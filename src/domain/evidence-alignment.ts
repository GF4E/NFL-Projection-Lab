import type { MatchupSignal } from "./decision-board";
import type { LineMarketKey } from "./line-board";

export type EvidenceVerdict = "supports" | "mixed" | "contradicts" | "insufficient";

export interface EvidenceAlignment {
  relevant: MatchupSignal[];
  supporting: MatchupSignal[];
  opposing: MatchupSignal[];
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
  const verdict: EvidenceVerdict = relevant.length === 0
    ? "insufficient"
    : supporting.length > opposing.length
      ? "supports"
      : opposing.length > supporting.length
        ? "contradicts"
        : "mixed";
  return { relevant, supporting, opposing, verdict };
}

export function compactEvidenceLabel(alignment: EvidenceAlignment): string {
  if (alignment.verdict === "insufficient") return "CTX —";
  if (alignment.verdict === "mixed") return `CTX ${alignment.supporting.length}-${alignment.opposing.length} MIXED`;
  if (alignment.verdict === "supports") return `CTX ${alignment.supporting.length}-${alignment.opposing.length} FOR`;
  return `CTX ${alignment.supporting.length}-${alignment.opposing.length} AGAINST`;
}
