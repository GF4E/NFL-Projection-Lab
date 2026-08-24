import teamConfig from "../../config/team.config.example.json";

export const PREFERRED_TEAM_CODES = teamConfig.preferredTeams;

const preferredTeams = new Set<string>(PREFERRED_TEAM_CODES);

export function isBetAgainstPreferredTeam(input: {
  awayTeam: string | null | undefined;
  homeTeam: string | null | undefined;
  selectionTeam: string;
}): boolean {
  const matchup = [input.awayTeam, input.homeTeam].filter((team): team is string => Boolean(team));
  return matchup.some((team) => preferredTeams.has(team) && team !== input.selectionTeam);
}
