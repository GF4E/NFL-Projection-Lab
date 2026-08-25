import operatingContractJson from "../../config/engine-operating-contract.v1.json";
import lifecycleContractJson from "../../config/football-lifecycle-2026.v1.json";
import researchConstitutionJson from "../../config/research-constitution.v1.json";
import { stableHash } from "./hash";

export interface FrozenContractValidation {
  errors: string[];
  contractHash: string;
}

function hasPlaceholder(value: unknown): boolean {
  if (typeof value === "string") return /\b(?:tbd|todo|fixme|placeholder)\b/i.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value && typeof value === "object") return Object.values(value).some(hasPlaceholder);
  return false;
}

function sameValues<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function consecutive(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validateFrozenEnvelope(
  contract: { version: string; status: string; frozenOn: string },
  expectedVersion: string,
  errors: string[]
): void {
  if (contract.version !== expectedVersion) errors.push(`expected version ${expectedVersion}`);
  if (!contract.status.includes("frozen")) errors.push(`${expectedVersion} must be frozen`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contract.frozenOn)) errors.push(`${expectedVersion} needs a frozen date`);
  if (hasPlaceholder(contract)) errors.push(`${expectedVersion} contains a placeholder value`);
}

export function validateEngineOperatingContract(): FrozenContractValidation {
  const contract = operatingContractJson;
  const errors: string[] = [];
  validateFrozenEnvelope(contract, "engine-operating-contract.2026.1", errors);

  if (
    contract.changePolicy.mode !== "append_new_version_only" ||
    contract.changePolicy.priorVersionFilesMutable ||
    !sameValues(contract.changePolicy.qualificationEvidenceMustStore, [
      "operating_contract_version",
      "operating_contract_hash"
    ])
  ) {
    errors.push("operating target changes must append a version and qualification evidence must bind its hash");
  }

  const horizonIds = contract.forecastHorizons.map((horizon) => horizon.id);
  if (
    new Set(horizonIds).size !== horizonIds.length ||
    !sameValues(horizonIds, [
      "weekly_tuesday_0730",
      "kickoff_minus_120",
      "kickoff_minus_90",
      "kickoff_minus_60",
      "kickoff_minus_15"
    ])
  ) {
    errors.push("required forecast horizons must be unique and frozen");
  }
  const scientific = contract.forecastHorizons.filter((horizon) => horizon.scientificEligibility);
  if (
    scientific.length !== 1 ||
    scientific[0]?.id !== "weekly_tuesday_0730" ||
    scientific[0]?.informationCutoff !== "completed_games_through_week_w_minus_1_at_origin"
  ) {
    errors.push("Tuesday 07:30 must be the sole scientific origin with a W-1 cutoff");
  }
  if (
    contract.clock.timezone !== "America/Los_Angeles" ||
    contract.clock.daylightSavingRule !== "iana_timezone_database" ||
    !finitePositive(contract.clock.scheduledJobGraceSeconds)
  ) {
    errors.push("forecast timing must use a finite IANA Pacific clock contract");
  }

  if (
    contract.eligibility.requiredProvenanceRatio !== 1 ||
    contract.eligibility.maximumUnexplainedMissingRecords !== 0 ||
    contract.eligibility.maximumLateScientificRecords !== 0 ||
    contract.eligibility.requiredForecastOrWithholdingRatio !== 1 ||
    contract.eligibility.minimumEligibleForecastRatioForPublicRelease < 0.95
  ) {
    errors.push("forecast completeness and provenance targets are not strict enough");
  }
  if (
    contract.scheduleChanges.revisionMode !== "append_only" ||
    contract.scheduleChanges.pastOriginBackfillAllowed ||
    contract.scheduleChanges.earlierKickoffMayGainEarlierOrigin ||
    contract.scheduleChanges.laterKickoffReclassifiesPriorLateRecord
  ) {
    errors.push("reschedules must append without changing past-origin eligibility");
  }
  if (Object.values(contract.maximumSourceAgeSeconds).some((seconds) => !finitePositive(seconds))) {
    errors.push("every source class needs a positive maximum age");
  }
  if (
    Object.entries(contract.servedPublicationAgeSeconds)
      .filter(([, value]) => typeof value === "number")
      .some(([, seconds]) => !finitePositive(seconds as number)) ||
    !contract.servedPublicationAgeSeconds.stalePublicationMustBeLabeled ||
    contract.servedPublicationAgeSeconds.stalePublicationMayReplaceLastGood
  ) {
    errors.push("served-snapshot ages and last-good behavior must be explicit");
  }

  const latency = contract.publicApi.latencyMilliseconds;
  if (
    !(latency.p50 < latency.p95 && latency.p95 < latency.p99) ||
    contract.publicApi.minimumRolling30DayAvailability < 0.99 ||
    contract.publicApi.maximumResponseBytes > 524288 ||
    contract.publicApi.providerCallsFromReadRequests !== 0 ||
    contract.publicApi.writesFromReadRequests !== 0
  ) {
    errors.push("public API latency, availability, payload, and read-only targets changed");
  }
  if (
    contract.recovery.r2AcknowledgedObjectRpoSeconds !== 0 ||
    contract.recovery.publicationPointerRpoSeconds !== 0 ||
    !finitePositive(contract.recovery.d1MetadataRpoSeconds) ||
    !finitePositive(contract.recovery.serviceRtoSeconds) ||
    !finitePositive(contract.recovery.d1BackupFrequencySeconds) ||
    !contract.recovery.lastGoodPublicationRequired
  ) {
    errors.push("recovery targets must protect acknowledged objects and the last good publication");
  }
  if (Object.values(contract.retentionDays).some((days) => !finitePositive(days))) {
    errors.push("every retained object class needs a positive retention period");
  }

  const oddsBudget = contract.providerBudgets.theOddsApi;
  if (
    oddsBudget.alertAtCredits !== 400 ||
    oddsBudget.hardCeilingCredits !== 450 ||
    oddsBudget.monthlyPlanCredits !== 500 ||
    oddsBudget.essentialReserveCredits !== oddsBudget.monthlyPlanCredits - oddsBudget.hardCeilingCredits ||
    oddsBudget.paidTierSpendUsdPerMonth !== 0
  ) {
    errors.push("The Odds API alert, ceiling, reserve, and free-tier budget must remain frozen");
  }
  if (
    contract.computeBudgets.paidComputeSpendUsdPerMonth !== 0 ||
    !finitePositive(contract.computeBudgets.computeRunnerMaximumVcpuHoursPerWeek) ||
    !finitePositive(contract.computeBudgets.computeRunnerMaximumMemoryGiB) ||
    contract.computeBudgets.fullHistoryFitOnPublicWorkerAllowed
  ) {
    errors.push("compute budgets must be finite and full-history fits must stay off the public Worker");
  }
  const capacity = contract.storageAndEgressBudgets;
  if (
    !finitePositive(capacity.r2MaximumStoredGiB) ||
    !finitePositive(capacity.d1MaximumStoredGiB) ||
    !finitePositive(capacity.maximumMonthlyPublicEgressGiB) ||
    !(capacity.alertAtFraction > 0 && capacity.alertAtFraction < capacity.hardStopAtFraction) ||
    capacity.hardStopAtFraction !== 1
  ) {
    errors.push("storage and egress targets must have a warning below a finite hard stop");
  }

  return { errors, contractHash: stableHash(contract) };
}

