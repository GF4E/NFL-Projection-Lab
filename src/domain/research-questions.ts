import questionConfigJson from "../../config/research-questions.config.json";
import { stableHash } from "./hash";

export type ResearchDecision = "promote" | "reject" | "defer" | "continue_shadow";
export type DecisionImpact = "human_contract" | "data_cost" | "structure" | "coefficient" | "diagnostic";

export interface ResearchQuestion {
  id: string;
  category: string;
  prompt: string;
  gate: string;
}

export interface ResearchQuestionAnswer {
  questionId: string;
  hypothesis: string;
  decisionImpact: DecisionImpact;
  asOfContract: string;
  baseline: string;
  evaluationRowsHash: string;
  primaryMetric: string;
  calibrationAndCoverageGates: string[];
  falsifier: string;
  evidence: string[];
  decision: ResearchDecision;
  author: string;
  recordedAt: string;
  offseasonReview: boolean;
  answerHash: string;
}

const config = questionConfigJson as {
  version: string;
  questions: ResearchQuestion[];
  nonWaivable: string[];
};

export const researchQuestions = config.questions as readonly ResearchQuestion[];

export function createResearchQuestionAnswer(
  input: Omit<ResearchQuestionAnswer, "answerHash">
): ResearchQuestionAnswer {
  const question = researchQuestions.find((candidate) => candidate.id === input.questionId);
  if (!question) throw new Error(`Unknown research question ${input.questionId}`);
  if (!Number.isFinite(Date.parse(input.recordedAt))) throw new Error("Research answer timestamp is invalid");
  if (!input.hypothesis || !input.asOfContract || !input.baseline || !input.evaluationRowsHash ||
    !input.primaryMetric || !input.falsifier || !input.author || !input.evidence.length) {
    throw new Error("Research answer is incomplete");
  }
  if (!input.calibrationAndCoverageGates.length) {
    throw new Error("Research answer must preserve calibration and coverage gates");
  }
  const normalizedText = JSON.stringify(input).toLowerCase();
  if (config.nonWaivable.some((gate) => normalizedText.includes(`waive:${gate}`))) {
    throw new Error("Research answers cannot waive foundational validity gates");
  }
  if (input.decision === "promote" && input.decisionImpact === "structure" && !input.offseasonReview) {
    throw new Error("Structural answers can promote only during offseason review");
  }
  return { ...input, answerHash: stableHash({ catalogVersion: config.version, question, answer: input }) };
}

export function unansweredResearchQuestions(
  answers: readonly Pick<ResearchQuestionAnswer, "questionId">[]
): ResearchQuestion[] {
  const answered = new Set(answers.map((answer) => answer.questionId));
  return researchQuestions.filter((question) => !answered.has(question.id));
}

