import type { FittedLogisticModel } from "@/domain/model-fit";
import type { ModelMetrics, ModelRun, RollingFeatures, SystemAlert, TeamState } from "@/domain/types";

export interface StoredModelArtifact {
  model: FittedLogisticModel;
  walkForwardModels: Record<string, FittedLogisticModel>;
  ensembleModels?: FittedLogisticModel[];
  ensembleSeeds?: number[];
  ensembleConfiguration?: {
    members: number;
    seedStart: number;
    regularization: number;
    iterations: number;
  };
  trainingThroughSeason: number;
  trainingThroughWeek: number;
}

export interface ModelLifecycleState {
  season: number;
  loopAThroughWeek: number;
  loopAHash: string | null;
  loopBTargetWeek: number;
  championHash: string | null;
  lastLoopAAt: string | null;
  lastLoopBAt: string | null;
}

interface LifecycleRow {
  season: number;
  loop_a_through_week: number;
  loop_a_hash: string | null;
  loop_b_target_week: number;
  champion_hash: string | null;
  last_loop_a_at: string | null;
  last_loop_b_at: string | null;
}

interface ModelRow {
  model_json: string;
  metrics_json: string;
  status: string;
  data_hash: string;
  config_hash: string;
  feature_schema_hash: string;
  code_hash: string;
  created_at: string;
  promoted_at: string | null;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS model_lifecycle_state (
    season integer PRIMARY KEY NOT NULL,
    loop_a_through_week integer NOT NULL DEFAULT -1,
    loop_a_hash text,
    loop_b_target_week integer NOT NULL DEFAULT -1,
    champion_hash text,
    last_loop_a_at text,
    last_loop_b_at text
  )`,
  `CREATE TABLE IF NOT EXISTS team_strength_states (
    season integer NOT NULL,
    team text NOT NULL,
    mean real NOT NULL,
    variance real NOT NULL,
    through_week integer NOT NULL,
    state_hash text NOT NULL,
    updated_at text NOT NULL,
    PRIMARY KEY (season, team)
  )`,
  `CREATE TABLE IF NOT EXISTS team_strength_states_stage (
    run_id text NOT NULL,
    season integer NOT NULL,
    team text NOT NULL,
    mean real NOT NULL,
    variance real NOT NULL,
    through_week integer NOT NULL,
    state_hash text NOT NULL,
    updated_at text NOT NULL,
    PRIMARY KEY (run_id, season, team)
  )`,
  `CREATE TABLE IF NOT EXISTS rolling_feature_states (
    season integer NOT NULL,
    team text NOT NULL,
    through_week integer NOT NULL,
    epa real NOT NULL,
    success_rate real NOT NULL,
    explosive_rate real NOT NULL,
    regressed_turnovers real NOT NULL,
    pace real NOT NULL,
    proe real NOT NULL,
    state_hash text NOT NULL,
    updated_at text NOT NULL,
    PRIMARY KEY (season, team)
  )`,
  `CREATE TABLE IF NOT EXISTS rolling_feature_states_stage (
    run_id text NOT NULL,
    season integer NOT NULL,
    team text NOT NULL,
    through_week integer NOT NULL,
    epa real NOT NULL,
    success_rate real NOT NULL,
    explosive_rate real NOT NULL,
    regressed_turnovers real NOT NULL,
    pace real NOT NULL,
    proe real NOT NULL,
    state_hash text NOT NULL,
    updated_at text NOT NULL,
    PRIMARY KEY (run_id, season, team)
  )`,
  `CREATE TABLE IF NOT EXISTS model_versions (
    version_hash text PRIMARY KEY NOT NULL,
    status text NOT NULL,
    model_json text NOT NULL,
    metrics_json text NOT NULL,
    training_through_season integer NOT NULL,
    training_through_week integer NOT NULL,
    data_hash text NOT NULL,
    config_hash text NOT NULL,
    feature_schema_hash text NOT NULL,
    code_hash text NOT NULL,
    created_at text NOT NULL,
    promoted_at text
  )`,
  `CREATE TABLE IF NOT EXISTS model_run_log (
    id text PRIMARY KEY NOT NULL,
    champion_hash text NOT NULL,
    challenger_hash text NOT NULL,
    champion_metrics_json text NOT NULL,
    challenger_metrics_json text NOT NULL,
    paired_improvement real NOT NULL,
    paired_interval_json text NOT NULL,
    paired_blocks integer NOT NULL,
    gate_decision text NOT NULL,
    data_hash text NOT NULL,
    config_hash text NOT NULL,
    feature_schema_hash text NOT NULL,
    code_hash text NOT NULL,
    started_at text NOT NULL,
    completed_at text NOT NULL,
    promoted_at text
  )`,
  `CREATE TABLE IF NOT EXISTS model_system_alerts (
    id text PRIMARY KEY NOT NULL,
    type text NOT NULL,
    severity text NOT NULL,
    message text NOT NULL,
    idempotency_key text UNIQUE NOT NULL,
    created_at text NOT NULL,
    acknowledged_at text
  )`,
  "CREATE INDEX IF NOT EXISTS idx_model_versions_status ON model_versions (status, promoted_at)",
  "CREATE INDEX IF NOT EXISTS idx_model_runs_completed ON model_run_log (completed_at)"
] as const;

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function mapLifecycle(row: LifecycleRow): ModelLifecycleState {
  return {
    season: row.season,
    loopAThroughWeek: row.loop_a_through_week,
    loopAHash: row.loop_a_hash,
    loopBTargetWeek: row.loop_b_target_week,
    championHash: row.champion_hash,
    lastLoopAAt: row.last_loop_a_at,
    lastLoopBAt: row.last_loop_b_at
  };
}

export async function ensureModelLifecycleStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

export async function publishModelSystemAlert(db: D1Database, alert: SystemAlert): Promise<void> {
  await ensureModelLifecycleStore(db);
  await db.prepare(`INSERT OR IGNORE INTO model_system_alerts
    (id, type, severity, message, idempotency_key, created_at, acknowledged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
      alert.id, alert.type, alert.severity, alert.message, alert.idempotencyKey,
      alert.createdAt, alert.acknowledgedAt
    ).run();
}

