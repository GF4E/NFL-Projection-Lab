import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex, stableHash } from "@/domain/hash";
import {
  classifyForecastEvidenceScope,
  forecastLedgerApprovedWithholdingReasons,
  forecastLedgerContract,
  forecastLedgerContractHash,
  forecastLedgerHorizonIds,
  forecastLedgerPersistenceDeadline,
  forecastLedgerRecordId,
  forecastOutputObjectKey,
  forecastQualificationKey,
  prepareForecastLedgerRecord,
  validateForecastLedgerContract,
  type ForecastLedgerAuthorityProof,
  type ForecastLedgerOrigin,
  type ForecastLedgerProvenance,
  type PrepareForecastLedgerRecordInput
} from "@/server/engine-os/forecast-ledger-kernel";

const HASHES = {
  runner: "1".repeat(64),
  code: "2".repeat(64),
  model: "3".repeat(64),
  config: "4".repeat(64),
  input: "5".repeat(64),
  feature: "6".repeat(64),
  target: "7".repeat(64)
} as const;

const OUTPUT_BYTES = new TextEncoder().encode("os-13a immutable forecast distribution fixture\n");
const OUTPUT_HASH = sha256Hex(OUTPUT_BYTES);

function provenance(overrides: Partial<ForecastLedgerProvenance> = {}): ForecastLedgerProvenance {
  return {
    runnerHash: HASHES.runner,
    codeHash: HASHES.code,
    modelOrPackageHash: HASHES.model,
    configHash: HASHES.config,
    inputManifestHash: HASHES.input,
    featureSchemaHash: HASHES.feature,
    targetSchemaHash: HASHES.target,
    outputObjectHash: OUTPUT_HASH,
    outputObjectKey: forecastOutputObjectKey(OUTPUT_HASH),
    ...overrides
  };
}

function origin(overrides: Partial<ForecastLedgerOrigin> = {}): ForecastLedgerOrigin {
  return {
    originVersionId: "origin-version-2026-01-ne-sea-k60",
    logicalOriginId: "logical-origin-2026-01-ne-sea-k60",
    gameId: "2026_01_NE_SEA",
    horizonId: "kickoff_minus_60",
    scheduledForUtc: "2026-09-13T19:05:00.000Z",
    kickoffUtc: "2026-09-13T20:05:00.000Z",
    activationBoundary: "os13a-qualification-boundary-v1",
    eligible: true,
    eligibilityReason: "eligible",
    ...overrides
  };
}

function authority(overrides: Partial<ForecastLedgerAuthorityProof> = {}): ForecastLedgerAuthorityProof {
  return {
    state: "running",
    storedAttemptTokenHash: "8".repeat(64),
    storedFence: 7,
    suppliedAttemptTokenHash: "8".repeat(64),
    suppliedFence: 7,
    leaseExpiresAt: "2026-09-13T19:10:00.000Z",
    isCurrentHead: true,
    ...overrides
  };
}

function forecastInput(
  overrides: Partial<PrepareForecastLedgerRecordInput> = {}
): PrepareForecastLedgerRecordInput {
  const expected = provenance();
  return {
    origin: origin(),
    activatedAt: "2026-09-08T14:30:00.000Z",
    activationFirstOriginUtc: "2026-09-08T14:30:00.000Z",
    weekOneOriginComplete: true,
    requestedStatus: "forecast",
    requestedWithholdingReason: null,
    captureHealth: "current",
    invokedAt: "2026-09-13T19:05:01.000Z",
    evidenceAt: "2026-09-13T19:05:01.500Z",
    generatedAt: "2026-09-13T19:05:02.000Z",
    outputPublishedAt: "2026-09-13T19:05:02.250Z",
    outputVerifiedAt: "2026-09-13T19:05:02.500Z",
    persistenceRequestedAt: "2026-09-13T19:05:03.000Z",
    persistedAt: "2026-09-13T19:05:04.000Z",
    qualification: {
      stream: "eligible_package",
      modelOrPackageHash: HASHES.model
    },
    authority: authority(),
    provenance: expected,
    expectedProvenance: expected,
    outputBytes: OUTPUT_BYTES,
    ...overrides
  };
}

