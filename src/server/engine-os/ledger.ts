import {
  buildForecastLedgerRecord,
  deterministicEngineJobKey,
  tuesdayForecastOrigin,
  type ForecastLedgerRecord,
  type ForecastOriginIdentity,
  type ForecastProvenance,
  type ForecastWithholdingReason
} from "@/domain/engine-os";
import { sha256Hex, stableHash } from "@/domain/hash";
import {
  engineOperatingContract,
  engineOsContractHashes,
  footballLifecycle2026,
  researchConstitution
} from "@/domain/engine-os-contracts";

export interface EngineActivation {
  activationId: string;
  activatedAt: string;
  activationBoundary: string;
  evidenceScope: ForecastLedgerRecord["evidenceScope"];
  firstOriginUtc: string;
}

async function storedActivation(db: D1Database): Promise<EngineActivation | null> {
  const row = await db.prepare(`SELECT activation_id, activated_at,
      activation_boundary, evidence_scope, first_origin_utc
    FROM engine_activations
    WHERE operating_contract_hash = ? AND research_contract_hash = ? AND lifecycle_hash = ?
    LIMIT 1`)
    .bind(engineOsContractHashes.operating, engineOsContractHashes.research, engineOsContractHashes.lifecycle)
    .first<{
      activation_id: string;
      activated_at: string;
      activation_boundary: string;
      evidence_scope: ForecastLedgerRecord["evidenceScope"];
      first_origin_utc: string;
    }>();
  return row ? {
    activationId: row.activation_id,
    activatedAt: row.activated_at,
    activationBoundary: row.activation_boundary,
    evidenceScope: row.evidence_scope,
    firstOriginUtc: row.first_origin_utc
  } : null;
}

