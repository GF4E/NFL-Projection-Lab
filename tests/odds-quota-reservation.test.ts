import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getD1: () => {
    throw new Error("Tests must inject D1 explicitly");
  }
}));
import scheduleManifest from "../config/2026-nfl-schedule.v1.json";
import { approvedOddsQuotaPlan } from "@/domain/odds-approved-plan";
import {
  futurePriorityReserveCredits,
  RESET_TIMEZONE_OFFSETS_MINUTES,
  simulateAllPublishedResetScenarios,
  simulateQuotaSchedule
} from "@/domain/odds-quota-budget";
import { scheduledSeasonMainlinePlan, scheduledSeasonQuotaPlanHash, type OddsAutomationJob } from "@/domain/odds-schedule";
import { stableHash } from "@/domain/hash";
import {
  bootstrapOddsQuotaState,
  getOddsQuotaState,
  listOutstandingOddsQuotaReservations,
  markOddsQuotaChargeUnknown,
  markOddsQuotaDispatched,
  providerMonthlyResetWindow,
  releaseOddsQuotaBeforeDispatch,
  reserveOddsQuota,
  settleOddsQuotaReservation
} from "@/server/odds-quota";
import { refreshCompleteSlateMainlines } from "@/server/odds-automation";

type SqlValue = string | number | bigint | Uint8Array | null;

class TestR2 {
  readonly objects = new Map<string, Uint8Array>();
  constructor(private readonly failWrites = false) {}

  async head(key: string) {
    return this.objects.has(key) ? { key } : null;
  }

  async put(key: string, value: Uint8Array | ReadableStream) {
    if (this.failWrites) throw new Error("synthetic R2 write failure");
    const bytes = value instanceof Uint8Array
      ? value.slice()
      : new Uint8Array(await new Response(value).arrayBuffer());
    this.objects.set(key, bytes);
    return { key };
  }

  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      body: new Blob([bytes.slice().buffer]).stream(),
      async arrayBuffer() { return bytes.slice().buffer; }
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function sqliteD1(db: DatabaseSync): D1Database {
  function prepare(sql: string) {
    let parameters: SqlValue[] = [];
    return {
      bind(...values: unknown[]) {
        parameters = values as SqlValue[];
        return this;
      },
      async run() {
        const result = db.prepare(sql).run(...parameters);
        return { meta: { changes: Number(result.changes) } };
      },
      async first<T>() {
        return (db.prepare(sql).get(...parameters) ?? null) as T | null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...parameters) as T[], success: true, meta: {} };
      },
      async raw<T>() {
        return db.prepare(sql).all(...parameters).map((row) => Object.values(row as Record<string, T>));
      }
    };
  }
  return {
    prepare,
    // Each reservation decision is one conditional INSERT. Running the batch
    // statements synchronously lets overlapping promises falsify the former
    // read/check/write race without weakening SQLite's statement atomicity.
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
    async exec(sql: string) { db.exec(sql); return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); }
  } as unknown as D1Database;
}

function applySql(db: DatabaseSync, filename: string): void {
  db.exec(readFileSync(resolve(process.cwd(), filename), "utf8")
    .replaceAll("--> statement-breakpoint", ""));
}

function quotaDb(): { sqlite: DatabaseSync; d1: D1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  applySql(sqlite, "drizzle/0004_player_prop_decision_board.sql");
  applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
  applySql(sqlite, "drizzle/0014_odds_quota_reservations.sql");
  return { sqlite, d1: sqliteD1(sqlite) };
}

async function bootstrap(d1: D1Database, used: number, observedAt = new Date().toISOString()) {
  return bootstrapOddsQuotaState({
    used,
    remaining: 500 - used,
    observedAt,
    credentialGenerationId: "rotation-2026-08-25-r2",
    operatorAttestation: "verified_against_provider_dashboard"
  }, d1);
}

