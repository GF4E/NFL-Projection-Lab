/**
 * Retired compatibility tombstone.
 *
 * The Supabase-backed job runner was a competing persistence/control plane. The
 * Cloudflare Worker scheduled handler is the sole active orchestration entrypoint.
 * Keeping this fail-closed export makes accidental legacy imports abort before a
 * provider request or database write can occur.
 */
export async function runJob(): Promise<never> {
  throw new Error("Legacy Supabase job runner is quarantined; use Cloudflare scheduled maintenance");
}