export async function resolveModelSystemAlerts(
  db: D1Database,
  idempotencyPrefix: string,
  resolvedAt: string
): Promise<void> {
  await ensureModelLifecycleStore(db);
  await db.prepare(`UPDATE model_system_alerts SET acknowledged_at = ?
    WHERE acknowledged_at IS NULL AND idempotency_key LIKE ?`)
    .bind(resolvedAt, `${idempotencyPrefix}%`).run();
}

export async function getModelLifecycleState(db: D1Database, season: number): Promise<ModelLifecycleState | null> {
  await ensureModelLifecycleStore(db);
  const row = await db.prepare("SELECT * FROM model_lifecycle_state WHERE season = ?").bind(season).first<LifecycleRow>();
  return row ? mapLifecycle(row) : null;
}

export async function getActiveChampionHash(db: D1Database, season: number): Promise<string | null> {
  return (await getModelLifecycleState(db, season))?.championHash ?? null;
}

export async function getModelArtifact(db: D1Database, versionHash: string): Promise<{
  artifact: StoredModelArtifact;
  metrics: ModelMetrics;
  metadata: {
    status: string;
    dataHash: string;
    configHash: string;
    featureSchemaHash: string;
    codeHash: string;
    createdAt: string;
    promotedAt: string | null;
  };
} | null> {
  await ensureModelLifecycleStore(db);
  const row = await db.prepare(`SELECT model_json, metrics_json, status, data_hash, config_hash,
      feature_schema_hash, code_hash, created_at, promoted_at
    FROM model_versions WHERE version_hash = ?`)
    .bind(versionHash).first<ModelRow>();
  if (!row) return null;
  return {
    artifact: JSON.parse(row.model_json) as StoredModelArtifact,
    metrics: JSON.parse(row.metrics_json) as ModelMetrics,
    metadata: {
      status: row.status,
      dataHash: row.data_hash,
      configHash: row.config_hash,
      featureSchemaHash: row.feature_schema_hash,
      codeHash: row.code_hash,
      createdAt: row.created_at,
      promotedAt: row.promoted_at
    }
  };
}

