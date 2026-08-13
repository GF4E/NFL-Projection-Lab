import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { buildDiscreteMarginArtifact } from "../src/domain/margin";
import structural from "../config/structural.config.json" with { type: "json" };

const input = process.argv[2];
const output = process.argv[3] ?? "config/discrete-margin-2026.json";
if (!input) throw new Error("Usage: tsx scripts/generate_margin_artifact.ts <games.csv> [output.json]");

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(value);
      value = "";
    } else value += character;
  }
  fields.push(value);
  return fields;
}

const sourceText = readFileSync(input, "utf8");
const lines = sourceText.trim().split(/\r?\n/);
const columns = parseCsvLine(lines[0]);
const position = (name: string) => {
  const index = columns.indexOf(name);
  if (index < 0) throw new Error(`Missing games.csv column ${name}`);
  return index;
};
const indexes = {
  gameId: position("game_id"), season: position("season"), gameType: position("game_type"),
  result: position("result"), spreadLine: position("spread_line")
};
const history = lines.slice(1).flatMap((line) => {
  const row = parseCsvLine(line);
  const season = Number(row[indexes.season]);
  const result = Number(row[indexes.result]);
  const spreadLine = Number(row[indexes.spreadLine]);
  if (season < 2010 || season > 2025 || row[indexes.gameType] !== "REG" ||
      row[indexes.result] === "" || row[indexes.spreadLine] === "" ||
      !Number.isFinite(result) || !Number.isFinite(spreadLine)) return [];
  const gameId = row[indexes.gameId];
  return [
    { gameId: `${gameId}:home`, season, consensusSpread: -spreadLine, actualMargin: result },
    { gameId: `${gameId}:away`, season, consensusSpread: spreadLine, actualMargin: -result }
  ];
});
if (history.length !== 8_350) throw new Error(`Expected 8,350 team-side rows, received ${history.length}`);

const artifact = buildDiscreteMarginArtifact(history, {
  latestCompletedSeason: 2025,
  halfLifeSeasons: structural.model.decayHalfLifeSeasons,
  boundarySeason: structural.model.keyMarginBoundarySeason,
  keyMargins: structural.model.keyMargins,
  generatedAt: "2026-02-01T00:00:00.000Z"
});
writeFileSync(output, `${JSON.stringify({
  ...artifact,
  source: {
    provider: "nflverse/nfldata",
    url: "https://github.com/nflverse/nfldata/raw/master/data/games.csv",
    sha256: createHash("sha256").update(sourceText).digest("hex"),
    gameRows: history.length / 2,
    teamSideRows: history.length
  },
  frozenForSeason: 2026
}, null, 2)}\n`);
console.log(`${output} · ${artifact.artifactHash} · ${history.length / 2} games`);
