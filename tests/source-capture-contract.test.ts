import { describe, expect, it } from "vitest";
import { sha256Hex, stableHash } from "@/domain/hash";
import {
  OS03A_CAPTURE_CONTRACT_VERSION,
  OS03A_EFFECTIVE_CONTRACT_HASH,
  assertRegisteredCaptureRequest,
  assertSecretFreeCanonicalValue,
  assertSecretFreeCaptureResponse,
  buildCaptureAlertId,
  buildCaptureEventId,
  buildCaptureId,
  buildEventPayloadHash,
  buildEvidenceHash,
  buildManifestExtensionHash,
  buildOs03aCaptureEvidence,
  buildOs03aManifestExtension,
  buildSidecarSha256,
  canonicalizeCaptureRequest,
  getQualificationSourceProfile,
  sourceCaptureKey,
  sourceCaptureQualificationProfiles,
  validateFrozenSourceCaptureContracts,
  verifyOs03aCaptureSidecar,
  type BuildOs03aCaptureEvidenceInput,
  type Os03aCaptureSidecar
} from "@/domain/source-capture-contract";

const encoder = new TextEncoder();

function scheduleInput(
  overrides: Partial<BuildOs03aCaptureEvidenceInput> = {}
): BuildOs03aCaptureEvidenceInput {
  return {
    profileId: "fixture_nflverse_schedule_v1",
    idempotencyKey: "schedule-2026-08-26T23:00:00Z",
    request: canonicalizeCaptureRequest({
      profileId: "fixture_nflverse_schedule_v1",
      url: "https://fixtures.invalid/nflverse/schedule.csv"
    }),
    responseBytes: encoder.encode("game_id,kickoff\n2026_01_DAL_PHI,2026-09-10T20:20:00Z\n"),
    contentType: "text/csv",
    etag: '"schedule-v1"',
    sourceObservedAt: "2026-08-26T22:59:00Z",
    providerPublishedAt: "2026-08-26T22:58:00Z",
    receiptCompletedAt: "2026-08-26T23:00:00Z",
    persistenceRequestedAt: "2026-08-26T23:00:00.100Z",
    responsePersistedAt: "2026-08-26T23:00:00.200Z",
    validFrom: "2026-08-26T22:58:00Z",
    validTo: null,
    sourceSchemaVersion: "nflverse-schedule.fixture.v1",
    usageRights: {
      licenseId: "fixture-license-v1",
      rightsUri: "https://fixtures.invalid/rights",
      retrievedFor: "isolated_qualification",
      redistribution: "private_fixture_only",
      retentionClass: "raw_source_3650_days",
      reviewStatus: "fixture_verified"
    },
    validationState: "usable",
    ...overrides
  };
}

