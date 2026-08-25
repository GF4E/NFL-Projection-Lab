import { stableHash } from "@/domain/hash";
import { createPointInTimeFeatureRow, type SourceObservation } from "@/domain/point-in-time";
import { evaluateScoreDistribution } from "@/domain/probabilistic-evaluation";
import { buildDecisionBoard } from "../decision-board";
import { listNflverseImportStates } from "../nflverse/store";
import {
  createForecastArtifact,
  hasForecastInputVersion,
  listPendingPrequentialForecasts,
  publishConfidenceEngineAlert,
  publishForecastArtifact,
  recordForecastEvaluation,
  registerConfidenceModel,
  resolveConfidenceEngineAlerts
} from "./store";

function forecastHorizon(kickoffAt: string | undefined, generatedAt: string): string {
  if (!kickoffAt) return "unknown_horizon";
  const minutes = (Date.parse(kickoffAt) - Date.parse(generatedAt)) / 60_000;
  if (minutes > 8_640) return "opener";
  if (minutes > 150) return "early_week";
  if (minutes > 90) return "t_minus_120";
  if (minutes > 30) return "t_minus_60";
  return "t_minus_15";
}

function observation(input: Omit<SourceObservation, "sourceHash"> & { sourceHash?: string }): SourceObservation {
  return {
    ...input,
    sourceHash: input.sourceHash ?? stableHash(input)
  };
}

