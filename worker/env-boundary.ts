export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface ImageTransformerBinding {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
}

/**
 * Bindings the Worker is permitted to name. Runtime environments may contain
 * additional secrets, but no public or scheduled lane receives the whole
 * environment object as a downstream dependency.
 */
export interface WorkerRuntimeEnv {
  ASSETS: AssetFetcher;
  DB: D1Database;
  ENGINE_OS_CAPTURE_ENABLED?: string;
  IMAGES: ImageTransformerBinding;
  OS01_CENSUS_AUTH_SHA256?: string;
  OS01_CENSUS_BUILD_ATTESTATION?: string;
  OS01_CENSUS_EXPIRES_AT?: string;
}

export interface PublicDataEnv {
  DB: D1Database;
}

export function readDatabaseBinding(env: Pick<WorkerRuntimeEnv, "DB">): D1Database {
  return env.DB;
}

export function readCaptureGate(
  env: Pick<WorkerRuntimeEnv, "ENGINE_OS_CAPTURE_ENABLED">
): string | undefined {
  return env.ENGINE_OS_CAPTURE_ENABLED;
}

export function readOs01CensusControlBindings(
  env: Pick<
    WorkerRuntimeEnv,
    "OS01_CENSUS_AUTH_SHA256" | "OS01_CENSUS_BUILD_ATTESTATION" | "OS01_CENSUS_EXPIRES_AT"
  >
): { authSha256?: string; buildAttestation?: string; expiresAt?: string } {
  return {
    authSha256: env.OS01_CENSUS_AUTH_SHA256,
    buildAttestation: env.OS01_CENSUS_BUILD_ATTESTATION,
    expiresAt: env.OS01_CENSUS_EXPIRES_AT
  };
}

export function selectFrameworkAssetBindings(
  env: Pick<WorkerRuntimeEnv, "ASSETS">
): Pick<WorkerRuntimeEnv, "ASSETS"> {
  return { ASSETS: env.ASSETS };
}

export function selectImageBindings(
  env: Pick<WorkerRuntimeEnv, "ASSETS" | "IMAGES">
): Pick<WorkerRuntimeEnv, "ASSETS" | "IMAGES"> {
  return {
    ASSETS: env.ASSETS,
    IMAGES: env.IMAGES
  };
}
