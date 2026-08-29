import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import {
  os01ControlPlaneContract,
  validateEnvironmentLifecycle,
  validateEnvironmentStaging,
  type EnvironmentProjection
} from "../scripts/os01-control-plane-evidence";
import { publishEvidenceBytesExclusive } from "../scripts/os01-atomic-evidence";

const sessionPath = resolve("scripts/run_os01_private_seed_session.ts");
const sessionSource = readFileSync(sessionPath, "utf8");
const controllerPath = resolve("scripts/run_os01_production_census.ts");
const controllerSource = readFileSync(controllerPath, "utf8");
const sessionAst = ts.createSourceFile(
  sessionPath,
  sessionSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
);
const temporaryRoots: string[] = [];

function temporaryDirectory(label: string): string {
  const directory = realpathSync(mkdtempSync(resolve(tmpdir(), `os01-${label}-`)));
  temporaryRoots.push(directory);
  return directory;
}

function callExpressions(): ts.CallExpression[] {
  const result: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sessionAst);
  return result;
}

function callsNamed(name: string): ts.CallExpression[] {
  return callExpressions().filter((call) => call.expression.getText(sessionAst) === name);
}

function identifiersWithin(node: ts.Node): string[] {
  const result: string[] = [];
  const visit = (current: ts.Node): void => {
    if (ts.isIdentifier(current)) result.push(current.text);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return result;
}

function objectPropertyText(call: ts.CallExpression, propertyName: string): string | null {
  const object = call.arguments[0];
  if (!object || !ts.isObjectLiteralExpression(object)) return null;
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
    if (property.name.getText(sessionAst).replaceAll(/['"]/gu, "") !== propertyName) continue;
    return ts.isShorthandPropertyAssignment(property)
      ? property.name.getText(sessionAst)
      : property.initializer.getText(sessionAst);
  }
  return null;
}

function environmentProjection(input: {
  revision: number;
  observedAt: string;
  controls?: string[];
  controlsAllSecret?: boolean;
  captureGatePresent?: boolean;
  unrelatedMetadataRoot?: string;
  unrelatedEntryCount?: number;
}): EnvironmentProjection {
  const controls = input.controls ?? [];
  const unrelatedEntryCount = input.unrelatedEntryCount ?? 1;
  return {
    version: os01ControlPlaneContract.version,
    observedAt: input.observedAt,
    projectId: "appgprj_os01_private_seed_protocol_test",
    revision: input.revision,
    updatedAt: input.observedAt,
    controlsPresent: controls,
    controlsAllSecret: input.controlsAllSecret ?? true,
    captureGatePresent: input.captureGatePresent ?? false,
    entryCount: controls.length + unrelatedEntryCount,
    unrelatedEntryCount,
    unrelatedMetadataRoot: input.unrelatedMetadataRoot ?? "a".repeat(64),
    allMetadataRoot: "b".repeat(64),
    valueObservation: os01ControlPlaneContract.environmentValueObservation,
    unrelatedValuePreservationBasis: os01ControlPlaneContract.unrelatedValuePreservationBasis
  };
}

function lifecycleProjections(): {
  before: EnvironmentProjection;
  staged: EnvironmentProjection;
  after: EnvironmentProjection;
} {
  return {
    before: environmentProjection({
      revision: 25,
      observedAt: "2026-08-27T20:00:00.000Z"
    }),
    staged: environmentProjection({
      revision: 26,
      observedAt: "2026-08-27T20:01:00.000Z",
      controls: [...os01ControlPlaneContract.temporaryControls]
    }),
    after: environmentProjection({
      revision: 27,
      observedAt: "2026-08-27T20:02:00.000Z"
    })
  };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const directory = temporaryRoots.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("OS-01 atomic evidence publication", () => {
  it("publishes complete bytes once with owner-only permissions and no partial name", () => {
    const directory = temporaryDirectory("atomic-success");
    const output = resolve(directory, "receipt.json");
    const bytes = Buffer.from("{\"status\":\"accepted\"}\n", "utf8");

    expect(publishEvidenceBytesExclusive(output, bytes)).toBe(output);
    expect(readFileSync(output)).toEqual(bytes);
    expect(lstatSync(output).mode & 0o777).toBe(0o600);
    expect(readdirSync(directory).filter((name) => name.endsWith(".partial"))).toEqual([]);
  });

  it("refuses an existing final file without replacing it or retaining a partial file", () => {
    const directory = temporaryDirectory("atomic-existing");
    const output = resolve(directory, "receipt.json");
    const original = Buffer.from("original immutable evidence\n", "utf8");
    writeFileSync(output, original, { mode: 0o600 });

    expect(() => publishEvidenceBytesExclusive(output, Buffer.from("replacement\n", "utf8")))
      .toThrow();
    expect(readFileSync(output)).toEqual(original);
    expect(readdirSync(directory).filter((name) => name.includes(".partial"))).toEqual([]);
  });

  it("rejects non-canonical or missing parents before creating final or partial evidence", () => {
    const root = temporaryDirectory("atomic-parent");
    const canonicalParent = resolve(root, "canonical");
    const aliasParent = resolve(root, "alias");
    mkdirSync(canonicalParent);
    symlinkSync(canonicalParent, aliasParent, "dir");

    expect(() => publishEvidenceBytesExclusive(
      resolve(aliasParent, "receipt.json"),
      Buffer.from("must not publish\n", "utf8")
    )).toThrow(/parent must be canonical/u);
    expect(readdirSync(canonicalParent)).toEqual([]);

    const missingParent = resolve(root, "missing");
    expect(() => publishEvidenceBytesExclusive(
      resolve(missingParent, "receipt.json"),
      Buffer.from("must not publish\n", "utf8")
    )).toThrow();
    expect(readdirSync(root).sort()).toEqual(["alias", "canonical"]);
  });

  it("does not broaden a stricter caller-supplied evidence mode", () => {
    const directory = temporaryDirectory("atomic-mode");
    const output = resolve(directory, "receipt.json");
    publishEvidenceBytesExclusive(output, Buffer.from("private\n", "utf8"), 0o400);
    expect(lstatSync(output).mode & 0o777).toBe(0o400);
    chmodSync(output, 0o600);
  });
});

describe("OS-01 private-seed session lifecycle protocol", () => {
  it("pins hermetic direct Git and isolated Python invocation contracts", () => {
    expect(controllerSource).toMatch(
      /OS01_QUALIFICATION_PYTHON_FLAGS = Object\.freeze\(\[\s*"-I", "-S", "-B", "-X", "utf8"\s*\]\)/u
    );
    expect(controllerSource).toContain('PATH: "/dev/null"');
    expect(controllerSource).toContain('GIT_CONFIG_NOSYSTEM: "1"');
    expect(controllerSource).toContain('GIT_EXEC_PATH: "/dev/null/os01-no-git-helpers"');
    expect(controllerSource).toContain('"--exec-path=/dev/null/os01-no-git-helpers"');
    expect(controllerSource).toContain('"--no-ext-diff"');
    expect(controllerSource).not.toMatch(/execFileSync\("\/usr\/bin\/(?:git|python3)"/u);
    expect(sessionSource).toContain("...OS01_QUALIFICATION_PYTHON_FLAGS");
  });

  it("uses one coordinator across source preparation, both builds, proof boundary, and census", () => {
    expect(callsNamed("ProductionQualificationCoordinator.start")).toHaveLength(1);

    const prepare = callsNamed("prepareSourceAnchorEvidence");
    expect(prepare).toHaveLength(1);
    expect(objectPropertyText(prepare[0]!, "productionCoordinator")).toBe("coordinator");

    const builds = callsNamed("freshBuildEvidence");
    expect(builds).toHaveLength(2);
    for (const build of builds) {
      expect(build.arguments.at(-1)?.getText(sessionAst)).toBe("coordinator");
    }

    const archiveBoundary = callsNamed("verifyQualificationArchiveBoundary");
    expect(archiveBoundary).toHaveLength(1);
    expect(objectPropertyText(archiveBoundary[0]!, "productionCoordinator")).toBe("coordinator");

    const census = callsNamed("executeQualifiedCensus");
    expect(census).toHaveLength(1);
    expect(objectPropertyText(census[0]!, "productionCoordinator")).toBe("coordinator");
  });

  it("freezes pre-census and terminal trust boundaries and reuses both for terminal validation", () => {
    const proofWriteIndex = sessionSource.indexOf("writeDeploymentProofExclusive(");
    const trustFreezeIndex = sessionSource.indexOf("acceptanceTrust = Object.freeze({");
    const censusIndex = sessionSource.indexOf("await executeQualifiedCensus({");
    const terminalLedgerIndex = sessionSource.indexOf('requirePhaseLedger().advance("session_complete"');
    const finalizationFreezeIndex = sessionSource.indexOf("finalizationTrust = Object.freeze({");
    const firstValidationIndex = sessionSource.indexOf("validateOs01SessionAcceptance({", finalizationFreezeIndex);
    expect(proofWriteIndex).toBeGreaterThan(-1);
    expect(trustFreezeIndex).toBeGreaterThan(proofWriteIndex);
    expect(censusIndex).toBeGreaterThan(trustFreezeIndex);
    expect(finalizationFreezeIndex).toBeGreaterThan(terminalLedgerIndex);
    expect(firstValidationIndex).toBeGreaterThan(finalizationFreezeIndex);

    const validations = callsNamed("validateOs01SessionAcceptance");
    expect(validations).toHaveLength(2);
    for (const validation of validations) {
      expect(objectPropertyText(validation, "trustedBoundary")).toBe("acceptanceTrust");
      expect(objectPropertyText(validation, "trustedFinalization")).toBe("finalizationTrust");
    }
    expect(objectPropertyText(validations[0]!, "externalMutationIntentBytes"))
      .toBe("externalMutationIntentBytes");
    expect(objectPropertyText(validations[1]!, "externalMutationIntentBytes"))
      .toBe("recoveredExternalMutationIntent");
  });

  it("zeroizes mutable route-token material and closes the process-scoped coordinator on every terminal path", () => {
    expect(sessionSource).toMatch(/const closeSecrets = \(\): void => \{[\s\S]*coordinator\.close\(\);[\s\S]*tokenBytes\.fill\(0\);[\s\S]*\};/u);
    expect(sessionSource).toMatch(/process\.once\("exit", closeSecrets\)/u);
    expect(sessionSource).toMatch(
      /process\.once\("SIGINT", \(\) => \{\s*try \{ signalRejector\?\.\(\); \} finally \{ closeSecrets\(\);/u
    );
    expect(sessionSource).toMatch(
      /process\.once\("SIGTERM", \(\) => \{\s*try \{ signalRejector\?\.\(\); \} finally \{ closeSecrets\(\);/u
    );
    expect(sessionSource).toMatch(/if \(name === "cleanup"\)[\s\S]*event: "session_complete"[\s\S]*closeSecrets\(\);/u);
    expect(sessionSource).toMatch(/finally \{\s*closeSecrets\(\);\s*\}/u);
    expect(sessionSource).toMatch(/externalMutationIntentBytes\?\.fill\(0\);\s*externalMutationIntentBytes = null;/u);
  });

  it("emits commitments and digests but never a raw seed, context, or bearer token", () => {
    const emissions = callsNamed("emit");
    expect(emissions.length).toBeGreaterThanOrEqual(3);
    for (const emission of emissions) {
      const argument = emission.arguments[0];
      expect(argument).toBeDefined();
      expect(identifiersWithin(argument!)).not.toEqual(expect.arrayContaining([
        "tokenBytes", "censusToken", "seed", "context"
      ]));
    }
    expect(sessionSource).not.toMatch(/coordinator\.seed(?!Commitment)/u);

    const receiptDeclaration = sessionAst.statements
      .flatMap((statement) => {
        const declarations: ts.VariableDeclaration[] = [];
        const visit = (node: ts.Node): void => {
          if (ts.isVariableDeclaration(node) && node.name.getText(sessionAst) === "receipt") {
            declarations.push(node);
          }
          ts.forEachChild(node, visit);
        };
        visit(statement);
        return declarations;
      });
    expect(receiptDeclaration.length).toBeGreaterThanOrEqual(2);
    for (const declaration of receiptDeclaration) {
      const receiptInitializer = declaration.initializer!;
      expect(identifiersWithin(receiptInitializer)).not.toEqual(expect.arrayContaining([
        "tokenBytes", "censusToken", "seed", "context"
      ]));
      expect(receiptInitializer.getText(sessionAst)).toContain("seedCommitment");
    }
  });

  it("fixes the production target and packages local output without a remote build path", () => {
    expect(sessionSource).toContain('configuredTrustedTarget("production")');
    expect(sessionSource).toContain('process.argv.includes("--target")');
    expect(sessionSource).toContain('process.argv.includes("--provider")');
    expect(sessionSource).not.toMatch(/configuredTrustedTarget\(argument/u);
    expect(sessionSource).not.toMatch(/remoteBuild|sites[_A-Z]?build|wrangler|\bfetch\s*\(/iu);

    const externalCommands = callsNamed("execFileSync");
    expect(externalCommands).toHaveLength(1);
    expect(externalCommands[0]!.arguments[0]!.getText(sessionAst)).toBe("pythonExecutable");
    expect(sessionSource).toContain('assertFrozenQualificationSystemExecutable("python3")');
    expect(externalCommands[0]!.arguments[1]!.getText(sessionAst))
      .toContain("...OS01_QUALIFICATION_PYTHON_FLAGS");
    expect(sessionSource).toContain("OS01_QUALIFICATION_PYTHON_FLAGS");
    expect(sessionSource).toContain("buildIdentity.localArchivePackaging");
    expect(sessionSource).toContain("archive packager hash");
  });

  it("validates staged metadata before proof and the restored lifecycle before receipt publication", () => {
    const stagingIndex = sessionSource.indexOf("validateEnvironmentStaging(before, staged);");
    const proofIndex = sessionSource.indexOf("writeDeploymentProofExclusive(");
    const censusIndex = sessionSource.indexOf("await executeQualifiedCensus({");
    const lifecycleIndex = sessionSource.indexOf(
      "validateEnvironmentLifecycle(environmentBefore, environmentStaged, environmentAfter);"
    );
    const receiptIndex = sessionSource.indexOf(
      'publishEvidenceBytesExclusive(resolve(qualificationDirectory, "session-receipt.json"), receiptBytes);'
    );

    expect(stagingIndex).toBeGreaterThan(-1);
    expect(proofIndex).toBeGreaterThan(stagingIndex);
    expect(censusIndex).toBeGreaterThan(proofIndex);
    expect(lifecycleIndex).toBeGreaterThan(censusIndex);
    expect(receiptIndex).toBeGreaterThan(lifecycleIndex);
  });

  it("arms target-global cleanup ownership before authorizing any external mutation", () => {
    const lockIndex = sessionSource.indexOf("Os01ProductionSessionLock.acquire({");
    const armIndex = sessionSource.indexOf("requireSessionLock().armExternalMutation(intentHash);");
    const intentReceiptIndex = sessionSource.indexOf(
      'resolve(qualificationDirectory, "external-mutation-intent.json")',
      armIndex
    );
    const armedEventIndex = sessionSource.indexOf('event: "external_mutation_armed"');
    const proofIndex = sessionSource.indexOf('if (name === "proof_and_census")');
    const lifecycleIndex = sessionSource.indexOf(
      "validateEnvironmentLifecycle(environmentBefore, environmentStaged, environmentAfter);"
    );
    const cleanupReceiptIndex = sessionSource.indexOf(
      'publishEvidenceBytesExclusive(resolve(qualificationDirectory, "session-receipt.json"), receiptBytes);'
    );
    const terminalLedgerIndex = sessionSource.indexOf('requirePhaseLedger().advance("session_complete"');
    const acceptanceIndex = sessionSource.indexOf(
      'resolve(qualificationDirectory, "session-acceptance.json")'
    );
    const releaseIndex = sessionSource.indexOf("releaseAfterVerifiedCleanup(");

    expect(lockIndex).toBeGreaterThan(-1);
    expect(armIndex).toBeGreaterThan(lockIndex);
    expect(intentReceiptIndex).toBeGreaterThan(armIndex);
    expect(armedEventIndex).toBeGreaterThan(intentReceiptIndex);
    expect(proofIndex).toBeGreaterThan(armedEventIndex);
    expect(sessionSource).toContain('"mutationIntentHash", "observedAt", "sitesVersion", "uploader"');
    expect(sessionSource).toContain("assertExternalMutationIntent(externalMutationIntentHash)");
    expect(terminalLedgerIndex).toBeGreaterThan(lifecycleIndex);
    expect(cleanupReceiptIndex).toBeGreaterThan(terminalLedgerIndex);
    expect(acceptanceIndex).toBeGreaterThan(terminalLedgerIndex);
    expect(releaseIndex).toBeGreaterThan(acceptanceIndex);
  });

  it("consumes a run-bound append-only phase ledger on success and rejection", () => {
    for (const phase of [
      "session_lock_acquired",
      "source_anchor_ready",
      "deployment_archive_ready",
      "external_mutation_armed",
      "proof_and_census_complete",
      "cleanup_verified",
      "session_complete",
      "session_rejected_before_external_mutation",
      "session_rejected_cleanup_required",
      "session_rejected_after_verified_cleanup"
    ]) expect(sessionSource).toContain(phase);
    expect(sessionSource).toContain('"session-phase-ledger.jsonl"');
    expect(sessionSource).toContain("phaseLedger: phaseLedgerEvidence");
    expect(sessionSource).toContain("phaseLedgerAtCleanup: requirePhaseLedger().snapshot()");
    expect(sessionSource).toContain('status: "verified_cleanup_pending_acceptance_marker"');
    expect(sessionSource).toContain('status: "clean_public_production_census_session_accepted"');
    expect(sessionSource).toContain('"session-acceptance.json"');
    expect(sessionSource).toContain("publishAcceptanceMarkerExclusive(");
    expect(sessionSource).toContain("validateOs01SessionAcceptance({");
    expect(sessionSource).toContain("censusReceiptBytes");
    expect(sessionSource).toContain("acceptanceFailureReceiptPresent");
  });

  it("requires an accepted two-pass census before cleanup or terminal acceptance", () => {
    const resultIndex = sessionSource.indexOf("const result = await executeQualifiedCensus({");
    const gateIndex = sessionSource.indexOf(
      'if (result.status !== "accepted_two_identical_read_only_passes")'
    );
    const assignmentIndex = sessionSource.indexOf("censusResult = result;");
    const cleanupIndex = sessionSource.indexOf('if (name === "cleanup")');
    expect(resultIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(resultIndex);
    expect(assignmentIndex).toBeGreaterThan(gateIndex);
    expect(cleanupIndex).toBeGreaterThan(assignmentIndex);
  });

  it("uses the actual proof-and-census phase time as every cleanup lower bound", () => {
    const phaseTimeIndex = sessionSource.indexOf(
      "const proofAndCensusCompletedAt = new Date().toISOString();"
    );
    const phaseAdvanceIndex = sessionSource.indexOf(
      'requirePhaseLedger().advance("proof_and_census_complete", proofAndCensusCompletedAt);'
    );
    const cleanupBoundaryIndex = sessionSource.indexOf(
      "cleanupNotBeforeMs = Date.parse(proofAndCensusCompletedAt);"
    );
    const cleanupIndex = sessionSource.indexOf('if (name === "cleanup")');

    expect(phaseTimeIndex).toBeGreaterThan(-1);
    expect(phaseAdvanceIndex).toBeGreaterThan(phaseTimeIndex);
    expect(cleanupBoundaryIndex).toBeGreaterThan(phaseAdvanceIndex);
    expect(cleanupIndex).toBeGreaterThan(cleanupBoundaryIndex);
    expect(sessionSource).not.toContain("censusCompletedAtMs");
    expect(sessionSource.match(/notBeforeMs: cleanupNotBeforeMs/gu)).toHaveLength(7);
  });

  it("makes every unaccepted terminal path nonzero and persists its final event synchronously", () => {
    expect(sessionSource).toContain('writeFileSync(1, `${stableJson(value)}\\n`, { encoding: "utf8" })');
    expect(sessionSource).toContain('if (!acceptancePublished) {');
    expect(sessionSource).toContain('currentPhase = "input_error";');
    expect(sessionSource).toMatch(/interface_\.once\("error", \(error\) => \{[\s\S]*publishRejection\(\);[\s\S]*rejectSessionPromise\(error\);/u);
    expect(sessionSource).toContain(
      'if (!acceptancePublished) throw new Error("private-seed session ended without accepted terminal evidence")'
    );
    expect(sessionSource).not.toContain('if (!closed) throw new Error("private-seed session ended before verified cleanup")');
  });

  it("rejects queued commands after cleanup and closes the line intake before committing acceptance", () => {
    const cleanupIndex = sessionSource.indexOf('if (name === "cleanup")');
    const pendingGateIndex = sessionSource.indexOf("if (pendingCommandCount !== 1)", cleanupIndex);
    const removeListenerIndex = sessionSource.indexOf('interface_.removeAllListeners("line")', cleanupIndex);
    const receiptIndex = sessionSource.indexOf(
      'publishEvidenceBytesExclusive(resolve(qualificationDirectory, "session-receipt.json"), receiptBytes);'
    );
    expect(pendingGateIndex).toBeGreaterThan(cleanupIndex);
    expect(removeListenerIndex).toBeGreaterThan(pendingGateIndex);
    expect(receiptIndex).toBeGreaterThan(removeListenerIndex);
  });

  it("fails closed with immutable rejection, expiry, response scans, and source CAS evidence", () => {
    expect(sessionSource).toContain("coordinator.assertActive();");
    expect(sessionSource).toContain('"session-rejection-receipt.json"');
    expect(sessionSource).toContain('event: disposition.cleanupRequired ? "cleanup_required" : "session_rejected"');
    expect(sessionSource).toContain("readCensusFailureEnvelopeBinding(");
    expect(sessionSource).toContain("censusFailureEnvelopeHash: censusFailureEnvelope?.failureEnvelopeHash ?? null");
    expect(sessionSource).toContain(
      "censusFailureEnvelopeBytesSha256: censusFailureEnvelope?.failureEnvelopeBytesSha256 ?? null"
    );
    expect(sessionSource).toContain("OS01_CENSUS_FAILURE_FILENAME");
    expect(sessionSource).toMatch(/interface_\.close\(\);\s*closeSecrets\(\);/u);
    expect(sessionSource).toContain("validateCleanupHttpObservations({");
    expect(sessionSource).toContain("coordinator.assertEvidenceBytesSafe(receiptBytes, \"private-seed session receipt\")");
    expect(sessionSource).toContain("validateSourceRestorationObservation(command.sourceRestoration");
    expect(sessionSource).toContain("sourcePushExpectedOld");
    expect(sessionSource).toContain("validateTrustedUploaderAssertion(uploader, sitesVersion");
    expect(sessionSource).toContain('currentPhase = "session_expired"');
    expect(sessionSource).toContain('currentPhase = "input_closed_before_verified_cleanup"');
    expect(sessionSource).toContain("signalRejector = publishRejection");
  });

  it("rejects a target override before creating session artifacts", () => {
    const directory = temporaryDirectory("session-target-override");
    const executable = resolve("node_modules/.bin/tsx");
    const result = spawnSync(executable, [sessionPath, "--target", "staging"], {
      cwd: resolve("."),
      encoding: "utf8",
      timeout: 20_000
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("OS-01 private-seed session terminated without acceptance.\n");
    expect(readdirSync(directory)).toEqual([]);
  });
});

describe("OS-01 private-seed environment boundary", () => {
  it("accepts exactly the three secret temporary controls and exact metadata restoration", () => {
    const { before, staged, after } = lifecycleProjections();
    expect(() => validateEnvironmentStaging(before, staged)).not.toThrow();
    expect(() => validateEnvironmentLifecycle(before, staged, after)).not.toThrow();
  });

  it("rejects capture activation, missing or non-secret controls, and unrelated metadata drift", () => {
    const { before, staged, after } = lifecycleProjections();

    expect(() => validateEnvironmentStaging(before, {
      ...staged,
      captureGatePresent: true
    })).toThrow(/environment staging is invalid/u);
    expect(() => validateEnvironmentStaging(before, {
      ...staged,
      controlsPresent: staged.controlsPresent.slice(1)
    })).toThrow(/environment staging is invalid/u);
    expect(() => validateEnvironmentStaging(before, {
      ...staged,
      controlsAllSecret: false
    })).toThrow(/environment staging is invalid/u);
    expect(() => validateEnvironmentLifecycle(before, staged, {
      ...after,
      unrelatedMetadataRoot: "c".repeat(64)
    })).toThrow(/environment lifecycle is invalid/u);
  });

  it("rejects incomplete cleanup and non-advancing cleanup revisions", () => {
    const { before, staged, after } = lifecycleProjections();
    expect(() => validateEnvironmentLifecycle(before, staged, {
      ...after,
      controlsPresent: [os01ControlPlaneContract.temporaryControls[0]]
    })).toThrow(/environment lifecycle is invalid/u);
    expect(() => validateEnvironmentLifecycle(before, staged, {
      ...after,
      revision: staged.revision
    })).toThrow(/environment lifecycle is invalid/u);
  });

  it("rejects any non-exact environment restoration or revision jump", () => {
    const { before, staged, after } = lifecycleProjections();
    for (const changed of [
      { ...after, allMetadataRoot: "c".repeat(64) },
      { ...after, entryCount: after.entryCount + 1 },
      { ...after, unrelatedEntryCount: after.unrelatedEntryCount + 1 },
      { ...after, unrelatedMetadataRoot: "c".repeat(64) },
      { ...after, revision: staged.revision + 2 }
    ]) expect(() => validateEnvironmentLifecycle(before, staged, changed))
      .toThrow(/environment lifecycle is invalid/u);

    expect(() => validateEnvironmentStaging(before, {
      ...staged,
      revision: before.revision + 2
    })).toThrow(/environment staging is invalid/u);
  });
});
