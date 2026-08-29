import frozenTotalArtifactJson from "../../config/discrete-total-2026.json";
import { structuralConfig } from "./config";
import { assertFrozenTotalArtifact } from "./total";
import type { DiscreteTotalArtifact } from "./types";

export const frozenTotalArtifact = frozenTotalArtifactJson as unknown as DiscreteTotalArtifact;

assertFrozenTotalArtifact({
  artifact: frozenTotalArtifact,
  season: structuralConfig.season,
  halfLifeSeasons: structuralConfig.model.decayHalfLifeSeasons,
  kernelBandwidth: structuralConfig.model.totalTranslationKernelBandwidth
});