export async function archiveCurrentConfidenceForecasts(input: {
  db: D1Database;
  now: Date;
}): Promise<{ archived: number; skipped: number; withheld: number; stale: number }> {
  const board = await buildDecisionBoard(input.db, {
    now: input.now,
    includeInternalDistributions: true,
    initializeStores: true
  });
  const featureSourceStates = (await listNflverseImportStates(input.db)).filter((state) => {
    if (!state.sourceHash || !state.lastSuccessAt || state.freshness !== "current") return false;
    if (state.dataset === "schedules:history") return true;
    const match = /^pbp:(\d{4})$/.exec(state.dataset);
    return match !== null && Number(match[1]) <= (board.basisSeason ?? board.season - 1);
  });
  let archived = 0;
  let skipped = 0;
  let withheld = 0;
  let stale = 0;
  for (const game of board.games) {
    const score = game.scoreForecast;
    const internal = game.internalScoreArtifact;
    if (!score || score.status === "withheld" || !internal || !score.mainline) {
      withheld += 1;
      continue;
    }
    if (!score.quoteFresh || score.status === "stale") {
      stale += 1;
      await publishConfidenceEngineAlert(input.db, {
        type: "stale_forecast_input",
        message: `${game.gameId} forecast archive retained its last good version because the market quote is stale`,
        idempotencyKey: `confidence:stale:${game.gameId}`,
        createdAt: board.generatedAt
      });
      continue;
    }
    const horizon = forecastHorizon(game.kickoffAt, board.generatedAt);
    const modelHash = internal.distribution.modelHash;
    if (await hasForecastInputVersion(input.db, {
      gameId: game.gameId,
      forecastHorizon: horizon,
      dataHash: board.dataHash,
      modelHash
    })) {
      skipped += 1;
      continue;
    }
    try {
      const latestQuoteAt = game.contractEvaluations.map((item) => item.capturedAt).sort().at(-1) ?? board.generatedAt;
      const quoteSnapshot = game.contractEvaluations.map((item) => ({
        sourceQuoteId: item.sourceQuoteId,
        book: item.book,
        market: item.market,
        side: item.side,
        point: item.point,
        price: item.americanPrice,
        capturedAt: item.capturedAt
      }));
      if (!featureSourceStates.length) throw new Error("No successful nflverse source manifests support this forecast");
      const observations: SourceObservation[] = [
        ...featureSourceStates.map((state) => observation({
          id: `nflverse:${state.dataset}:${state.sourceHash}`,
          provider: "nflverse",
          dataset: state.dataset,
          sourceRecordId: state.sourceHash!,
          kind: "observed",
          publishedAt: state.lastSuccessAt!,
          providerUpdatedAt: null,
          requestedAt: state.lastSuccessAt!,
          receivedAt: state.lastSuccessAt!,
          capturedAt: state.lastSuccessAt!,
          availabilityBasis: "received_only",
          validAt: state.lastSuccessAt!,
          validTo: null,
          schemaVersion: "nflverse-import-state.1",
          importRunId: `nflverse:${state.dataset}:${state.sourceHash}`,
          licenseTag: "nflverse source terms",
          freshness: "current",
          sourceUrl: state.sourceUrl,
          sourceHash: state.sourceHash!
        })),
        observation({
          id: `odds:${game.gameId}:${latestQuoteAt}`,
          provider: "the_odds_api",
          dataset: "us_mainlines",
          sourceRecordId: game.gameId,
          kind: "market",
          publishedAt: latestQuoteAt,
          providerUpdatedAt: latestQuoteAt,
          requestedAt: board.generatedAt,
          receivedAt: board.generatedAt,
          capturedAt: board.generatedAt,
          availabilityBasis: "provider_updated",
          validAt: game.kickoffAt ?? board.generatedAt,
          validTo: game.kickoffAt ?? null,
          schemaVersion: "live-lines.1",
          importRunId: `odds:${stableHash(quoteSnapshot)}`,
          licenseTag: "provider terms",
          freshness: "current",
          sourceUrl: "https://the-odds-api.com/",
          sourceHash: stableHash(quoteSnapshot)
        })
      ];
      if (game.availability.capturedAt) observations.push(observation({
        id: `injury:${game.gameId}:${game.availability.capturedAt}`,
        provider: "official_nfl_or_team",
        dataset: "injuries_and_inactives",
        sourceRecordId: game.sourceGameId ?? game.gameId,
        kind: "observed",
        publishedAt: game.availability.capturedAt,
        providerUpdatedAt: game.availability.capturedAt,
        requestedAt: board.generatedAt,
        receivedAt: board.generatedAt,
        capturedAt: board.generatedAt,
        availabilityBasis: "provider_updated",
        validAt: game.kickoffAt ?? board.generatedAt,
        validTo: game.kickoffAt ?? null,
        schemaVersion: "official-injuries.1",
        importRunId: `injury:${game.availability.capturedAt}`,
        licenseTag: "source terms",
        freshness: game.availability.status === "current" ? "current" : "stale",
        sourceUrl: null
      }));
      if (game.weather.capturedAt) observations.push(observation({
        id: `weather:${game.gameId}:${game.weather.capturedAt}`,
        provider: "open_meteo",
        dataset: "kickoff_hour_as_issued_forecast",
        sourceRecordId: game.sourceGameId ?? game.gameId,
        kind: "forecast",
        publishedAt: game.weather.capturedAt,
        providerUpdatedAt: game.weather.capturedAt,
        requestedAt: board.generatedAt,
        receivedAt: board.generatedAt,
        capturedAt: board.generatedAt,
        availabilityBasis: "provider_updated",
        validAt: game.kickoffAt ?? board.generatedAt,
        validTo: game.kickoffAt ?? null,
        schemaVersion: "kickoff-weather.1",
        importRunId: `weather:${game.weather.capturedAt}`,
        licenseTag: "CC BY 4.0",
        freshness: game.weather.status === "current" || game.weather.status === "indoors" ? "current" : "stale",
        sourceUrl: "https://open-meteo.com/"
      }));
      const usableObservations = observations.filter((item) => item.freshness === "current");
      const featureRow = createPointInTimeFeatureRow({
        id: `${game.gameId}:${horizon}:${board.dataHash}`,
        gameId: game.gameId,
        season: board.season,
        targetWeek: board.week,
        inputsThroughWeek: board.week - 1,
        generatedAt: board.generatedAt,
        featureSchemaVersion: "joint-score.1",
        transformationVersion: board.configHash,
        imputationPolicy: "missing values remain null and widen or withhold; no future backfill",
        values: {
          away_epa: game.away?.epaPerPlay ?? null,
          home_epa: game.home?.epaPerPlay ?? null,
          away_success: game.away?.successRate ?? null,
          home_success: game.home?.successRate ?? null,
          projected_home_score: score.expectedHomeScore,
          projected_away_score: score.expectedAwayScore,
          quote_age_minutes: score.quoteAgeMinutes
        },
        missingness: {
          away_team_features: game.away === null,
          home_team_features: game.home === null,
          injuries: game.availability.status !== "current",
          weather: game.weather.status === "pending" || game.weather.status === "unconfirmed"
        },
        observations: usableObservations
      });
      const marketHomeWin = game.moneylines[0]?.consensusHomeProbability ?? score.mainline.moneyline.home;
      const marketHomeCover = game.projections[0]?.marketHomeProbability ?? score.mainline.spread.homeCover;
      const overEvaluation = game.contractEvaluations.find((item) => item.market === "total" && item.side.toLowerCase() === "over");
      const marketOver = overEvaluation?.fairProbability ?? score.mainline.total.over;
      const artifact = createForecastArtifact({
        gameId: game.gameId,
        sourceGameId: game.sourceGameId ?? game.gameId,
        season: board.season,
        week: board.week,
        forecastHorizon: horizon,
        generatedAt: board.generatedAt,
        modelFamily: internal.distribution.family,
        modelHash,
        configHash: board.configHash,
        dataHash: board.dataHash,
        featureRowHash: featureRow.rowHash,
        homeSpreadPoint: score.mainline.spread.homePoint,
        totalPoint: score.mainline.total.point,
        marketHomeWinProbability: marketHomeWin,
        marketHomeCoverProbability: marketHomeCover,
        marketOverProbability: marketOver,
        quoteFresh: true,
        distribution: internal.distribution,
        mainline: score.mainline,
        dossier: internal.dossier
      });
      await registerConfidenceModel(input.db, {
        modelHash,
        family: internal.distribution.family,
        status: "baseline",
        configHash: board.configHash,
        artifact: {
          family: internal.distribution.family,
          modelHash,
          configHash: board.configHash,
          role: "market_anchored_benchmark"
        },
        registeredAt: board.generatedAt
      });
      await publishForecastArtifact({ db: input.db, featureRow, artifact });
      await resolveConfidenceEngineAlerts(input.db, `confidence:stale:${game.gameId}`, board.generatedAt);
      archived += 1;
    } catch (error) {
      await publishConfidenceEngineAlert(input.db, {
        type: "forecast_archive_failed",
        message: `${game.gameId}: ${error instanceof Error ? error.message : "unknown archive failure"}`,
        idempotencyKey: `confidence:archive:${game.gameId}:${board.dataHash}`,
        createdAt: board.generatedAt
      });
    }
  }
  return { archived, skipped, withheld, stale };
}

