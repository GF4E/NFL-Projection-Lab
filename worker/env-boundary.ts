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
