import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moduleOneContract, validateModuleOneContract } from "@/domain/model-lab-module-one";

describe("Model Laboratory Module 1 contract", () => {
  it("freezes a market-free research-only forecast contract", () => {
    const validation = validateModuleOneContract();
    expect(validation.errors).toEqual([]);
    expect(validation.contractHash).toHaveLength(64);
    expect(moduleOneContract.status).toBe("preregistered_research_only");
    expect(moduleOneContract.productionForecastChangeAllowed).toBe(false);
    expect(moduleOneContract.forecastContract.sameWeekEarlierGamesAllowed).toBe(false);
    expect(moduleOneContract.shadowEligibilityGate.automaticProductionPromotion).toBe(false);
  });

  it("uses positive data allowlists with no sportsbook or team-selection fields", () => {
    const allowed = [
      ...moduleOneContract.dataBoundary.scheduleAllowlist,
      ...moduleOneContract.dataBoundary.pbpAllowlist,
      ...moduleOneContract.dataBoundary.weeklyRosterAllowlist
    ].join(" ").toLowerCase();
    for (const forbidden of moduleOneContract.dataBoundary.forbiddenFieldPatterns) {
      expect(allowed).not.toContain(forbidden.toLowerCase());
    }
    expect(moduleOneContract.dataBoundary.rosterFeatureStatus).toBe("prior_week_listed_continuity_only");
  });

  it("keeps the model lab disconnected from production forecast code", () => {
    function codeFiles(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return codeFiles(path);
        return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
      });
    }
    const productionFiles = [...codeFiles("src"), ...codeFiles("worker")].filter(
      (file) => file !== "src/domain/model-lab-module-one.ts"
    );
    for (const file of productionFiles) {
      expect(readFileSync(file, "utf8")).not.toContain("model-lab-module-one");
      expect(readFileSync(file, "utf8")).not.toContain("model-lab/module1");
      expect(readFileSync(file, "utf8")).not.toContain("artifacts/model-lab/module-one");
    }
  });
});
