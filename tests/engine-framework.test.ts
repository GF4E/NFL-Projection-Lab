import { describe, expect, it } from "vitest";
import {
  engineDecisions,
  engineFramework,
  nextEngineQuestion,
  validateEngineAnswer,
  validateEngineDecisionLedger,
  validateEngineFramework
} from "@/domain/engine-framework";

describe("ten-part engine Q&A framework", () => {
  it("keeps exactly ten auditable workstreams with questions, evidence, and acceptance gates", () => {
    expect(validateEngineFramework()).toEqual([]);
    expect(engineFramework.workstreams).toHaveLength(10);
    expect(engineFramework.mode).toBe("high_leverage_questions_only");
    expect(engineFramework.noveltyStandard.distinctiveOutcome).toContain("decision dossier");
    expect(engineFramework.noveltyStandard.foundationNotDifferentiation).toContain("count models and game simulation");
    expect(engineFramework.workstreams.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("asks one unanswered question at a time in a deterministic order", () => {
    expect(nextEngineQuestion([])?.question.id).toBe("Q01");
    expect(nextEngineQuestion([{ questionId: "Q01" }])?.question.id).toBe("Q02");
    expect(validateEngineDecisionLedger()).toEqual([]);
    expect(nextEngineQuestion(engineDecisions.answers)?.question.id).toBe("Q04");
    const allQuestions = engineFramework.workstreams.flatMap((item) => item.questions);
    expect(nextEngineQuestion(allQuestions.map((question) => ({ questionId: question.id })))).toBeNull();
  });

  it("keeps product choices distinct from empirically validated model decisions", () => {
    expect(engineDecisions.answers).toHaveLength(3);
    expect(engineDecisions.answers[0]).toMatchObject({
      questionId: "Q01",
      status: "accepted_design_hypothesis",
      author: "owner"
    });
    expect(engineDecisions.answers[0].implementationEffects.join(" ")).toContain("advisory");
    expect(engineDecisions.answers[0].validationRequired.length).toBeGreaterThanOrEqual(3);
    expect(engineDecisions.answers[1]).toMatchObject({
      questionId: "Q02",
      status: "accepted_design_hypothesis",
      author: "owner"
    });
    expect(engineDecisions.answers[1].answer).toContain("log loss");
    expect(engineDecisions.answers[1].implementationEffects.join(" ")).toContain("calibration slope");
    expect(engineDecisions.answers[2]).toMatchObject({
      questionId: "Q03",
      status: "accepted_design_hypothesis",
      author: "owner"
    });
    expect(engineDecisions.answers[2].rationale).toContain("established foundations");
    expect(engineFramework.workstreams[0].status).toBe("decisions_complete_implementation_pending");
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
