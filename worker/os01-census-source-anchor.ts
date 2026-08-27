// Qualification builds replace only this literal after the implementation
// commit is frozen. The production census route refuses to serve unless its
// control-plane binding matches this compiled value exactly.
export const OS01_CENSUS_SOURCE_ANCHOR =
  "0000000000000000000000000000000000000000000000000000000000000000";
export const OS01_CENSUS_SOURCE_ANCHOR_READY = false;
