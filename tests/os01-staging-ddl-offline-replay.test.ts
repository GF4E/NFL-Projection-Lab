import { linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson } from "../qualification/os01-staging-census/contract";
import {
  currentRuntimeIdentity,
  hasForeignKeyClause,
  OS01_DDL_OFFLINE_REPLAY_CONTRACT,
  os01DdlOfflineReplayTestOnly,
  qualifyOs01StagingDdlOfflineReplay,
  readStableFile,
  tokenizeSql
} from "../qualification/os01-staging-census/offline-replay";

const ROOT = process.cwd();
const RESPONSE = readFileSync(resolve(ROOT,
  ".planning/engine-os/execution/os-01/generation10-hosted-authority-v1/response.json"));
const FINAL_RECEIPT = readFileSync(resolve(ROOT,
  ".planning/engine-os/execution/os-01/generation10-hosted-authority-v1/final-receipt.json"));
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function qualify(): Record<string, unknown> {
  return qualifyOs01StagingDdlOfflineReplay({
    hostedResponseBytes: RESPONSE,
    hostedFinalReceiptBytes: FINAL_RECEIPT,
    runnerSourceSha256: "a".repeat(64),
    testSourceSha256: "b".repeat(64),
    recordedAt: "2026-08-29T13:00:00.000Z"
  });
}