export async function activateForecastLedger(input: {
  db: D1Database;
  activatedAt: string;
  firstOriginUtc: string;
}): Promise<EngineActivation> {
  const existing = await storedActivation(input.db);
  if (existing) return existing;
  const activatedAt = new Date(input.activatedAt);
  const firstOrigin = new Date(input.firstOriginUtc);
  if (![activatedAt, firstOrigin].every((date) => Number.isFinite(date.getTime()))) {
    throw new Error("Activation and first origin timestamps must be valid");
  }
  const fullSeasonDeadline = Date.parse(footballLifecycle2026.seasonBoundary.fullSeasonActivationDeadline);
  const evidenceScope: ForecastLedgerRecord["evidenceScope"] =
    activatedAt.getTime() <= fullSeasonDeadline && activatedAt.getTime() <= firstOrigin.getTime()
      ? "full_season_shadow"
      : "partial_season_shadow";
  const activationBoundary = `engine-os-2026:${activatedAt.toISOString()}`;
  const activationId = stableHash({
    contract: "engine-os.activation.v1",
    activationBoundary,
    operating: engineOsContractHashes.operating,
    research: engineOsContractHashes.research,
    lifecycle: engineOsContractHashes.lifecycle
  });
  await input.db.prepare(`INSERT OR IGNORE INTO engine_activations (
    activation_id, activated_at, activation_boundary, evidence_scope,
    operating_contract_version, operating_contract_hash,
    research_contract_version, research_contract_hash,
    lifecycle_version, lifecycle_hash, first_origin_utc
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      activationId,
      activatedAt.toISOString(),
      activationBoundary,
      evidenceScope,
      engineOperatingContract.version,
      engineOsContractHashes.operating,
      researchConstitution.version,
      engineOsContractHashes.research,
      footballLifecycle2026.version,
      engineOsContractHashes.lifecycle,
      firstOrigin.toISOString()
    ).run();
  const authoritative = await storedActivation(input.db);
  if (!authoritative) throw new Error("Forecast-ledger activation was not durably recorded");
  return authoritative;
}

export interface CanonicalGameSeed {
  gameId: string;
  season: number;
  seasonType: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  observedAt: string;
  sourceCaptureId?: string | null;
  provider?: string;
  providerGameId?: string;
  activationBoundary: string;
  activatedAt: string;
}

export async function seedCanonicalGameOrigin(input: CanonicalGameSeed, db: D1Database): Promise<{
  kickoffRevisionId: string;
  origin: ForecastOriginIdentity;
}> {
  const observedAt = new Date(input.observedAt).toISOString();
  const requestedKickoff = new Date(input.kickoffUtc).toISOString();
  const activatedAt = new Date(input.activatedAt).toISOString();
  const existing = await db.prepare(`SELECT g.season, g.season_type, g.week, g.home_team, g.away_team,
      o.origin_id, o.origin_kind, o.scheduled_for_utc, o.scheduled_for_local, o.eligible,
      origin_kickoff.revision_id AS origin_revision_id, origin_kickoff.kickoff_utc AS origin_kickoff_utc,
      latest.revision_id AS latest_revision_id, latest.kickoff_utc AS latest_kickoff_utc
    FROM canonical_games g
    LEFT JOIN forecast_origins o ON o.game_id = g.game_id AND o.origin_kind = 'tuesday_0730_pt'
    LEFT JOIN game_kickoff_revisions origin_kickoff ON origin_kickoff.revision_id = o.kickoff_revision_id
    LEFT JOIN game_kickoff_revisions latest ON latest.revision_id = (
      SELECT revision_id FROM game_kickoff_revisions
      WHERE game_id = g.game_id ORDER BY observed_at DESC, revision_id DESC LIMIT 1
    )
    WHERE g.game_id = ? LIMIT 1`).bind(input.gameId).first<{
      season: number;
      season_type: string;
      week: number;
      home_team: string;
      away_team: string;
      origin_id: string | null;
      origin_kind: "tuesday_0730_pt" | null;
      scheduled_for_utc: string | null;
      scheduled_for_local: string | null;
      eligible: number | null;
      origin_revision_id: string | null;
      origin_kickoff_utc: string | null;
      latest_revision_id: string | null;
      latest_kickoff_utc: string | null;
    }>();
  if (existing && (existing.season !== input.season || existing.season_type !== input.seasonType ||
    existing.week !== input.week || existing.home_team !== input.homeTeam || existing.away_team !== input.awayTeam)) {
    throw new Error(`Canonical game identity conflict for ${input.gameId}`);
  }
  if (existing?.origin_id && existing.origin_kind && existing.scheduled_for_utc &&
    existing.scheduled_for_local && existing.origin_revision_id && existing.origin_kickoff_utc) {
    if (existing.latest_revision_id && existing.latest_kickoff_utc !== requestedKickoff) {
      await appendKickoffRevision({
        db,
        gameId: input.gameId,
        kickoffUtc: requestedKickoff,
        observedAt,
        supersedesRevisionId: existing.latest_revision_id,
        sourceCaptureId: input.sourceCaptureId
      });
    }
    return {
      kickoffRevisionId: existing.origin_revision_id,
      origin: {
        originId: existing.origin_id,
        gameId: input.gameId,
        kind: existing.origin_kind,
        scheduledForUtc: existing.scheduled_for_utc,
        scheduledForLocal: existing.scheduled_for_local,
        kickoffUtc: existing.origin_kickoff_utc,
        timeZone: "America/Los_Angeles",
        eligible: existing.eligible === 1
      }
    };
  }
  const origin = tuesdayForecastOrigin(input.gameId, input.kickoffUtc);
  const eligible = origin.eligible &&
    Date.parse(origin.scheduledForUtc) >= Date.parse(activatedAt) &&
    Date.parse(origin.scheduledForUtc) >= Date.parse(observedAt);
  const revisionId = stableHash({
    contract: "engine-os.kickoff-revision.v1",
    gameId: input.gameId,
    kickoffUtc: new Date(input.kickoffUtc).toISOString(),
    observedAt
  });
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO canonical_games (
      game_id, season, season_type, week, home_team, away_team,
      identity_status, created_at, source_capture_id
    ) VALUES (?, ?, ?, ?, ?, ?, 'resolved', ?, ?)`)
      .bind(
        input.gameId,
        input.season,
        input.seasonType,
        input.week,
        input.homeTeam,
        input.awayTeam,
        observedAt,
        input.sourceCaptureId ?? null
      ),
    db.prepare(`INSERT OR IGNORE INTO game_kickoff_revisions (
      revision_id, game_id, kickoff_utc, local_time_zone, observed_at,
      supersedes_revision_id, source_capture_id
    ) VALUES (?, ?, ?, 'America/Los_Angeles', ?, NULL, ?)`)
      .bind(revisionId, input.gameId, requestedKickoff, observedAt, input.sourceCaptureId ?? null),
    db.prepare(`INSERT OR IGNORE INTO forecast_origins (
      origin_id, game_id, origin_kind, scheduled_for_utc, scheduled_for_local,
      kickoff_revision_id, eligible, activation_boundary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        origin.originId,
        origin.gameId,
        origin.kind,
        origin.scheduledForUtc,
        origin.scheduledForLocal,
        revisionId,
        eligible ? 1 : 0,
        input.activationBoundary,
        observedAt
      )
  ];
  if (input.provider && input.providerGameId) {
    const aliasId = stableHash({
      contract: "engine-os.game-alias.v1",
      provider: input.provider,
      providerGameId: input.providerGameId,
      validFrom: observedAt
    });
    statements.push(db.prepare(`INSERT OR IGNORE INTO game_provider_aliases (
      alias_id, provider, provider_game_id, game_id, valid_from, observed_at, source_capture_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        aliasId,
        input.provider,
        input.providerGameId,
        input.gameId,
        observedAt,
        observedAt,
        input.sourceCaptureId ?? null
      ));
  }
  await db.batch(statements);
  const stored = await db.prepare(`SELECT season, season_type, week, home_team, away_team
    FROM canonical_games WHERE game_id = ?`).bind(input.gameId).first<{
      season: number;
      season_type: string;
      week: number;
      home_team: string;
      away_team: string;
    }>();
  if (!stored || stored.season !== input.season || stored.season_type !== input.seasonType ||
    stored.week !== input.week || stored.home_team !== input.homeTeam || stored.away_team !== input.awayTeam) {
    throw new Error(`Canonical game identity conflict for ${input.gameId}`);
  }
  return { kickoffRevisionId: revisionId, origin: { ...origin, eligible } };
}

