import { stableHash } from "./hash";

export type EvidenceTier = "foundation" | "shadow" | "quarantined";
export type ExperimentStatus =
  | "preregistered"
  | "running"
  | "continue_shadow"
  | "promote"
  | "reject"
  | "defer";

export interface ExperimentGate {
  primaryMetric: string;
  minimumImprovement: number;
  maximumCalibrationSlopeError: number;
  minimumIntervalCoverage80: number;
  multiplicityFamily: string;
  plannedComparisons: number;
}

export interface RegisteredExperiment {
  id: string;
  name: string;
  hypothesis: string;
  evidenceTier: EvidenceTier;
  baselineFamily: string;
  candidateFamily: string;
  sourceIds: string[];
  requiredSeasonStart: number;
  requiredSeasonEnd: number;
  transformation: string;
  primaryMetric: string;
  secondaryMetrics: string[];
  falsifier: string;
  gate: ExperimentGate;
  featureSetFrozen: boolean;
  preregisteredAt: string;
  registryHash: string;
}

export interface ExperimentDecision {
  experimentId: string;
  previousStatus: ExperimentStatus;
  decision: Exclude<ExperimentStatus, "preregistered" | "running">;
  evaluationWindow: string;
  rowsHash: string;
  baselineMetrics: Record<string, number>;
  candidateMetrics: Record<string, number>;
  calibrationSlope: number;
  intervalCoverage80: number;
  multiplicityAdjustedThreshold: number;
  rationale: string;
  decidedAt: string;
  offseasonReview: boolean;
  decisionHash: string;
}

function assertIso(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

export function registerExperiment(
  input: Omit<RegisteredExperiment, "registryHash">
): RegisteredExperiment {
  assertIso(input.preregisteredAt, "Experiment preregistration time");
  if (!input.id || !input.name || !input.hypothesis || !input.falsifier) {
    throw new Error("An experiment requires an id, name, hypothesis, and falsifier");
  }
  if (!input.sourceIds.length || input.requiredSeasonStart > input.requiredSeasonEnd) {
    throw new Error("An experiment requires source coverage over a valid season range");
  }
  if (!input.featureSetFrozen) {
    throw new Error("Experiment feature membership must be frozen before evaluation");
  }
  if (input.gate.primaryMetric !== input.primaryMetric || input.gate.plannedComparisons < 1) {
    throw new Error("Experiment gate must match the primary metric and declare multiplicity");
  }
  if (input.gate.minimumIntervalCoverage80 < 0 || input.gate.minimumIntervalCoverage80 > 1) {
    throw new Error("Interval coverage gate must be a probability");
  }
  return { ...input, registryHash: stableHash(input) };
}

export function validateRegisteredExperiment(experiment: RegisteredExperiment): void {
  const { registryHash, ...content } = experiment;
  if (registryHash !== stableHash(content)) throw new Error("Experiment registry hash mismatch");
  registerExperiment(content);
}

export function decideExperiment(input: {
  experiment: RegisteredExperiment;
  previousStatus: ExperimentStatus;
  requestedDecision: Exclude<ExperimentStatus, "preregistered" | "running">;
  evaluationWindow: string;
  rowsHash: string;
  baselineMetrics: Record<string, number>;
  candidateMetrics: Record<string, number>;
  calibrationSlope: number;
  intervalCoverage80: number;
  rationale: string;
  decidedAt: string;
  offseasonReview: boolean;
}): ExperimentDecision {
  validateRegisteredExperiment(input.experiment);
  assertIso(input.decidedAt, "Experiment decision time");
  if (Date.parse(input.decidedAt) < Date.parse(input.experiment.preregisteredAt)) {
    throw new Error("Experiment decision cannot predate preregistration");
  }
  if (!input.rowsHash || !input.evaluationWindow || !input.rationale) {
    throw new Error("Experiment decision requires frozen rows, an evaluation window, and rationale");
  }
  if (!(["running", "continue_shadow", "defer"] as ExperimentStatus[]).includes(input.previousStatus)) {
    throw new Error("Only an evaluated experiment can receive a terminal decision");
  }
  if (input.requestedDecision === "promote" && !input.offseasonReview) {
    throw new Error("Structural experiment promotion is offseason-only");
  }
  if (input.requestedDecision === "promote" && input.experiment.evidenceTier === "quarantined") {
    throw new Error("A quarantined hypothesis must pass shadow evaluation before promotion");
  }

  const baseline = input.baselineMetrics[input.experiment.primaryMetric];
  const candidate = input.candidateMetrics[input.experiment.primaryMetric];
  if (!Number.isFinite(baseline) || !Number.isFinite(candidate)) {
    throw new Error("Decision metrics must include the preregistered primary metric");
  }
  const improvement = baseline - candidate;
  const calibrationError = Math.abs(input.calibrationSlope - 1);
  const adjustedThreshold = input.experiment.gate.minimumImprovement
    * Math.sqrt(input.experiment.gate.plannedComparisons);
  const passes = improvement >= adjustedThreshold
    && calibrationError <= input.experiment.gate.maximumCalibrationSlopeError
    && input.intervalCoverage80 >= input.experiment.gate.minimumIntervalCoverage80;
  if (input.requestedDecision === "promote" && !passes) {
    throw new Error("Candidate does not pass the preregistered performance and calibration gate");
  }

  const decisionContent = {
    experimentId: input.experiment.id,
    previousStatus: input.previousStatus,
    decision: input.requestedDecision,
    evaluationWindow: input.evaluationWindow,
    rowsHash: input.rowsHash,
    baselineMetrics: input.baselineMetrics,
    candidateMetrics: input.candidateMetrics,
    calibrationSlope: input.calibrationSlope,
    intervalCoverage80: input.intervalCoverage80,
    multiplicityAdjustedThreshold: adjustedThreshold,
    rationale: input.rationale,
    decidedAt: input.decidedAt,
    offseasonReview: input.offseasonReview
  } satisfies Omit<ExperimentDecision, "decisionHash">;
  return { ...decisionContent, decisionHash: stableHash(decisionContent) };
}

export function assertTrainingInputsAllowed(inputNames: readonly string[]): void {
  const forbidden = ["team_pick", "pick_outcome", "human_adjustment", "approval", "units", "rationale"];
  const contaminated = inputNames.filter((name) => forbidden.some((token) => name.toLowerCase().includes(token)));
  if (contaminated.length) {
    throw new Error(`Decision-process fields are prohibited from model training: ${contaminated.join(", ")}`);
  }
}

