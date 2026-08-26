import { stableHash } from "@/domain/hash";
import { bootstrapOddsQuotaState, getOddsQuotaState, type OddsQuotaState } from "@/server/odds-quota";

export const OWNER_ATTESTED_ODDS_USED = 38;
export const OWNER_ATTESTED_ODDS_REMAINING = 462;
export const OWNER_ATTESTED_CREDENTIAL_GENERATION = "oddsapi-20260825-owner-rotation-01";

const PROBE_RESERVATIONS = "engine_os_quota_probe_reservations";
const PROBE_EVENTS = "engine_os_quota_probe_events";

export interface LiveQuotaQualificationResult {
  bootstrapStatus: "applied" | "already_applied";
  quotaState: OddsQuotaState;
  probe: {
    contenders: number;
    acquired: number;
    reservationRows: number;
    eventRows: number;
    rollbackFailureObserved: boolean;
    rollbackRows: number;
    temporaryObjectsRemoved: boolean;
  };
}

function exactAttestedState(state: OddsQuotaState | null): boolean {
  return state?.credentialGenerationId === OWNER_ATTESTED_CREDENTIAL_GENERATION &&
    state.used === OWNER_ATTESTED_ODDS_USED &&
    state.remaining === OWNER_ATTESTED_ODDS_REMAINING &&
    state.lastCost === 0;
}

async function bootstrapOwnerAttestedState(
  db: D1Database,
  observedAt: string
): Promise<{ status: "applied" | "already_applied"; state: OddsQuotaState }> {
  const existing = await getOddsQuotaState(db);
  if (existing && exactAttestedState(existing)) return { status: "already_applied", state: existing };
  if (existing?.credentialGenerationId === OWNER_ATTESTED_CREDENTIAL_GENERATION) {
    throw new Error("Existing quota state conflicts with the owner-attested counters");
  }
  try {
    const state = await bootstrapOddsQuotaState({
      used: OWNER_ATTESTED_ODDS_USED,
      remaining: OWNER_ATTESTED_ODDS_REMAINING,
      observedAt,
      credentialGenerationId: OWNER_ATTESTED_CREDENTIAL_GENERATION,
      operatorAttestation: "verified_against_provider_dashboard"
    }, db);
    if (!exactAttestedState(state)) throw new Error("Quota bootstrap did not preserve the attested counters");
    return { status: "applied", state };
  } catch (error) {
    const concurrent = await getOddsQuotaState(db);
    if (concurrent && exactAttestedState(concurrent)) return { status: "already_applied", state: concurrent };
    throw error;
  }
}

function changes(result: unknown): number {
  return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
}

async function dropProbeObjects(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`DROP TABLE IF EXISTS ${PROBE_EVENTS}`),
    db.prepare(`DROP TABLE IF EXISTS ${PROBE_RESERVATIONS}`)
  ]);
}

