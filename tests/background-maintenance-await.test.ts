import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orchestrate: vi.fn(),
  engineOs: vi.fn()
}));

vi.mock("@/domain/background-maintenance", () => ({
  orchestrateBackgroundMaintenance: mocks.orchestrate
}));
vi.mock("@/server/engine-os/automation", () => ({
  runEngineOsUrgentAutomation: mocks.engineOs
}));
vi.mock("@/server/nflverse/automation", () => ({ runNflverseAutomation: vi.fn() }));
vi.mock("@/server/odds-automation", () => ({ runScheduledOddsAutomation: vi.fn() }));
vi.mock("@/server/official-injuries/automation", () => ({ runOfficialInjuryAutomation: vi.fn() }));
vi.mock("@/server/pregame-context/automation", () => ({ runOfficialPregameContextAutomation: vi.fn() }));
vi.mock("@/server/weather/automation", () => ({ runKickoffWeatherAutomation: vi.fn() }));

import { runBackgroundMaintenance } from "@/server/background-maintenance";

describe("production maintenance completion", () => {
  it("awaits the evidence ledger and stamps it with wall time after imports finish", async () => {
    let releaseLedger!: (value: { originsCreated: number }) => void;
    const pendingLedger = new Promise<{ originsCreated: number }>((resolve) => {
      releaseLedger = resolve;
    });
    mocks.orchestrate.mockResolvedValue({
      checkedAt: "2026-08-25T01:00:00.000Z",
      pregame: { status: "completed", result: {} },
      odds: { status: "completed", result: {} },
      weather: { status: "completed", result: {} },
      injuries: { status: "completed", result: {} },
      nflverse: { status: "completed", result: {} }
    });
    mocks.engineOs.mockReturnValue(pendingLedger);
    const wallTime = new Date("2026-08-25T01:03:00.000Z");

    let completed = false;
    const maintenance = runBackgroundMaintenance({
      db: {} as D1Database,
      apiKey: undefined,
      now: new Date("2026-08-25T01:00:00.000Z"),
      clock: () => wallTime
    }).then((result) => {
      completed = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(mocks.engineOs).toHaveBeenCalledWith(expect.objectContaining({ now: wallTime }));

    releaseLedger({ originsCreated: 16 });
    const result = await maintenance;
    expect(result.engineOs).toEqual({ status: "completed", result: { originsCreated: 16 } });
    expect(result).not.toHaveProperty("confidenceEngine");
  });
});
