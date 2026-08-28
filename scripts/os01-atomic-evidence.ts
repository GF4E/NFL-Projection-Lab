import { randomUUID } from "node:crypto";
import {
  closeSync, fsyncSync, linkSync, openSync, realpathSync, unlinkSync, writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

/**
 * Publishes bytes without exposing a partial final file. The temporary inode is
 * fully written and synced before an exclusive hard-link creates the final name.
 */
export function publishEvidenceBytesExclusive(pathInput: string, bytes: Uint8Array, mode = 0o600): string {
  const requested = resolve(pathInput);
  const parent = realpathSync(dirname(requested));
  if (dirname(requested) !== parent) throw new Error("evidence output parent must be canonical");
  const temporary = resolve(parent, `.${basename(requested)}.${randomUUID()}.partial`);
  let descriptor: number | null = null;
  let directoryDescriptor: number | null = null;
  try {
    descriptor = openSync(temporary, "wx", mode);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    linkSync(temporary, requested);
    unlinkSync(temporary);
    directoryDescriptor = openSync(parent, "r");
    fsyncSync(directoryDescriptor);
    return requested;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (directoryDescriptor !== null) closeSync(directoryDescriptor);
    try {
      unlinkSync(temporary);
    } catch (error: unknown) {
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
      if (code !== "ENOENT") throw error;
    }
  }
}
