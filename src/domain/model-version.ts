import { eraConfig, structuralConfig } from "./config";
import { stableHash } from "./hash";

export function currentModelConfigurationHash(): string {
  return stableHash({ structuralConfig, eraConfig });
}

export function championConfigurationStatus(
  championHash: string | null,
  storedConfigHash: string | null,
  currentConfigHash = currentModelConfigurationHash()
): "compatible" | "config_mismatch" | "unavailable" {
  if (!championHash || !storedConfigHash) return "unavailable";
  return storedConfigHash === currentConfigHash ? "compatible" : "config_mismatch";
}
