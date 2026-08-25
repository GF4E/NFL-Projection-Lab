import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orchestrate: vi.fn(),
  archive: vi.fn(),
  digest: vi.fn(),
  push: vi.fn()
}));

vi.mock("@/domain/background-maintenance", () => ({
  orchestrateBackgroundMaintenance: mocks.orchestrate
}));
vi.mock("@/server/confidence-engine/automation", () => ({
  runConfidenceEngineAutomation: mocks.archive,
  evaluateCompletedConfidenceForecasts: vi.fn()
}));
vi.mock("@/server/automatic-settlement", () => ({ settleCompletedTeamPlays: vi.fn() }));
vi.mock("@/server/nflverse/automation", () => ({ runNflverseAutomation: vi.fn() }));
vi.mock("@/server/odds-automation", () => ({ runScheduledOddsAutomation: vi.fn() }));
vi.mock("@/server/official-injuries/automation", () => ({ runOfficialInjuryAutomation: vi.fn() }));
vi.mock("@/server/play-store", () => ({ expireStaleTeamDrafts: vi.fn() }));
vi.mock("@/server/pregame-context/automation", () => ({ runOfficialPregameContextAutomation: vi.fn() }));
vi.mock("@/server/weather/automation", () => ({ runKickoffWeatherAutomation: vi.fn() }));
vi.mock("@/server/market-sentiment/automation", () => ({ runMarketSentimentAutomation: vi.fn() }));
vi.mock("@/server/weekly-digest", () => ({ generateWeeklyDigest: mocks.digest }));
vi.mock("@/server/push/store", () => ({ dispatchPendingPushes: mocks.push }));

import { runBackgroundMaintenance } from "@/server/background-maintenance";

describe("production maintenance completion", () => {
  it("does not release the scheduled invocation before the confidence archive finishes", async () => {
    let releaseArchive!: (value: {
      archive: { archived: number; skipped: number; withheld: number; stale: number };
      evaluation: { evaluated: number; skippedStaleBaselines: number };
    }) => void;
    const pendingArchive = new Promise<Parameters<typeof releaseArchive>[0]>((resolve) => {
      releaseArchive = resolve;
    });
    mocks.orchestrate.mockResolvedValue({
      checkedAt: "2026-08-25T01:00:00.000Z",
      odds: { status: "completed", result: {} },
      nflverse: { status: "completed", result: {} }
    });
    mocks.archive.mockReturnValue(pendingArchive);
    mocks.digest.mockResolvedValue({ id: "digest" });
    mocks.push.mockResolvedValue({ delivered: 0 });

    let completed = false;
    const maintenance = runBackgroundMaintenance({
      db: {} as D1Database,
      apiKey: "test-key",
      now: new Date("2026-08-25T01:00:00.000Z")
    }).then((result) => {
      completed = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);

    releaseArchive({
      archive: { archived: 15, skipped: 0, withheld: 0, stale: 1 },
      evaluation: { evaluated: 0, skippedStaleBaselines: 0 }
    });
    const result = await maintenance;
    expect(result.confidenceEngine).toEqual({
      status: "completed",
      result: {
        archive: { archived: 15, skipped: 0, withheld: 0, stale: 1 },
        evaluation: { evaluated: 0, skippedStaleBaselines: 0 }
      }
    });
  });
});
