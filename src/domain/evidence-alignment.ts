import type { MatchupSignal } from "./decision-board";
import type { LineMarketKey } from "./line-board";

export type EvidenceVerdict = "supports" | "mixed" | "contradicts" | "insufficient";

export interface EvidenceAlignment {
  relevant: MatchupSignal[];
  supporting: MatchupSignal[];
  opposing: MatchupSignal[];
  supportingStrength: number;
  opposingStrength: number;
  verdict: EvidenceVerdict;
}

function isTotalLean(value: string): boolean {
  return value.toUpperCase() === "OVER" || value.toUpperCase() === "UNDER";
}

/**
 * Relates the compact matchup read to one exact contract. This is an
 * explanation layer only: these signals may overlap model inputs and are never
 * added to probability, EV, or sizing a second time.
 */
export function alignMatchupEvidence(
  signals: readonly MatchupSignal[],
  market: LineMarketKey | "teaser",
  selection: string
): EvidenceAlignment {
  const total = market === "total";
  const relevant = signals.filter((signal) => total ? isTotalLean(signal.lean) : !isTotalLean(signal.lean));
  const normalizedSelection = selection.toUpperCase();
  const supporting = relevant.filter((signal) => signal.lean.toUpperCase() === normalizedSelection);
  const opposing = relevant.filter((signal) => signal.lean.toUpperCase() !== normalizedSelection);
  const supportingStrength = supporting.reduce((total, signal) => total + signal.strength, 0);
  const opposingStrength = opposing.reduce((total, signal) => total + signal.strength, 0);
  const combinedStrength = supportingStrength + opposingStrength;
  const isBalanced = combinedStrength > 0
    && Math.abs(supportingStrength - opposingStrength) / combinedStrength < 0.2;
  const verdict: EvidenceVerdict = relevant.length === 0
    ? "insufficient"
    : isBalanced
      ? "mixed"
      : supportingStrength > opposingStrength
      ? "supports"
      : opposingStrength > supportingStrength
        ? "contradicts"
        : "mixed";
  return { relevant, supporting, opposing, supportingStrength, opposingStrength, verdict };
}

const shortSignalLabels: Record<MatchupSignal["id"], string> = {
  efficiency: "ADJ EPA",
  success: "SUCCESS",
  explosive: "EXPLOSIVE",
  turnovers: "TURNOVERS",
  pace: "PACE",
  pass_rate: "PROE",
  rest: "REST",
  strength: "FORM"
};

function strongest(signals: readonly MatchupSignal[]): MatchupSignal | null {
  return signals.reduce<MatchupSignal | null>(
    (best, signal) => !best || signal.strength > best.strength ? signal : best,
    null
  );
}

export function compactEvidenceLabel(alignment: EvidenceAlignment): string {
  if (alignment.verdict === "insufficient") return "NO MATCHUP READ";
  const support = strongest(alignment.supporting);
  const opposition = strongest(alignment.opposing);
  if (alignment.verdict === "mixed") {
    const names = [support, opposition].filter((signal): signal is MatchupSignal => signal !== null)
      .map((signal) => shortSignalLabels[signal.id]);
    return `MIXED · ${names.join(" / ")}`;
  }
  if (alignment.verdict === "supports") return `FOR · ${support ? shortSignalLabels[support.id] : "MATCHUP"}`;
  return `AGAINST · ${opposition ? shortSignalLabels[opposition.id] : "MATCHUP"}`;
}

export function evidenceDetail(alignment: EvidenceAlignment): string {
  const explain = (heading: string, signals: readonly MatchupSignal[]) => signals.length
    ? `${heading}: ${[...signals].sort((left, right) => right.strength - left.strength)
      .map((signal) => `${signal.label} — ${signal.detail}`).join("; ")}`
    : null;
  return [
    explain("For", alignment.supporting),
    explain("Watch", alignment.opposing),
    "Context explains the contract and is not added to EV or sizing twice."
  ].filter((value): value is string => Boolean(value)).join(" | ");
}
