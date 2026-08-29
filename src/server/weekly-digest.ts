import { stableHash } from "@/domain/hash";
import {
  brierScore,
  calibrationSlope,
  createWeeklyDigest,
  logLoss,
  populationStabilityIndex
} from "@/domain/monitoring";
import type { DataFreshness, WeeklyDigest } from "@/domain/types";
import type { PlayForecastSnapshot, StoredPlayLeg } from "@/domain/play-card";
import { structuralConfig } from "@/domain/config";
import { getLatestModelRun, publishModelSystemAlert } from "./model-lifecycle/store";
import { getOddsQuotaState } from "./odds-quota";
import { listNflverseImportStates } from "./nflverse/store";
import { listOfficialInjuryImportStates } from "./official-injuries/store";
import { assertD1SchemaAuthority } from "@/server/schema-authority";

interface SettledPlayRow {
  id: string;
  week: number;
  play_type: "single" | "parlay" | "teaser";
  result: "win" | "loss" | "push" | "void";
  closing_clv_cents: number | null;
  contract_json: string;
  forecast_json: string | null;
}

interface FeatureValueRow {
  season: number;
  week: number;
  epa_per_play: number;
  success_rate: number;
  explosive_rate: number;
  turnover_rate: number;
  seconds_per_play: number | null;
  pass_rate_over_expectation: number | null;
}

interface ScoringRow {
  season: number;
  week: number;
  total: number;
}

function freshness(values: string[]): DataFreshness {
  if (!values.length || values.includes("unavailable")) return "unavailable";
  if (values.includes("partial") || values.includes("running")) return "partial";
  if (values.includes("stale")) return "stale";
  return "current";
}