export async function getLatestModelRunConfigHash(db: D1Database): Promise<string | null> {
  await ensureModelLifecycleStore(db);
  const row = await db.prepare("SELECT config_hash FROM model_run_log ORDER BY completed_at DESC LIMIT 1")
    .first<{ config_hash: string }>();
  return row?.config_hash ?? null;
}

export async function getLatestModelRunAuthorization(db: D1Database): Promise<{
  championHash: string;
  challengerHash: string;
  configHash: string;
  codeHash: string;
  gateDecision: "promote" | "retain";
  completedAt: string;
} | null> {
  await ensureModelLifecycleStore(db);
  const row = await db.prepare(`SELECT champion_hash, challenger_hash, config_hash, code_hash, gate_decision, completed_at
    FROM model_run_log ORDER BY completed_at DESC LIMIT 1`).first<{
      champion_hash: string;
      challenger_hash: string;
      config_hash: string;
      code_hash: string;
      gate_decision: "promote" | "retain";
      completed_at: string;
    }>();
  return row ? {
    championHash: row.champion_hash,
    challengerHash: row.challenger_hash,
    configHash: row.config_hash,
    codeHash: row.code_hash,
    gateDecision: row.gate_decision,
    completedAt: row.completed_at
  } : null;
}

export async function getLatestModelRun(db: D1Database): Promise<ModelRun | null> {
  await ensureModelLifecycleStore(db);
  const row = await db.prepare(`SELECT id, champion_hash, challenger_hash, champion_metrics_json,
      challenger_metrics_json, paired_improvement, paired_interval_json, paired_blocks,
      gate_decision, data_hash, config_hash, feature_schema_hash,
      code_hash, started_at, completed_at, promoted_at
    FROM model_run_log ORDER BY completed_at DESC LIMIT 1`).first<{
      id: string;
      champion_hash: string;
      challenger_hash: string;
      champion_metrics_json: string;
      challenger_metrics_json: string;
      paired_improvement: number;
      paired_interval_json: string;
      paired_blocks: number;
      gate_decision: "promote" | "retain";
      data_hash: string;
      config_hash: string;
      feature_schema_hash: string;
      code_hash: string;
      started_at: string;
      completed_at: string;
      promoted_at: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    championVersionHash: row.champion_hash,
    challengerVersionHash: row.challenger_hash,
    status: row.gate_decision === "promote" ? "challenger" : "rejected",
    championMetrics: JSON.parse(row.champion_metrics_json) as ModelMetrics,
    challengerMetrics: JSON.parse(row.challenger_metrics_json) as ModelMetrics,
    pairedLogLossImprovement: row.paired_improvement,
    pairedLogLossImprovementInterval90: JSON.parse(row.paired_interval_json) as [number, number],
    pairedEvaluationBlocks: row.paired_blocks,
    gateDecision: row.gate_decision,
    dataSnapshotHash: row.data_hash,
    configHash: row.config_hash,
    featureSchemaHash: row.feature_schema_hash,
    codeHash: row.code_hash,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    promotedAt: row.promoted_at
  };
}

export async function getTeamStrengthStates(db: D1Database, season: number): Promise<TeamState[]> {
  await ensureModelLifecycleStore(db);
  const result = await db.prepare(`SELECT team, mean, variance, through_week
    FROM team_strength_states WHERE season = ? ORDER BY team`).bind(season)
    .all<{ team: string; mean: number; variance: number; through_week: number }>();
  return result.results.map((row) => ({ team: row.team, mean: row.mean, variance: row.variance, throughWeek: row.through_week }));
}