describe("OS-03A frozen source-capture contract", () => {
  it("binds the complete v1-v9 chain and exactly seven fixture-only profiles", () => {
    const validation = validateFrozenSourceCaptureContracts();
    expect(validation.errors).toEqual([]);
    expect(validation.canonicalHashes).toMatchObject({
      "source-capture-contract.2026.1": "168f59411370af79a5303f03f9901989c5ebc324b6b6b88141e94c48ee4fe7ee",
      "source-capture-contract.2026.2": "4ee911763aa4573dabfd984e4ac1890ad25303ae3cfa8440aba16151c4a9f587",
      "source-capture-contract.2026.3": "847feaa7dac17e57d3a2b20aadee60b186faeb36e768ff9e3216d911d6266ff2",
      "source-capture-contract.2026.4": "a16138cd9577c91bbea8cd1dee94bdb9384cf0bc385f2bb24d4b311270750e78",
      "source-capture-contract.2026.5": "2e69bfc5a0cfcb0be613af4d165e2e9f60f3b4183a07c7f52dcd7c6930740e38",
      "source-capture-contract.2026.6": "baa7a206973039de395ce79e33165fe842ffbff124e5a3c806f283815dde10b2",
      "source-capture-contract.2026.7": "9de33c9635ac8ded218bc9f774234e653135964204b5e3699b171536be99e867",
      "source-capture-contract.2026.8": "4829d2dc5713a802210a3e80ad8edb8c1fcf874b41a46414ae6596b701e0951f",
      "source-capture-contract.2026.9": OS03A_EFFECTIVE_CONTRACT_HASH
    });
    expect(sourceCaptureQualificationProfiles).toHaveLength(7);
    expect(sourceCaptureQualificationProfiles.every((profile) => profile.origin === "https://fixtures.invalid")).toBe(true);
    expect(getQualificationSourceProfile("fixture_market_odds_v1")).toMatchObject({
      dataset: "odds",
      requestCredentialMode: "fixture_only"
    });
    expect(() => getQualificationSourceProfile("live_market")).toThrow(/unregistered/i);
  });

  it("canonicalizes only a registered credential-free route", () => {
    const request = canonicalizeCaptureRequest({
      profileId: "fixture_nflverse_schedule_v1",
      url: "https://fixtures.invalid/nflverse/schedule.csv"
    });
    expect(request.url).toBe("https://fixtures.invalid/nflverse/schedule.csv");
    expect(request.publicQuery).toEqual({});
    expect(request.redactedQueryKeys).toEqual([]);
    expect(sourceCaptureKey(getQualificationSourceProfile("fixture_nflverse_schedule_v1"))).toBe(
      "nflverse-fixture:schedule:fixture_nflverse_schedule_v1"
    );

    expect(() => canonicalizeCaptureRequest({
      profileId: "fixture_nflverse_schedule_v1",
      url: "https://fixtures.invalid/nflverse/roster.csv"
    })).toThrow(/registered source route/i);
    expect(() => canonicalizeCaptureRequest({
      profileId: "fixture_nflverse_schedule_v1",
      url: "https://fixtures.invalid/secret/token/schedule.csv"
    })).toThrow(/credential-bearing/i);
    expect(() => canonicalizeCaptureRequest({
      profileId: "fixture_nflverse_schedule_v1",
      url: "https://fixtures.invalid/nflverse/schedule.csv?apiKey=must-not-survive" // secret-scan: allow-fixture
    })).toThrow(/redacted query keys/i);
    expect(() => canonicalizeCaptureRequest({
      profileId: "fixture_nflverse_schedule_v1",
      url: "https://user:pass@fixtures.invalid/nflverse/schedule.csv" // secret-scan: allow-fixture
    })).toThrow(/userinfo/i);
  });

  it("rejects noncanonical and cross-wired persisted request identities", () => {
    const profile = getQualificationSourceProfile("fixture_nflverse_schedule_v1");
    expect(() => assertRegisteredCaptureRequest(profile, {
      method: "get",
      url: "https://fixtures.invalid/nflverse/schedule.csv",
      publicQuery: {},
      redactedQueryKeys: [],
      publicHeaders: {}
    })).toThrow(/uppercase/i);
    expect(() => assertRegisteredCaptureRequest(profile, {
      method: "GET",
      url: "https://fixtures.invalid/nflverse/schedule.csv",
      publicQuery: {},
      redactedQueryKeys: [],
      publicHeaders: { authorization: "redacted" }
    })).toThrow(/forbidden persisted header/i);
    expect(() => assertRegisteredCaptureRequest(profile, {
      method: "GET",
      url: "https://fixtures.invalid/nflverse/schedule.csv",
      publicQuery: {},
      redactedQueryKeys: [],
      publicHeaders: { "x-unregistered": "public" }
    })).toThrow(/unregistered public header/i);
  });

  it("scans textual bytes before persistence and only permits binary PBP fixtures", () => {
    const schedule = getQualificationSourceProfile("fixture_nflverse_schedule_v1");
    expect(() => assertSecretFreeCaptureResponse(
      schedule,
      "text/csv",
      encoder.encode("game_id,kickoff\nfoo,bar\n")
    )).not.toThrow();
    expect(() => assertSecretFreeCaptureResponse(
      schedule,
      "text/csv",
      encoder.encode('{"api_key":"must-not-persist"}')
    )).toThrow(/credential-bearing/i);
    expect(() => assertSecretFreeCaptureResponse(
      schedule,
      "text/csv",
      encoder.encode("Authorization: Bearer abcdefghijkl")
    )).toThrow(/credential-bearing/i);
    for (const key of ["authToken", "idToken", "csrfToken", "clientToken"]) {
      expect(() => assertSecretFreeCanonicalValue({ nested: { [key]: "must-not-persist" } }))
        .toThrow(/credential-bearing/i);
      expect(() => assertSecretFreeCaptureResponse(
        schedule,
        "text/csv",
        encoder.encode(JSON.stringify({ nested: { [key]: "must-not-persist" } }))
      )).toThrow(/credential-bearing/i);
      expect(() => assertSecretFreeCaptureResponse(
        schedule,
        "text/csv",
        encoder.encode(`${key}=must-not-persist`)
      )).toThrow(/credential-bearing/i);
    }

    const pbp = getQualificationSourceProfile("fixture_nflverse_pbp_v1");
    expect(() => assertSecretFreeCaptureResponse(
      pbp,
      "application/gzip",
      new Uint8Array([0x1f, 0x8b, 0x08, 0x00])
    )).not.toThrow();
    expect(() => assertSecretFreeCaptureResponse(
      getQualificationSourceProfile("fixture_market_odds_v1"),
      "application/octet-stream",
      new Uint8Array([1, 2, 3])
    )).toThrow(/content type|binary/i);
  });

  it("uses the frozen identity and evidence formulas exactly", () => {
    const built = buildOs03aCaptureEvidence(scheduleInput());
    const expectedCaptureId = stableHash({
      contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
      provider: "nflverse-fixture",
      dataset: "schedule",
      idempotencyKey: "schedule-2026-08-26T23:00:00Z"
    });
    expect(buildCaptureId({
      provider: "nflverse-fixture",
      dataset: "schedule",
      idempotencyKey: "schedule-2026-08-26T23:00:00Z"
    })).toBe(expectedCaptureId);
    expect(built.sidecar.captureId).toBe(expectedCaptureId);
    expect(built.responseObjectKey).toBe(
      `raw/nflverse-fixture/schedule/sha256/${built.responseSha256}`
    );
    expect(built.sidecarSha256).toBe(sha256Hex(built.sidecarBytes));
    expect(built.sidecarSha256).toBe(buildSidecarSha256(built.sidecar));
    expect(built.sidecarObjectKey).toBe(`manifests/os03a/sha256/${built.sidecarSha256}.json`);

    const sidecar = built.sidecar;
    expect(sidecar.evidenceHash).toBe(buildEvidenceHash({
      contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
      captureId: sidecar.captureId,
      profileId: sidecar.profileId,
      requestHash: sidecar.requestHash,
      responseSha256: sidecar.responseSha256,
      responseBytes: sidecar.responseBytes,
      contentType: sidecar.contentType,
      etag: sidecar.etag,
      sourceObservedAt: sidecar.sourceObservedAt,
      providerPublishedAt: sidecar.providerPublishedAt,
      validFrom: sidecar.validFrom,
      validTo: sidecar.validTo,
      sourceSchemaVersion: sidecar.sourceSchemaVersion,
      usageRightsHash: sidecar.usageRightsHash,
      validationState: sidecar.validationState,
      laterImportHash: sidecar.laterImportHash
    }));
    expect(() => verifyOs03aCaptureSidecar(sidecar)).not.toThrow();
    expect(() => verifyOs03aCaptureSidecar({
      ...sidecar,
      responseBytes: sidecar.responseBytes + 1
    })).toThrow(/evidence hash/i);
    expect(() => verifyOs03aCaptureSidecar({
      ...sidecar,
      unexpected: true
    } as Os03aCaptureSidecar)).toThrow(/frozen schema/i);
  });

  it("excludes retry clocks from evidence identity while retaining them in the sidecar", () => {
    const first = buildOs03aCaptureEvidence(scheduleInput());
    const retry = buildOs03aCaptureEvidence(scheduleInput({
      receiptCompletedAt: "2026-08-26T23:01:00Z",
      persistenceRequestedAt: "2026-08-26T23:01:00.100Z",
      responsePersistedAt: "2026-08-26T23:01:00.200Z"
    }));
    expect(retry.sidecar.captureId).toBe(first.sidecar.captureId);
    expect(retry.sidecar.evidenceHash).toBe(first.sidecar.evidenceHash);
    expect(retry.sidecarSha256).not.toBe(first.sidecarSha256);
  });

  it("requires missing source clocks to be explicit raw-only failures", () => {
    expect(() => buildOs03aCaptureEvidence(scheduleInput({
      sourceObservedAt: null,
      validationState: "usable"
    }))).toThrow(/usable capture|raw_only_schema_invalid/i);

    const rawOnly = buildOs03aCaptureEvidence(scheduleInput({
      sourceObservedAt: null,
      providerPublishedAt: null,
      validationState: "raw_only_schema_invalid"
    }));
    expect(rawOnly.sidecar.failureCodes).toEqual([
      "publication_time_missing",
      "source_time_missing"
    ]);
    expect(rawOnly.sidecar.validationState).toBe("raw_only_schema_invalid");

    expect(() => buildOs03aCaptureEvidence(scheduleInput({
      validationState: "raw_only_http_error",
      failureCodes: []
    }))).toThrow(/explicit frozen failure code/i);
    expect(buildOs03aCaptureEvidence(scheduleInput({
      validationState: "raw_only_http_error",
      failureCodes: ["provider_unavailable"]
    })).sidecar.failureCodes).toEqual(["provider_unavailable"]);
  });

  it("enforces every persistence clock boundary and immutable extension hash", () => {
    const built = buildOs03aCaptureEvidence(scheduleInput());
    const extension = buildOs03aManifestExtension({
      sidecar: built.sidecar,
      sidecarPersistedAt: "2026-08-26T23:00:00.300Z",
      manifestPersistedAt: "2026-08-26T23:00:00.400Z"
    });
    expect(extension.contractHash).toBe(OS03A_EFFECTIVE_CONTRACT_HASH);
    expect(extension.contractVersion).toBe("source-capture-contract.2026.9");
    expect(extension.extensionHash).toBe(buildManifestExtensionHash(extension));
    expect(buildManifestExtensionHash({
      ...extension,
      manifestPersistedAt: "2026-08-26T23:00:01.000Z"
    })).toBe(extension.extensionHash);
    expect(buildManifestExtensionHash({
      ...extension,
      sidecarPersistedAt: "2026-08-26T23:00:00.301Z"
    })).not.toBe(extension.extensionHash);

    expect(() => buildOs03aCaptureEvidence(scheduleInput({
      persistenceRequestedAt: "2026-08-26T22:59:59Z"
    }))).toThrow(/receipt must precede/i);
    expect(() => buildOs03aManifestExtension({
      sidecar: built.sidecar,
      sidecarPersistedAt: "2026-08-26T23:00:00.150Z",
      manifestPersistedAt: "2026-08-26T23:00:00.400Z"
    })).toThrow(/response verification must precede/i);
  });

  it("builds event and alert identities from only the frozen fields", () => {
    const eventPayload = { outcome: "verified", responseBytes: 17 };
    const eventPayloadHash = buildEventPayloadHash(eventPayload);
    expect(eventPayloadHash).toBe(stableHash(eventPayload));
    expect(buildCaptureEventId({
      eventType: "replay_verified",
      attemptToken: "attempt-001",
      captureId: "c".repeat(64),
      eventPayloadHash
    })).toBe(stableHash({
      contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
      eventType: "replay_verified",
      attemptToken: "attempt-001",
      captureId: "c".repeat(64),
      eventPayloadHash
    }));
    expect(buildCaptureAlertId({
      sourceKey: "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
      failureCode: "storage_failure",
      idempotencyKey: "schedule-001"
    })).toBe(stableHash({
      contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
      sourceKey: "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
      failureCode: "storage_failure",
      idempotencyKey: "schedule-001"
    }));
    expect(() => buildEventPayloadHash({ apiKey: "must-not-persist" })).toThrow(/credential-bearing/i);
  });

  it("fails closed for untyped validation states, datasets, attempts, and hashes", () => {
    expect(() => buildOs03aCaptureEvidence(scheduleInput({
      validationState: "invented" as "usable"
    }))).toThrow(/unknown capture validation state/i);
    expect(() => buildCaptureId({
      provider: "nflverse-fixture",
      dataset: "invented" as "schedule",
      idempotencyKey: "identity"
    })).toThrow(/unknown capture dataset/i);
    expect(() => buildCaptureEventId({
      eventType: "replay_verified",
      attemptToken: "has spaces",
      captureId: null,
      eventPayloadHash: "a".repeat(64)
    })).toThrow(/storage-safe/i);
    expect(() => buildCaptureEventId({
      eventType: "replay_verified",
      attemptToken: "attempt-001",
      captureId: null,
      eventPayloadHash: "not-a-hash"
    })).toThrow(/sha-256/i);
    expect(() => buildCaptureEventId({
      eventType: "invented" as "replay_verified",
      attemptToken: "attempt-001",
      captureId: null,
      eventPayloadHash: "a".repeat(64)
    })).toThrow(/unknown capture event type/i);
  });

  it("does not let a caller redirect later imports or smuggle a self hash into a sidecar", () => {
    expect(() => buildOs03aCaptureEvidence(scheduleInput({
      laterImport: { owner: "OS-04", target: "market_raw_snapshot" }
    }))).toThrow(/frozen dataset mapping/i);

    const built = buildOs03aCaptureEvidence(scheduleInput());
    const withPersistenceFields = {
      ...built.sidecar,
      sidecarSha256: "f".repeat(64),
      sidecarPersistedAt: "2099-01-01T00:00:00.000Z",
      manifestPersistedAt: "2099-01-01T00:00:01.000Z"
    } as Os03aCaptureSidecar & Record<string, unknown>;
    expect(buildSidecarSha256(withPersistenceFields)).toBe(built.sidecarSha256);
  });
});
