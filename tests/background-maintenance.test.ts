import { describe, expect, it } from "vitest";
import { orchestrateBackgroundMaintenance, type BackgroundMaintenanceTasks } from "@/domain/background-maintenance";

describe("background maintenance orchestration", () => {
  it("publishes pregame context first and isolates a provider failure from every other stage", async () => {
    const events: string[] = [];
    const completed = (name: string) => async () => {
      events.push(name);
      return name;
    };
    const tasks: BackgroundMaintenanceTasks = {
      pregame: completed("pregame"),
      odds: async () => {
        events.push("odds");
        throw new Error("provider unavailable");
      },
      weather: completed("weather"),
      injuries: completed("injuries"),
      nflverse: completed("nflverse"),
      drafts: completed("drafts"),
      lifecycle: async () => {
        expect(events).toContain("nflverse");
        events.push("lifecycle");
        return "lifecycle";
      },
      settlement: async () => {
        expect(events).toContain("nflverse");
        events.push("settlement");
        return "settlement";
      }
    };

    const result = await orchestrateBackgroundMaintenance(tasks, "2026-09-13T16:00:00.000Z");

    expect(events[0]).toBe("pregame");
    expect(events.indexOf("lifecycle")).toBeGreaterThan(events.indexOf("nflverse"));
    expect(result.odds).toEqual({ status: "failed", error: "scheduled odds: provider unavailable" });
    expect(result.weather.status).toBe("completed");
    expect(result.lifecycle.status).toBe("completed");
    expect(result.settlement.status).toBe("completed");
  });
});
