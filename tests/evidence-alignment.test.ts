import { describe, expect, it } from "vitest";
import { alignMatchupEvidence, compactEvidenceLabel, evidenceDetail, materialEvidenceSignals } from "@/domain/evidence-alignment";
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
    expect(alignment.verdict).toBe("supports");
    expect(alignment.supportingStrength).toBe(20);
    expect(alignment.opposingStrength).toBe(12);
    expect(compactEvidenceLabel(alignment)).toBe("FOR · ADJ EPA");
    expect(evidenceDetail(alignment)).toContain("For: ADJ EPA — SEA O #4 vs LAR D #22");
    expect(evidenceDetail(alignment)).toContain("Watch: MARKET-ADJUSTED FORM — state #8 vs SEA #13");
  });

  it("uses only total-direction signals for totals", () => {
    const alignment = alignMatchupEvidence(signals, "total", "Over");
    expect(alignment.relevant.map((signal) => signal.id)).toEqual(["pace"]);
    expect(alignment.supporting).toHaveLength(1);
    expect(alignment.opposing).toHaveLength(0);
    expect(alignment.verdict).toBe("supports");
    expect(compactEvidenceLabel(alignment)).toBe("FOR · PACE");
  });

  it("marks a teaser leg as contradicted when team context points to its opponent", () => {
    const alignment = alignMatchupEvidence([
      { id: "efficiency", label: "ADJ EPA", lean: "LAR", detail: "LAR O #4 vs SEA D #22", strength: 20 },
      { id: "strength", label: "MARKET-ADJUSTED FORM", lean: "LAR", detail: "state #4 vs SEA #22", strength: 18 }
    ], "teaser", "SEA");
    expect(alignment.verdict).toBe("contradicts");
    expect(compactEvidenceLabel(alignment)).toBe("AGAINST · ADJ EPA");
  });

  it("does not invent a contextual verdict when no relevant signal exists", () => {
    const alignment = alignMatchupEvidence([signals[2]], "moneyline", "SEA");
    expect(alignment.verdict).toBe("insufficient");
    expect(compactEvidenceLabel(alignment)).toBe("NO MATCHUP READ");
  });

  it("calls similarly weighted evidence mixed even when the signal counts differ", () => {
    const alignment = alignMatchupEvidence([
      { id: "efficiency", label: "ADJ EPA", lean: "SEA", detail: "one strong signal", strength: 20 },
      { id: "rest", label: "REST", lean: "LAR", detail: "first caution", strength: 11 },
      { id: "strength", label: "MARKET-ADJUSTED FORM", lean: "LAR", detail: "second caution", strength: 8 }
    ], "spread", "SEA");
    expect(alignment.verdict).toBe("mixed");
    expect(compactEvidenceLabel(alignment)).toBe("MIXED · ADJ EPA / REST");
  });

  it("publishes only material statistics relevant to the exact contract", () => {
    const material = materialEvidenceSignals([
      ...signals,
      { id: "success", label: "SUCCESS", lean: "SEA", detail: "small difference", strength: 7 },
      { id: "pass_rate", label: "PROE", lean: "UNDER", detail: "pass tendency", strength: 8 }
    ], "spread", "SEA");

    expect(material.map((signal) => signal.id)).toEqual(["efficiency", "strength"]);
  });

  it("orders material evidence by strength and caps the expanded read", () => {
    const material = materialEvidenceSignals([
      { id: "pace", label: "PACE", lean: "OVER", detail: "tempo", strength: 9 },
      { id: "pass_rate", label: "PROE", lean: "UNDER", detail: "pass rate", strength: 12 },
      { id: "turnovers", label: "TURNOVERS", lean: "OVER", detail: "short fields", strength: 15 },
      { id: "explosive", label: "EXPLOSIVE", lean: "UNDER", detail: "limited explosives", strength: 10 }
    ], "total", "Over");

    expect(material.map((signal) => signal.strength)).toEqual([15, 12, 10]);
  });
});
