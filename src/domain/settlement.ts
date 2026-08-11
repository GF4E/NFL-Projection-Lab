import type { SettledPick, TeamPickRevision } from "./types";
import { americanToDecimal } from "./odds";

export function gradePick(
  pick: TeamPickRevision,
  outcome: {
    actualSelectionMargin: number;
    totalPoints: number;
    gameCompleted: boolean;
    voided?: boolean;
  }
): SettledPick["result"] {
  if (outcome.voided || !outcome.gameCompleted) return "void";
  if (pick.market === "moneyline") {
    return outcome.actualSelectionMargin > 0
      ? "win"
      : outcome.actualSelectionMargin < 0
        ? "loss"
        : "push";
  }
  const graded = pick.market === "spread"
    ? outcome.actualSelectionMargin + (pick.frozenPoint ?? 0)
    : pick.selection.toLowerCase().startsWith("over")
      ? outcome.totalPoints - (pick.frozenPoint ?? 0)
      : (pick.frozenPoint ?? 0) - outcome.totalPoints;
  return graded > 0 ? "win" : graded < 0 ? "loss" : "push";
}

export function profitForResult(
  result: SettledPick["result"],
  units: number,
  americanPrice: number
): number {
  if (result === "win") return units * (americanToDecimal(americanPrice) - 1);
  if (result === "loss") return -units;
  return 0;
}

export function correctSettlement(
  current: SettledPick,
  correction: Pick<SettledPick, "result" | "profitUnits"> & { reason: string; actorId: string; correctedAt: string },
  role: "owner" | "teammate"
): { corrected: SettledPick; audit: Record<string, unknown> } {
  if (role !== "owner") throw new Error("Only the owner may correct a graded pick");
  if (!correction.reason.trim()) throw new Error("Settlement correction requires a reason");
  const corrected = { ...current, result: correction.result, profitUnits: correction.profitUnits };
  return {
    corrected,
    audit: {
      action: "settlement_corrected",
      actorId: correction.actorId,
      correctedAt: correction.correctedAt,
      reason: correction.reason,
      before: { result: current.result, profitUnits: current.profitUnits },
      after: { result: corrected.result, profitUnits: corrected.profitUnits }
    }
  };
}
