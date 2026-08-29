export type BookKey = "betmgm" | "fanduel";
export type MarketKey = "spread" | "total" | "moneyline";
export type ExecutionStatus = "executed" | "paper";
export type TeamPickStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "locked"
  | "settled"
  | "push"
  | "void";
export type ModelStatus = "champion" | "challenger" | "rejected";
export type DataFreshness = "current" | "stale" | "partial" | "unavailable";
export type PushEventType = "awaiting_you" | "edge_threshold";
export type Role = "owner" | "teammate";

export interface Teammate {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}

export interface OddsSnapshot {
  id: string;
  gameId: string;
  book: BookKey;
  market: MarketKey;
  side: string;
  point: number | null;
  americanPrice: number;
  capturedAt: string;
  sourceHash: string;
  quota: {
    used: number;
    remaining: number;
    lastCost: number;
  };
}

export interface HistoricalMarginRow {
  gameId: string;
  season: number;
  consensusSpread: number;
  actualMargin: number;
}

export interface HistoricalTotalRow {
  gameId: string;
  season: number;
  consensusTotal: number;
  actualTotal: number;
}

export interface DiscreteOutcomeCell {
  postedPoint: number;
  cover: number;
  push: number;
  loss: number;
  effectiveWeight: number;
}

export interface DiscreteMarginRow {
  consensusSpread: number;
  outcomes: DiscreteOutcomeCell[];
}

export interface DiscreteMarginArtifact {
  version: string;
  seasonRange: [number, number];
  boundarySeason: number;
  decay: {
    halfLifeSeasons: number;
    referenceSeason: number;
  };
  spreadGrid: number[];
  rows: DiscreteMarginRow[];
  keyMarginMasses: Record<string, number>;
  artifactHash: string;
  generatedAt: string;
}

export interface DiscreteTotalRow {
  consensusTotal: number;
  outcomes: DiscreteOutcomeCell[];
}

export interface DiscreteTotalArtifact {
  version: string;
  seasonRange: [number, number];
  decay: {
    halfLifeSeasons: number;
    referenceSeason: number;
  };
  kernelBandwidth: number;
  consensusGrid: number[];
  totalGrid: number[];
  rows: DiscreteTotalRow[];
  artifactHash: string;
  generatedAt: string;
}

export interface TranslationResult {
  /** Fair win probability conditional on the outcome not being a push. */
  probability: number | null;
  pushProbability: number | null;
  warning: "none" | "interpolated" | "extrapolated" | "unsupported";
  sourcePoints: number[];
}

export interface Forecast {
  id: string;
  gameId: string;
  market: MarketKey;
  selection: string;
  championHash: string;
  configHash: string;
  dataHash: string;
  modelProbability: number;
  consensusProbability: number;
  shrunkProbability: number;
  uncertaintyInterval: [number, number];
  edge: number;
  suggestedUnits: number;
  unitsGreyed: boolean;
  inputsThroughWeek: number;
  targetWeek: number;
  generatedAt: string;
  oddsCapturedAt: string;
  injuryCapturedAt: string | null;
  weatherForecastIssuedAt: string | null;
  weatherValidAt: string | null;
  qbInput: QuarterbackInput;
  freshness: DataFreshness;
}

export interface BookEvaluation {
  book: BookKey;
  rawQuote: OddsSnapshot;
  opposingQuote: OddsSnapshot;
  canonicalPoint: number | null;
  translatedAmericanPrice: number | null;
  powerExponent: number;
  fairProbability: number;
  shrunkProbability: number | null;
  pushProbability: number | null;
  expectedValue: number | null;
  edge: number | null;
  uncertaintyInterval: [number, number] | null;
  translationWarning: TranslationResult["warning"];
}

export interface Approval {
  teammateId: string;
  approvedAt: string;
  revisionHash: string;
}

export interface TeamPickRevision {
  id: string;
  pickId: string;
  revision: number;
  gameId: string;
  kickoffAt: string;
  market: MarketKey;
  selection: string;
  units: number;
  executionStatus: ExecutionStatus;
  book: BookKey;
  frozenPoint: number | null;
  frozenPrice: number;
  consensusSnapshotId: string;
  rationale: string;
  authorId: string;
  approvals: Approval[];
  modelHash: string;
  dataHash: string;
  uncertaintyInterval: [number, number];
  status: TeamPickStatus;
  createdAt: string;
  approvedAt: string | null;
  cashPlacementConfirmed: boolean;
}