function approvedRequest(
  job: Exclude<OddsAutomationJob, "props_minus_60">,
  index = 0
) {
  const contract = approvedOddsQuotaPlan().filter((item) => item.candidate.job === job)[index];
  if (!contract) throw new Error(`Missing approved ${job} request ${index}`);
  return {
    requestKey: contract.requestKey,
    requestClass: contract.requestClass,
    reservedCost: contract.reservedCost,
    futureReserve: contract.futureReserve,
    quotaPlanHash: contract.quotaPlanHash
  };
}

function approvedRefreshRequest(
  job: Exclude<OddsAutomationJob, "props_minus_60">,
  index = 0
) {
  const contract = approvedRequest(job, index);
  return {
    snapshotKey: contract.requestKey,
    requestClass: contract.requestClass,
    futureReserveCredits: contract.futureReserve,
    quotaPlanHash: contract.quotaPlanHash
  };
}

describe("OS-19A atomic quota reservation", () => {
  it("derives the full request plan from the pinned 2026 schedule and preserves essential work", () => {
    expect(scheduleManifest.source.commit).toBe("66abff2fb404bb3a77fcb4886910d901d32b8e51");
    expect(scheduleManifest.source.csvSha256).toBe("ee90aae773984ae143426294b2724988f7f65e6d21e031212731f622e977b580");
    expect(scheduleManifest.games).toHaveLength(272);
    expect(stableHash({ contract: "engine-os.normalized-2026-nfl-schedule.v1", games: scheduleManifest.games }))
      .toBe(scheduleManifest.normalizedGamesSha256);
    expect(new Set(scheduleManifest.games.map((game) => game.week))).toHaveLength(18);
    expect(new Set(scheduleManifest.games.map((game) => game.kickoffAt))).toHaveLength(118);

    const plan = scheduledSeasonMainlinePlan(scheduleManifest.games);
    expect(plan).toHaveLength(480);
    expect(plan.filter((request) => request.job === "open_sunday")).toHaveLength(18);
    expect(plan.filter((request) => request.job === "open_monday")).toHaveLength(18);
    expect(plan.filter((request) => request.job === "tuesday_origin")).toHaveLength(18);
    expect(plan.filter((request) => request.job === "daily")).toHaveLength(72);
    expect(plan.filter((request) => request.job === "kickoff_minus_120")).toHaveLength(118);
    expect(plan.filter((request) => request.job === "kickoff_minus_60")).toHaveLength(118);
    expect(plan.filter((request) => request.job === "kickoff_minus_15")).toHaveLength(118);
    expect(plan.some((request) => request.job === "props_minus_60")).toBe(false);
    expect(plan[0]?.scheduledFor).toBe("2026-09-07T01:00:00.000Z");
    for (const job of ["daily", "kickoff_minus_120", "kickoff_minus_60"] as const) {
      const approved = approvedOddsQuotaPlan().find((item) => item.candidate.job === job)!;
      expect(approved.futureReserve).toBe(futurePriorityReserveCredits({
        candidate: approved.candidate,
        games: scheduleManifest.games
      }));
    }

    const simulations = simulateAllPublishedResetScenarios(scheduleManifest.games);
    expect(simulations).toHaveLength(RESET_TIMEZONE_OFFSETS_MINUTES.length);
    expect(simulations.every((simulation) => simulation.withinCeiling)).toBe(true);
    expect(simulations.every((simulation) => simulation.allAlwaysPreserved)).toBe(true);
    expect(Math.max(...simulations.flatMap((simulation) =>
      simulation.periods.map((period) => period.projectedCredits)))).toBe(399);
    expect(Math.max(...simulations.flatMap((simulation) =>
      simulation.periods.map((period) => period.scheduledCredits)))).toBe(405);
    expect(simulations.some((simulation) => simulation.periods.some((period) => period.alertRequired))).toBe(true);
    for (const offset of RESET_TIMEZONE_OFFSETS_MINUTES) {
      const instant = new Date(Date.UTC(2026, 9, 1, 0, 15) - offset * 60_000).toISOString();
      expect(providerMonthlyResetWindow(instant)).toBe(true);
    }
    expect(providerMonthlyResetWindow("2026-10-15T00:15:00.000Z")).toBe(false);

    const utc = simulations.find((simulation) => simulation.resetOffsetMinutes === 0)!;
    const busiest = [...utc.periods].sort((left, right) => right.scheduledCredits - left.scheduledCredits)[0]!;
    const stressed = simulateQuotaSchedule({
      plan,
      resetOffsetMinutes: 0,
      startingUsageByPeriod: { [busiest.periodKey]: 3 }
    });
    expect(stressed.periods.find((period) => period.periodKey === busiest.periodKey)?.alertRequired).toBe(true);
    expect(stressed.withinCeiling).toBe(true);
    expect(stressed.allAlwaysPreserved).toBe(true);
  });

  it("binds every reservation to the approved plan hash and exact request contract", async () => {
    const { sqlite, d1 } = quotaDb();
    const now = new Date().toISOString();
    await bootstrap(d1, 0, now);
    const canonical = approvedRequest("kickoff_minus_15", 0);

    await expect(reserveOddsQuota({
      ...canonical,
      quotaPlanHash: "f".repeat(64),
      now
    }, d1)).rejects.toThrow(/not the approved 2026 manifest/);
    await expect(reserveOddsQuota({
      ...canonical,
      requestKey: "unregistered-request-key",
      now
    }, d1)).rejects.toThrow(/absent from the approved 2026 manifest/);
    await expect(reserveOddsQuota({
      ...canonical,
      futureReserve: canonical.futureReserve + 1,
      now
    }, d1)).rejects.toThrow(/contract differs/);
    await expect(reserveOddsQuota({
      ...canonical,
      requestClass: "ordinary",
      now
    }, d1)).rejects.toThrow(/contract differs/);
    await expect(reserveOddsQuota({
      ...canonical,
      reservedCost: canonical.reservedCost + 1,
      now
    }, d1)).rejects.toThrow(/contract differs/);

    const shiftedGames = scheduleManifest.games.map((game, index) => index === 0
      ? { ...game, kickoffAt: new Date(Date.parse(game.kickoffAt) + 5 * 60_000).toISOString() }
      : game);
    expect(scheduledSeasonQuotaPlanHash(shiftedGames)).not.toBe(scheduleManifest.quotaPlanSha256);
    const approvedKeys = new Set(approvedOddsQuotaPlan().map((item) => item.requestKey));
    const shiftedCandidate = scheduledSeasonMainlinePlan(shiftedGames)
      .find((candidate) => !approvedKeys.has(candidate.key));
    expect(shiftedCandidate).toBeTruthy();
    await expect(reserveOddsQuota({
      ...canonical,
      requestKey: shiftedCandidate!.key,
      now
    }, d1)).rejects.toThrow(/absent from the approved 2026 manifest/);
    expect(sqlite.prepare("SELECT count(*) AS count FROM odds_quota_reservations").get())
      .toEqual({ count: 0 });

    const ineligible = approvedOddsQuotaPlan().find((item) => !item.allowedAcrossResetScenarios);
    expect(ineligible).toBeTruthy();
    await expect(reserveOddsQuota({
      requestKey: ineligible!.requestKey,
      requestClass: ineligible!.requestClass,
      reservedCost: ineligible!.reservedCost,
      futureReserve: ineligible!.futureReserve,
      quotaPlanHash: ineligible!.quotaPlanHash,
      now
    }, d1)).rejects.toThrow(/throttled by at least one approved reset scenario/);

    const exact = await reserveOddsQuota({ ...canonical, now }, d1);
    expect(exact).toMatchObject({ acquired: true });
    expect(sqlite.prepare(`SELECT quota_plan_hash FROM odds_quota_reservations
      WHERE request_key = ?`).get(canonical.requestKey))
      .toEqual({ quota_plan_hash: scheduleManifest.quotaPlanSha256 });
    sqlite.close();
  });

  it("allows one late canonical recovery but rejects synthetic retry identities", async () => {
    const { sqlite, d1 } = quotaDb();
    const bootstrapAt = new Date().toISOString();
    await bootstrap(d1, 0, bootstrapAt);
    const canonical = approvedRequest("open_sunday", 0);
    const scheduledFor = approvedOddsQuotaPlan()
      .find((item) => item.requestKey === canonical.requestKey)!.candidate.scheduledFor;
    const recoveredAt = new Date(Date.parse(scheduledFor) + 60 * 60_000).toISOString();
    sqlite.prepare("UPDATE odds_quota_state SET updated_at = ? WHERE provider = 'the-odds-api'")
      .run(recoveredAt);

    const recovered = await reserveOddsQuota({ ...canonical, now: recoveredAt }, d1);
    expect(recovered).toMatchObject({ acquired: true });
    const duplicate = await reserveOddsQuota({ ...canonical, now: recoveredAt }, d1);
    expect(duplicate).toMatchObject({ acquired: false, reason: "duplicate" });
    await expect(reserveOddsQuota({
      ...canonical,
      requestKey: `${canonical.requestKey}:recovery-1`,
      now: recoveredAt
    }, d1)).rejects.toThrow(/absent from the approved 2026 manifest/);
    expect(sqlite.prepare("SELECT count(*) AS count FROM odds_quota_reservations").get())
      .toEqual({ count: 1 });
    sqlite.close();
  });

  it("allows exactly one overlapping reservation at the hard ceiling and deduplicates its alert", async () => {
    const { sqlite, d1 } = quotaDb();
    const now = new Date().toISOString();
    await bootstrap(d1, 447, now);

    const attempts = await Promise.allSettled([
      reserveOddsQuota({
        ...approvedRequest("kickoff_minus_15", 0),
        now
      }, d1),
      reserveOddsQuota({
        ...approvedRequest("kickoff_minus_15", 1),
        now
      }, d1)
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(sqlite.prepare("SELECT count(*) AS count FROM odds_quota_reservations").get())
      .toEqual({ count: 1 });

    const winner = attempts.find((attempt) => attempt.status === "fulfilled");
    expect(winner?.status).toBe("fulfilled");
    if (winner?.status !== "fulfilled" || !winner.value.acquired) throw new Error("No reservation winner");
    const duplicate = await reserveOddsQuota({
      ...approvedRequest("kickoff_minus_15", winner.value.reservation.requestKey ===
        approvedRequest("kickoff_minus_15", 0).requestKey ? 0 : 1),
      now
    }, d1);
    expect(duplicate).toMatchObject({ acquired: false, reason: "duplicate" });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM odds_quota_reservation_events
      WHERE event_type = 'reserved'`).get()).toEqual({ count: 1 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'odds_quota_guard' AND payload_json LIKE '%"reason":"threshold"%'`).get())
      .toEqual({ count: 1 });
    sqlite.close();
  });

  it("fails closed on missing and stale counters with one alert per epoch and reason", async () => {
    const missing = quotaDb();
    await expect(reserveOddsQuota({
      ...approvedRequest("open_sunday", 0),
      now: new Date().toISOString()
    }, missing.d1)).rejects.toThrow(/missing_state/);
    expect(missing.sqlite.prepare("SELECT count(*) AS count FROM engine_system_alerts").get())
      .toEqual({ count: 1 });
    missing.sqlite.close();

    const stale = quotaDb();
    const now = new Date();
    await bootstrap(stale.d1, 12, now.toISOString());
    stale.sqlite.prepare("UPDATE odds_quota_state SET updated_at = ? WHERE provider = 'the-odds-api'")
      .run(new Date(now.getTime() - 3 * 86_400_000).toISOString());
    for (const request of [approvedRequest("open_sunday", 0), approvedRequest("open_sunday", 1)]) {
      await expect(reserveOddsQuota({
        ...request,
        now: now.toISOString()
      }, stale.d1)).rejects.toThrow(/stale_state/);
    }
    expect(stale.sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'odds_quota_guard' AND payload_json LIKE '%"reason":"stale_state"%'`).get())
      .toEqual({ count: 1 });
    stale.sqlite.close();
  });

  it("holds ambiguous charges against capacity until authoritative headers settle them", async () => {
    const { sqlite, d1 } = quotaDb();
    const reservedAt = new Date().toISOString();
    await bootstrap(d1, 30, reservedAt);
    const firstRequest = approvedRequest("kickoff_minus_60", 0);
    const secondRequest = approvedRequest("kickoff_minus_60", 1);
    const reservation = await reserveOddsQuota({
      ...firstRequest,
      now: reservedAt
    }, d1);
    if (!reservation.acquired) throw new Error("Reservation was not acquired");
    await markOddsQuotaDispatched({
      requestKey: firstRequest.requestKey,
      dispatchToken: reservation.dispatchToken,
      dispatchedAt: reservedAt
    }, d1);
    await markOddsQuotaChargeUnknown({
      requestKey: firstRequest.requestKey,
      dispatchToken: reservation.dispatchToken,
      markedAt: reservedAt
    }, d1);
    expect(await listOutstandingOddsQuotaReservations(d1)).toEqual([
      expect.objectContaining({ requestKey: firstRequest.requestKey, state: "charge_unknown", reservedCost: 3 })
    ]);

    const second = await reserveOddsQuota({
      ...secondRequest,
      now: reservedAt
    }, d1);
    if (!second.acquired) throw new Error("Second reservation was not acquired");
    await markOddsQuotaDispatched({
      requestKey: secondRequest.requestKey,
      dispatchToken: second.dispatchToken,
      dispatchedAt: reservedAt
    }, d1);
    const settledAt = new Date(Date.parse(reservedAt) + 1_000).toISOString();
    await settleOddsQuotaReservation({
      requestKey: secondRequest.requestKey,
      dispatchToken: second.dispatchToken,
      used: 36,
      remaining: 464,
      lastCost: 3,
      updatedAt: settledAt
    }, d1);
    expect(await listOutstandingOddsQuotaReservations(d1)).toEqual([]);
    expect(await getOddsQuotaState(d1)).toMatchObject({ used: 36, remaining: 464 });
    expect(sqlite.prepare(`SELECT group_concat(event_type, ',') AS events
      FROM odds_quota_reservation_events WHERE request_key = ?
      ORDER BY occurred_at`).get(firstRequest.requestKey)).toEqual({ events: "reserved,dispatched,charge_unknown,settled" });
    sqlite.close();
  });

  it("serializes provider dispatch and rejects a delayed lower-counter response", async () => {
    const { sqlite, d1 } = quotaDb();
    const now = new Date().toISOString();
    const initial = await bootstrap(d1, 0, now);
    const firstRequest = approvedRequest("kickoff_minus_15", 0);
    const secondRequest = approvedRequest("kickoff_minus_15", 1);
    const first = await reserveOddsQuota({ ...firstRequest, now }, d1);
    const second = await reserveOddsQuota({ ...secondRequest, now }, d1);
    if (!first.acquired || !second.acquired) throw new Error("Both planned reservations must be acquired");

    await markOddsQuotaDispatched({
      requestKey: firstRequest.requestKey,
      dispatchToken: first.dispatchToken,
      dispatchedAt: now
    }, d1);
    await expect(markOddsQuotaDispatched({
      requestKey: secondRequest.requestKey,
      dispatchToken: second.dispatchToken,
      dispatchedAt: now
    }, d1)).rejects.toThrow(/cannot transition/);

    await markOddsQuotaChargeUnknown({
      requestKey: firstRequest.requestKey,
      dispatchToken: first.dispatchToken,
      markedAt: now
    }, d1);
    await markOddsQuotaDispatched({
      requestKey: secondRequest.requestKey,
      dispatchToken: second.dispatchToken,
      dispatchedAt: now
    }, d1);
    const secondReceivedAt = new Date(Date.parse(now) + 1_000).toISOString();
    await settleOddsQuotaReservation({
      requestKey: secondRequest.requestKey,
      dispatchToken: second.dispatchToken,
      used: 6,
      remaining: 494,
      lastCost: 3,
      updatedAt: secondReceivedAt
    }, d1);
    await expect(settleOddsQuotaReservation({
      requestKey: firstRequest.requestKey,
      dispatchToken: first.dispatchToken,
      used: 3,
      remaining: 497,
      lastCost: 3,
      updatedAt: new Date(Date.parse(secondReceivedAt) + 1_000).toISOString()
    }, d1)).rejects.toThrow(/dispatched quota reservation/);

    expect(await getOddsQuotaState(d1)).toMatchObject({
      used: 6,
      remaining: 494,
      quotaEpoch: initial.quotaEpoch
    });
    expect(await listOutstandingOddsQuotaReservations(d1)).toEqual([]);
    expect(sqlite.prepare(`SELECT state FROM odds_quota_reservations WHERE request_key = ?`)
      .get(firstRequest.requestKey)).toEqual({ state: "settled" });
    sqlite.close();
  });

  it("starts a new quota epoch only from authoritative lower counters in the reset window", async () => {
    const { sqlite, d1 } = quotaDb();
    const reservedAt = new Date().toISOString();
    const initial = await bootstrap(d1, 399, reservedAt);
    const resetRequest = approvedRequest("open_sunday", 0);
    const supersededRequest = approvedRequest("open_monday", 0);
    const reservation = await reserveOddsQuota({
      ...resetRequest,
      now: reservedAt
    }, d1);
    const superseded = await reserveOddsQuota({
      ...supersededRequest,
      now: reservedAt
    }, d1);
    if (!reservation.acquired || !superseded.acquired) throw new Error("Reset reservations were not acquired");
    await markOddsQuotaDispatched({
      requestKey: resetRequest.requestKey,
      dispatchToken: reservation.dispatchToken,
      dispatchedAt: reservedAt
    }, d1);
    const resetAt = "2026-09-01T00:15:00.000Z";
    const reset = await settleOddsQuotaReservation({
      requestKey: resetRequest.requestKey,
      dispatchToken: reservation.dispatchToken,
      used: 3,
      remaining: 497,
      lastCost: 3,
      updatedAt: resetAt
    }, d1);
    expect(reset.quotaEpoch).not.toBe(initial.quotaEpoch);
    expect(reset).toMatchObject({ used: 3, remaining: 497 });
    await expect(markOddsQuotaDispatched({
      requestKey: supersededRequest.requestKey,
      dispatchToken: superseded.dispatchToken,
      dispatchedAt: resetAt
    }, d1)).rejects.toThrow(/cannot transition/);
    await releaseOddsQuotaBeforeDispatch({
      requestKey: supersededRequest.requestKey,
      dispatchToken: superseded.dispatchToken,
      releasedAt: resetAt
    }, d1);
    expect(await listOutstandingOddsQuotaReservations(d1)).toEqual([]);
    sqlite.close();
  });

  it("rejects a second dispatch transition and preserves the append-only transition ledger", async () => {
    const { sqlite, d1 } = quotaDb();
    const now = new Date().toISOString();
    await bootstrap(d1, 0, now);
    const singleRequest = approvedRequest("tuesday_origin", 0);
    const reservation = await reserveOddsQuota({
      ...singleRequest,
      now
    }, d1);
    if (!reservation.acquired) throw new Error("Reservation was not acquired");
    await markOddsQuotaDispatched({ requestKey: singleRequest.requestKey, dispatchToken: reservation.dispatchToken, dispatchedAt: now }, d1);
    await expect(markOddsQuotaDispatched({
      requestKey: singleRequest.requestKey,
      dispatchToken: reservation.dispatchToken,
      dispatchedAt: new Date(Date.parse(now) + 1_000).toISOString()
    }, d1)).rejects.toThrow(/cannot transition/);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM odds_quota_reservation_events
      WHERE request_key = ? AND event_type = 'dispatched'`).get(singleRequest.requestKey)).toEqual({ count: 1 });
    expect(() => sqlite.prepare(`UPDATE odds_quota_reservation_events SET payload_json = '{}'
      WHERE request_key = ?`).run(singleRequest.requestKey)).toThrow(/append-only/);
    sqlite.close();
  });

  it("never dispatches without a reservation and never retries an ambiguous request key", async () => {
    const missing = quotaDb();
    let missingCalls = 0;
    await expect(refreshCompleteSlateMainlines({
      apiKey: "test-key-never-persisted",
      matchups: [],
      db: missing.d1,
      fetcher: async () => {
        missingCalls += 1;
        throw new Error("must not be reached");
      },
      ...approvedRefreshRequest("open_sunday", 0),
      fetchedAt: new Date().toISOString(),
      evidenceBucket: {} as R2Bucket
    })).rejects.toThrow(/missing_state/);
    expect(missingCalls).toBe(0);
    missing.sqlite.close();

    const ambiguous = quotaDb();
    const now = new Date().toISOString();
    await bootstrap(ambiguous.d1, 0, now);
    let providerCalls = 0;
    const request = {
      apiKey: "test-key-never-persisted",
      matchups: [],
      db: ambiguous.d1,
      fetcher: async () => {
        providerCalls += 1;
        throw new Error("network outcome unknown");
      },
      ...approvedRefreshRequest("kickoff_minus_15", 0),
      fetchedAt: now,
      evidenceBucket: {} as R2Bucket
    };
    await expect(refreshCompleteSlateMainlines(request)).rejects.toThrow(/before a response was received/);
    expect(providerCalls).toBe(1);
    expect(await listOutstandingOddsQuotaReservations(ambiguous.d1)).toEqual([
      expect.objectContaining({ requestKey: request.snapshotKey, state: "charge_unknown" })
    ]);
    await expect(refreshCompleteSlateMainlines(request)).rejects.toThrow(/Duplicate Odds API request/);
    expect(providerCalls).toBe(1);
    ambiguous.sqlite.close();
  });

  it("preserves raw bytes and marks the charge unknown when quota headers are internally invalid", async () => {
    const { sqlite, d1 } = quotaDb();
    const now = new Date().toISOString();
    await bootstrap(d1, 0, now);
    const bucket = new TestR2();
    const invalidRequest = approvedRefreshRequest("kickoff_minus_15", 0);
    await expect(refreshCompleteSlateMainlines({
      apiKey: "test-key-never-persisted",
      matchups: [],
      db: d1,
      fetcher: async () => new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-requests-used": "4",
          "x-requests-remaining": "497",
          "x-requests-last": "3"
        }
      }),
      ...invalidRequest,
      fetchedAt: now,
      evidenceBucket: bucket as unknown as R2Bucket
    })).rejects.toThrow(/quota headers are invalid/);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_manifests
      WHERE idempotency_key = ?`).get(invalidRequest.snapshotKey)).toEqual({ count: 1 });
    expect(await listOutstandingOddsQuotaReservations(d1)).toEqual([
      expect.objectContaining({ requestKey: invalidRequest.snapshotKey, state: "charge_unknown" })
    ]);
    expect(sqlite.prepare(`SELECT status, failure_code FROM source_capture_heartbeats
      WHERE source_key = 'the-odds-api:odds'`).get()).toEqual({ status: "stale", failure_code: "schema_invalid" });
    sqlite.close();
  });

  it("records storage failure even when quota reconciliation also fails", async () => {
    const { sqlite, d1 } = quotaDb();
    const now = new Date().toISOString();
    await bootstrap(d1, 0, now);
    const storageRequest = approvedRefreshRequest("kickoff_minus_15", 0);
    await expect(refreshCompleteSlateMainlines({
      apiKey: "test-key-never-persisted",
      matchups: [],
      db: d1,
      fetcher: async () => new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-requests-used": "4",
          "x-requests-remaining": "497",
          "x-requests-last": "3"
        }
      }),
      ...storageRequest,
      fetchedAt: now,
      evidenceBucket: new TestR2(true) as unknown as R2Bucket
    })).rejects.toThrow(/storage and quota reconciliation both failed/);
    expect(sqlite.prepare(`SELECT status, failure_code FROM source_capture_heartbeats
      WHERE source_key = 'the-odds-api:odds'`).get()).toEqual({ status: "stale", failure_code: "storage_failure" });
    expect(await listOutstandingOddsQuotaReservations(d1)).toEqual([
      expect.objectContaining({ requestKey: storageRequest.snapshotKey, state: "charge_unknown" })
    ]);
    sqlite.close();
  });
});
