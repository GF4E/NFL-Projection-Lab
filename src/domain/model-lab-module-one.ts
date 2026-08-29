import contract from "../../config/model-lab-module-one.config.json";
import { stableHash } from "./hash";

export interface ModuleOneContractValidation {
  errors: string[];
  contractHash: string;
}

function normalized(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_");
}

export function validateModuleOneContract(): ModuleOneContractValidation {
  const errors: string[] = [];
  const allowlist = [
    ...contract.dataBoundary.scheduleAllowlist,
    ...contract.dataBoundary.pbpAllowlist,
    ...contract.dataBoundary.weeklyRosterAllowlist
  ].map(normalized);
  for (const pattern of contract.dataBoundary.forbiddenFieldPatterns.map(normalized)) {
    if (allowlist.some((field) => field.includes(pattern))) {
      errors.push(`forbidden field pattern ${pattern} appears in the positive allowlist`);
    }
  }
  if (contract.productionForecastChangeAllowed) errors.push("Module 1 cannot change the production forecast");
  if (contract.forecastContract.sameWeekEarlierGamesAllowed) errors.push("same-week game data must be forbidden");
  if (contract.forecastContract.warmupSeasons.at(-1)! >= contract.forecastContract.developmentSeasons[0]) {
    errors.push("warm-up seasons must end before development evaluation");
  }
  if (contract.forecastContract.developmentSeasons.at(-1)! >= contract.forecastContract.confirmationSeason) {
    errors.push("development seasons must end before the confirmation season");
  }
  const complexity = Object.values(contract.candidates).map((candidate) => candidate.complexityRank);
  if (new Set(complexity).size !== 4 || Math.min(...complexity) !== 0 || Math.max(...complexity) !== 3) {
    errors.push("the four candidates require unique complexity ranks zero through three");
  }
  if (contract.evaluation.primaryMetric !== "multivariate_energy_score") {
    errors.push("the primary metric is not frozen to multivariate energy score");
  }
  if (contract.shadowEligibilityGate.automaticProductionPromotion) {
    errors.push("Module 1 cannot promote to production automatically");
  }
  return { errors, contractHash: stableHash(contract) };
}

export const moduleOneContract = contract;
