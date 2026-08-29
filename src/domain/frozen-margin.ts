import frozenMarginArtifactJson from "../../config/discrete-margin-2026.json";
import { structuralConfig } from "./config";
import { assertFrozenMarginArtifact } from "./margin";
import type { DiscreteMarginArtifact } from "./types";

export const frozenMarginArtifact = frozenMarginArtifactJson as unknown as DiscreteMarginArtifact;

assertFrozenMarginArtifact({
  artifact: frozenMarginArtifact,
  season: structuralConfig.season,
  halfLifeSeasons: structuralConfig.model.decayHalfLifeSeasons,
  boundarySeason: structuralConfig.model.keyMarginBoundarySeason,
  keyMargins: structuralConfig.model.keyMargins
});
