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
    strengthValidationArtifact: string;
    promotionLogLossTolerance: number;
    promotionCalibrationSlope: number[];
    bootstrapMembers: number;
    bootstrapSeedStart: number;
    bootstrapFitIterations: number;
    intervalPercentiles: number[];
    keyMargins: number[];
    keyMarginBoundarySeason: number;
    discreteMarginArtifact: string;
    discreteTotalArtifact: string;
    totalTranslationValidationArtifact: string;
    totalTranslationKernelBandwidth: number;
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
  props: {
    minimumReferenceBooks: number;
    minimumExpectedValue: number;
    maximumPerBook: number;
    maximumSnapshotSkewMinutes: number;
    maximumQuoteAgeMinutes: number;
    minimumHistoryGames: number;
    historyWindowGames: number;
    priorGames: number;
    recencyWeight: number;
    minimumHitRate: number;
    participationSource: "nflverse_snap_counts";
    distinctRecommendationKey: "player_market";
    usageProjectionTrainingStartSeason: number;
    usageProjectionValidationArtifact: string;
    projectionByMarket: Record<"player_pass_yds" | "player_rush_yds" | "player_reception_yds", {
      method: "weighted_yardage_mean" | "usage_efficiency";
      usageRecencyWeight: number;
      efficiencyPriorOpportunities: number;
    }>;
    matchupAdjustment: "market_consensus_only";
    matchupValidationArtifact: string;
  };
  matchupEvidence: {
    windowGames: number;
    minimumTrainingGames: number;
    opponentAdjustmentMethod: "play_weighted_ridge";
    ridgePenalty: number;
    validationArtifact: string;
    coefficientFeatureScaling: {
      clip: number;
      epaPerPlay: number;
      successRate: number;
      explosiveRate: number;
      turnoverRate: number;
      secondsPerPlay: number;
      proe: number;
      centers: {
        epaPerPlay: number;
        successRate: number;
        explosiveRate: number;
        turnoverRate: number;
        secondsPerPlay: number;
        proe: number;
      };
    };
  };
  teasers: {
    points: number;
    screeningAmerican: number;
    selectableAmericanPrices: number[];
    minimumExpectedValue: number;
    preferredOpponentExceptionalEv: number;
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
    validationArtifact: string;
    definitions: unknown[];
    learnedPointPriors: unknown[];
    status: string;
    fallbackBehavior: string;
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