async function runIsolatedD1Probe(db: D1Database, now: string): Promise<LiveQuotaQualificationResult["probe"]> {
  await dropProbeObjects(db);
  await db.batch([
    db.prepare(`CREATE TABLE ${PROBE_RESERVATIONS} (
      request_key text PRIMARY KEY NOT NULL,
      holder_hash text NOT NULL,
      reserved_at text NOT NULL
    )`),
    db.prepare(`CREATE TABLE ${PROBE_EVENTS} (
      event_id text PRIMARY KEY NOT NULL,
      request_key text NOT NULL,
      holder_hash text NOT NULL,
      occurred_at text NOT NULL,
      FOREIGN KEY (request_key) REFERENCES ${PROBE_RESERVATIONS} (request_key)
    )`)
  ]);

  const requestKey = `live-d1-contention:${stableHash({ now })}`;
  const contender = async (ordinal: number) => {
    const holderHash = stableHash({ requestKey, ordinal });
    const eventId = stableHash({ requestKey, holderHash, type: "reserved" });
    const result = await db.batch([
      db.prepare(`INSERT INTO ${PROBE_RESERVATIONS} (
          request_key, holder_hash, reserved_at
        ) VALUES (?, ?, ?) ON CONFLICT(request_key) DO NOTHING`)
        .bind(requestKey, holderHash, now),
      db.prepare(`INSERT INTO ${PROBE_EVENTS} (event_id, request_key, holder_hash, occurred_at)
        SELECT ?, request_key, holder_hash, ? FROM ${PROBE_RESERVATIONS}
        WHERE request_key = ? AND holder_hash = ?
        ON CONFLICT(event_id) DO NOTHING`)
        .bind(eventId, now, requestKey, holderHash)
    ]);
    return { acquired: changes(result[0]) === 1, holderHash, eventId };
  };

  let result: Omit<LiveQuotaQualificationResult["probe"], "temporaryObjectsRemoved">;
  try {
    const contenders = await Promise.all([contender(1), contender(2)]);
    const rows = await db.prepare(`SELECT request_key, holder_hash FROM ${PROBE_RESERVATIONS}`)
      .all<{ request_key: string; holder_hash: string }>();
    const events = await db.prepare(`SELECT event_id, request_key, holder_hash FROM ${PROBE_EVENTS}`)
      .all<{ event_id: string; request_key: string; holder_hash: string }>();
    const winners = contenders.filter((entry) => entry.acquired);
    if (winners.length !== 1 || rows.results.length !== 1 || events.results.length !== 1 ||
      rows.results[0]?.holder_hash !== winners[0]?.holderHash ||
      events.results[0]?.holder_hash !== winners[0]?.holderHash) {
      throw new Error("Deployed D1 did not preserve exactly one reservation holder and matching event");
    }

    const rollbackKey = `${requestKey}:rollback`;
    let rollbackFailureObserved = false;
    try {
      await db.batch([
        db.prepare(`INSERT INTO ${PROBE_RESERVATIONS} (request_key, holder_hash, reserved_at)
          VALUES (?, ?, ?)`).bind(rollbackKey, stableHash({ rollbackKey }), now),
        db.prepare(`INSERT INTO ${PROBE_EVENTS} (event_id, request_key, holder_hash, occurred_at)
          VALUES (?, ?, ?, ?)`).bind(
            events.results[0]!.event_id,
            rollbackKey,
            stableHash({ rollbackKey }),
            now
          )
      ]);
    } catch {
      rollbackFailureObserved = true;
    }
    const rollback = await db.prepare(`SELECT count(*) AS count FROM ${PROBE_RESERVATIONS}
      WHERE request_key = ?`).bind(rollbackKey).first<{ count: number }>();
    const rollbackRows = Number(rollback?.count ?? -1);
    if (!rollbackFailureObserved || rollbackRows !== 0) {
      throw new Error("Deployed D1 batch rollback falsification failed");
    }
    result = {
      contenders: contenders.length,
      acquired: winners.length,
      reservationRows: rows.results.length,
      eventRows: events.results.length,
      rollbackFailureObserved,
      rollbackRows
    };
  } finally {
    await dropProbeObjects(db);
  }
  const remaining = await db.prepare(`SELECT count(*) AS count FROM sqlite_schema
    WHERE name IN (?, ?)`).bind(PROBE_RESERVATIONS, PROBE_EVENTS).first<{ count: number }>();
  const temporaryObjectsRemoved = Number(remaining?.count ?? -1) === 0;
  if (!temporaryObjectsRemoved) throw new Error("Temporary D1 qualification objects were not removed");
  return { ...result, temporaryObjectsRemoved };
}

export async function qualifyLiveOddsQuota(
  db: D1Database,
  observedAt = new Date().toISOString()
): Promise<LiveQuotaQualificationResult> {
  const bootstrap = await bootstrapOwnerAttestedState(db, observedAt);
  const probe = await runIsolatedD1Probe(db, observedAt);
  return {
    bootstrapStatus: bootstrap.status,
    quotaState: bootstrap.state,
    probe
  };
}
