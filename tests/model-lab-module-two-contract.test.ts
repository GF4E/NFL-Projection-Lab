import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moduleTwoContract, validateModuleTwoContract } from "@/domain/model-lab-module-two";

function normalized(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_");
}

function codeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return codeFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function archivedSha256(localPath: string): string {
  const archiveManifest = JSON.parse(
    readFileSync(".planning/engine-os/execution/os-00/r2-archive-manifest.v1.json", "utf8")
  ) as { objects: Array<{ localPath: string; sha256: string }> };
  const archived = archiveManifest.objects.find((object) => object.localPath === localPath);
  if (!archived) throw new Error(`Missing archived evidence object: ${localPath}`);
  return archived.sha256;
}

const expectedConfigSha256 = "ceb9cd5287fb2d2ecf4cbf0961d28e5b41f7b583282ff655cfe8d1a778686a3b";
const expectedInvalidV7FreezeManifestSha256 = "194864b038235c1ad933a58dca6c0bb03ed5bc9b8fadfc94534c46d2a269cf3b";
const expectedV8FreezeManifestSha256 = "eecd6bfd47f648159770356ddac7357911ea879971fc3c41e4fe3df720efab9c";

describe("Model Laboratory Module 2 contract", () => {
  it("anchors the v8 config and preserves the invalid v7 freeze", () => {
    expect(sha256("config/model-lab-module-two.config.json")).toBe(expectedConfigSha256);
    expect(archivedSha256("artifacts/model-lab/module-two/pre-replay-manifest.json")).toBe(
      expectedInvalidV7FreezeManifestSha256
    );
    expect(archivedSha256("artifacts/model-lab/module-two-v8/pre-replay-manifest.json")).toBe(
      expectedV8FreezeManifestSha256
    );
  });

  it("freezes Module 1's rejection and all Module 2 research boundaries", () => {
    const validation = validateModuleTwoContract();
    expect(validation.errors).toEqual([]);
    expect(validation.contractHash).toHaveLength(64);
    expect(moduleTwoContract.status).toBe("preregistered_research_only");
    expect(moduleTwoContract.frozenBeforeCandidateReplay).toBe(true);
    expect(moduleTwoContract.moduleOneResult).toBe("reject_all");
    expect(moduleTwoContract.moduleOneResearchBenchmark).toBe("c0_naive_points_only");
    expect(moduleTwoContract.moduleOneArtifactsMutable).toBe(false);
    expect(moduleTwoContract.productionForecastChangeAllowed).toBe(false);
    expect(moduleTwoContract.marketComparisonAllowed).toBe(false);
    expect(moduleTwoContract.confidenceScoreAllowed).toBe(false);
    expect(moduleTwoContract.nextModuleAllowed).toBe(false);
  });

  it("uses a joint regulation target while storing overtime separately", () => {
    expect(moduleTwoContract.target.primary).toEqual([
      "home_regulation_offensive_series",
      "away_regulation_offensive_series"
    ]);
    expect(moduleTwoContract.target.secondaryStoredOnly).toEqual([
      "overtime_occurred",
      "home_overtime_offensive_series",
      "away_overtime_offensive_series"
    ]);
    expect(moduleTwoContract.target.regulationQuarters).toEqual([1, 2, 3, 4]);
    expect(moduleTwoContract.target.overtimeMinimumQuarter).toBe(5);
    expect(moduleTwoContract.target.edgeCases.overtime).toBe(
      "store_separately_and_never_merge_into_the_primary_target"
    );
  });

  it("freezes three ranked candidates, the joint log score, and chronological periods", () => {
    expect(Object.keys(moduleTwoContract.candidates)).toEqual([
      "p0_league_season_naive",
      "p1_partially_pooled_rates",
      "p2_regularized_joint_count"
    ]);
    expect(Object.values(moduleTwoContract.candidates).map((candidate) => candidate.complexityRank)).toEqual([
      0,
      1,
      2
    ]);
    expect(moduleTwoContract.evaluation.primaryMetric).toBe("joint_negative_log_score");
    expect(moduleTwoContract.forecastContract.sameWeekEarlierGamesAllowed).toBe(false);
    expect(moduleTwoContract.forecastContract.developmentSeasons).toEqual([
      2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024
    ]);
    expect(moduleTwoContract.forecastContract.retrospectiveConfirmationSeason).toBe(2025);
    expect(moduleTwoContract.forecastContract.prospectiveShadowSeason).toBe(2026);
    expect(moduleTwoContract.shadowEligibilityGate.automaticProductionPromotion).toBe(false);
    expect(moduleTwoContract.shadowEligibilityGate.retrospectivePassResult).toBe("shadow_eligible_only");
  });

  it("keeps forbidden sportsbook, outcome, and prior-module fields out of positive allowlists", () => {
    const allowed = [
      ...moduleTwoContract.dataBoundary.scheduleAllowlist,
      ...moduleTwoContract.dataBoundary.pbpAllowlist
    ].map(normalized);
    for (const forbidden of moduleTwoContract.dataBoundary.forbiddenFieldPatterns.map(normalized)) {
      expect(allowed.some((field) => field.includes(forbidden))).toBe(false);
    }
  });

  it("keeps Module 2 disconnected from production code", () => {
    const productionFiles = [...codeFiles("src"), ...codeFiles("worker")].filter(
      (file) => file !== "src/domain/model-lab-module-two.ts"
    );
    const forbiddenReferences = [
      "model-lab-module-two",
      "model-lab/module2",
      "artifacts/model-lab/module-two",
      "moduleTwoContract",
      "validateModuleTwoContract"
    ];
    for (const file of productionFiles) {
      const source = readFileSync(file, "utf8");
      for (const reference of forbiddenReferences) expect(source).not.toContain(reference);
    }
  });
});