function published(input: PrepareForecastLedgerRecordInput = forecastInput()) {
  const result = prepareForecastLedgerRecord(input);
  expect(result.publishable).toBe(true);
  if (!result.publishable) throw new Error(result.violations.join(", "));
  return result.record;
}

describe("OS-13A frozen forecast-ledger kernel", () => {
  it("binds a machine-readable frozen contract to accepted foundations and exactly five horizons", () => {
    expect(validateForecastLedgerContract()).toEqual({
      errors: [],
      contractHash: forecastLedgerContractHash
    });
    expect(forecastLedgerHorizonIds).toEqual([
      "weekly_tuesday_0730",
      "kickoff_minus_120",
      "kickoff_minus_90",
      "kickoff_minus_60",
      "kickoff_minus_15"
    ]);
    expect(new Set(forecastLedgerHorizonIds).size).toBe(5);
    expect(forecastLedgerApprovedWithholdingReasons).toEqual(
      forecastLedgerContract.withholding.approvedReasons
    );

    const bytes = readFileSync(resolve(
      process.cwd(),
      "config/forecast-ledger-contract-2026.v1.json"
    ), "utf8");
    expect(JSON.parse(bytes)).toEqual(forecastLedgerContract);
    expect(stableHash(JSON.parse(bytes) as unknown)).toBe(forecastLedgerContractHash);
  });

  it("uses one terminal identity per activated origin while separating qualification streams", () => {
    const recordId = forecastLedgerRecordId({
      originVersionId: "origin-v1",
      activationBoundary: "activation-v1"
    });
    expect(recordId).toBe(forecastLedgerRecordId({
      originVersionId: "origin-v1",
      activationBoundary: "activation-v1"
    }));
    expect(recordId).not.toBe(forecastLedgerRecordId({
      originVersionId: "origin-v1",
      activationBoundary: "activation-v2"
    }));

    const packageKey = forecastQualificationKey({
      activationBoundary: "activation-v1",
      qualification: { stream: "eligible_package", modelOrPackageHash: HASHES.model }
    });
    const noPackageKey = forecastQualificationKey({
      activationBoundary: "activation-v1",
      qualification: { stream: "no_eligible_package" }
    });
    expect(packageKey).not.toBe(noPackageKey);
    expect(packageKey).toBe(forecastQualificationKey({
      activationBoundary: "activation-v1",
      qualification: { stream: "eligible_package", modelOrPackageHash: HASHES.model }
    }));
    expect(() => forecastQualificationKey({
      activationBoundary: "activation-v1",
      qualification: {
        stream: "no_eligible_package",
        modelOrPackageHash: HASHES.model
      } as never
    })).toThrow("cannot carry a package hash");
  });

  it("derives the output pointer only from exact bytes and publishes a complete verified forecast", () => {
    expect(forecastOutputObjectKey(OUTPUT_HASH))
      .toBe(`forecast-output/sha256/${OUTPUT_HASH}`);
    const record = published();
    expect(record).toMatchObject({
      status: "forecast",
      withholdingReason: null,
      qualificationStream: "eligible_package",
      timing: "timely",
      prospectiveEvidenceEligible: true,
      forecastEvaluationEligible: true,
      evidenceScope: "full_season_shadow",
      outputObjectHash: OUTPUT_HASH,
      outputObjectKey: `forecast-output/sha256/${OUTPUT_HASH}`
    });
    expect(record.provenance).toEqual(provenance());
    const { recordHash, ...unsigned } = record;
    expect(recordHash).toBe(stableHash(unsigned));
  });

  it("creates a contemporaneous no-package withholding without forecast provenance", () => {
    const record = published(forecastInput({
      requestedStatus: "withheld",
      requestedWithholdingReason: "no_eligible_package",
      qualification: { stream: "no_eligible_package" },
      provenance: null,
      expectedProvenance: null,
      outputBytes: null
    }));
    expect(record).toMatchObject({
      status: "withheld",
      withholdingReason: "no_eligible_package",
      qualificationStream: "no_eligible_package",
      timing: "timely",
      prospectiveEvidenceEligible: true,
      forecastEvaluationEligible: false,
      provenance: null,
      outputObjectHash: null,
      outputObjectKey: null,
      outputPublishedAt: null,
      outputVerifiedAt: null
    });
  });

  it.each([
    "runnerHash",
    "codeHash",
    "modelOrPackageHash",
    "configHash",
    "inputManifestHash",
    "featureSchemaHash",
    "targetSchemaHash",
    "outputObjectHash",
    "outputObjectKey"
  ] as const)("withholds a requested forecast when %s is missing", (field) => {
    const incomplete = { ...provenance(), [field]: undefined };
    const record = published(forecastInput({ provenance: incomplete }));
    expect(record.status).toBe("withheld");
    expect(record.withholdingReason).toBe("provenance_incomplete");
    expect(record.provenance).toBeNull();
  });

  it.each([
    "runnerHash",
    "codeHash",
    "modelOrPackageHash",
    "configHash",
    "inputManifestHash",
    "featureSchemaHash",
    "targetSchemaHash",
    "outputObjectHash"
  ] as const)("withholds a requested forecast when %s mismatches qualification", (field) => {
    const actual = provenance({ [field]: "a".repeat(64) });
    const record = published(forecastInput({ provenance: actual }));
    expect(record.status).toBe("withheld");
    expect(record.withholdingReason).toBe("package_hash_mismatch");
    expect(record.provenance).toBeNull();
  });

  it("withholds when pointer metadata or exact output bytes do not match", () => {
    const wrongKey = published(forecastInput({
      provenance: provenance({ outputObjectKey: `forecast-output/sha256/${"a".repeat(64)}` })
    }));
    expect(wrongKey.withholdingReason).toBe("package_hash_mismatch");

    const wrongBytes = published(forecastInput({
      outputBytes: new TextEncoder().encode("different bytes")
    }));
    expect(wrongBytes.withholdingReason).toBe("package_hash_mismatch");
  });

  it.each([
    ["weekly_tuesday_0730", 600],
    ["kickoff_minus_120", 600],
    ["kickoff_minus_90", 600],
    ["kickoff_minus_60", 600],
    ["kickoff_minus_15", 300]
  ] as const)("uses the strict frozen deadline for %s", (horizonId, capSeconds) => {
    const scheduledForUtc = "2026-09-13T19:00:00.000Z";
    const kickoffUtc = "2026-09-13T22:00:00.000Z";
    const deadline = forecastLedgerPersistenceDeadline({ horizonId, scheduledForUtc, kickoffUtc });
    expect(deadline).toBe(new Date(Date.parse(scheduledForUtc) + capSeconds * 1_000).toISOString());

    const record = published(forecastInput({
      origin: origin({ horizonId, scheduledForUtc, kickoffUtc }),
      invokedAt: "2026-09-13T19:00:00.250Z",
      evidenceAt: "2026-09-13T19:00:00.500Z",
      generatedAt: "2026-09-13T19:00:01.000Z",
      persistenceRequestedAt: new Date(Date.parse(deadline) - 1_000).toISOString(),
      persistedAt: deadline,
      authority: authority({ leaseExpiresAt: new Date(Date.parse(deadline) + 90_000).toISOString() })
    }));
    expect(record).toMatchObject({
      status: "withheld",
      withholdingReason: "late_origin_excluded",
      timing: "late",
      prospectiveEvidenceEligible: false,
      forecastEvaluationEligible: false
    });
  });

  it("caps persistence at kickoff minus one second and treats the boundary as nonprospective", () => {
    const deadline = forecastLedgerPersistenceDeadline({
      horizonId: "kickoff_minus_15",
      scheduledForUtc: "2026-09-13T20:04:58.000Z",
      kickoffUtc: "2026-09-13T20:05:00.000Z"
    });
    expect(deadline).toBe("2026-09-13T20:04:59.000Z");
    const record = published(forecastInput({
      origin: origin({
        horizonId: "kickoff_minus_15",
        scheduledForUtc: "2026-09-13T20:04:58.000Z",
        kickoffUtc: "2026-09-13T20:05:00.000Z"
      }),
      invokedAt: "2026-09-13T20:04:58.025Z",
      evidenceAt: "2026-09-13T20:04:58.050Z",
      generatedAt: "2026-09-13T20:04:58.100Z",
      persistenceRequestedAt: "2026-09-13T20:04:58.500Z",
      persistedAt: deadline,
      authority: authority({ leaseExpiresAt: "2026-09-13T20:06:00.000Z" })
    }));
    expect(record.withholdingReason).toBe("late_origin_excluded");
    expect(record.prospectiveEvidenceEligible).toBe(false);
  });

  it("never turns a post-origin activation into a prospective backfill", () => {
    const record = published(forecastInput({
      activatedAt: "2026-09-13T19:05:01.000Z",
      generatedAt: "2026-09-13T19:05:02.000Z"
    }));
    expect(record).toMatchObject({
      status: "withheld",
      withholdingReason: "late_origin_excluded",
      timing: "late",
      prospectiveEvidenceEligible: false
    });
  });

  it("preserves the schedule-unavailable reason for a game discovered after its origin", () => {
    const record = published(forecastInput({
      origin: origin({
        eligible: false,
        eligibilityReason: "known_after_origin"
      })
    }));
    expect(record).toMatchObject({
      status: "withheld",
      withholdingReason: "schedule_unavailable_at_origin",
      timing: "late",
      prospectiveEvidenceEligible: false
    });
  });

  it("labels late activation or incomplete Week 1 coverage as partial-season evidence", () => {
    expect(classifyForecastEvidenceScope({
      activatedAt: "2026-09-08T14:30:00.000Z",
      firstOriginUtc: "2026-09-08T14:30:00.000Z",
      weekOneOriginComplete: true
    })).toBe("full_season_shadow");
    expect(classifyForecastEvidenceScope({
      activatedAt: "2026-09-08T14:30:00.001Z",
      firstOriginUtc: "2026-09-08T14:30:00.000Z",
      weekOneOriginComplete: true
    })).toBe("partial_season_shadow");
    expect(classifyForecastEvidenceScope({
      activatedAt: "2026-09-08T14:30:00.000Z",
      firstOriginUtc: "2026-09-08T14:30:00.000Z",
      weekOneOriginComplete: false
    })).toBe("partial_season_shadow");
    expect(classifyForecastEvidenceScope({
      activatedAt: "2026-09-08T14:30:00.000Z",
      firstOriginUtc: "2026-09-08T14:30:00.001Z",
      weekOneOriginComplete: true
    })).toBe("partial_season_shadow");

    const partial = published(forecastInput({
      activatedAt: "2026-09-09T14:30:00.000Z",
      activationFirstOriginUtc: "2026-09-09T14:30:00.000Z"
    }));
    expect(partial.evidenceScope).toBe("partial_season_shadow");
  });

  it.each([
    ["stale", "required_source_stale"],
    ["partial", "required_source_partial"],
    ["unavailable", "required_source_unavailable"]
  ] as const)("withholds verified output when capture health is %s", (captureHealth, reason) => {
    const record = published(forecastInput({ captureHealth }));
    expect(record.status).toBe("withheld");
    expect(record.withholdingReason).toBe(reason);
    expect(record.provenance).toBeNull();
  });

  it("refuses stale workers, lost fences, expired leases, and superseded origin heads", () => {
    const cases: PrepareForecastLedgerRecordInput[] = [
      forecastInput({ authority: authority({ state: "terminal" }) }),
      forecastInput({ authority: authority({ suppliedFence: 8 }) }),
      forecastInput({ authority: authority({ suppliedAttemptTokenHash: "9".repeat(64) }) }),
      forecastInput({ authority: authority({ leaseExpiresAt: "2026-09-13T19:05:04.000Z" }) }),
      forecastInput({ authority: authority({ isCurrentHead: false }) })
    ];
    for (const candidate of cases) {
      const result = prepareForecastLedgerRecord(candidate);
      expect(result.publishable).toBe(false);
      expect(result.record).toBeNull();
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  it("refuses impossible clock ordering instead of manufacturing evidence", () => {
    const beforeOrigin = prepareForecastLedgerRecord(forecastInput({
      invokedAt: "2026-09-13T19:04:59.000Z"
    }));
    expect(beforeOrigin).toMatchObject({
      publishable: false,
      record: null,
      violations: ["invocation_precedes_origin"]
    });

    const generatedBeforeInvocation = prepareForecastLedgerRecord(forecastInput({
      generatedAt: "2026-09-13T19:05:00.500Z"
    }));
    expect(generatedBeforeInvocation.publishable).toBe(false);
    expect(generatedBeforeInvocation.violations).toContain("generation_precedes_invocation");

    const generatedBeforeEvidence = prepareForecastLedgerRecord(forecastInput({
      evidenceAt: "2026-09-13T19:05:02.500Z"
    }));
    expect(generatedBeforeEvidence.publishable).toBe(false);
    expect(generatedBeforeEvidence.violations).toContain("generation_precedes_evidence");

    const requestBeforeGeneration = prepareForecastLedgerRecord(forecastInput({
      persistenceRequestedAt: "2026-09-13T19:05:01.000Z"
    }));
    expect(requestBeforeGeneration.publishable).toBe(false);
    expect(requestBeforeGeneration.violations).toContain("persistence_request_precedes_generation");

    const databaseBeforeRequest = prepareForecastLedgerRecord(forecastInput({
      persistenceRequestedAt: "2026-09-13T19:05:05.000Z"
    }));
    expect(databaseBeforeRequest.publishable).toBe(false);
    expect(databaseBeforeRequest.violations).toContain("database_persistence_precedes_request");

    const publicationBeforeGeneration = prepareForecastLedgerRecord(forecastInput({
      outputPublishedAt: "2026-09-13T19:05:01.999Z"
    }));
    expect(publicationBeforeGeneration.publishable).toBe(false);
    expect(publicationBeforeGeneration.violations)
      .toContain("output_publication_precedes_generation");

    const verificationBeforePublication = prepareForecastLedgerRecord(forecastInput({
      outputVerifiedAt: "2026-09-13T19:05:02.200Z"
    }));
    expect(verificationBeforePublication.publishable).toBe(false);
    expect(verificationBeforePublication.violations)
      .toContain("output_verification_precedes_publication");

    const persistenceBeforeVerification = prepareForecastLedgerRecord(forecastInput({
      outputVerifiedAt: "2026-09-13T19:05:03.500Z"
    }));
    expect(persistenceBeforeVerification.publishable).toBe(false);
    expect(persistenceBeforeVerification.violations)
      .toContain("persistence_request_precedes_output_verification");

    for (const missingClock of ["outputPublishedAt", "outputVerifiedAt"] as const) {
      const missing = prepareForecastLedgerRecord(forecastInput({ [missingClock]: null }));
      expect(missing.publishable).toBe(false);
      expect(missing.violations).toContain(
        missingClock === "outputPublishedAt"
          ? "output_publication_time_missing"
          : "output_verification_time_missing"
      );
    }
  });

  it("rejects market-bearing inputs and remains independent of odds state", () => {
    const contaminated = {
      ...forecastInput(),
      odds: { spread: -2.5, price: -110 }
    } as PrepareForecastLedgerRecordInput;
    const result = prepareForecastLedgerRecord(contaminated);
    expect(result.publishable).toBe(false);
    expect(result.violations).toEqual([
      "forbidden_market_input:odds",
      "forbidden_market_input:odds.price",
      "forbidden_market_input:odds.spread"
    ]);

    const clean = prepareForecastLedgerRecord(forecastInput());
    expect(clean.publishable).toBe(true);
  });

  it("rejects unknown withholding reasons and inconsistent no-package assertions", () => {
    expect(() => prepareForecastLedgerRecord(forecastInput({
      requestedStatus: "withheld",
      requestedWithholdingReason: "invented_reason" as never,
      qualification: { stream: "no_eligible_package" },
      provenance: null,
      expectedProvenance: null,
      outputBytes: null
    }))).toThrow("approved reason");

    expect(() => prepareForecastLedgerRecord(forecastInput({
      requestedStatus: "withheld",
      requestedWithholdingReason: "no_eligible_package"
    }))).toThrow("requires the no-package qualification stream");
  });

  it("makes duplicate retries converge on one record identity without rewriting content", () => {
    const first = published();
    const duplicate = published();
    expect(duplicate).toEqual(first);

    const retriedLater = published(forecastInput({
      generatedAt: "2026-09-13T19:05:10.000Z",
      outputPublishedAt: "2026-09-13T19:05:10.250Z",
      outputVerifiedAt: "2026-09-13T19:05:10.500Z",
      persistenceRequestedAt: "2026-09-13T19:05:11.000Z",
      persistedAt: "2026-09-13T19:05:12.000Z"
    }));
    expect(retriedLater.recordId).toBe(first.recordId);
    expect(retriedLater.recordHash).not.toBe(first.recordHash);
  });
});