export interface ModelMetrics {
  pooledLogLoss: number;
  calibrationIntercept: number;
  calibrationSlope: number;
  byMarket: Record<MarketKey, { logLoss: number; observations: number }>;
}

export interface ModelRun {
  id: string;
  championVersionHash: string;
  challengerVersionHash: string;
  status: ModelStatus;
  championMetrics: ModelMetrics;
  challengerMetrics: ModelMetrics;
  pairedLogLossImprovement: number;
  pairedLogLossImprovementInterval90: [number, number];
  pairedEvaluationBlocks: number;
  gateDecision: "promote" | "retain";
  dataSnapshotHash: string;
  configHash: string;
  featureSchemaHash: string;
  codeHash: string;
  startedAt: string;
  completedAt: string;
  promotedAt: string | null;
}

export interface SystemAlert {
  id: string;
  type:
    | "pipeline_failure"
    | "gate_rejection"
    | "credit_budget"
    | "calibration_drift"
    | "feature_shift"
    | "soft_book_anchor";
  severity: "info" | "warning" | "critical";
  message: string;
  idempotencyKey: string;
  createdAt: string;
  acknowledgedAt: string | null;
}

export interface PushDelivery {
  id: string;
  type: PushEventType;
  recipientId: string;
  idempotencyKey: string;
  state: "pending" | "sent" | "failed";
  createdAt: string;
  sentAt: string | null;
}

export interface TeamState {
  team: string;
  mean: number;
  variance: number;
  throughWeek: number;
}

export interface CompletedGame {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  actualHomeMargin: number;
  consensusHomeExpectedMargin: number;
  completedAt: string;
}

export interface RollingFeatures {
  team: string;
  season: number;
  throughWeek: number;
  epa: number;
  successRate: number;
  explosiveRate: number;
  regressedTurnovers: number;
  pace: number;
  proe: number;
}

export interface QuarterbackInput {
  starter: string;
  available: boolean;
  backupTier: string | null;
  learnedPointPrior: number | null;
  override: QuarterbackOverride | null;
}

export interface QuarterbackOverride {
  value: number;
  sourceUrl: string;
  rationale: string;
  authorId: string;
  createdAt: string;
}

export interface NormalizedInjury {
  player: string;
  team: string;
  gameId: string;
  practiceStatus: string | null;
  gameStatus: string | null;
  inactive: boolean | null;
  sourceUrl: string;
  sourceTimestamp: string;
  rawSnapshotHash: string;
}

export interface WeatherInput {
  gameId: string;
  stadium: string;
  roof: "outdoor" | "open" | "closed" | "fixed" | "unconfirmed";
  kickoffAt: string;
  forecastIssuedAt: string;
  validAt: string;
  windMph: number | null;
  temperatureF: number | null;
  precipitationProbability: number | null;
}

export interface SettledPick {
  pick: TeamPickRevision;
  result: "win" | "loss" | "push" | "void";
  profitUnits: number;
  entryPoint: number | null;
  closingPoint: number | null;
  entryPrice: number;
  syntheticClosingPrice: number | null;
  clvPoints: number | null;
  clvCents: number | null;
}

export interface RecordSummary {
  label: "Full record" | "Executed-only";
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  riskedUnits: number;
  profitUnits: number;
  profitDollars: number;
  roi: number;
  averageClvPoints: number | null;
  averageClvCents: number | null;
  percentBeatingClose: number | null;
  maximumDrawdownUnits: number;
  winRate: number | null;
}

export interface WeeklyDigest {
  id: string;
  season: number;
  week: number;
  brierScore: number | null;
  marketBrierScore: number | null;
  logLoss: number | null;
  marketLogLoss: number | null;
  realizedClvCents: number | null;
  displayedExpectedEdgeCents: number | null;
  calibrationSlope40: number | null;
  calibrationSmallSample: boolean;
  maxFeaturePsi: number | null;
  scoringEnvironment: number | null;
  trailingScoringMean: number | null;
  trailingScoringInterval: [number, number] | null;
  modelRun: ModelRun;
  dataFreshness: DataFreshness;
  failedJobs: string[];
  injurySourceStatus: DataFreshness;
  oddsCreditsUsed: number;
  alerts: SystemAlert[];
  generatedAt: string;
}

export interface JobState<T> {
  key: string;
  freshness: DataFreshness;
  lastGoodValue: T | null;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  alert: SystemAlert | null;
}