function parseJson<T>(value: string | null, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function outcomeForLeg(result: SettledPlayRow["result"], contract: StoredPlayLeg[], index: number): 0 | 1 | null {
  if (result === "push" || result === "void") return null;
  if (contract.length !== 1 || index !== 0) return null;
  return result === "win" ? 1 : 0;
}

function weightedMean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function quantile(sorted: number[], probability: number): number {
  const index = (sorted.length - 1) * probability;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (index - low) * (sorted[high] - sorted[low]);
}

function distribution(values: number[], boundaries: number[]): number[] {
  if (!values.length) return [];
  const bins = Array(boundaries.length + 1).fill(0) as number[];
  for (const value of values) {
    const index = boundaries.findIndex((boundary) => value <= boundary);
    bins[index < 0 ? bins.length - 1 : index] += 1;
  }
  return bins.map((count) => count / values.length);
}

function featurePsi(reference: FeatureValueRow[], current: FeatureValueRow[]): number | null {
  if (reference.length < 20 || current.length < 20) return null;
  const fields = [
    "epa_per_play", "success_rate", "explosive_rate", "turnover_rate",
    "seconds_per_play", "pass_rate_over_expectation"
  ] as const;
  const values = fields.flatMap((field) => {
    const expected = reference.map((row) => row[field]).filter((value): value is number => value !== null && Number.isFinite(value));
    const actual = current.map((row) => row[field]).filter((value): value is number => value !== null && Number.isFinite(value));
    if (expected.length < 20 || actual.length < 20) return [];
    const sorted = [...expected].sort((left, right) => left - right);
    const boundaries = [0.2, 0.4, 0.6, 0.8].map((probability) => quantile(sorted, probability));
    return [populationStabilityIndex(distribution(expected, boundaries), distribution(actual, boundaries))];
  });
  return values.length ? Math.max(...values) : null;
}

function scoringSummary(rows: ScoringRow[], season: number, throughWeek: number) {
  const current = rows.filter((row) => row.season === season && row.week <= throughWeek).map((row) => row.total);
  const trailing = rows.filter((row) => row.season >= season - 3 && row.season < season).map((row) => row.total).sort((a, b) => a - b);
  return {
    current: weightedMean(current),
    mean: weightedMean(trailing),
    interval: trailing.length ? [quantile(trailing, 0.025), quantile(trailing, 0.975)] as [number, number] : null
  };
}

export async function ensureWeeklyDigestStore(db: D1Database): Promise<void> {
  await assertD1SchemaAuthority(db);
}

export async function generateWeeklyDigest(input: {
  db: D1Database;
  season?: number;
  week?: number;
  now?: Date;
}): Promise<WeeklyDigest | null> {
  const season = input.season ?? structuralConfig.season;
  const week = input.week ?? Math.max(0, ...(await input.db.prepare(`SELECT week FROM nfl_games
    WHERE season = ? AND season_type = 'REG' AND away_score IS NOT NULL AND home_score IS NOT NULL`)
    .bind(season).all<{ week: number }>()).results.map((row) => row.week));
  if (week < 1) return null;
  await ensureWeeklyDigestStore(input.db);
  const [playResult, featureResult, scoringResult, modelRun, nflverse, injuries, quota, failedRunResult, priorDigestResult] = await Promise.all([
    input.db.prepare(`SELECT id, week, play_type, result, closing_clv_cents, contract_json, forecast_json
      FROM plays WHERE season = ? AND status = 'settled' AND week <= ? ORDER BY week, updated_at`)
      .bind(season, week).all<SettledPlayRow>(),
    input.db.prepare(`SELECT season, week, epa_per_play, success_rate, explosive_rate, turnover_rate,
        seconds_per_play, pass_rate_over_expectation FROM nfl_team_game_features
      WHERE season_type = 'REG' AND season BETWEEN ? AND ?`).bind(season - 3, season).all<FeatureValueRow>(),
    input.db.prepare(`SELECT season, week, total FROM nfl_games WHERE season_type = 'REG'
      AND season BETWEEN ? AND ? AND total IS NOT NULL`).bind(season - 3, season).all<ScoringRow>(),
    getLatestModelRun(input.db),
    listNflverseImportStates(input.db),
    listOfficialInjuryImportStates(input.db),
    getOddsQuotaState(input.db),
    input.db.prepare(`SELECT message FROM model_system_alerts WHERE acknowledged_at IS NULL
      UNION ALL SELECT COALESCE(last_error, dataset) AS message FROM nflverse_import_state
      WHERE freshness IN ('stale', 'unavailable')`).all<{ message: string }>(),
    input.db.prepare(`SELECT week, digest_json FROM weekly_digests WHERE season = ? AND week < ? ORDER BY week`)
      .bind(season, week).all<{ week: number; digest_json: string }>()
  ]);
  if (!modelRun) return null;
  const forecastRows = playResult.results.flatMap((play) => {
    const contract = parseJson<StoredPlayLeg[]>(play.contract_json, []);
    const snapshot = parseJson<PlayForecastSnapshot | null>(play.forecast_json, null);
    if (!snapshot) return [];
    return snapshot.legs.flatMap((leg, index) => {
      const outcome = outcomeForLeg(play.result, contract, index);
      return outcome === null || leg.betProbability === null || leg.marketProbability === null
        ? []
        : [{ probability: leg.betProbability, marketProbability: leg.marketProbability, outcome }];
    });
  });
  const trailing40 = forecastRows.slice(-40);
  const currentFeatures = featureResult.results.filter((row) => row.season === season && row.week <= week);
  const referenceFeatures = featureResult.results.filter((row) => row.season < season);
  const scoring = scoringSummary(scoringResult.results, season, week);
  const currentWeekPlays = playResult.results.filter((play) => play.week === week);
  const clv = currentWeekPlays.map((play) => play.closing_clv_cents).filter((value): value is number => value !== null);
  const expectedEdgeCents = currentWeekPlays.flatMap((play) => {
    const snapshot = parseJson<PlayForecastSnapshot | null>(play.forecast_json, null);
    if (!snapshot) return [];
    // New cards freeze a server-derived value. The display-field fallback is
    // only for records approved before authoritativeEdgeCents was introduced.
    return [snapshot.authoritativeEdgeCents ?? snapshot.displayedEdgePp];
  });
  const priorGaps = priorDigestResult.results.flatMap((row) => {
    const digest = parseJson<WeeklyDigest | null>(row.digest_json, null);
    return digest?.displayedExpectedEdgeCents === null || digest?.displayedExpectedEdgeCents === undefined ||
      digest.realizedClvCents === null ? [] : [digest.displayedExpectedEdgeCents - digest.realizedClvCents];
  });
  const generatedAt = (input.now ?? new Date()).toISOString();
  const digest = createWeeklyDigest({
    id: `digest:${season}:week${week}`,
    season,
    week,
    brierScore: forecastRows.length ? brierScore(forecastRows) : null,
    marketBrierScore: forecastRows.length ? brierScore(forecastRows.map((row) => ({ probability: row.marketProbability, outcome: row.outcome }))) : null,
    logLoss: forecastRows.length ? logLoss(forecastRows) : null,
    marketLogLoss: forecastRows.length ? logLoss(forecastRows.map((row) => ({ probability: row.marketProbability, outcome: row.outcome }))) : null,
    realizedClvCents: weightedMean(clv),
    displayedExpectedEdgeCents: weightedMean(expectedEdgeCents),
    calibrationSlope40: calibrationSlope(trailing40),
    calibrationSmallSample: trailing40.length < 40,
    maxFeaturePsi: featurePsi(referenceFeatures, currentFeatures),
    scoringEnvironment: scoring.current,
    trailingScoringMean: scoring.mean,
    trailingScoringInterval: scoring.interval,
    modelRun,
    dataFreshness: freshness(nflverse.map((state) => state.freshness)),
    failedJobs: [...new Set(failedRunResult.results.map((row) => row.message))],
    injurySourceStatus: freshness(injuries.map((state) => state.freshness)),
    oddsCreditsUsed: quota?.used ?? 0,
    generatedAt,
    priorWeeklyClvGapCents: priorGaps
  });
  const digestHash = stableHash(digest);
  await input.db.prepare(`INSERT INTO weekly_digests (id, season, week, digest_json, digest_hash, generated_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(season, week) DO UPDATE SET digest_json = excluded.digest_json,
      digest_hash = excluded.digest_hash, generated_at = excluded.generated_at`)
    .bind(digest.id, season, week, JSON.stringify(digest), digestHash, generatedAt).run();
  for (const alert of digest.alerts) await publishModelSystemAlert(input.db, alert);
  if (digest.oddsCreditsUsed >= structuralConfig.monitoring.creditAlert) {
    await publishModelSystemAlert(input.db, {
      id: `credit-budget:${generatedAt.slice(0, 7)}`,
      type: "credit_budget",
      severity: "warning",
      message: `Odds usage reached ${digest.oddsCreditsUsed}/${structuralConfig.monitoring.creditCeiling}; non-essential snapshots are throttled.`,
      idempotencyKey: `credit-budget:${generatedAt.slice(0, 7)}`,
      createdAt: generatedAt,
      acknowledgedAt: null
    });
  }
  return digest;
}

export async function latestWeeklyDigest(db: D1Database): Promise<WeeklyDigest | null> {
  await ensureWeeklyDigestStore(db);
  const row = await db.prepare("SELECT digest_json FROM weekly_digests ORDER BY season DESC, week DESC LIMIT 1")
    .first<{ digest_json: string }>();
  return row ? parseJson<WeeklyDigest | null>(row.digest_json, null) : null;
}
