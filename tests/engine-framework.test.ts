import { describe, expect, it } from "vitest";
import {
  engineFramework,
  nextEngineQuestion,
  validateEngineAnswer,
  validateEngineFramework
} from "@/domain/engine-framework";

describe("ten-part engine Q&A framework", () => {
  it("keeps exactly ten auditable workstreams with questions, evidence, and acceptance gates", () => {
    expect(validateEngineFramework()).toEqual([]);
    expect(engineFramework.workstreams).toHaveLength(10);
    expect(engineFramework.workstreams.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("asks one unanswered question at a time in a deterministic order", () => {
    expect(nextEngineQuestion([])?.question.id).toBe("Q01");
    expect(nextEngineQuestion([{ questionId: "Q01" }])?.question.id).toBe("Q02");
    const allQuestions = engineFramework.workstreams.flatMap((item) => item.questions);
    expect(nextEngineQuestion(allQuestions.map((question) => ({ questionId: question.id })))).toBeNull();
  });

  it("rejects an undocumented answer and accepts a complete decision record", () => {
    expect(validateEngineAnswer({
      questionId: "Q01", answer: "", rationale: "", evidence: [], author: "", answeredAt: "today"
    })).toHaveLength(5);
    expect(validateEngineAnswer({
      questionId: "Q01",
      answer: "Use a joint score distribution.",
      rationale: "Every derived market should reconcile to the same simulated game outcomes.",
      evidence: ["rolling-origin-baseline-v1"],
      author: "owner",
      answeredAt: "2026-08-24T19:00:00.000Z"
    })).toEqual([]);
  });
});
