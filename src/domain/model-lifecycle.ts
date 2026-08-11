import type {
  CompletedGame,
  Forecast,
  ModelMetrics,
  ModelRun,
  RollingFeatures,
  SystemAlert,
  TeamState
} from "./types";

export function updateTeamStates(
  states: TeamState[],
  games: CompletedGame[],
  k: number
): TeamState[] {
  const next = new Map(states.map((state) => [state.team, { ...state }]));
  for (const game of [...games].sort((a, b) => a.week - b.week)) {
    const home = next.get(game.homeTeam) ?? {
      team: game.homeTeam,
      mean: 0,
      variance: 1,
      throughWeek: game.week - 1
    };
    const away = next.get(game.awayTeam) ?? {
      team: game.awayTeam,
      mean: 0,
      variance: 1,
      throughWeek: game.week - 1
    };
    const residual = game.actualHomeMargin - game.consensusHomeExpectedMargin;
    next.set(game.homeTeam, {
      ...home,
      mean: home.mean + (k * residual) / 2,
      variance: Math.max(0.1, home.variance * 0.96),
      throughWeek: game.week
    });
    next.set(game.awayTeam, {
      ...away,
      mean: away.mean - (k * residual) / 2,
      variance: Math.max(0.1, away.variance * 0.96),
      throughWeek: game.week
    });
  }
  return [...next.values()];
}

export function widenOffseasonVariance(states: TeamState[], factor: number): TeamState[] {
  if (factor < 1) throw new Error("Offseason variance widening factor cannot be below one");
  return states.map((state) => ({ ...state, variance: state.variance * factor }));
}

export function recomputeRollingFeatures(
  rows: Array<RollingFeatures & { gameWeek: number }>,
  targetWeek: number
): RollingFeatures[] {
  const safeRows = rows.filter((row) => row.gameWeek <= targetWeek - 1);
  const latest = new Map<string, RollingFeatures & { gameWeek: number }>();
  for (const row of safeRows) {
    const existing = latest.get(row.team);
    if (!existing || row.gameWeek > existing.gameWeek) latest.set(row.team, row);
  }
  return [...latest.values()].map((row) => ({
    team: row.team,
    season: row.season,
    throughWeek: row.throughWeek,
    epa: row.epa,
    successRate: row.successRate,
    explosiveRate: row.explosiveRate,
    regressedTurnovers: row.regressedTurnovers,
    pace: row.pace,
    proe: row.proe
  }));
}

export function runPromotionGate(input: {
  runId: string;
  championHash: string;
  challengerHash: string;
  championMetrics: ModelMetrics;
  challengerMetrics: ModelMetrics;
  dataHash: string;
  configHash: string;
  featureSchemaHash: string;
  codeHash: string;
  startedAt: string;
  completedAt: string;
  tolerance?: number;
}): { run: ModelRun; alert: SystemAlert | null } {
  const tolerance = input.tolerance ?? 0.002;
  const promote =
    input.challengerMetrics.pooledLogLoss <=
      input.championMetrics.pooledLogLoss + tolerance &&
    input.challengerMetrics.calibrationSlope >= 0.8 &&
    input.challengerMetrics.calibrationSlope <= 1.2;
  const run: ModelRun = {
    id: input.runId,
    championVersionHash: input.championHash,
    challengerVersionHash: input.challengerHash,
    status: promote ? "challenger" : "rejected",
    championMetrics: input.championMetrics,
    challengerMetrics: input.challengerMetrics,
    gateDecision: promote ? "promote" : "retain",
    dataSnapshotHash: input.dataHash,
    configHash: input.configHash,
    featureSchemaHash: input.featureSchemaHash,
    codeHash: input.codeHash,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    promotedAt: promote ? input.completedAt : null
  };
  return {
    run,
    alert: promote
      ? null
      : {
          id: `alert:${input.runId}`,
          type: "gate_rejection",
          severity: "warning",
          message: "Challenger retained behind the champion because it failed the Tuesday promotion gate.",
          idempotencyKey: `gate_rejection:${input.runId}`,
          createdAt: input.completedAt,
          acknowledgedAt: null
        }
  };
}

export function assertForecastLogged(forecast: Forecast, loggedModelHashes: Set<string>): void {
  if (!loggedModelHashes.has(forecast.championHash)) {
    throw new Error("Forecasting from an unlogged model is prohibited");
  }
}

export function validateForecastLeakage(
  forecast: Forecast,
  gameRows: Array<{ completedWeek: number }>
): string[] {
  const errors: string[] = [];
  if (forecast.inputsThroughWeek > forecast.targetWeek - 1) {
    errors.push("Forecast feature window extends past W-1");
  }
  if (gameRows.some((row) => row.completedWeek > forecast.targetWeek - 1)) {
    errors.push("A game input postdates W-1");
  }
  const generated = new Date(forecast.generatedAt).getTime();
  for (const [label, timestamp] of [
    ["odds", forecast.oddsCapturedAt],
    ["injury", forecast.injuryCapturedAt],
    ["weather issue", forecast.weatherForecastIssuedAt]
  ] as const) {
    if (timestamp && new Date(timestamp).getTime() > generated) {
      errors.push(`${label} input postdates the forecast timestamp`);
    }
  }
  return errors;
}
