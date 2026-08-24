import pregameSourcesJson from "../../../config/pregame-sources.config.json";
import { stableHash } from "@/domain/hash";
import { NFL_TEAM_NAMES, normalizeScheduleTeam } from "@/domain/weekly-slate";
import type { WeatherInput } from "@/domain/types";

interface PregameSourceConfig {
  version: string;
  inactivesLanding: string;
  articleSitemapTemplate: string;
  gameCenterTemplate: string;
  operationsSource: string;
  teamSlugs: Record<string, string>;
}

export const pregameSourceConfig = pregameSourcesJson as PregameSourceConfig;

export interface ParsedInactivePlayer {
  id: string;
  gameId: string;
  team: string;
  player: string;
  position: string | null;
}

export interface ParsedGameInactives {
  gameId: string;
  teams: [string, string];
  players: ParsedInactivePlayer[];
  rawSnapshotHash: string;
}

const namedEntities: Record<string, string> = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"'
};

const positions = new Set([
  "QB", "RB", "FB", "WR", "TE", "T", "OT", "G", "OG", "C", "OL",
  "DE", "DT", "DL", "NT", "LB", "ILB", "OLB", "CB", "DB", "S", "K", "P", "LS"
]);

function decodeHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return namedEntities[entity.toLowerCase()] ?? match;
  });
}

function plainText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function teamFromHeading(value: string): string | null {
  const heading = plainText(value).replace(/[’']/g, "'").toLowerCase();
  for (const [rawTeam, fullName] of Object.entries(NFL_TEAM_NAMES)) {
    const team = normalizeScheduleTeam(rawTeam);
    const full = fullName.toLowerCase();
    const nickname = full.split(" ").at(-1)!;
    if (heading === team.toLowerCase() || heading === full || heading === nickname) return team;
  }
  return null;
}

function parsePlayer(value: string): { player: string; position: string | null } | null {
  const cleaned = plainText(value).replace(/^[-–—•]\s*/, "").trim();
  if (!cleaned || /^(none|no inactives?|no players?)/i.test(cleaned)) return null;
  const [first, ...rest] = cleaned.split(/\s+/);
  const position = positions.has(first.toUpperCase()) ? first.toUpperCase() : null;
  const player = (position ? rest.join(" ") : cleaned).replace(/\s*\([^)]*\)\s*$/, "").trim();
  return player ? { player, position } : null;
}

function teamLists(html: string): Map<string, Array<{ player: string; position: string | null }>> {
  const output = new Map<string, Array<{ player: string; position: string | null }>>();
  const pattern = /<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>\s*(?:<p\b[^>]*>\s*<br\s*\/?\s*>\s*<\/p>\s*)?<ul\b[^>]*>([\s\S]*?)<\/ul>/gi;
  for (const match of html.matchAll(pattern)) {
    const team = teamFromHeading(match[1]);
    if (!team) continue;
    const players = [...match[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .flatMap((item) => {
        const parsed = parsePlayer(item[1]);
        return parsed ? [parsed] : [];
      });
    if (players.length) output.set(team, players);
  }
  return output;
}

export function parseOfficialGameInactives(input: {
  html: string;
  gameId: string;
  awayTeam: string;
  homeTeam: string;
}): ParsedGameInactives | null {
  const awayTeam = normalizeScheduleTeam(input.awayTeam);
  const homeTeam = normalizeScheduleTeam(input.homeTeam);
  const lists = teamLists(input.html);
  const away = lists.get(awayTeam);
  const home = lists.get(homeTeam);
  if (!away?.length || !home?.length) return null;
  const players = ([
    ...away.map((player) => ({ team: awayTeam, ...player })),
    ...home.map((player) => ({ team: homeTeam, ...player }))
  ]).map((player) => ({
    id: stableHash({ gameId: input.gameId, team: player.team, player: player.player }),
    gameId: input.gameId,
    ...player
  }));
  return {
    gameId: input.gameId,
    teams: [awayTeam, homeTeam],
    players,
    rawSnapshotHash: stableHash(input.html)
  };
}

export function discoverOfficialInactiveArticles(input: {
  html: string;
  season: number;
  week: number;
}): string[] {
  const links = [...input.html.matchAll(/href=["']([^"']*\/news\/[^"']*inactiv[^"']*)["']/gi)]
    .map((match) => decodeHtml(match[1]))
    .map((href) => new URL(href, "https://www.nfl.com").toString());
  const unique = [...new Set(links)];
  const weekPattern = new RegExp(`(?:week-${input.week}(?:-|$)|(?:^|-)wk-${input.week}(?:-|$))`, "i");
  const matchingWeek = unique.filter((url) => weekPattern.test(url)).reverse();
  const recentFallbacks = unique.filter((url) => !weekPattern.test(url)).slice(-12).reverse();
  return [...matchingWeek, ...recentFallbacks].slice(0, 12);
}

export function parseOfficialRoofDesignation(html: string): WeatherInput["roof"] | null {
  const field = html.match(/<dt\b[^>]*>[\s\S]*?\bROOF\b[\s\S]*?<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/i);
  const json = html.match(/(?:roofStatus|roofDesignation)\\?["']\s*:\s*\\?["'](open|closed|fixed|dome|outdoors?|outdoor)/i);
  const raw = plainText(field?.[1] ?? json?.[1] ?? "").toLowerCase();
  if (raw === "open") return "open";
  if (raw === "closed") return "closed";
  if (raw === "fixed" || raw === "dome") return "fixed";
  if (raw === "outdoors" || raw === "outdoor") return "outdoor";
  return null;
}

export function officialGameCenterUrl(input: {
  awayTeam: string;
  homeTeam: string;
  season: number;
  week: number;
}): string {
  const away = pregameSourceConfig.teamSlugs[normalizeScheduleTeam(input.awayTeam)];
  const home = pregameSourceConfig.teamSlugs[normalizeScheduleTeam(input.homeTeam)];
  if (!away || !home) throw new Error("Official NFL game-center URL cannot be formed for an unknown team");
  return pregameSourceConfig.gameCenterTemplate
    .replace("{away}", away)
    .replace("{home}", home)
    .replace("{season}", String(input.season))
    .replace("{week}", String(input.week));
}

export function officialArticleSitemapUrl(date: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "numeric"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return pregameSourceConfig.articleSitemapTemplate
    .replace("{year}", parts.year)
    .replace("{month}", parts.month);
}