export async function evaluateCompletedConfidenceForecasts(input: {
  db: D1Database;
  now: Date;
}): Promise<{ evaluated: number; skippedStaleBaselines: number }> {
  const forecasts = await listPendingPrequentialForecasts(input.db);
  let evaluated = 0;
  let skippedStaleBaselines = 0;
  for (const forecast of forecasts) {
    if (!forecast.quoteFresh) {
      skippedStaleBaselines += 1;
      continue;
    }
    const evaluation = evaluateScoreDistribution({
      distribution: forecast.distribution,
      actualHomeScore: forecast.actualHomeScore,
      actualAwayScore: forecast.actualAwayScore,
      homeSpreadPoint: forecast.homeSpreadPoint,
      totalPoint: forecast.totalPoint
    });
    await recordForecastEvaluation({ db: input.db, forecast, evaluation, evaluatedAt: input.now.toISOString() });
    evaluated += 1;
  }
  return { evaluated, skippedStaleBaselines };
}

export async function runConfidenceEngineAutomation(input: {
  db: D1Database;
  now: Date;
}): Promise<{
  archive: Awaited<ReturnType<typeof archiveCurrentConfidenceForecasts>>;
  evaluation: Awaited<ReturnType<typeof evaluateCompletedConfidenceForecasts>>;
}> {
  const archive = await archiveCurrentConfidenceForecasts(input);
  const evaluation = await evaluateCompletedConfidenceForecasts(input);
  return { archive, evaluation };
}
