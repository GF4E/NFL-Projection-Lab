import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Os01SessionPhaseLedger } from "../scripts/os01-session-phase-ledger";

const roots: string[] = [];
const runId = "55555555-5555-4555-8555-555555555555";

function path(label: string): string {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), `os01-phase-ledger-${label}-`)));
  roots.push(root);
  return resolve(root, "phases.jsonl");
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("OS-01 run-bound monotonic phase ledger", () => {
  it("chains the complete success sequence and exposes a reproducible root", () => {
    const output = path("success");
    const ledger = Os01SessionPhaseLedger.create(output, runId);
    for (const phase of [
      "session_lock_acquired",
      "source_anchor_ready",
      "deployment_archive_ready",
      "external_mutation_armed",
      "proof_and_census_complete",
      "cleanup_verified",
      "session_complete"
    ] as const) ledger.advance(phase, "2026-08-28T12:00:00.000Z");

    expect(ledger.snapshot()).toMatchObject({
      runId,
      entryCount: 7,
      terminalPhase: "session_complete"
    });
    const lines = readFileSync(output, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(lines[0].previousEntryHash).toBe("0".repeat(64));
    expect(lines[6].previousEntryHash).toBe(lines[5].entryHash);
    expect(() => ledger.advance("session_rejected_after_verified_cleanup")).toThrow(/terminal/u);
    ledger.close();
  });

  it("rejects skipped, repeated, and regressed success phases", () => {
    const ledger = Os01SessionPhaseLedger.create(path("nonmonotonic"), runId);
    expect(() => ledger.advance("source_anchor_ready")).toThrow(/non-monotonic/u);
    ledger.advance("session_lock_acquired");
    expect(() => ledger.advance("session_lock_acquired")).toThrow(/non-monotonic/u);
    expect(() => ledger.advance("deployment_archive_ready")).toThrow(/non-monotonic/u);
    ledger.close();
  });

  it("rejects a regressed observation time even when the phase order is valid", () => {
    const ledger = Os01SessionPhaseLedger.create(path("time-regression"), runId);
    ledger.advance("session_lock_acquired", "2026-08-28T12:00:01.000Z");
    expect(() => ledger.advance("source_anchor_ready", "2026-08-28T12:00:00.000Z"))
      .toThrow(/timestamp regressed/u);
    ledger.close();
  });

  it.each([
    "session_rejected_before_external_mutation",
    "session_rejected_cleanup_required",
    "session_rejected_after_verified_cleanup"
  ] as const)("accepts %s as a terminal transition from the active run", (phase) => {
    const ledger = Os01SessionPhaseLedger.create(path(phase), runId);
    ledger.advance("session_lock_acquired");
    ledger.advance(phase);
    expect(ledger.snapshot()).toMatchObject({ entryCount: 2, terminalPhase: phase });
    expect(() => ledger.advance("source_anchor_ready")).toThrow(/terminal/u);
    ledger.close();
  });

  it("detects external truncation or replacement before another phase can publish", () => {
    const output = path("tamper");
    const ledger = Os01SessionPhaseLedger.create(output, runId);
    ledger.advance("session_lock_acquired");
    writeFileSync(output, "{}\n", { mode: 0o600 });
    expect(() => ledger.advance("source_anchor_ready")).toThrow(/changed outside its owner/u);
    ledger.close();
  });

  it("rejects same-byte unlink and recreation without changing the replacement", () => {
    const output = path("same-byte-recreate");
    const ledger = Os01SessionPhaseLedger.create(output, runId);
    ledger.advance("session_lock_acquired");
    const original = readFileSync(output);
    unlinkSync(output);
    writeFileSync(output, original, { mode: 0o600 });

    expect(() => ledger.advance("source_anchor_ready")).toThrow(/metadata is invalid/u);
    expect(readFileSync(output)).toEqual(original);
    original.fill(0);
    ledger.close();
  });

  it("rejects a symlink at creation and a symlink replacing an owned pathname", () => {
    const createOutput = path("create-symlink");
    const createTarget = resolve(createOutput, "..", "create-target.jsonl");
    writeFileSync(createTarget, "target\n", { mode: 0o600 });
    symlinkSync(createTarget, createOutput);
    expect(() => Os01SessionPhaseLedger.create(createOutput, runId)).toThrow();
    expect(readFileSync(createTarget, "utf8")).toBe("target\n");

    const output = path("replace-symlink");
    const owned = resolve(output, "..", "owned-ledger.jsonl");
    const ledger = Os01SessionPhaseLedger.create(output, runId);
    ledger.advance("session_lock_acquired");
    renameSync(output, owned);
    symlinkSync(owned, output);
    expect(() => ledger.assertIntegrity()).toThrow(/metadata is invalid/u);
    ledger.close();
  });

  it("rejects descriptor and pathname divergence after the owned path is renamed", () => {
    const output = path("path-divergence");
    const moved = resolve(output, "..", "moved-ledger.jsonl");
    const ledger = Os01SessionPhaseLedger.create(output, runId);
    ledger.advance("session_lock_acquired");
    renameSync(output, moved);

    expect(() => ledger.assertIntegrity()).toThrow(/metadata is invalid/u);
    expect(existsSync(output)).toBe(false);
    ledger.close();
  });

  it("fences a stale writer after a fresh ledger takes over the pathname", () => {
    const output = path("stale-writer");
    const stalePath = resolve(output, "..", "stale-ledger.jsonl");
    const stale = Os01SessionPhaseLedger.create(output, runId);
    stale.advance("session_lock_acquired");
    renameSync(output, stalePath);

    const fresh = Os01SessionPhaseLedger.create(output, "77777777-7777-4777-8777-777777777777");
    fresh.advance("session_lock_acquired");
    const freshBytes = readFileSync(output);
    expect(() => stale.advance("source_anchor_ready")).toThrow(/metadata is invalid/u);
    expect(readFileSync(output)).toEqual(freshBytes);
    freshBytes.fill(0);
    stale.close();
    fresh.close();
  });
});
