import { stableHash } from "@/domain/hash";
import { deterministicSnapshotKey } from "@/domain/automation";
import { createAdminClient } from "@/server/supabase/admin";
import { fetchOddsSnapshots } from "@/server/providers/the-odds-api";
import { fetchOfficialInjuries } from "@/server/providers/official-injuries";
import { fetchNflverseDataset, NFLVERSE_URLS } from "@/server/providers/nflverse";

export type JobName =
  | "data-refresh"
  | "loop-a"
  | "loop-b"
  | "forecast-refresh"
  | "odds-snapshot"
  | "inactives-roof"
  | "settlement"
  | "credit-meter"
  | "weekly-digest";

export async function runJob(name: JobName, scheduledFor: string): Promise<{
  job: JobName;
  idempotencyKey: string;
  runHash: string;
  state: "completed" | "already_completed";
}> {
  const idempotencyKey = deterministicSnapshotKey({
    provider: name === "odds-snapshot" ? "the-odds-api" : "projection-lab",
    job: name,
    scheduledFor
  });
  const teamId = requiredEnv("PROJECTION_TEAM_ID");
  const admin = createAdminClient();
  const existing = await admin
    .from("pipeline_runs")
    .select("status,output_hash")
    .eq("team_id", teamId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing.error) throw new Error(`Pipeline idempotency lookup failed: ${existing.error.message}`);
  if (existing.data?.status === "completed") {
    return {
      job: name,
      idempotencyKey,
      runHash: existing.data.output_hash,
      state: "already_completed"
    };
  }
  if (!existing.data) {
    const inserted = await admin.from("pipeline_runs").insert({
      team_id: teamId,
      job_name: name,
      idempotency_key: idempotencyKey,
      status: "running",
      freshness: "stale",
      scheduled_for: scheduledFor
    });
    if (inserted.error) throw new Error(`Pipeline run could not start: ${inserted.error.message}`);
  }
  try {
    const output = name === "odds-snapshot"
      ? await importOdds(teamId, scheduledFor)
      : name === "data-refresh"
        ? await importWeeklyData(teamId, scheduledFor)
        : await callTransactionalWorker(name, teamId, scheduledFor, idempotencyKey);
    const runHash = stableHash(output);
    const completed = await admin.from("pipeline_runs").update({
      status: "completed",
      freshness: "current",
      output_hash: runHash,
      completed_at: new Date().toISOString(),
      error_message: null
    }).eq("team_id", teamId).eq("idempotency_key", idempotencyKey);
    if (completed.error) throw new Error(`Pipeline completion log failed: ${completed.error.message}`);
    return { job: name, idempotencyKey, runHash, state: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline failure";
    await admin.from("pipeline_runs").update({
      status: "failed",
      freshness: "stale",
      error_message: message,
      completed_at: new Date().toISOString()
    }).eq("team_id", teamId).eq("idempotency_key", idempotencyKey);
    await admin.from("forecasts").update({ freshness: "stale" }).eq("team_id", teamId);
    await admin.from("system_alerts").upsert({
      team_id: teamId,
      type: "pipeline_failure",
      severity: "critical",
      message: `${name} aborted: ${message}`,
      idempotency_key: `pipeline_failure:${idempotencyKey}`
    }, { onConflict: "team_id,idempotency_key", ignoreDuplicates: true });
    throw error;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; the job aborted without changing forecasts`);
  return value;
}

async function importOdds(teamId: string, scheduledFor: string) {
  const result = await fetchOddsSnapshots({
    apiKey: requiredEnv("ODDS_API_KEY"),
    scheduledFor
  });
  if (result.used > 450) throw new Error("Odds credit ceiling exceeded; snapshot was not published");
  const admin = createAdminClient();
  const rows = result.snapshots.map((snapshot) => ({
    team_id: teamId,
    snapshot_key: snapshot.id,
    game_id: snapshot.gameId,
    book: snapshot.book,
    market: snapshot.market,
    side: snapshot.side,
    point: snapshot.point,
    american_price: snapshot.americanPrice,
    captured_at: snapshot.capturedAt,
    source_hash: snapshot.sourceHash,
    quota_headers: snapshot.quota,
    freshness: "current"
  }));
  const persisted = await admin.from("odds_snapshots").upsert(rows, {
    onConflict: "team_id,snapshot_key,book,market,side",
    ignoreDuplicates: true
  });
  if (persisted.error) throw new Error(`Odds snapshot transaction aborted: ${persisted.error.message}`);
  const credit = await admin.from("credit_usage").insert({
    team_id: teamId,
    billing_period: scheduledFor.slice(0, 7),
    response_used: result.used,
    response_remaining: result.remaining,
    response_last_cost: result.lastCost,
    projected_usage: result.used,
    throttle_state: result.used >= 400 ? ["ordinary_tuesday_saturday"] : [],
    captured_at: scheduledFor
  });
  if (credit.error) throw new Error(`Credit ledger transaction aborted: ${credit.error.message}`);
  return { snapshots: rows.length, sourceHash: result.rawHash, creditsUsed: result.used };
}

async function importWeeklyData(teamId: string, scheduledFor: string) {
  const officialEndpoint = requiredEnv("OFFICIAL_INJURY_FEED_URL");
  const expectedTeams = requiredEnv("NFL_EXPECTED_TEAMS").split(",").map((team) => team.trim()).filter(Boolean);
  const [schedules, rosters, pbp, historicalInjuries, officialInjuries] = await Promise.all([
    fetchNflverseDataset(NFLVERSE_URLS.schedules),
    fetchNflverseDataset(NFLVERSE_URLS.rosters(2026)),
    fetchNflverseDataset(NFLVERSE_URLS.pbp(2026)),
    fetchNflverseDataset(NFLVERSE_URLS.historicalInjuries(2024)),
    fetchOfficialInjuries({ endpoint: officialEndpoint, expectedTeams })
  ]);
  const admin = createAdminClient();
  const rawRows = [
    ["schedules", schedules],
    ["rosters", rosters],
    ["play_by_play", pbp],
    ["historical_injuries_2024", historicalInjuries]
  ] as const;
  const persistedRaw = await admin.from("raw_data_snapshots").upsert(
    rawRows.map(([dataset, snapshot]) => ({
      team_id: teamId,
      provider: "nflverse",
      dataset,
      snapshot_key: `nflverse:${dataset}:${scheduledFor}`,
      source_url: snapshot.url,
      source_timestamp: snapshot.fetchedAt,
      raw_hash: snapshot.sha256,
      freshness: "current"
    })),
    { onConflict: "team_id,snapshot_key", ignoreDuplicates: true }
  );
  if (persistedRaw.error) throw new Error(`nflverse snapshot transaction aborted: ${persistedRaw.error.message}`);
  const persistedInjuries = await admin.from("normalized_injuries").upsert(
    officialInjuries.map((injury) => ({
      team_id: teamId,
      game_id: injury.gameId,
      player: injury.player,
      nfl_team: injury.team,
      practice_status: injury.practiceStatus,
      game_status: injury.gameStatus,
      inactive: injury.inactive,
      source_url: injury.sourceUrl,
      source_timestamp: injury.sourceTimestamp,
      raw_snapshot_hash: injury.rawSnapshotHash
    })),
    { onConflict: "team_id,game_id,player,raw_snapshot_hash", ignoreDuplicates: true }
  );
  if (persistedInjuries.error) throw new Error(`Official injury transaction aborted: ${persistedInjuries.error.message}`);
  return {
    nflverseHashes: rawRows.map(([dataset, snapshot]) => [dataset, snapshot.sha256]),
    officialInjuries: officialInjuries.length
  };
}

async function callTransactionalWorker(
  name: Exclude<JobName, "odds-snapshot" | "data-refresh">,
  teamId: string,
  scheduledFor: string,
  idempotencyKey: string
) {
  const workerUrl = requiredEnv("PIPELINE_WORKER_URL");
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${requiredEnv("PIPELINE_WORKER_SECRET")}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey
    },
    body: JSON.stringify({ job: name, teamId, scheduledFor })
  });
  if (!response.ok) throw new Error(`${name} worker aborted with HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}
