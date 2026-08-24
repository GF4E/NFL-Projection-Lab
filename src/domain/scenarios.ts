import { stableHash } from "./hash";
import {
  deriveMainlineProbabilities,
  mixJointScoreDistributions,
  type JointScoreDistribution,
  type MainlineProbabilities
} from "./joint-score";
import type { SourceObservation } from "./point-in-time";

export type ScenarioDecisionStatus = "robust" | "fragile" | "indeterminate";

export interface ForecastScenarioBranch {
  id: string;
  label: string;
  condition: string;
  weight: number | null;
  supported: boolean;
  material: boolean;
  observations: SourceObservation[];
  distribution: JointScoreDistribution;
  edge: number;
  edgeInterval: [number, number];
  suggestedUnits: number;
}

export interface ScenarioDecisionDossier {
  status: ScenarioDecisionStatus;
  decision: "consider" | "pass";
  weightedEdge: number;
  edgeInterval: [number, number];
  suggestedUnits: number;
  branches: ForecastScenarioBranch[];
  aggregateDistribution: JointScoreDistribution;
  mainline: MainlineProbabilities;
  whatChangesTheView: string[];
  generatedAt: string;
  scenarioConfigHash: string;
  dossierHash: string;
}

function normalizedSupportedBranches(branches: readonly ForecastScenarioBranch[]): Array<{
  weight: number;
  distribution: JointScoreDistribution;
}> {
  const eligible = branches.filter((branch) => branch.supported && branch.weight !== null && branch.weight >= 0);
  const total = eligible.reduce((sum, branch) => sum + branch.weight!, 0);
  if (!(total > 0)) throw new Error("Scenario dossier has no supported weighted branch");
  return eligible.map((branch) => ({ weight: branch.weight! / total, distribution: branch.distribution }));
}

export function buildScenarioDecisionDossier(input: {
  branches: ForecastScenarioBranch[];
  aggregateEdgeInterval: [number, number];
  suggestedUnits: number;
  kellyFloor: number;
  homeSpreadPoint: number;
  totalPoint: number;
  lineMoveFalsifier?: string | null;
  generatedAt: string;
  modelHash: string;
  scenarioConfigHash: string;
  provenanceHash: string;
}): ScenarioDecisionDossier {
  if (!input.branches.length) throw new Error("Scenario dossier requires at least one branch");
  const supported = normalizedSupportedBranches(input.branches);
  const eligibleBranches = input.branches.filter((branch) => branch.supported && branch.weight !== null && branch.weight >= 0);
  const eligibleWeight = eligibleBranches.reduce((sum, branch) => sum + branch.weight!, 0);
  const weightedEdge = eligibleBranches.reduce(
    (sum, branch) => sum + branch.edge * branch.weight! / eligibleWeight,
    0
  );
  const unresolvedMaterial = input.branches.some((branch) => branch.material && (!branch.supported || branch.weight === null));
  const intervalSpansZero = input.aggregateEdgeInterval[0] <= 0 && input.aggregateEdgeInterval[1] >= 0;
  const decision = weightedEdge > 0 && input.suggestedUnits >= input.kellyFloor ? "consider" : "pass";
  const materialSupported = input.branches.filter((branch) => branch.material && branch.supported);
  const decisionReversal = materialSupported.some((branch) => decision === "consider"
    ? branch.edge <= 0 || branch.suggestedUnits < input.kellyFloor
    : branch.edge > 0 && branch.suggestedUnits >= input.kellyFloor);
  const status: ScenarioDecisionStatus = unresolvedMaterial || intervalSpansZero
    ? "indeterminate"
    : decisionReversal
      ? "fragile"
      : "robust";
  const whatChangesTheView = input.branches
    .filter((branch) => branch.material && branch.supported && (
      decision === "consider"
        ? branch.edge <= 0 || branch.suggestedUnits < input.kellyFloor
        : branch.edge > 0 && branch.suggestedUnits >= input.kellyFloor
    ))
    .map((branch) => branch.condition);
  if (unresolvedMaterial) {
    whatChangesTheView.push(...input.branches
      .filter((branch) => branch.material && (!branch.supported || branch.weight === null))
      .map((branch) => `Resolve ${branch.condition}`));
  }
  if (input.lineMoveFalsifier) whatChangesTheView.push(input.lineMoveFalsifier);
  const aggregateDistribution = mixJointScoreDistributions({
    branches: supported,
    family: supported[0].distribution.family,
    generatedAt: input.generatedAt,
    modelHash: input.modelHash,
    provenanceHash: input.provenanceHash
  });
  const mainline = deriveMainlineProbabilities(aggregateDistribution, {
    homeSpreadPoint: input.homeSpreadPoint,
    totalPoint: input.totalPoint
  });
  const dossierHash = stableHash({
    status,
    decision,
    weightedEdge,
    edgeInterval: input.aggregateEdgeInterval,
    suggestedUnits: input.suggestedUnits,
    branches: input.branches.map((branch) => ({
      ...branch,
      observations: branch.observations.map((observation) => observation.sourceHash),
      distribution: branch.distribution.distributionHash
    })),
    aggregateDistribution: aggregateDistribution.distributionHash,
    scenarioConfigHash: input.scenarioConfigHash
  });
  return {
    status,
    decision,
    weightedEdge,
    edgeInterval: input.aggregateEdgeInterval,
    suggestedUnits: input.suggestedUnits,
    branches: input.branches,
    aggregateDistribution,
    mainline,
    whatChangesTheView: [...new Set(whatChangesTheView)],
    generatedAt: input.generatedAt,
    scenarioConfigHash: input.scenarioConfigHash,
    dossierHash
  };
}

export function assertScenarioWeightsCalibratable(branches: readonly ForecastScenarioBranch[]): void {
  if (!branches.length) throw new Error("Scenario calibration requires branches");
  const supported = branches.filter((branch) => branch.supported);
  if (supported.some((branch) => branch.weight === null)) {
    throw new Error("Supported scenario branches require explicit weights");
  }
  const weight = supported.reduce((sum, branch) => sum + branch.weight!, 0);
  if (Math.abs(weight - 1) > 1e-9) throw new Error("Supported scenario weights must sum to one");
  if (supported.some((branch) => branch.weight! < 0 || branch.weight! > 1)) {
    throw new Error("Scenario weights must be between zero and one");
  }
}

