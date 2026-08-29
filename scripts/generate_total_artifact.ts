import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import structural from "../config/structural.config.json" with { type: "json" };
import { buildDiscreteTotalArtifact } from "../src/domain/total";
import type { HistoricalTotalRow } from "../src/domain/types";

const input = process.argv[2];
const artifactOutput = process.argv[3] ?? "config/discrete-total-2026.json";
const validationOutput = process.argv[4] ?? "config/total-translation-validation.json";
if (!input) {
  throw new Error("Usage: tsx scripts/generate_total_artifact.ts <games.csv> [artifact.json] [validation.json]");
}

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
  gameId: position("game_id"),
  season: position("season"),
  gameType: position("game_type"),
  total: position("total"),
  totalLine: position("total_line")
};
const history: HistoricalTotalRow[] = lines.slice(1).flatMap((line) => {
  const row = parseCsvLine(line);
  const season = Number(row[indexes.season]);
  const actualTotal = Number(row[indexes.total]);
  const consensusTotal = Number(row[indexes.totalLine]);
  if (season < 2010 || season > 2025 || row[indexes.gameType] !== "REG" ||
      row[indexes.total] === "" || row[indexes.totalLine] === "" ||
      !Number.isFinite(actualTotal) || !Number.isFinite(consensusTotal)) return [];
  return [{ gameId: row[indexes.gameId], season, consensusTotal, actualTotal }];
});
if (history.length !== 4_175) throw new Error(`Expected 4,175 complete regular-season games, received ${history.length}`);

const clamp = (value: number) => Math.max(1e-5, Math.min(1 - 1e-5, value));
const logit = (value: number) => Math.log(clamp(value) / (1 - clamp(value)));
const logistic = (value: number) => 1 / (1 + Math.exp(-value));

function weightedOutcome(
  training: readonly HistoricalTotalRow[],
  consensusTotal: number,
  postedPoint: number,
  referenceSeason: number,
  bandwidth: number
): { decisiveOver: number; push: number; effectiveWeight: number } {
  let over = 0;
  let under = 0;
  let push = 0;
  for (const row of training) {
    const recency = 0.5 ** ((referenceSeason - row.season) / structural.model.decayHalfLifeSeasons) *
      (row.season === 2020 ? 0.5 : 1);
    const distance = (row.consensusTotal - consensusTotal) / bandwidth;
    const weight = recency * Math.exp(-0.5 * distance * distance);
    if (row.actualTotal > postedPoint) over += weight;
    else if (row.actualTotal < postedPoint) under += weight;
    else push += weight;
  }
  return {
    decisiveOver: over + under ? over / (over + under) : 0.5,
    push: over + under + push ? push / (over + under + push) : 0,
    effectiveWeight: over + under + push
  };
}

function calibrationSlope(rows: readonly { probability: number; outcome: number }[]): {
  intercept: number;
  slope: number;
} {
  let intercept = 0;
  let slope = 1;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    let gradientIntercept = 0;
    let gradientSlope = 0;
    let hessianIntercept = 0;
    let hessianCross = 0;
    let hessianSlope = 0;
    for (const row of rows) {
      const feature = logit(row.probability);
      const probability = logistic(intercept + slope * feature);
      const variance = probability * (1 - probability);
      gradientIntercept += row.outcome - probability;
      gradientSlope += (row.outcome - probability) * feature;
      hessianIntercept -= variance;
      hessianCross -= variance * feature;
      hessianSlope -= variance * feature * feature;
    }
    const determinant = hessianIntercept * hessianSlope - hessianCross * hessianCross;
    if (Math.abs(determinant) < 1e-9) break;
    const interceptStep = (gradientIntercept * hessianSlope - gradientSlope * hessianCross) / determinant;
    const slopeStep = (hessianIntercept * gradientSlope - hessianCross * gradientIntercept) / determinant;
    intercept -= interceptStep;
    slope -= slopeStep;
    if (Math.max(Math.abs(interceptStep), Math.abs(slopeStep)) < 1e-7) break;
  }
  return { intercept, slope };
}

