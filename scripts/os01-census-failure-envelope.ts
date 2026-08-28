import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { publishEvidenceBytesExclusive } from "./os01-atomic-evidence";

export const OS01_CENSUS_FAILURE_FILENAME = "census-failure.json";
const VERSION = "os01-census-failure-envelope.2026.1" as const;
const STATUS = "failed_after_reservation" as const;

export const CENSUS_FAILURE_OPERATIONS = [
  "begin",
  "schema_object",
  "table_start",
  "table_page",
  "table_finish",
  "foundation"
] as const;

export const CENSUS_FAILURE_STAGES = [
  "transport",
  "response_body",
  "response_content_type",
  "response_json",
  "http_status",
  "response_protocol",
  "first_pass_schema",
  "first_pass_content",
  "second_pass_schema",
  "second_pass_content",
  "pass_comparison"
] as const;

export const CENSUS_FAILURE_OUTCOMES = [
  "transport_failure",
  "response_body_failure",
  "response_content_type_failure",
  "response_json_failure",
  "http_error",
  "protocol_mismatch",
  "schema_validation_failure",
  "content_validation_failure",
  "pass_mismatch"
] as const;

export const CENSUS_CONTENT_TYPE_CLASSES = [
  "absent",
  "canonical_json",
  "json_noncanonical",
  "non_json"
] as const;

const CANONICAL_JSON_ERROR_CODES = [
  "bookmark_unavailable",
  "canonical_page_too_large",
  "canonical_row_too_large",
  "census_failed",
  "content_table_not_authorized",
  "continuation_expired",
  "invalid_continuation",
  "invalid_identifier",
  "invalid_limit",
  "invalid_offset",
  "invalid_request",
  "method_not_allowed",
  "non_read_query_rejected",
  "not_found",
  "read_only_violation",
  "request_too_large",
  "response_too_large",
  "schema_object_not_found",
  "table_schema_changed",
  "unexpected_row_count",
  "unsupported_json_value",
  "unsupported_schema_object",
  "unsupported_table_shape",
  "unrecognized"
] as const;

export type CensusFailureOperation = typeof CENSUS_FAILURE_OPERATIONS[number];
export type CensusFailureStage = typeof CENSUS_FAILURE_STAGES[number];
export type CensusFailureOutcome = typeof CENSUS_FAILURE_OUTCOMES[number];
export type CensusContentTypeClass = typeof CENSUS_CONTENT_TYPE_CLASSES[number];
export type CanonicalJsonErrorCode = typeof CANONICAL_JSON_ERROR_CODES[number];
export type CensusPassNumber = 1 | 2;

const OUTCOME_BY_STAGE: Readonly<Record<CensusFailureStage, CensusFailureOutcome>> = Object.freeze({
  transport: "transport_failure",
  response_body: "response_body_failure",
  response_content_type: "response_content_type_failure",
  response_json: "response_json_failure",
  http_status: "http_error",
  response_protocol: "protocol_mismatch",
  first_pass_schema: "schema_validation_failure",
  first_pass_content: "content_validation_failure",
  second_pass_schema: "schema_validation_failure",
  second_pass_content: "content_validation_failure",
  pass_comparison: "pass_mismatch"
});

type ResponseEvidence = {
  httpStatus: number | null;
  contentTypeClass: CensusContentTypeClass;
  responseByteLength: number | null;
  responseSha256: string | null;
  canonicalJsonErrorCode: CanonicalJsonErrorCode | null;
  requestIdHash: string | null;
  responseReceivedAt: string | null;
};

export type CensusRequestContext = {
  requestOrdinal: number;
  passNumber: CensusPassNumber;
  operation: CensusFailureOperation;
  requestStartedAt: string;
};

export type CensusResponseEvidence = ResponseEvidence;

export type CensusFailureEnvelope = {
  version: typeof VERSION;
  status: typeof STATUS;
  reservationHash: string;
  failure: CensusRequestContext & ResponseEvidence & {
    stage: CensusFailureStage;
    failedAt: string;
    outcomeCategory: CensusFailureOutcome;
  };
  providerSecretReads: 0;
  providerRequests: 0;
  quotaReservations: 0;
  failureEnvelopeHash: string;
};

export type CensusFailureEnvelopeBinding = {
  path: string;
  failureEnvelopeHash: string;
  failureEnvelopeBytesSha256: string;
};

