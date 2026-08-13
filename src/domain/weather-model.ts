export interface HistoricalWeatherGame {
  season: number;
  total: number | null;
  totalLine: number | null;
  roof: string | null;
  windMph: number | null;
  temperatureF: number | null;
}

export interface WeatherAdjustment {
  points: number;
  rawPoints: number;
  trainingGames: number;
  effectiveGames: number;
}

function weightedQuantile(values: Array<{ value: number; weight: number }>, percentile: number): number {
  const ordered = [...values].sort((left, right) => left.value - right.value);
  const target = ordered.reduce((sum, item) => sum + item.weight, 0) * percentile;
  let cumulative = 0;
  for (const item of ordered) {
    cumulative += item.weight;
    if (cumulative >= target) return item.value;
  }
  return ordered.at(-1)?.value ?? 0;
}

export function fitWeatherTotalAdjustment(
  rows: readonly HistoricalWeatherGame[],
  forecast: { windMph: number; temperatureF: number },
  latestSeason: number,
  halfLifeSeasons: number,
  minimumEffectiveGames = 64
): WeatherAdjustment | null {
  const eligible = rows.flatMap((row) => {
    const roof = row.roof?.toLowerCase();
    if ((roof !== "outdoors" && roof !== "outdoor" && roof !== "open") ||
      row.total === null || row.totalLine === null || row.windMph === null || row.temperatureF === null ||
      !Number.isFinite(row.total) || !Number.isFinite(row.totalLine) || !Number.isFinite(row.windMph) || !Number.isFinite(row.temperatureF)) return [];
    return [{
      wind: row.windMph,
      temperature: row.temperatureF,
      residual: row.total - row.totalLine,
      weight: 0.5 ** ((latestSeason - row.season) / halfLifeSeasons)
    }];
  });
  if (!eligible.length) return null;
  const weight = eligible.reduce((sum, row) => sum + row.weight, 0);
  const squaredWeight = eligible.reduce((sum, row) => sum + row.weight ** 2, 0);
  const effectiveGames = weight ** 2 / Math.max(Number.EPSILON, squaredWeight);
  if (effectiveGames < minimumEffectiveGames) return null;

  const meanWind = eligible.reduce((sum, row) => sum + row.wind * row.weight, 0) / weight;
  const meanTemperature = eligible.reduce((sum, row) => sum + row.temperature * row.weight, 0) / weight;
  const meanResidual = eligible.reduce((sum, row) => sum + row.residual * row.weight, 0) / weight;
  let windWind = 0;
  let tempTemp = 0;
  let windTemp = 0;
  let windResidual = 0;
  let tempResidual = 0;
  for (const row of eligible) {
    const wind = row.wind - meanWind;
    const temperature = row.temperature - meanTemperature;
    const residual = row.residual - meanResidual;
    windWind += row.weight * wind * wind;
    tempTemp += row.weight * temperature * temperature;
    windTemp += row.weight * wind * temperature;
    windResidual += row.weight * wind * residual;
    tempResidual += row.weight * temperature * residual;
  }
  const determinant = windWind * tempTemp - windTemp ** 2;
  if (determinant <= Number.EPSILON * Math.max(1, windWind * tempTemp)) return null;
  const windCoefficient = (windResidual * tempTemp - tempResidual * windTemp) / determinant;
  const temperatureCoefficient = (tempResidual * windWind - windResidual * windTemp) / determinant;
  const rawPoints = windCoefficient * (forecast.windMph - meanWind) +
    temperatureCoefficient * (forecast.temperatureF - meanTemperature);
  const fitted = eligible.map((row) => ({
    value: windCoefficient * (row.wind - meanWind) + temperatureCoefficient * (row.temperature - meanTemperature),
    weight: row.weight
  }));
  const lower = weightedQuantile(fitted, 0.1);
  const upper = weightedQuantile(fitted, 0.9);
  const bounded = Math.max(lower, Math.min(upper, rawPoints));
  return {
    points: Math.round(bounded * 2) / 2,
    rawPoints,
    trainingGames: eligible.length,
    effectiveGames
  };
}