function validateBandwidth(bandwidth: number) {
  const decisive: Array<{ probability: number; outcome: number }> = [];
  const pushes: Array<{ probability: number; outcome: number }> = [];
  const effectiveWeights: number[] = [];
  for (const season of [2023, 2024, 2025]) {
    const training = history.filter((row) => row.season < season);
    for (const row of history.filter((candidate) => candidate.season === season)) {
      const from = weightedOutcome(training, row.consensusTotal, row.consensusTotal, season - 1, bandwidth);
      effectiveWeights.push(from.effectiveWeight);
      for (const offset of [-3, -2, -1, 0, 1, 2, 3]) {
        const postedPoint = row.consensusTotal + offset;
        const to = weightedOutcome(training, row.consensusTotal, postedPoint, season - 1, bandwidth);
        if (row.actualTotal !== postedPoint) {
          decisive.push({
            probability: logistic(logit(0.5) + logit(to.decisiveOver) - logit(from.decisiveOver)),
            outcome: Number(row.actualTotal > postedPoint)
          });
        }
        pushes.push({ probability: to.push, outcome: Number(row.actualTotal === postedPoint) });
      }
    }
  }
  effectiveWeights.sort((left, right) => left - right);
  const logLoss = decisive.reduce((sum, row) => sum -
    row.outcome * Math.log(clamp(row.probability)) -
    (1 - row.outcome) * Math.log(clamp(1 - row.probability)), 0) / decisive.length;
  const brier = decisive.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / decisive.length;
  const pushBrier = pushes.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / pushes.length;
  const calibration = calibrationSlope(decisive);
  return {
    bandwidth,
    logLoss,
    brier,
    pushBrier,
    calibrationIntercept: calibration.intercept,
    calibrationSlope: calibration.slope,
    decisiveObservations: decisive.length,
    pushObservations: pushes.length,
    minimumEffectiveWeight: effectiveWeights[0],
    p10EffectiveWeight: effectiveWeights[Math.floor(effectiveWeights.length * 0.1)],
    medianEffectiveWeight: effectiveWeights[Math.floor(effectiveWeights.length * 0.5)]
  };
}

function validateLinearBaseline() {
  const rows: Array<{ probability: number; outcome: number }> = [];
  for (const season of [2023, 2024, 2025]) {
    for (const row of history.filter((candidate) => candidate.season === season)) {
      for (const offset of [-3, -2, -1, 0, 1, 2, 3]) {
        const postedPoint = row.consensusTotal + offset;
        if (row.actualTotal === postedPoint) continue;
        rows.push({ probability: clamp(0.5 - offset * 0.025), outcome: Number(row.actualTotal > postedPoint) });
      }
    }
  }
  return {
    method: "0.5 minus 0.025 per point",
    logLoss: rows.reduce((sum, row) => sum - row.outcome * Math.log(row.probability) -
      (1 - row.outcome) * Math.log(1 - row.probability), 0) / rows.length,
    brier: rows.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / rows.length,
    decisiveObservations: rows.length
  };
}

const bandwidthResults = [1, 1.5, 2, 2.5, 3, 4, 6, 1_000].map(validateBandwidth);
const eligible = bandwidthResults.filter((result) => result.calibrationSlope >= 0.8 && result.calibrationSlope <= 1.2);
eligible.sort((left, right) => left.logLoss - right.logLoss);
const selected = eligible[0];
if (!selected || selected.bandwidth !== structural.model.totalTranslationKernelBandwidth) {
  throw new Error(`Configured total bandwidth ${structural.model.totalTranslationKernelBandwidth} did not win validation`);
}
const baseline = validateLinearBaseline();
if (!(selected.logLoss < baseline.logLoss)) throw new Error("Discrete total translator did not improve rolling-origin log loss");

const generatedAt = "2026-08-13T10:15:00-07:00";
const sourceHash = createHash("sha256").update(sourceText).digest("hex");
const artifact = buildDiscreteTotalArtifact(history, {
  latestCompletedSeason: 2025,
  halfLifeSeasons: structural.model.decayHalfLifeSeasons,
  kernelBandwidth: selected.bandwidth,
  generatedAt
});
writeFileSync(artifactOutput, `${JSON.stringify({
  ...artifact,
  source: {
    provider: "nflverse/nfldata",
    url: "https://github.com/nflverse/nfldata/raw/master/data/games.csv",
    sha256: sourceHash,
    gameRows: history.length
  },
  frozenForSeason: 2026
}, null, 2)}\n`);
writeFileSync(validationOutput, `${JSON.stringify({
  generatedAt,
  trainingSource: "nflverse schedules, closing totals, and final scores",
  sourceUrl: "https://github.com/nflverse/nfldata/raw/master/data/games.csv",
  dataSnapshotHash: sourceHash,
  trainingSeasons: [2010, 2025],
  validationSeasons: [2023, 2024, 2025],
  trainingGames: history.length,
  translatedOffsets: [-3, -2, -1, 0, 1, 2, 3],
  timeDecayHalfLifeSeasons: structural.model.decayHalfLifeSeasons,
  season2020Multiplier: 0.5,
  candidateKernelBandwidths: bandwidthResults.map((result) => result.bandwidth),
  selectionMetric: "minimum rolling-origin decisive-outcome log loss subject to calibration slope in [0.8, 1.2]",
  selectedKernelBandwidth: selected.bandwidth,
  selected,
  currentLinearBaseline: baseline,
  relativeLogLossImprovementPercent: 100 * (baseline.logLoss - selected.logLoss) / baseline.logLoss,
  results: bandwidthResults
}, null, 2)}\n`);
console.log(`${artifactOutput} · ${artifact.artifactHash} · ${history.length} games`);
console.log(`${validationOutput} · bandwidth ${selected.bandwidth} · log loss ${selected.logLoss.toFixed(6)}`);
