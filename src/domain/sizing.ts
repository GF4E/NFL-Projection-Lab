import { americanToDecimal } from "./odds";

export interface SizingResult {
  fullKellyFraction: number;
  rawQuarterKellyUnits: number;
  suggestedUnits: number;
  included: boolean;
  greyed: boolean;
}

export interface SizingConfig {
  referenceBankrollUnits: number;
  kellyFraction: number;
  increment: number;
  minimum: number;
  maximum: number;
}

export function sizeKelly(
  shrunkProbability: number,
  americanPrice: number,
  edgeInterval: [number, number],
  config: SizingConfig
): SizingResult {
  const decimal = americanToDecimal(americanPrice);
  const fullKelly = Math.max(0, (shrunkProbability * decimal - 1) / (decimal - 1));
  const rawUnits = fullKelly * config.kellyFraction * config.referenceBankrollUnits;
  const rounded = Math.floor((rawUnits + 1e-10) / config.increment) * config.increment;
  const included = rounded >= config.minimum;
  const suggested = included ? Math.min(config.maximum, rounded) : 0;
  return {
    fullKellyFraction: fullKelly,
    rawQuarterKellyUnits: rawUnits,
    suggestedUnits: suggested,
    included,
    greyed: edgeInterval[0] <= 0 && edgeInterval[1] >= 0
  };
}

export interface ProposedPosition {
  gameId: string;
  week: number;
  market: "spread" | "total" | "moneyline";
  units: number;
}

export function validatePortfolioLimits(
  existing: ProposedPosition[],
  proposed: ProposedPosition
): string[] {
  const errors: string[] = [];
  const sameGame = existing.filter((position) => position.gameId === proposed.gameId);
  const sideCount = sameGame.filter((position) => position.market === "spread" || position.market === "moneyline").length;
  const totalCount = sameGame.filter((position) => position.market === "total").length;
  if ((proposed.market === "spread" || proposed.market === "moneyline") && sideCount >= 1) {
    errors.push("Only one side position is permitted per game");
  }
  if (proposed.market === "total" && totalCount >= 1) {
    errors.push("Only one total is permitted per game");
  }
  if (sameGame.reduce((sum, position) => sum + position.units, 0) + proposed.units > 3) {
    errors.push("Game exposure cannot exceed 3u");
  }
  if (
    existing.filter((position) => position.week === proposed.week).reduce((sum, position) => sum + position.units, 0) +
      proposed.units >
    10
  ) {
    errors.push("Weekly exposure cannot exceed 10u");
  }
  return errors;
}