export function validateResearchConstitution(): FrozenContractValidation {
  const contract = researchConstitutionJson;
  const errors: string[] = [];
  validateFrozenEnvelope(contract, "research-constitution.2026.1", errors);

  if (
    contract.operatingContractVersion !== operatingContractJson.version ||
    contract.immutability.mode !== "append_new_version_only" ||
    contract.immutability.negativeResultsMayBeRewritten ||
    contract.immutability.postRunConditionalRoutingAllowed
  ) {
    errors.push("the constitution must bind the operating contract and preserve negative results");
  }
  if (
    contract.forecastContract.origin !== "tuesday_0730_america_los_angeles" ||
    contract.forecastContract.sameWeekEarlierGamesAllowed ||
    contract.forecastContract.withinWeekRefreshAllowedForResearchRows ||
    contract.forecastContract.randomSplitAllowed ||
    !contract.forecastContract.transformsFitInsideTrainingFold ||
    !contract.forecastContract.identicalScoredGamesRequired
  ) {
    errors.push("chronological Tuesday-origin evaluation rules changed");
  }
  if (
    !sameValues(contract.seasonRoles.warmupSeasons, [2010, 2011, 2012]) ||
    !sameValues(contract.seasonRoles.developmentSeasons, consecutive(2013, 2024)) ||
    !sameValues(contract.seasonRoles.researchExposedSeasons, consecutive(2010, 2025)) ||
    contract.seasonRoles.nextProspectiveSeason !== 2026 ||
    contract.seasonRoles.preActivationBackfillAllowed
  ) {
    errors.push("2025 must remain exposed and 2026 must begin prospectively at actual activation");
  }
  if (
    contract.candidateStatus.module1.terminalResult !== "reject_all" ||
    contract.candidateStatus.module1.retainedBenchmark !== "c0_naive_points_only" ||
    contract.candidateStatus.module1.benchmarkEligibleForProduction ||
    contract.candidateStatus.module2.terminalResult !== "reject_all" ||
    contract.candidateStatus.module2.retainedBenchmark !== "p0_league_season_naive" ||
    contract.candidateStatus.module2.benchmarkEligibleForProduction ||
    contract.candidateStatus.onlyAuthorizedNextExperiment !== "module2b_residual_kernel_falsification_v1" ||
    contract.candidateStatus.driveOutcomeModuleAuthorized ||
    contract.candidateStatus.marketComparisonAuthorized ||
    contract.candidateStatus.productionForecastChangeAuthorized
  ) {
    errors.push("rejected candidates, benchmark-only roles, and the Module 2B boundary must remain frozen");
  }
  const requiredForbiddenPatterns = [
    "spread", "total_line", "moneyline", "odds", "line_movement", "public_betting",
    "clv", "selection", "pick_outcome", "approval", "human_adjustment", "manual_override"
  ];
  if (requiredForbiddenPatterns.some((pattern) => !contract.forbiddenFootballFeaturePatterns.includes(pattern))) {
    errors.push("football feature prohibitions are incomplete");
  }
  if (
    !contract.foldRules.sameWeekIsolationRequired ||
    !contract.foldRules.imputationFitInsideFold ||
    !contract.foldRules.scalingFitInsideFold ||
    !contract.foldRules.poolingFitInsideFold ||
    !contract.foldRules.calibrationFitInsideFold ||
    contract.foldRules.featureSelectionInsideSeasonAllowed ||
    contract.foldRules.favorableRowDeletionAllowed
  ) {
    errors.push("fold-local transforms and leakage controls must remain mandatory");
  }
  if (
    contract.pairedUncertainty.method !== "hierarchical_paired_season_week_block_bootstrap" ||
    contract.pairedUncertainty.members !== 10000 ||
    !sameValues(contract.pairedUncertainty.developmentBlockLengthsWeeks, [1, 3, 6]) ||
    contract.pairedUncertainty.simultaneousIntervalLevel !== 0.9 ||
    !contract.pairedUncertainty.pairedRowsRequired
  ) {
    errors.push("paired uncertainty contract changed");
  }
  const identityTriggers = contract.multiplicity.newExperimentIdentityTriggers;
  if (
    contract.multiplicity.discoveryEvidenceMayPromote ||
    contract.multiplicity.diagnosticSlicesMayPromote ||
    !contract.multiplicity.confirmationFamilyMustBeFrozenBeforeScoring ||
    identityTriggers.length < 10 ||
    contract.multiplicity.failedConfirmatoryExperimentMayBeConditionallyRouted
  ) {
    errors.push("multiplicity and discovery-versus-confirmation rules are not strict enough");
  }

  const module2b = contract.module2b;
  if (
    module2b.parentProtocolVersion !== "module2.2026-08-25.8" ||
    module2b.parentCodeHash !== "6ea88ae5a609ef4dac85aa28e4f39785b86c2a32d456c34bf220ae17ed23efd6" ||
    !sameValues(module2b.allowedKernelComparison.d0, [0.15, 0.7, 0.15]) ||
    !sameValues(module2b.allowedKernelComparison.d1, [0, 1, 0]) ||
    !sameValues(module2b.allowedCandidates, ["p0_league_season_naive", "p1_partially_pooled_rates"]) ||
    !module2b.forbiddenCandidates.includes("p2_regularized_joint_count") ||
    module2b.newFeaturesAllowed ||
    module2b.mechanismGates.minimumAbsoluteDifferenceVarianceErrorReduction !== 0.3 ||
    !sameValues(module2b.mechanismGates.marginalCoverage80Range, [0.72, 0.88]) ||
    module2b.forecastGates.minimumDeltaNllNat !== 0.01 ||
    module2b.forecastGates.minimumRelativeNllImprovement !== 0.01 ||
    module2b.forecastGates.maximumForecastFailures !== 0 ||
    !sameValues(module2b.terminalStatuses, ["reject_all", "shadow_eligible", "protocol_invalid"]) ||
    module2b.automaticProductionPromotion
  ) {
    errors.push("Module 2B must remain the exact D0/D1, P0/P1-only falsification");
  }
  if (
    contract.promotionLanguage.retrospectivePassMeaning !== "shadow_eligible_only" ||
    contract.promotionLanguage.productionReadyFromRetrospectiveEvidenceAllowed ||
    !contract.promotionLanguage.negativeResultRemainsTerminalForExperimentIdentity ||
    !contract.promotionLanguage.simplerModelPreferredWhenGainUnstable ||
    contract.promotionLanguage.humanSelectionOutcomeMayQualifyModel
  ) {
    errors.push("promotion language must preserve negative results and retrospective limits");
  }

  return { errors, contractHash: stableHash(contract) };
}

