import { eraConfig, structuralConfig } from "./config";
import { stableHash } from "./hash";

export function currentModelConfigurationHash(): string {
  return stableHash({ structuralConfig, eraConfig });
}

export function currentModelCodeHash(): string {
  return stableHash("nfl-projection-lab:model-lifecycle:2026.7");
}

export function championConfigurationStatus(
  championHash: string | null,
  storedConfigHash: string | null,
  currentConfigHash = currentModelConfigurationHash(),
  retainedByCurrentGate = false
): "compatible" | "config_mismatch" | "unavailable" {
  if (!championHash || !storedConfigHash) return "unavailable";
  return storedConfigHash === currentConfigHash || retainedByCurrentGate ? "compatible" : "config_mismatch";
}
