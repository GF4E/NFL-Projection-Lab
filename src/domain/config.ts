import eraConfigJson from "../../config/era.config.json";
import structuralConfigJson from "../../config/structural.config.json";

export interface StructuralConfig {
  version: string;
  season: number;
  frozen: boolean;
  unitDollars: number;
  executionBooks: readonly ["betmgm", "fanduel"];
  model: {
    trainingStartSeason: number;
    decayHalfLifeSeasons: number;
    decayCandidates: number[];
    shrinkageWeight: number;
    strengthK: number;
    promotionLogLossTolerance: number;
    promotionCalibrationSlope: number[];
    bootstrapMembers: number;
    bootstrapSeedStart: number;
    intervalPercentiles: number[];
    keyMargins: number[];
    keyMarginBoundarySeason: number;
    seasonEffects: string;
  };
  sizing: {
    kellyFraction: number;
    referenceBankrollUnits: number;
    roundDownUnits: number;
    minimumUnits: number;
    maximumUnits: number;
    maximumGameUnits: number;
    maximumWeekUnits: number;
    maximumSidePositionsPerGame: number;
    maximumTotalsPerGame: number;
  };
  monitoring: {
    pushEdgeThreshold: number;
    calibrationSlope: number[];
    psiThreshold: number;
    softAnchorCentGap: number;
    softAnchorConsecutiveWeeks: number;
    creditAlert: number;
    creditCeiling: number;
    monthlyPlanCredits: number;
    reserveCredits: number;
  };
  qbTiers: {
    definitions: unknown[];
    learnedPointPriors: unknown[];
    status: string;
  };
  dataSources: Record<string, unknown>;
}

export const structuralConfig = structuralConfigJson as unknown as StructuralConfig;
export const eraConfig = eraConfigJson;

export function assertStructuralConfigFrozen(inSeason: boolean): void {
  if (inSeason && !structuralConfig.frozen) {
    throw new Error("Structural configuration must be frozen during the season");
  }
  if (structuralConfig.executionBooks.join(",") !== "betmgm,fanduel") {
    throw new Error("Only BetMGM and FanDuel are permitted execution books");
  }
  if (structuralConfig.unitDollars !== 25) {
    throw new Error("The 2026 unit must remain fixed at $25");
  }
}