export function assertFootballTrainingInputsAllowed(inputNames: readonly string[]): void {
  const normalized = inputNames.map((name) => name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_"));
  const contaminated = normalized.filter((name) =>
    researchConstitutionJson.forbiddenFootballFeaturePatterns.some((pattern) => name.includes(pattern))
  );
  if (contaminated.length > 0) {
    throw new Error(`Market, selection, or human-decision fields are forbidden football inputs: ${contaminated.join(", ")}`);
  }
}

export function validateFootballLifecycle(): FrozenContractValidation {
  const contract = lifecycleContractJson;
  const errors: string[] = [];
  validateFrozenEnvelope(contract, "football-lifecycle.2026.1", errors);

  if (
    contract.operatingContractVersion !== operatingContractJson.version ||
    contract.researchConstitutionVersion !== researchConstitutionJson.version ||
    contract.season !== 2026
  ) {
    errors.push("the lifecycle must bind the frozen 2026 operating and research contracts");
  }
  const deadline = Date.parse(contract.seasonBoundary.fullSeasonActivationDeadline);
  const kickoff = Date.parse(contract.seasonBoundary.firstRegularSeasonKickoff);
  if (
    !Number.isFinite(deadline) ||
    !Number.isFinite(kickoff) ||
    deadline >= kickoff ||
    contract.seasonBoundary.regularSeasonWeeks !== 18 ||
    contract.seasonBoundary.preActivationForecastBackfillAllowed ||
    contract.seasonBoundary.preActivationWeeksCountAsProspectiveEvidence
  ) {
    errors.push("full- versus partial-season activation boundaries are invalid");
  }
  if (
    contract.activation.modelPackageAtLifecycleFreeze !== "none_no_validated_market_free_candidate" ||
    !contract.activation.requiresImmutablePackageHash ||
    !contract.activation.requiresImmutableConfigHash ||
    !contract.activation.requiresImmutableFeatureSchemaHash ||
    !contract.activation.oneActivationBoundaryPerPackage ||
    !contract.activation.laterPackageActivationCreatesNewEvidenceStream ||
    contract.activation.componentPackageMayPopulateGamePredictionEndpoint
  ) {
    errors.push("activation must start honestly with no eligible package and bind immutable identities");
  }
  if (
    contract.structuralFreeze.inSeasonChangesAllowed ||
    contract.structuralFreeze.frozenPerActivatedPackage.length < 16 ||
    !contract.structuralFreeze.manualOffseasonReviewRequired
  ) {
    errors.push("activated package structure must remain frozen for the season");
  }
  if (
    contract.weeklyStateUpdate.maximumGameWeekUsed !== "target_week_minus_1" ||
    contract.weeklyStateUpdate.sameWeekEarlierGamesAllowed ||
    contract.weeklyStateUpdate.allowedMutations.length !== 5 ||
    !contract.weeklyStateUpdate.forbiddenMutations.includes("select_features") ||
    !contract.weeklyStateUpdate.forbiddenMutations.includes("tune_hyperparameters") ||
    !contract.weeklyStateUpdate.forbiddenMutations.includes("train_on_market_evidence") ||
    contract.weeklyStateUpdate.historicalForecastMutationAllowed
  ) {
    errors.push("weekly state may advance under frozen rules using W-1 data only");
  }
  const challenger = contract.coefficientChallenger;
  if (
    !challenger.structureMustMatchActivatedPackage ||
    !challenger.featureSchemaMustMatchActivatedPackage ||
    !challenger.trainingRowsEndAtPriorCompletedWeek ||
    challenger.evaluationWindowCompletedSeasons !== 3 ||
    challenger.primaryMetric !== "joint_negative_log_score" ||
    !challenger.candidateMustImprovePrimaryMetric ||
    challenger.pairedImprovementLowerBoundMustExceed !== 0 ||
    !sameValues(challenger.calibrationSlopeRange, [0.8, 1.2]) ||
    challenger.maximumForecastFailures !== 0 ||
    challenger.structuralChallengerPromotionInSeasonAllowed ||
    challenger.marketMetricMayAffectFootballPromotion
  ) {
    errors.push("the coefficient challenger must be paired, football-only, and structurally frozen");
  }
  if (
    contract.dataFailureAndWithholding.partialImportMayUpdateState ||
    contract.dataFailureAndWithholding.staleImportMayUpdateState ||
    contract.dataFailureAndWithholding.schemaInvalidImportMayUpdateState ||
    !contract.dataFailureAndWithholding.serveLastGoodForecastDuringFailure ||
    !contract.dataFailureAndWithholding.servedLastGoodMustBeMarkedStale ||
    contract.dataFailureAndWithholding.lastGoodMayBeCopiedAsNewForecast ||
    contract.dataFailureAndWithholding.lateRecordEligibleForProspectiveScore ||
    contract.dataFailureAndWithholding.unknownWithholdingCodeAllowed
  ) {
    errors.push("stale or partial data must withhold, preserve last good, and never rewrite evidence");
  }
  if (
    contract.prospectiveEvidence.requiredRecordRatio !== 1 ||
    contract.prospectiveEvidence.maximumUnexplainedMissingRecords !== 0 ||
    !contract.prospectiveEvidence.forecastMustBeStoredBeforeKickoff ||
    !contract.prospectiveEvidence.immutableAfterStorage ||
    !contract.prospectiveEvidence.allEligibleGamesRequired ||
    contract.prospectiveEvidence.selectedGameSubsetMayQualifyModel ||
    contract.prospectiveEvidence.humanNotesTrainingEligible ||
    contract.prospectiveEvidence.marketEvidenceTrainingEligible ||
    contract.prospectiveEvidence.partialSeasonMayBeCalledFullSeasonConfirmation
  ) {
    errors.push("prospective evidence must be complete, immutable, all-game, and honestly labeled");
  }

  return { errors, contractHash: stableHash(contract) };
}

export type SeasonEvidenceLabel = "full_season_shadow" | "partial_season_shadow";

export function classifySeasonEvidence(input: {
  activatedAt: string;
  weekOneOriginComplete: boolean;
}): SeasonEvidenceLabel {
  const activatedAt = Date.parse(input.activatedAt);
  if (!Number.isFinite(activatedAt)) throw new Error("Activation time must be a valid ISO timestamp");
  const deadline = Date.parse(lifecycleContractJson.seasonBoundary.fullSeasonActivationDeadline);
  return activatedAt <= deadline && input.weekOneOriginComplete
    ? "full_season_shadow"
    : "partial_season_shadow";
}

export function assertWeeklyStateUpdateAllowed(input: {
  mutation: string;
  targetWeek: number;
  latestCompletedWeekUsed: number;
}): void {
  if (!lifecycleContractJson.weeklyStateUpdate.allowedMutations.includes(input.mutation)) {
    throw new Error(`In-season mutation is not authorized: ${input.mutation}`);
  }
  if (input.latestCompletedWeekUsed > input.targetWeek - 1) {
    throw new Error("Weekly state updates may use completed games only through W-1");
  }
}

export function assertWithholdingCodeAllowed(code: string): void {
  if (!lifecycleContractJson.dataFailureAndWithholding.approvedWithholdingCodes.includes(code)) {
    throw new Error(`Unknown withholding code: ${code}`);
  }
}

export const engineOperatingContract = operatingContractJson;
export const researchConstitution = researchConstitutionJson;
export const footballLifecycle2026 = lifecycleContractJson;

export const engineOsContractHashes = {
  operating: stableHash(operatingContractJson),
  research: stableHash(researchConstitutionJson),
  lifecycle: stableHash(lifecycleContractJson)
} as const;
