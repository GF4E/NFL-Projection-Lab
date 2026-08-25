import { orchestrateBackgroundMaintenance } from "@/domain/background-maintenance";
import { runNflverseAutomation } from "./nflverse/automation";
import { runScheduledOddsAutomation } from "./odds-automation";
import { runOfficialInjuryAutomation } from "./official-injuries/automation";
import { runOfficialPregameContextAutomation } from "./pregame-context/automation";
import { runKickoffWeatherAutomation } from "./weather/automation";
import { runEngineOsUrgentAutomation } from "./engine-os/automation";

/**
 * Runs every five minutes in production. The official pregame snapshot is resolved first so
 * prop eligibility and retractable-roof weather cannot race an inactive-list update. Each
 * remaining stage is isolated: one unavailable provider never suppresses the other refreshes.
 * CPU-heavy coefficient work has its own scheduled invocation and is intentionally absent here.
 */
export async function runBackgroundMaintenance(input: {
  db: D1Database;
  evidenceBucket?: R2Bucket;
  apiKey: string | undefined;
  now?: Date;
  clock?: () => Date;
}) {
  const clock = input.clock ?? (() => new Date());
  const now = input.now ?? clock();
  const result = await orchestrateBackgroundMaintenance({
    pregame: () => runOfficialPregameContextAutomation({
      db: input.db,
      evidenceBucket: input.evidenceBucket,
      now
    }),
    odds: () => runScheduledOddsAutomation({
      db: input.db,
      evidenceBucket: input.evidenceBucket,
      apiKey: input.apiKey,
      now,
      allowCatchup: true
    }),
    weather: () => runKickoffWeatherAutomation({
      db: input.db,
      evidenceBucket: input.evidenceBucket,
      now
    }),
    injuries: () => runOfficialInjuryAutomation({
      db: input.db,
      evidenceBucket: input.evidenceBucket,
      now
    }),
    nflverse: () => runNflverseAutomation({
      db: input.db,
      evidenceBucket: input.evidenceBucket,
      now,
      allowPlayByPlay: true
    })
  }, now.toISOString());
  const engineOs = await runEngineOsUrgentAutomation({
    db: input.db,
    evidenceBucket: input.evidenceBucket,
    // Persistence time is sampled after imports complete. The scheduled tick
    // is not evidence of when the forecast/withholding was generated.
    now: clock()
  }).then(
    (value) => ({ status: "completed" as const, result: value }),
    (error: unknown) => ({
      status: "failed" as const,
      error: `engine OS urgent lane: ${error instanceof Error ? error.message : "unknown failure"}`
    })
  );
  return { ...result, engineOs };
}