export async function appendKickoffRevision(input: {
  db: D1Database;
  gameId: string;
  kickoffUtc: string;
  observedAt: string;
  supersedesRevisionId: string;
  sourceCaptureId?: string | null;
}): Promise<string> {
  const prior = await input.db.prepare(`SELECT game_id FROM game_kickoff_revisions
    WHERE revision_id = ? LIMIT 1`).bind(input.supersedesRevisionId).first<{ game_id: string }>();
  if (!prior || prior.game_id !== input.gameId) {
    throw new Error("A kickoff revision must supersede a revision of the same game");
  }
  const kickoffUtc = new Date(input.kickoffUtc).toISOString();
  const observedAt = new Date(input.observedAt).toISOString();
  const revisionId = stableHash({
    contract: "engine-os.kickoff-revision.v1",
    gameId: input.gameId,
    kickoffUtc,
    observedAt
  });
  await input.db.prepare(`INSERT OR IGNORE INTO game_kickoff_revisions (
    revision_id, game_id, kickoff_utc, local_time_zone, observed_at,
    supersedes_revision_id, source_capture_id
  ) VALUES (?, ?, ?, 'America/Los_Angeles', ?, ?, ?)`)
    .bind(
      revisionId,
      input.gameId,
      kickoffUtc,
      observedAt,
      input.supersedesRevisionId,
      input.sourceCaptureId ?? null
    ).run();
  return revisionId;
}

