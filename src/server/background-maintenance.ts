import { settleCompletedTeamPlays } from "./automatic-settlement";
import { orchestrateBackgroundMaintenance } from "@/domain/background-maintenance";
import { runModelLifecycleAutomation } from "./model-lifecycle/automation";
import { runNflverseAutomation } from "./nflverse/automation";
import { runScheduledOddsAutomation } from "./odds-automation";
import { runOfficialInjuryAutomation } from "./official-injuries/automation";
import { expireStaleTeamDrafts } from "./play-store";
import { runOfficialPregameContextAutomation } from "./pregame-context/automation";
import { runKickoffWeatherAutomation } from "./weather/automation";

/**
 * Runs every five minutes in production. The official pregame snapshot is resolved first so
 * prop eligibility and retractable-roof weather cannot race an inactive-list update. Each
 * remaining stage is isolated: one unavailable provider never suppresses the other refreshes.
 */
export async function runBackgroundMaintenance(input: {
  db: D1Database;
  apiKey: string | undefined;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return orchestrateBackgroundMaintenance({
    pregame: () => runOfficialPregameContextAutomation({ db: input.db, now }),
    odds: () => runScheduledOddsAutomation({ db: input.db, apiKey: input.apiKey, now }),
    weather: () => runKickoffWeatherAutomation({ db: input.db, now }),
    injuries: () => runOfficialInjuryAutomation({ db: input.db, now }),
    nflverse: () => runNflverseAutomation({ db: input.db, now, allowPlayByPlay: true }),
    drafts: () => expireStaleTeamDrafts(input.db, now),
    lifecycle: () => runModelLifecycleAutomation({ db: input.db, now }),
    settlement: () => settleCompletedTeamPlays(input.db, now)
  }, now.toISOString());
}
