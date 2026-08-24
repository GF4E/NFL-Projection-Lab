import type { RecordSummary, SettledPick } from "./types";

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarize(label: RecordSummary["label"], picks: SettledPick[]): RecordSummary {
  const riskedUnits = picks
    .filter((pick) => pick.result !== "void")
    .reduce((sum, pick) => sum + pick.pick.units, 0);
  const profitUnits = picks.reduce((sum, pick) => sum + pick.profitUnits, 0);
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const pick of picks) {
    running += pick.profitUnits;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }
  const decisions = picks.filter((pick) => pick.result === "win" || pick.result === "loss");
  const clvCents = picks.flatMap((pick) => (pick.clvCents === null ? [] : [pick.clvCents]));
  const clvPoints = picks.flatMap((pick) => (pick.clvPoints === null ? [] : [pick.clvPoints]));
  return {
    label,
    picks: picks.length,
    wins: picks.filter((pick) => pick.result === "win").length,
    losses: picks.filter((pick) => pick.result === "loss").length,
    pushes: picks.filter((pick) => pick.result === "push").length,
    voids: picks.filter((pick) => pick.result === "void").length,
    riskedUnits,
    profitUnits,
    profitDollars: profitUnits * 25,
    roi: riskedUnits ? profitUnits / riskedUnits : 0,
    averageClvPoints: mean(clvPoints),
    averageClvCents: mean(clvCents),
    percentBeatingClose: clvCents.length
      ? clvCents.filter((value) => value > 0).length / clvCents.length
      : null,
    maximumDrawdownUnits: maxDrawdown,
    winRate: decisions.length
      ? decisions.filter((pick) => pick.result === "win").length / decisions.length
      : null
  };
}

export function dualRecordSummaries(picks: SettledPick[]): {
  full: RecordSummary;
  executedOnly: RecordSummary;
} {
  return {
    full: summarize("Full record", picks),
    executedOnly: summarize(
      "Executed-only",
      picks.filter((pick) => pick.pick.executionStatus === "executed")
    )
  };
}
