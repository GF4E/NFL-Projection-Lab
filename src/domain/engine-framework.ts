import frameworkJson from "../../config/engine-framework.config.json";

export type EngineWorkstreamStatus =
  | "needs_answer"
  | "implemented_pending_production_verification"
  | "verified";

export interface EngineQuestion {
  id: string;
  prompt: string;
  recommendedDefault: string;
  evidenceRequired: string;
}

export interface EngineWorkstream {
  id: string;
  sequence: number;
  title: string;
  problem: string;
  deliverable: string;
  dependsOn: string[];
  status: EngineWorkstreamStatus;
  questions: EngineQuestion[];
  acceptanceGates: string[];
}

export interface EngineFramework {
  version: string;
  mode: "one_question_at_a_time";
  purpose: string;
  answerPolicy: {
    requiredFields: string[];
    structuralChanges: "offseason_only";
    inSeasonChanges: "state_and_gated_coefficients_only";
    pickOutcomesInTraining: false;
  };
  workstreams: EngineWorkstream[];
}

export interface EngineAnswer {
  questionId: string;
  answer: string;
  rationale: string;
  evidence: string[];
  author: string;
  answeredAt: string;
}

export const engineFramework = frameworkJson as unknown as EngineFramework;

export function validateEngineFramework(framework: EngineFramework = engineFramework): string[] {
  const errors: string[] = [];
  if (framework.workstreams.length !== 10) errors.push("The framework must contain exactly ten workstreams");
  const workstreamIds = new Set<string>();
  const questionIds = new Set<string>();
  for (const workstream of framework.workstreams) {
    if (workstreamIds.has(workstream.id)) errors.push(`Duplicate workstream id: ${workstream.id}`);
    workstreamIds.add(workstream.id);
    if (!workstream.questions.length) errors.push(`${workstream.id} has no decision questions`);
    if (!workstream.acceptanceGates.length) errors.push(`${workstream.id} has no acceptance gates`);
    if (!workstream.deliverable.trim()) errors.push(`${workstream.id} has no deliverable`);
    for (const question of workstream.questions) {
      if (questionIds.has(question.id)) errors.push(`Duplicate question id: ${question.id}`);
      questionIds.add(question.id);
      if (!question.recommendedDefault.trim()) errors.push(`${question.id} has no recommended default`);
      if (!question.evidenceRequired.trim()) errors.push(`${question.id} has no evidence requirement`);
    }
  }
  for (const workstream of framework.workstreams) {
    for (const dependency of workstream.dependsOn) {
      if (!workstreamIds.has(dependency)) errors.push(`${workstream.id} has unknown dependency: ${dependency}`);
    }
  }
  return errors;
}

export function nextEngineQuestion(
  answers: readonly Pick<EngineAnswer, "questionId">[],
  framework: EngineFramework = engineFramework
): { workstream: EngineWorkstream; question: EngineQuestion } | null {
  const answered = new Set(answers.map((answer) => answer.questionId));
  for (const workstream of [...framework.workstreams].sort((left, right) => left.sequence - right.sequence)) {
    const question = workstream.questions.find((candidate) => !answered.has(candidate.id));
    if (question) return { workstream, question };
  }
  return null;
}

export function validateEngineAnswer(answer: EngineAnswer, framework: EngineFramework = engineFramework): string[] {
  const question = framework.workstreams.flatMap((workstream) => workstream.questions)
    .find((candidate) => candidate.id === answer.questionId);
  const errors: string[] = [];
  if (!question) errors.push(`Unknown question: ${answer.questionId}`);
  if (!answer.answer.trim()) errors.push("An answer is required");
  if (!answer.rationale.trim()) errors.push("A rationale is required");
  if (!answer.evidence.length || answer.evidence.some((item) => !item.trim())) errors.push("At least one evidence reference is required");
  if (!answer.author.trim()) errors.push("An author is required");
  if (!Number.isFinite(Date.parse(answer.answeredAt))) errors.push("A valid answer timestamp is required");
  return errors;
}
