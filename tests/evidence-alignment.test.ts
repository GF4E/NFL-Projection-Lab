import { describe, expect, it } from "vitest";
import { alignMatchupEvidence, compactEvidenceLabel } from "@/domain/evidence-alignment";
import type { MatchupSignal } from "@/domain/decision-board";

const signals: MatchupSignal[] = [
  { id: "efficiency", label: "ADJ EPA", lean: "SEA", detail: "SEA O #4 vs LAR D #22", strength: 20 },
  { id: "strength", label: "MARKET-ADJUSTED FORM", lean: "LAR", detail: "state #8 vs SEA #13", strength: 12 },
  { id: "pace", label: "PACE", lean: "OVER", detail: "tempo #6 / #9", strength: 9 }
];

describe("contract-specific evidence alignment", () => {
  it("uses only team-direction signals for sides and moneylines", () => {
    const alignment = alignMatchupEvidence(signals, "spread", "SEA");
    expect(alignment.relevant.map((signal) => signal.id)).toEqual(["efficiency", "strength"]);
    expect(alignment.supporting.map((signal) => signal.id)).toEqual(["efficiency"]);
    expect(alignment.opposing.map((signal) => signal.id)).toEqual(["strength"]);
    expect(alignment.verdict).toBe("mixed");
    expect(compactEvidenceLabel(alignment)).toBe("CTX 1-1 MIXED");
  });

  it("uses only total-direction signals for totals", () => {
    const alignment = alignMatchupEvidence(signals, "total", "Over");
    expect(alignment.relevant.map((signal) => signal.id)).toEqual(["pace"]);
    expect(alignment.supporting).toHaveLength(1);
    expect(alignment.opposing).toHaveLength(0);
    expect(alignment.verdict).toBe("supports");
    expect(compactEvidenceLabel(alignment)).toBe("CTX 1-0 FOR");
  });

  it("marks a teaser leg as contradicted when team context points to its opponent", () => {
    const alignment = alignMatchupEvidence([
      { id: "efficiency", label: "ADJ EPA", lean: "LAR", detail: "LAR O #4 vs SEA D #22", strength: 20 },
      { id: "strength", label: "MARKET-ADJUSTED FORM", lean: "LAR", detail: "state #4 vs SEA #22", strength: 18 }
    ], "teaser", "SEA");
    expect(alignment.verdict).toBe("contradicts");
    expect(compactEvidenceLabel(alignment)).toBe("CTX 0-2 AGAINST");
  });

  it("does not invent a contextual verdict when no relevant signal exists", () => {
    const alignment = alignMatchupEvidence([signals[2]], "moneyline", "SEA");
    expect(alignment.verdict).toBe("insufficient");
    expect(compactEvidenceLabel(alignment)).toBe("CTX —");
  });
});
