import contract from "../../config/model-lab-module-two.config.json";
import { stableHash } from "./hash";

export interface ModuleTwoContractValidation {
  errors: string[];
  contractHash: string;
}

const PRIMARY_TARGET = [
  "home_regulation_offensive_series",
  "away_regulation_offensive_series"
] as const;

const OVERTIME_STORAGE = [
  "overtime_occurred",
  "home_overtime_offensive_series",
  "away_overtime_offensive_series"
] as const;

const CANDIDATE_IDS = [
  "p0_league_season_naive",
  "p1_partially_pooled_rates",
  "p2_regularized_joint_count"
] as const;

function normalized(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_");
}

function equalsInOrder<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function inclusiveRange(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function validateModuleTwoContract(): ModuleTwoContractValidation {
  const errors: string[] = [];

  if (contract.version !== "module2.2026-08-25.8") {
    errors.push("Module 2 must use the frozen v8 repair contract");
  }
  if (contract.status !== "preregistered_research_only" || !contract.frozenBeforeCandidateReplay) {
    errors.push("Module 2 must remain preregistered and frozen before candidate replay");
  }
  if (
    contract.moduleOneResult !== "reject_all" ||
    contract.moduleOneResearchBenchmark !== "c0_naive_points_only" ||
    contract.moduleOneArtifactsMutable
  ) {
    errors.push("Module 1 reject-all result and C0 research benchmark must remain frozen");
  }
  if (contract.productionForecastChangeAllowed) errors.push("Module 2 cannot change the production forecast");
  if (contract.marketComparisonAllowed) errors.push("market comparison must remain disabled in Module 2");
  if (contract.confidenceScoreAllowed) errors.push("confidence scoring must remain disabled in Module 2");
  if (contract.nextModuleAllowed) errors.push("the next model-lab module must remain disabled");

  if (!equalsInOrder(contract.target.primary, PRIMARY_TARGET)) {
    errors.push("the primary target must be the joint home-away regulation offensive-series count");
  }
  if (!equalsInOrder(contract.target.secondaryStoredOnly, OVERTIME_STORAGE)) {
    errors.push("overtime outcomes must be stored separately from the primary target");
  }
  if (
    !equalsInOrder(contract.target.regulationQuarters, [1, 2, 3, 4]) ||
    contract.target.overtimeMinimumQuarter !== 5 ||
    contract.target.edgeCases.overtime !== "store_separately_and_never_merge_into_the_primary_target"
  ) {
    errors.push("regulation and overtime target boundaries are not frozen correctly");
  }
  if (contract.target.primary.some((field) => normalized(field).includes("overtime"))) {
    errors.push("the primary regulation target cannot contain an overtime field");
  }

  const candidateIds = Object.keys(contract.candidates);
  const complexityRanks = Object.values(contract.candidates).map((candidate) => candidate.complexityRank);
  if (
    !equalsInOrder(candidateIds, CANDIDATE_IDS) ||
    !equalsInOrder([...complexityRanks].sort((left, right) => left - right), [0, 1, 2])
  ) {
    errors.push("Module 2 requires exactly three frozen candidates ranked zero through two");
  }
  if (contract.evaluation.primaryMetric !== "joint_negative_log_score") {
    errors.push("the primary metric must remain joint negative log score");
  }
  if (
    contract.dataBoundary.missingData.unexpectedFieldMissingnessMaximum !== 0.01 ||
    Object.keys(contract.dataBoundary.missingData.unexpectedMissingnessStrata).join(",") !==
      "schedule_identity_context,pbp_identity_timing_and_teams,qualifying_series_keys,repaired_envelope_drive_key,neutral_interval_inputs"
  ) {
    errors.push("the executable source-missingness strata or threshold changed");
  }
  if (
    contract.evaluation.bootstrapMembers !== 10000 ||
    contract.evaluation.bootstrapSeed !== 20260824 ||
    contract.evaluation.bootstrapBitGenerator !== "numpy_Generator_PCG64" ||
    contract.evaluation.quantileMethod !== "hyndman_fan_type_7_numpy_linear" ||
    !equalsInOrder(contract.evaluation.bootstrapLedgerPeriods.development.blockLengths, [1, 3, 6]) ||
    !equalsInOrder(contract.evaluation.bootstrapLedgerPeriods.confirmation_2025.blockLengths, [3])
  ) {
    errors.push("the paired bootstrap or quantile contract changed");
  }

  const allowlist = [
    ...contract.dataBoundary.scheduleAllowlist,
    ...contract.dataBoundary.pbpAllowlist
  ].map(normalized);
  for (const pattern of contract.dataBoundary.forbiddenFieldPatterns.map(normalized)) {
    if (allowlist.some((field) => field.includes(pattern))) {
      errors.push(`forbidden field pattern ${pattern} appears in the positive allowlist`);
    }
  }

  if (contract.forecastContract.sameWeekEarlierGamesAllowed) {
    errors.push("same-week game data must be forbidden");
  }
  if (!equalsInOrder(contract.forecastContract.developmentSeasons, inclusiveRange(2013, 2024))) {
    errors.push("development evaluation must cover seasons 2013 through 2024 in order");
  }
  if (
    contract.forecastContract.retrospectiveConfirmationSeason !== 2025 ||
    contract.forecastContract.prospectiveShadowSeason !== 2026
  ) {
    errors.push("2025 must remain retrospective confirmation and 2026 prospective shadow");
  }
  if (contract.shadowEligibilityGate.automaticProductionPromotion) {
    errors.push("Module 2 cannot promote to production automatically");
  }
  if (contract.shadowEligibilityGate.retrospectivePassResult !== "shadow_eligible_only") {
    errors.push("a retrospective pass may confer shadow eligibility only");
  }
  if (
    contract.shadowEligibilityGate.simplerCandidatePreference !==
    "select_p2_if_and_only_if_p2_passes_every_gate_including_stable_gain_over_p1;otherwise_select_p1_if_p1_passes;otherwise_reject_all"
  ) {
    errors.push("candidate selection must use the frozen P2-then-P1 rule");
  }

  return { errors, contractHash: stableHash(contract) };
}

export const moduleTwoContract = contract;