export async function publishLoopA(input: {
  db: D1Database;
  season: number;
  throughWeek: number;
  states: TeamState[];
  features: RollingFeatures[];
  stateHash: string;
  updatedAt: string;
}): Promise<void> {
  const runId = `${input.season}:${input.throughWeek}:${input.stateHash}`;
  await input.db.batch([
    input.db.prepare("DELETE FROM team_strength_states_stage WHERE run_id = ?").bind(runId),
    input.db.prepare("DELETE FROM rolling_feature_states_stage WHERE run_id = ?").bind(runId)
  ]);
  for (const group of chunks(input.states, 10)) {
    await input.db.batch(group.map((state) => input.db.prepare(`INSERT INTO team_strength_states_stage
      (run_id, season, team, mean, variance, through_week, state_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(runId, input.season, state.team, state.mean, state.variance, state.throughWeek, input.stateHash, input.updatedAt)));
  }
  for (const group of chunks(input.features, 8)) {
    await input.db.batch(group.map((feature) => input.db.prepare(`INSERT INTO rolling_feature_states_stage
      (run_id, season, team, through_week, epa, success_rate, explosive_rate, regressed_turnovers, pace, proe, state_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(runId, input.season, feature.team, feature.throughWeek, feature.epa, feature.successRate,
        feature.explosiveRate, feature.regressedTurnovers, feature.pace, feature.proe,
        input.stateHash, input.updatedAt)));
  }
  await input.db.batch([
    input.db.prepare(`DELETE FROM team_strength_states WHERE season = ?
      AND team NOT IN (SELECT team FROM team_strength_states_stage WHERE run_id = ?)`).bind(input.season, runId),
    input.db.prepare(`INSERT INTO team_strength_states
      (season, team, mean, variance, through_week, state_hash, updated_at)
      SELECT season, team, mean, variance, through_week, state_hash, updated_at
      FROM team_strength_states_stage WHERE run_id = ?
      ON CONFLICT(season, team) DO UPDATE SET mean = excluded.mean, variance = excluded.variance,
        through_week = excluded.through_week, state_hash = excluded.state_hash, updated_at = excluded.updated_at`).bind(runId),
    input.db.prepare(`DELETE FROM rolling_feature_states WHERE season = ?
      AND team NOT IN (SELECT team FROM rolling_feature_states_stage WHERE run_id = ?)`).bind(input.season, runId),
    input.db.prepare(`INSERT INTO rolling_feature_states
      (season, team, through_week, epa, success_rate, explosive_rate, regressed_turnovers, pace, proe, state_hash, updated_at)
      SELECT season, team, through_week, epa, success_rate, explosive_rate, regressed_turnovers, pace, proe, state_hash, updated_at
      FROM rolling_feature_states_stage WHERE run_id = ?
      ON CONFLICT(season, team) DO UPDATE SET through_week = excluded.through_week, epa = excluded.epa,
        success_rate = excluded.success_rate, explosive_rate = excluded.explosive_rate,
        regressed_turnovers = excluded.regressed_turnovers, pace = excluded.pace, proe = excluded.proe,
        state_hash = excluded.state_hash, updated_at = excluded.updated_at`).bind(runId),
    input.db.prepare(`INSERT INTO model_lifecycle_state
      (season, loop_a_through_week, loop_a_hash, last_loop_a_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(season) DO UPDATE SET loop_a_through_week = excluded.loop_a_through_week,
        loop_a_hash = excluded.loop_a_hash, last_loop_a_at = excluded.last_loop_a_at`)
      .bind(input.season, input.throughWeek, input.stateHash, input.updatedAt),
    input.db.prepare("DELETE FROM team_strength_states_stage WHERE run_id = ?").bind(runId),
    input.db.prepare("DELETE FROM rolling_feature_states_stage WHERE run_id = ?").bind(runId)
  ]);
}

export async function publishLoopB(input: {
  db: D1Database;
  season: number;
  targetWeek: number;
  challengerHash: string;
  artifact: StoredModelArtifact;
  challengerMetrics: ModelMetrics;
  run: ModelRun;
  alert: SystemAlert | null;
  retainedChampionHash: string;
  bootstrapVersion?: {
    hash: string;
    artifact: StoredModelArtifact;
    metrics: ModelMetrics;
  };
}): Promise<void> {
  const promoted = input.run.gateDecision === "promote";
  const statements = [
    input.db.prepare(`INSERT OR REPLACE INTO model_versions
      (version_hash, status, model_json, metrics_json, training_through_season, training_through_week,
       data_hash, config_hash, feature_schema_hash, code_hash, created_at, promoted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.challengerHash, promoted ? "champion" : "rejected", JSON.stringify(input.artifact),
        JSON.stringify(input.challengerMetrics), input.artifact.trainingThroughSeason,
        input.artifact.trainingThroughWeek, input.run.dataSnapshotHash, input.run.configHash,
        input.run.featureSchemaHash, input.run.codeHash, input.run.startedAt, input.run.promotedAt),
    input.db.prepare(`INSERT OR REPLACE INTO model_run_log
      (id, champion_hash, challenger_hash, champion_metrics_json, challenger_metrics_json,
       paired_improvement, paired_interval_json, paired_blocks, gate_decision, data_hash, config_hash,
       feature_schema_hash, code_hash, started_at, completed_at, promoted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.run.id, input.run.championVersionHash, input.run.challengerVersionHash,
        JSON.stringify(input.run.championMetrics), JSON.stringify(input.run.challengerMetrics),
        input.run.pairedLogLossImprovement, JSON.stringify(input.run.pairedLogLossImprovementInterval90),
        input.run.pairedEvaluationBlocks, input.run.gateDecision, input.run.dataSnapshotHash, input.run.configHash,
        input.run.featureSchemaHash, input.run.codeHash, input.run.startedAt,
        input.run.completedAt, input.run.promotedAt),
    input.db.prepare(`INSERT INTO model_lifecycle_state
      (season, loop_b_target_week, champion_hash, last_loop_b_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(season) DO UPDATE SET loop_b_target_week = excluded.loop_b_target_week,
        champion_hash = excluded.champion_hash,
        last_loop_b_at = excluded.last_loop_b_at`)
      .bind(input.season, input.targetWeek, promoted ? input.challengerHash : input.retainedChampionHash, input.run.completedAt)
  ];
  if (input.bootstrapVersion) {
    statements.unshift(input.db.prepare(`INSERT OR IGNORE INTO model_versions
      (version_hash, status, model_json, metrics_json, training_through_season, training_through_week,
       data_hash, config_hash, feature_schema_hash, code_hash, created_at, promoted_at)
      VALUES (?, 'champion', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.bootstrapVersion.hash, JSON.stringify(input.bootstrapVersion.artifact),
        JSON.stringify(input.bootstrapVersion.metrics), input.bootstrapVersion.artifact.trainingThroughSeason,
        input.bootstrapVersion.artifact.trainingThroughWeek, input.run.dataSnapshotHash,
        input.run.configHash, input.run.featureSchemaHash, input.run.codeHash,
        input.run.startedAt, input.run.startedAt));
  }
  if (input.alert) {
    statements.push(input.db.prepare(`INSERT OR IGNORE INTO model_system_alerts
      (id, type, severity, message, idempotency_key, created_at, acknowledged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.alert.id, input.alert.type, input.alert.severity, input.alert.message,
        input.alert.idempotencyKey, input.alert.createdAt, input.alert.acknowledgedAt));
  }
  await input.db.batch(statements);
}