type Clock = () => string;
type EvidenceAssertion = (bytes: Uint8Array, label: string) => void;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function canonicalTimestamp(value: string, label: string): string {
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (stableJson(actual) !== stableJson(wanted)) throw new Error(`${label} keys are invalid`);
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${label} is invalid`);
  return value as T[number];
}

export function censusFailurePath(outputInput: string): string {
  const parent = realpathSync(dirname(resolve(outputInput)));
  return resolve(parent, OS01_CENSUS_FAILURE_FILENAME);
}

export function classifyCensusContentType(value: string | null): CensusContentTypeClass {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "") return "absent";
  if (/^application\/json(?:\s*;\s*charset=utf-8)?$/u.test(normalized)) return "canonical_json";
  if (/^(?:application|text)\/[a-z0-9.+-]*json(?:\s*;.*)?$/u.test(normalized)) return "json_noncanonical";
  return "non_json";
}

export function canonicalJsonErrorCode(value: unknown): CanonicalJsonErrorCode | null {
  if (typeof value !== "string") return null;
  return (CANONICAL_JSON_ERROR_CODES as readonly string[]).includes(value)
    ? value as CanonicalJsonErrorCode
    : "unrecognized";
}

export function hashCensusRequestId(headers: Headers): string | null {
  for (const name of ["cf-ray", "x-request-id", "request-id"] as const) {
    const value = headers.get(name);
    if (value !== null && value.length > 0) {
      return sha256(`os01-census-request-id.2026.1\u0000${name}\u0000${value}`);
    }
  }
  return null;
}

export class CensusResponseFailure extends Error {
  readonly stage: CensusFailureStage;
  readonly outcomeCategory: CensusFailureOutcome;
  readonly responseEvidence: CensusResponseEvidence;

  constructor(
    stage: CensusFailureStage,
    outcomeCategory: CensusFailureOutcome,
    responseEvidence: CensusResponseEvidence,
    reason: "body_missing" | "body_read" | "body_oversize" | "content_type" | "json"
  ) {
    super({
      body_missing: "operator response body missing",
      body_read: "operator response body recovery failed",
      body_oversize: "operator response exceeded byte limit",
      content_type: "operator response content type is not canonical JSON",
      json: "operator returned invalid UTF-8 JSON"
    }[reason]);
    this.name = "CensusResponseFailure";
    this.stage = stage;
    this.outcomeCategory = outcomeCategory;
    this.responseEvidence = responseEvidence;
  }
}

export async function readCanonicalCensusJson(
  response: Response,
  maximumBytes: number,
  evidenceScanner?: (bytes: Uint8Array, label: string) => void,
  clock: Clock = () => new Date().toISOString()
): Promise<{ json: Record<string, unknown>; evidence: CensusResponseEvidence }> {
  const receivedAt = canonicalTimestamp(clock(), "response receipt time");
  const contentTypeClass = classifyCensusContentType(response.headers.get("content-type"));
  const base = {
    httpStatus: response.status,
    contentTypeClass,
    canonicalJsonErrorCode: null,
    requestIdHash: hashCensusRequestId(response.headers),
    responseReceivedAt: receivedAt
  } as const;
  if (!response.body) {
    throw new CensusResponseFailure("response_body", "response_body_failure", {
      ...base,
      responseByteLength: 0,
      responseSha256: sha256(new Uint8Array())
    }, "body_missing");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const digest = createHash("sha256");
  let total = 0;
  let scanTail = new Uint8Array(0);
  const scanOverlapBytes = 8_192;
  while (true) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch {
      throw new CensusResponseFailure("response_body", "response_body_failure", {
        ...base,
        responseByteLength: total,
        responseSha256: digest.digest("hex")
      }, "body_read");
    }
    if (result.done) break;
    digest.update(result.value);
    total += result.value.byteLength;
    if (evidenceScanner) {
      const scanWindow = new Uint8Array(scanTail.byteLength + result.value.byteLength);
      scanWindow.set(scanTail, 0);
      scanWindow.set(result.value, scanTail.byteLength);
      try {
        evidenceScanner(scanWindow, "public census response chunk");
      } catch {
        throw new CensusResponseFailure("response_body", "response_body_failure", {
          ...base,
          responseByteLength: total,
          responseSha256: digest.digest("hex")
        }, "body_read");
      }
      scanTail = scanWindow.slice(Math.max(0, scanWindow.byteLength - scanOverlapBytes));
    }
    if (total > maximumBytes) {
      await reader.cancel();
      throw new CensusResponseFailure("response_body", "response_body_failure", {
        ...base,
        responseByteLength: total,
        responseSha256: digest.digest("hex")
      }, "body_oversize");
    }
    chunks.push(result.value);
  }
  const responseSha256 = digest.digest("hex");
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    evidenceScanner?.(joined, "public census response");
  } catch {
    throw new CensusResponseFailure("response_body", "response_body_failure", {
      ...base,
      responseByteLength: total,
      responseSha256
    }, "body_read");
  }
  const common = { ...base, responseByteLength: total, responseSha256 };
  if (contentTypeClass !== "canonical_json") {
    throw new CensusResponseFailure(
      "response_content_type",
      "response_content_type_failure",
      common,
      "content_type"
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch {
    throw new CensusResponseFailure("response_json", "response_json_failure", common, "json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CensusResponseFailure("response_json", "response_json_failure", common, "json");
  }
  const json = parsed as Record<string, unknown>;
  return {
    json,
    evidence: {
      ...common,
      canonicalJsonErrorCode: canonicalJsonErrorCode(json.error)
    }
  };
}

export class CensusFailureEnvelopePublisher {
  private requestOrdinal = 0;
  private lastObservation: (CensusRequestContext & CensusResponseEvidence) | null = null;
  private binding: CensusFailureEnvelopeBinding | null = null;
  private readonly output: string;
  private readonly reservationHash: string;
  private readonly assertEvidence?: EvidenceAssertion;
  private readonly clock: Clock;

  constructor(input: {
    output: string;
    reservationHash: string;
    assertEvidence?: EvidenceAssertion;
    clock?: Clock;
  }) {
    this.output = censusFailurePath(input.output);
    this.reservationHash = requireHash(input.reservationHash, "census reservation hash");
    this.assertEvidence = input.assertEvidence;
    this.clock = input.clock ?? (() => new Date().toISOString());
    if (existsSync(this.output)) throw new Error("census failure envelope path already exists");
  }

  beginRequest(passNumber: CensusPassNumber, operation: CensusFailureOperation): CensusRequestContext {
    this.requestOrdinal += 1;
    return {
      requestOrdinal: this.requestOrdinal,
      passNumber,
      operation,
      requestStartedAt: canonicalTimestamp(this.clock(), "request start time")
    };
  }

  observeResponse(context: CensusRequestContext, evidence: CensusResponseEvidence): void {
    this.lastObservation = { ...context, ...evidence };
  }

  publishRequestFailure(input: {
    context: CensusRequestContext;
    stage: CensusFailureStage;
    outcomeCategory: CensusFailureOutcome;
    responseEvidence?: CensusResponseEvidence;
  }): CensusFailureEnvelopeBinding {
    const evidence = input.responseEvidence ?? {
      httpStatus: null,
      contentTypeClass: "absent" as const,
      responseByteLength: null,
      responseSha256: null,
      canonicalJsonErrorCode: null,
      requestIdHash: null,
      responseReceivedAt: null
    };
    return this.publish({ ...input.context, ...evidence }, input.stage, input.outcomeCategory);
  }

  publishAfterValidatedResponse(input: {
    passNumber: CensusPassNumber;
    stage: CensusFailureStage;
    outcomeCategory: CensusFailureOutcome;
  }): CensusFailureEnvelopeBinding {
    if (this.lastObservation === null || this.lastObservation.passNumber !== input.passNumber) {
      throw new Error("census failure lacks a bound request observation");
    }
    return this.publish(this.lastObservation, input.stage, input.outcomeCategory);
  }

  currentBinding(): CensusFailureEnvelopeBinding | null {
    return this.binding;
  }

  private publish(
    evidence: CensusRequestContext & CensusResponseEvidence,
    stage: CensusFailureStage,
    outcomeCategory: CensusFailureOutcome
  ): CensusFailureEnvelopeBinding {
    if (this.binding !== null) return this.binding;
    if (OUTCOME_BY_STAGE[stage] !== outcomeCategory) {
      throw new Error("census failure stage and outcome are inconsistent");
    }
    const withoutHash = {
      version: VERSION,
      status: STATUS,
      reservationHash: this.reservationHash,
      failure: {
        ...evidence,
        stage,
        failedAt: canonicalTimestamp(this.clock(), "failure time"),
        outcomeCategory
      },
      providerSecretReads: 0 as const,
      providerRequests: 0 as const,
      quotaReservations: 0 as const
    };
    const failureEnvelopeHash = sha256(stableJson(withoutHash));
    const envelope: CensusFailureEnvelope = { ...withoutHash, failureEnvelopeHash };
    const bytes = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    this.assertEvidence?.(bytes, "production census failure envelope");
    publishEvidenceBytesExclusive(this.output, bytes);
    this.binding = Object.freeze({
      path: this.output,
      failureEnvelopeHash,
      failureEnvelopeBytesSha256: sha256(bytes)
    });
    return this.binding;
  }
}

export function readCensusFailureEnvelopeBinding(outputInput: string): CensusFailureEnvelopeBinding | null {
  const path = censusFailurePath(outputInput);
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("census failure envelope JSON is invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("census failure envelope is invalid");
  }
  const envelope = parsed as Record<string, unknown>;
  exactKeys(envelope, [
    "failure", "failureEnvelopeHash", "providerRequests", "providerSecretReads",
    "quotaReservations", "reservationHash", "status", "version"
  ], "census failure envelope");
  if (envelope.version !== VERSION || envelope.status !== STATUS ||
    envelope.providerSecretReads !== 0 || envelope.providerRequests !== 0 || envelope.quotaReservations !== 0) {
    throw new Error("census failure envelope contract is invalid");
  }
  requireHash(envelope.reservationHash, "census failure reservation hash");
  const failure = envelope.failure;
  if (!failure || typeof failure !== "object" || Array.isArray(failure)) {
    throw new Error("census failure event is invalid");
  }
  const event = failure as Record<string, unknown>;
  exactKeys(event, [
    "canonicalJsonErrorCode", "contentTypeClass", "failedAt", "httpStatus", "operation",
    "outcomeCategory", "passNumber", "requestIdHash", "requestOrdinal", "requestStartedAt",
    "responseByteLength", "responseReceivedAt", "responseSha256", "stage"
  ], "census failure event");
  if (!Number.isSafeInteger(event.requestOrdinal) || Number(event.requestOrdinal) < 1 ||
    ![1, 2].includes(Number(event.passNumber))) throw new Error("census failure request identity is invalid");
  enumValue(event.operation, CENSUS_FAILURE_OPERATIONS, "census failure operation");
  const stage = enumValue(event.stage, CENSUS_FAILURE_STAGES, "census failure stage");
  const outcome = enumValue(event.outcomeCategory, CENSUS_FAILURE_OUTCOMES, "census failure outcome");
  if (OUTCOME_BY_STAGE[stage] !== outcome) throw new Error("census failure stage and outcome are inconsistent");
  enumValue(event.contentTypeClass, CENSUS_CONTENT_TYPE_CLASSES, "census content type class");
  const requestStartedAt = canonicalTimestamp(String(event.requestStartedAt), "census request start time");
  const failedAt = canonicalTimestamp(String(event.failedAt), "census failure time");
  const responseReceivedAt = event.responseReceivedAt === null
    ? null
    : canonicalTimestamp(String(event.responseReceivedAt), "census response time");
  if (Date.parse(requestStartedAt) > Date.parse(failedAt) ||
    (responseReceivedAt !== null && (
      Date.parse(responseReceivedAt) < Date.parse(requestStartedAt) ||
      Date.parse(responseReceivedAt) > Date.parse(failedAt)
    ))) throw new Error("census failure timestamps are inconsistent");
  if (event.httpStatus !== null && (!Number.isSafeInteger(event.httpStatus) || Number(event.httpStatus) < 100 || Number(event.httpStatus) > 599)) {
    throw new Error("census failure HTTP status is invalid");
  }
  if (event.responseByteLength !== null && (!Number.isSafeInteger(event.responseByteLength) || Number(event.responseByteLength) < 0)) {
    throw new Error("census failure response byte length is invalid");
  }
  for (const [value, label] of [
    [event.responseSha256, "census response hash"],
    [event.requestIdHash, "census request-id hash"]
  ] as const) if (value !== null) requireHash(value, label);
  if ((event.responseByteLength === null) !== (event.responseSha256 === null)) {
    throw new Error("census failure response length/hash binding is invalid");
  }
  if (responseReceivedAt === null) {
    if (event.httpStatus !== null || event.contentTypeClass !== "absent" ||
      event.responseByteLength !== null || event.responseSha256 !== null ||
      event.canonicalJsonErrorCode !== null || event.requestIdHash !== null) {
      throw new Error("census failure absent-response evidence is invalid");
    }
  } else if (event.httpStatus === null || event.responseByteLength === null || event.responseSha256 === null) {
    throw new Error("census failure response evidence is incomplete");
  }
  if (event.canonicalJsonErrorCode !== null && event.contentTypeClass !== "canonical_json") {
    throw new Error("census failure JSON error evidence is inconsistent");
  }
  if (event.canonicalJsonErrorCode !== null) {
    enumValue(event.canonicalJsonErrorCode, CANONICAL_JSON_ERROR_CODES, "canonical census error code");
  }
  const embedded = requireHash(envelope.failureEnvelopeHash, "census failure envelope hash");
  const withoutHash = { ...envelope };
  delete withoutHash.failureEnvelopeHash;
  if (sha256(stableJson(withoutHash)) !== embedded) throw new Error("census failure envelope hash mismatch");
  return Object.freeze({
    path,
    failureEnvelopeHash: embedded,
    failureEnvelopeBytesSha256: sha256(bytes)
  });
}