describe("OS-01 Generation 10 offline DDL replay", () => {
  it("replays the exact hosted DDL twice and freezes the Generation 11 candidate set", () => {
    const receipt = qualify();
    expect(receipt.status).toBe("accepted_bounded_two_pass_offline_ddl_replay_and_fk_candidate_freeze");
    expect(receipt.crossPassEqual).toBe(true);
    expect(receipt.candidateCount).toBe(28);
    expect(receipt.candidateRoot).toBe("09e6a26e0c2f3d6029e34a2fb42a8b3b550e45eab7d8e8da1aaefb69af62a09e");
    expect(receipt.normalizedForeignKeyRoot).toBe("bad8738dceb23141a6781540308bbd7d287ce8d7f5119913b7f3986e7e724622");
    expect(receipt.foreignKeyConstraintCount).toBe(51);
    expect(receipt.foreignKeyColumnRowCount).toBe(54);
    const passes = receipt.passes as Array<Record<string, unknown>>;
    expect(passes).toHaveLength(2);
    expect(passes.map((pass) => pass.replayCatalogRows)).toEqual([376, 376]);
    expect(passes.map((pass) => pass.derivedAutoIndexCount)).toEqual([128, 128]);
    expect(passes.map((pass) => pass.triggerProbeCount)).toEqual([73, 73]);
    expect(passes.map((pass) => pass.lexicalReferenceTokenCount)).toEqual([51, 51]);
    expect(passes.map((pass) => pass.foreignKeyStructureProbeCount)).toEqual([51, 51]);
    expect(passes.map((pass) => pass.integrityCheck)).toEqual(["ok", "ok"]);
    expect(passes.map((pass) => pass.foreignKeyCheckViolationCount)).toEqual([0, 0]);
    expect(passes[0].passRoot).toBe(passes[1].passRoot);
    const body = Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "receiptHash"));
    expect(receipt.receiptHash).toBe(os01DdlOfflineReplayTestOnly.sha256(canonicalJson(body)));
  });

  it("binds qualification to the exact hosted response and final receipt bytes", () => {
    const changedResponse = Buffer.from(RESPONSE);
    changedResponse[changedResponse.length - 1] = changedResponse[changedResponse.length - 1] ^ 1;
    expect(() => qualifyOs01StagingDdlOfflineReplay({
      hostedResponseBytes: changedResponse,
      hostedFinalReceiptBytes: FINAL_RECEIPT,
      runnerSourceSha256: "a".repeat(64),
      testSourceSha256: "b".repeat(64),
      recordedAt: "2026-08-29T13:00:00.000Z"
    })).toThrow("hosted response byte hash mismatch");
    const changedReceipt = Buffer.from(FINAL_RECEIPT);
    changedReceipt[0] = changedReceipt[0] ^ 1;
    expect(() => qualifyOs01StagingDdlOfflineReplay({
      hostedResponseBytes: RESPONSE,
      hostedFinalReceiptBytes: changedReceipt,
      runnerSourceSha256: "a".repeat(64),
      testSourceSha256: "b".repeat(64),
      recordedAt: "2026-08-29T13:00:00.000Z"
    })).toThrow("hosted final receipt byte hash mismatch");
  });

  it("fails closed on a runtime identity mismatch", () => {
    expect(() => os01DdlOfflineReplayTestOnly.assertRuntime({
      ...currentRuntimeIdentity(), sqlite: "0.0.0"
    })).toThrow("offline replay runtime identity mismatch");
  });

  it("uses a lexical scanner that excludes comments, strings, and quoted identifiers", () => {
    const negative = `CREATE TABLE child (
      note TEXT DEFAULT 'REFERENCES parent(id)',
      "FOREIGN" TEXT,
      \`REFERENCES\` TEXT,
      [FOREIGN KEY] TEXT
      /* REFERENCES hidden(id) */
      -- FOREIGN KEY (note) REFERENCES hidden(id)
    )`;
    expect(hasForeignKeyClause(negative)).toBe(false);
    expect(hasForeignKeyClause("CREATE TABLE child (parent_id TEXT REFERENCES parent(id))")).toBe(true);
    expect(hasForeignKeyClause(
      "CREATE TABLE child (parent_id TEXT, FOREIGN KEY (parent_id) REFERENCES parent(id))"
    )).toBe(true);
    expect(() => tokenizeSql("CREATE TABLE x (v TEXT DEFAULT 'unterminated)")).toThrow("unterminated string literal");
    expect(() => tokenizeSql("CREATE TABLE x (v TEXT /* unterminated")).toThrow("unterminated block comment");
    expect(() => tokenizeSql("CREATE TABLE x (\"unterminated TEXT)")).toThrow("unterminated quoted identifier");
  });

  it("normalizes away raw FK ids and row order while retaining composite order", () => {
    const first = os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      { id: 9, seq: 1, table: "parent", from: "b", to: "b", on_update: "CASCADE", on_delete: "RESTRICT", match: "NONE" },
      { id: 9, seq: 0, table: "parent", from: "a", to: "a", on_update: "CASCADE", on_delete: "RESTRICT", match: "NONE" }
    ]);
    const renumbered = os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      { id: 2, seq: 0, table: "parent", from: "a", to: "a", on_update: "CASCADE", on_delete: "RESTRICT", match: "NONE" },
      { id: 2, seq: 1, table: "parent", from: "b", to: "b", on_update: "CASCADE", on_delete: "RESTRICT", match: "NONE" }
    ]);
    const reordered = os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      { id: 2, seq: 0, table: "parent", from: "b", to: "b", on_update: "CASCADE", on_delete: "RESTRICT", match: "NONE" },
      { id: 2, seq: 1, table: "parent", from: "a", to: "a", on_update: "CASCADE", on_delete: "RESTRICT", match: "NONE" }
    ]);
    expect(canonicalJson(first)).toBe(canonicalJson(renumbered));
    expect(canonicalJson(first)).not.toBe(canonicalJson(reordered));
  });

  it("rejects malformed or semantically unsupported FK rows", () => {
    const valid = {
      id: 0, seq: 0, table: "parent", from: "parent_id", to: "id",
      on_update: "NO ACTION", on_delete: "CASCADE", match: "NONE"
    };
    expect(() => os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      { ...valid, extra: "unexpected" } as never
    ])).toThrow("foreign-key row shape is invalid");
    expect(() => os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      { ...valid, id: -1 }
    ])).toThrow("foreign-key row shape is invalid");
    expect(() => os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      { ...valid, seq: -1 }
    ])).toThrow("foreign-key row shape is invalid");
    expect(() => os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      { ...valid, on_delete: "INVALID" }
    ])).toThrow("foreign-key row shape is invalid");
    expect(() => os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      { ...valid, match: "FULL" }
    ])).toThrow("foreign-key row shape is invalid");
    expect(() => os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      valid, { ...valid }
    ])).toThrow("foreign-key constraint rows are inconsistent");
    expect(() => os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      valid, { ...valid, seq: 2, from: "other", to: "other" }
    ])).toThrow("foreign-key constraint rows are inconsistent");
    expect(() => os01DdlOfflineReplayTestOnly.normalizeForeignKeys("child", [
      valid, { ...valid, seq: 1, table: "other_parent" }
    ])).toThrow("foreign-key constraint rows are inconsistent");
  });

  it("parses trigger events lexically rather than from comments or literals", () => {
    expect(os01DdlOfflineReplayTestOnly.triggerEvent(
      "CREATE TRIGGER x AFTER /* BEFORE DELETE */ INSERT ON child BEGIN SELECT 'AFTER UPDATE'; END"
    )).toBe("INSERT");
    expect(() => os01DdlOfflineReplayTestOnly.triggerEvent(
      "CREATE TRIGGER x /* AFTER INSERT */ ON child BEGIN SELECT 'BEFORE DELETE'; END"
    )).toThrow("trigger event is not recognized");
  });

  it("enforces the Generation 11 candidate ceiling", () => {
    expect(() => os01DdlOfflineReplayTestOnly.enforceCandidateLimit(40)).not.toThrow();
    expect(() => os01DdlOfflineReplayTestOnly.enforceCandidateLimit(41)).toThrow(
      "foreign-key candidate set exceeds the Generation 11 one-batch limit"
    );
  });

  it("reads evidence with no-follow and single-link protections", () => {
    const root = mkdtempSync(join(tmpdir(), "os01-ddl-replay-"));
    temporaryRoots.push(root);
    const original = join(root, "original.json");
    const symlink = join(root, "symlink.json");
    const hardlink = join(root, "hardlink.json");
    writeFileSync(original, "{}", { mode: 0o600 });
    expect(readStableFile(original).bytesSha256).toBe(os01DdlOfflineReplayTestOnly.sha256("{}"));
    symlinkSync(original, symlink);
    expect(() => readStableFile(symlink)).toThrow("qualification input path must not be a symlink");
    linkSync(original, hardlink);
    expect(() => readStableFile(original)).toThrow("qualification input must be one regular single-link file");
  });

  it("pins the exact runtime and preserves bounded claims", () => {
    expect(currentRuntimeIdentity()).toEqual(OS01_DDL_OFFLINE_REPLAY_CONTRACT.runtime);
    const receipt = qualify();
    expect((receipt.boundaries as Record<string, unknown>).os01Accepted).toBe(false);
    expect((receipt.boundaries as Record<string, unknown>).hostedForeignKeyEvidenceAccepted).toBe(false);
    expect((receipt.boundaries as Record<string, unknown>).rowCountEvidenceAccepted).toBe(false);
    expect((receipt.generation11 as Record<string, unknown>).plannedD1StatementCount).toBe(30);
  });
});