async function outputObjectMatches(bucket: R2Bucket, provenance: Partial<ForecastProvenance> | null | undefined): Promise<boolean> {
  if (!provenance?.outputObjectKey || !provenance.outputObjectHash) return false;
  const object = await bucket.get(provenance.outputObjectKey);
  if (!object) return false;
  const bytes = new Uint8Array(await object.arrayBuffer());
  return sha256Hex(bytes) === provenance.outputObjectHash.replace(/^sha256:/i, "").toLowerCase();
}

export async function recordForecastOrWithholding(input: {
  db: D1Database;
  bucket?: R2Bucket;
  origin: ForecastOriginIdentity;
  requestedStatus: "forecast" | "withheld";
  withholdingReason?: ForecastWithholdingReason | null;
  generatedAt: string;
  recordedAt?: string;
  captureHealth: ForecastLedgerRecord["captureHealth"];
  activationBoundary: string;
  evidenceScope: ForecastLedgerRecord["evidenceScope"];
  originGraceSeconds: number;
  qualificationKey?: string | null;
  provenance?: Partial<ForecastProvenance> | null;
}): Promise<ForecastLedgerRecord> {
  const storedOrigin = await input.db.prepare(`SELECT o.game_id, o.origin_kind,
      o.scheduled_for_utc, o.scheduled_for_local, o.eligible, o.activation_boundary,
      k.kickoff_utc, k.local_time_zone
    FROM forecast_origins o
    JOIN game_kickoff_revisions k ON k.revision_id = o.kickoff_revision_id
    WHERE o.origin_id = ? LIMIT 1`)
    .bind(input.origin.originId)
    .first<{
      game_id: string;
      origin_kind: ForecastOriginIdentity["kind"];
      scheduled_for_utc: string;
      scheduled_for_local: string;
      eligible: number;
      activation_boundary: string;
      kickoff_utc: string;
      local_time_zone: string;
    }>();
  if (!storedOrigin || storedOrigin.game_id !== input.origin.gameId ||
    storedOrigin.activation_boundary !== input.activationBoundary ||
    storedOrigin.local_time_zone !== "America/Los_Angeles") {
    throw new Error("Forecast record does not match its stored origin identity");
  }
  const authoritativeOrigin: ForecastOriginIdentity = {
    originId: input.origin.originId,
    gameId: storedOrigin.game_id,
    kind: storedOrigin.origin_kind,
    scheduledForUtc: storedOrigin.scheduled_for_utc,
    scheduledForLocal: storedOrigin.scheduled_for_local,
    kickoffUtc: storedOrigin.kickoff_utc,
    timeZone: "America/Los_Angeles",
    eligible: storedOrigin.eligible === 1
  };
  const objectValid = input.requestedStatus !== "forecast" ||
    input.bucket !== undefined && await outputObjectMatches(input.bucket, input.provenance);
  const record = buildForecastLedgerRecord({
    ...input,
    origin: authoritativeOrigin,
    provenance: objectValid ? input.provenance : null
  });
  const provenance = record.provenance;
  const inserted = await input.db.prepare(`INSERT OR IGNORE INTO forecast_origin_records (
    record_id, record_hash, origin_id, game_id, status, withholding_reason,
    generated_at, recorded_at, timing, prospective_eligible, capture_health,
    activation_boundary, evidence_scope, qualification_key, runner_hash, code_hash,
    package_hash, config_hash, input_manifest_hash, feature_schema_hash,
    target_schema_hash, output_object_key, output_object_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      record.recordId,
      record.recordHash,
      record.originId,
      record.gameId,
      record.status,
      record.withholdingReason,
      record.generatedAt,
      record.recordedAt,
      record.timing,
      record.prospectiveEligible ? 1 : 0,
      record.captureHealth,
      record.activationBoundary,
      record.evidenceScope,
      record.qualificationKey,
      provenance?.runnerHash ?? null,
      provenance?.codeHash ?? null,
      provenance?.packageHash ?? null,
      provenance?.configHash ?? null,
      provenance?.inputManifestHash ?? null,
      provenance?.featureSchemaHash ?? null,
      provenance?.targetSchemaHash ?? null,
      provenance?.outputObjectKey ?? null,
      provenance?.outputObjectHash ?? null
    ).run();
  if (Number(inserted.meta.changes ?? 0) === 0) {
    const existing = await input.db.prepare(`SELECT record_hash FROM forecast_origin_records
      WHERE record_id = ? OR (origin_id = ? AND timing = ?)
      ORDER BY record_id LIMIT 1`)
      .bind(record.recordId, record.originId, record.timing)
      .first<{ record_hash: string }>();
    if (!existing || existing.record_hash !== record.recordHash) {
      throw new Error("Forecast origin already has a different immutable record");
    }
  }
  return record;
}

export async function acquireEngineJobLease(input: {
  db: D1Database;
  job: string;
  scheduledFor: string;
  owner: string;
  now: string;
  leaseSeconds: number;
  gameId?: string | null;
  originId?: string | null;
}): Promise<{ acquired: boolean; jobKey: string }> {
  const now = new Date(input.now);
  const scheduledFor = new Date(input.scheduledFor);
  if (![now, scheduledFor].every((date) => Number.isFinite(date.getTime())) ||
    !Number.isFinite(input.leaseSeconds) || input.leaseSeconds <= 0) {
    throw new Error("Engine job lease inputs are invalid");
  }
  const jobKey = deterministicEngineJobKey({
    job: input.job,
    scheduledFor: scheduledFor.toISOString(),
    gameId: input.gameId ?? null,
    originId: input.originId ?? null
  });
  const canonicalNow = now.toISOString();
  const canonicalScheduledFor = scheduledFor.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + input.leaseSeconds * 1000).toISOString();
  const inserted = await input.db.prepare(`INSERT OR IGNORE INTO engine_job_runs (
    job_key, job_type, game_id, origin_id, scheduled_for, state, attempt,
    lease_owner, lease_expires_at, started_at, heartbeat_at
  ) VALUES (?, ?, ?, ?, ?, 'running', 1, ?, ?, ?, ?)`)
    .bind(
      jobKey,
      input.job,
      input.gameId ?? null,
      input.originId ?? null,
      canonicalScheduledFor,
      input.owner,
      leaseExpiresAt,
      canonicalNow,
      canonicalNow
    ).run();
  if (Number(inserted.meta.changes ?? 0) > 0) return { acquired: true, jobKey };
  const recovery = await input.db.prepare(`UPDATE engine_job_runs SET
      state = 'running', attempt = attempt + 1, lease_owner = ?, lease_expires_at = ?,
      started_at = ?, completed_at = NULL, heartbeat_at = ?, failure_code = NULL
    WHERE job_key = ? AND (
      state = 'failed' OR (
        state = 'running' AND completed_at IS NULL AND
        (lease_expires_at IS NULL OR lease_expires_at < ?)
      )
    )`)
    .bind(input.owner, leaseExpiresAt, canonicalNow, canonicalNow, jobKey, canonicalNow).run();
  return {
    acquired: Number(recovery.meta.changes ?? 0) > 0,
    jobKey
  };
}

export async function finishEngineJob(input: {
  db: D1Database;
  jobKey: string;
  owner: string;
  completedAt: string;
  state: "succeeded" | "failed" | "skipped" | "late";
  failureCode?: string | null;
}): Promise<boolean> {
  const completedAt = new Date(input.completedAt);
  if (!Number.isFinite(completedAt.getTime())) throw new Error("Engine job completion time is invalid");
  const completedAtIso = completedAt.toISOString();
  const result = await input.db.prepare(`UPDATE engine_job_runs SET
      state = ?, completed_at = ?, heartbeat_at = ?, lease_owner = NULL,
      lease_expires_at = NULL, failure_code = ?
    WHERE job_key = ? AND state = 'running' AND lease_owner = ?`)
    .bind(input.state, completedAtIso, completedAtIso, input.failureCode ?? null, input.jobKey, input.owner).run();
  return Number(result.meta.changes ?? 0) > 0;
}
