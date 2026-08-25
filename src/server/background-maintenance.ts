import { settleCompletedTeamPlays } from "./automatic-settlement";
import { orchestrateBackgroundMaintenance } from "@/domain/background-maintenance";
import { runNflverseAutomation } from "./nflverse/automation";
import { runScheduledOddsAutomation } from "./odds-automation";
import { runOfficialInjuryAutomation } from "./official-injuries/automation";
import { expireStaleTeamDrafts } from "./play-store";
import { runOfficialPregameContextAutomation } from "./pregame-context/automation";
import { runKickoffWeatherAutomation } from "./weather/automation";
import { dispatchPendingPushes } from "./push/store";
import { generateWeeklyDigest } from "./weekly-digest";
import { runMarketSentimentAutomation } from "./market-sentiment/automation";
import {
  evaluateCompletedConfidenceForecasts,
  runConfidenceEngineAutomation
} from "./confidence-engine/automation";

/**
 * Runs every five minutes in production. The official pregame snapshot is resolved first so
 * prop eligibility and retractable-roof weather cannot race an inactive-list update. Each
 * remaining stage is isolated: one unavailable provider never suppresses the other refreshes.
 * CPU-heavy coefficient work has its own scheduled invocation and is intentionally absent here.
 */
export async function runBackgroundMaintenance(input: {
  db: D1Database;
  apiKey: string | undefined;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const result = await orchestrateBackgroundMaintenance({
    pregame: () => runOfficialPregameContextAutomation({ db: input.db, now }),
    odds: () => runScheduledOddsAutomation({ db: input.db, apiKey: input.apiKey, now, allowCatchup: true }),
    weather: () => runKickoffWeatherAutomation({ db: input.db, now }),
    injuries: () => runOfficialInjuryAutomation({ db: input.db, now }),
    nflverse: () => runNflverseAutomation({ db: input.db, now, allowPlayByPlay: true }),
    sentiment: () => runMarketSentimentAutomation({ db: input.db, now }),
    drafts: () => expireStaleTeamDrafts(input.db, now),
    settlement: () => settleCompletedTeamPlays(input.db, now)
  }, now.toISOString());
  const digest = await generateWeeklyDigest({ db: input.db, now }).then(
    (value) => ({ status: "completed" as const, result: value }),
    (error: unknown) => ({
      status: "failed" as const,
      error: `weekly digest: ${error instanceof Error ? error.message : "unknown failure"}`
    })
  );
  const confidenceEngine = await (result.odds.status === "completed" && result.nflverse.status === "completed"
    ? runConfidenceEngineAutomation({ db: input.db, now })
    : evaluateCompletedConfidenceForecasts({ db: input.db, now }).then((evaluation) => ({
        archive: { archived: 0, skipped: 0, withheld: 0, stale: 0 },
        evaluation
      })))
    .then(
      (value) => ({ status: "completed" as const, result: value }),
      (error: unknown) => ({
        status: "failed" as const,
        error: `confidence engine: ${error instanceof Error ? error.message : "unknown failure"}`
      })
    );
  try {
    return { ...result, confidenceEngine, digest, push: { status: "completed" as const, result: await dispatchPendingPushes({ db: input.db, now: now.toISOString() }) } };
  } catch (error) {
    return { ...result, confidenceEngine, digest, push: { status: "failed" as const, error: error instanceof Error ? error.message : "push retry failed" } };
  }
}
