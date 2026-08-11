import type { OddsSnapshot, TeamPickRevision } from "./types";
import { edgeGone, expireStaleDraft } from "./approval";

export interface SundayGame<T = unknown> {
  kickoffAt: string;
  payload: T;
}

function dateInPacific(instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(instant));
}

export function todayOnly<T>(games: SundayGame<T>[], now: string): SundayGame<T>[] {
  const today = dateInPacific(now);
  return games.filter((game) => dateInPacific(game.kickoffAt) === today);
}

export function kickoffCountdown(kickoffAt: string, now: string): number {
  return Math.max(0, new Date(kickoffAt).getTime() - new Date(now).getTime());
}

export function snapshotAgeMs(capturedAt: string, now: string): number {
  return Math.max(0, new Date(now).getTime() - new Date(capturedAt).getTime());
}

export function refreshSundayDraft(input: {
  revision: TeamPickRevision;
  latestQuote: OddsSnapshot;
  latestEdge: number;
  now: string;
}): { revision: TeamPickRevision; edgeGone: boolean } {
  const revision = expireStaleDraft(input.revision, input.now, input.latestQuote);
  return { revision, edgeGone: edgeGone(revision, input.latestEdge) };
}
