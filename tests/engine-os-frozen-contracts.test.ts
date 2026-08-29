import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../config/engine-os-contract-manifest.v1.json";
import {
  assertFootballTrainingInputsAllowed,
  assertWeeklyStateUpdateAllowed,
  assertWithholdingCodeAllowed,
  classifySeasonEvidence,
  engineOperatingContract,
  engineOsContractHashes,
  footballLifecycle2026,
  researchConstitution,
  validateEngineOperatingContract,
  validateFootballLifecycle,
  validateResearchConstitution
} from "@/domain/engine-os-contracts";

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Prediction Engine OS frozen contracts", () => {
  it("anchors every versioned contract before Module 2B fitting", () => {
    expect(manifest.version).toBe("engine-os-contract-manifest.2026.1");
    expect(manifest.artifacts).toHaveLength(3);
    for (const artifact of manifest.artifacts) {
      expect(fileSha256(artifact.path)).toBe(artifact.byteSha256);
    }
    expect(engineOsContractHashes).toEqual({
      operating: manifest.artifacts[0]?.canonicalContentSha256,
      research: manifest.artifacts[1]?.canonicalContentSha256,
      lifecycle: manifest.artifacts[2]?.canonicalContentSha256
    });
  });

  it("freezes complete numerical operating targets without placeholders", () => {
    expect(validateEngineOperatingContract().errors).toEqual([]);
    expect(engineOperatingContract.forecastHorizons.map((horizon) => horizon.id)).toEqual([
      "weekly_tuesday_0730",
      "kickoff_minus_120",
      "kickoff_minus_90",
      "kickoff_minus_60",
      "kickoff_minus_15"
    ]);
    expect(engineOperatingContract.eligibility.requiredForecastOrWithholdingRatio).toBe(1);
    expect(engineOperatingContract.publicApi.providerCallsFromReadRequests).toBe(0);
    expect(engineOperatingContract.publicApi.writesFromReadRequests).toBe(0);
    expect(engineOperatingContract.providerBudgets.theOddsApi).toMatchObject({
      monthlyPlanCredits: 500,
      alertAtCredits: 400,
      hardCeilingCredits: 450,
      essentialReserveCredits: 50,
      paidTierSpendUsdPerMonth: 0
    });
  });

  it("preserves rejected models and authorizes only the exact Module 2B question", () => {
    expect(validateResearchConstitution().errors).toEqual([]);
    expect(researchConstitution.candidateStatus.module1).toMatchObject({
      terminalResult: "reject_all",
      retainedBenchmark: "c0_naive_points_only",
      benchmarkEligibleForProduction: false
    });
    expect(researchConstitution.candidateStatus.module2).toMatchObject({
      terminalResult: "reject_all",
      retainedBenchmark: "p0_league_season_naive",
      benchmarkEligibleForProduction: false
    });
    expect(researchConstitution.module2b.allowedKernelComparison).toEqual({
      d0: [0.15, 0.7, 0.15],
      d1: [0, 1, 0]
    });
    expect(researchConstitution.module2b.allowedCandidates).toEqual([
      "p0_league_season_naive",
      "p1_partially_pooled_rates"
    ]);
    expect(researchConstitution.module2b.forbiddenCandidates).toEqual([
      "p2_regularized_joint_count"
    ]);
    expect(researchConstitution.module2b.newFeaturesAllowed).toBe(false);
  });

  it("blocks sportsbook, selection, and human-decision inputs from football training", () => {
    expect(() => assertFootballTrainingInputsAllowed([
      "rolling_epa",
      "prior_week_success_rate",
      "quarterback_availability"
    ])).not.toThrow();
    for (const field of [
      "closing_spread",
      "moneyline_odds",
      "public_betting_percentage",
      "team_pick_outcome",
      "human_adjustment_points",
      "manual_override_value"
    ]) {
      expect(() => assertFootballTrainingInputsAllowed([field])).toThrow(/forbidden football inputs/i);
    }
  });

  it("keeps 2025 exposed and starts 2026 evidence at the actual activation boundary", () => {
    expect(researchConstitution.seasonRoles.researchExposedSeasons.at(-1)).toBe(2025);
    expect(researchConstitution.seasonRoles.nextProspectiveSeason).toBe(2026);
    expect(researchConstitution.seasonRoles.preActivationBackfillAllowed).toBe(false);
    expect(classifySeasonEvidence({
      activatedAt: "2026-09-08T07:30:00-07:00",
      weekOneOriginComplete: true
    })).toBe("full_season_shadow");
    expect(classifySeasonEvidence({
      activatedAt: "2026-09-08T07:30:01-07:00",
      weekOneOriginComplete: true
    })).toBe("partial_season_shadow");
    expect(classifySeasonEvidence({
      activatedAt: "2026-09-08T07:29:00-07:00",
      weekOneOriginComplete: false
    })).toBe("partial_season_shadow");
  });

  it("allows only W-1 state advancement under frozen in-season rules", () => {
    expect(validateFootballLifecycle().errors).toEqual([]);
    expect(footballLifecycle2026.activation.modelPackageAtLifecycleFreeze).toBe(
      "none_no_validated_market_free_candidate"
    );
    expect(() => assertWeeklyStateUpdateAllowed({
      mutation: "recompute_frozen_rolling_features",
      targetWeek: 4,
      latestCompletedWeekUsed: 3
    })).not.toThrow();
    expect(() => assertWeeklyStateUpdateAllowed({
      mutation: "select_features",
      targetWeek: 4,
      latestCompletedWeekUsed: 3
    })).toThrow(/not authorized/i);
    expect(() => assertWeeklyStateUpdateAllowed({
      mutation: "recompute_frozen_rolling_features",
      targetWeek: 4,
      latestCompletedWeekUsed: 4
    })).toThrow(/W-1/i);
  });

  it("uses a closed withholding vocabulary and preserves last-good separation", () => {
    expect(() => assertWithholdingCodeAllowed("required_source_stale")).not.toThrow();
    expect(() => assertWithholdingCodeAllowed("convenient_unplanned_skip")).toThrow(/unknown withholding/i);
    expect(footballLifecycle2026.dataFailureAndWithholding).toMatchObject({
      partialImportMayUpdateState: false,
      staleImportMayUpdateState: false,
      schemaInvalidImportMayUpdateState: false,
      serveLastGoodForecastDuringFailure: true,
      servedLastGoodMustBeMarkedStale: true,
      lastGoodMayBeCopiedAsNewForecast: false,
      lateRecordEligibleForProspectiveScore: false,
      unknownWithholdingCodeAllowed: false
    });
  });
});
