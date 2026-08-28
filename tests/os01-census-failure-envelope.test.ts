import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CensusFailureEnvelopePublisher,
  censusFailurePath,
  readCensusFailureEnvelopeBinding,
  type CensusFailureEnvelope,
  type CensusResponseEvidence
} from "../scripts/os01-census-failure-envelope";
import { OperatorClient } from "../scripts/run_os01_production_census";

const temporaryDirectories: string[] = [];
const reservationHash = "a".repeat(64);
const buildAttestation = "b".repeat(64);
const censusToken = "c".repeat(64);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function outputPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "os01-census-failure-"));
  temporaryDirectories.push(directory);
  return join(directory, "census-receipt.json");
}

function readEnvelope(output: string): CensusFailureEnvelope {
  return JSON.parse(readFileSync(censusFailurePath(output), "utf8")) as CensusFailureEnvelope;
}

async function serverFor(response: () => {
  status: number;
  contentType: string;
  body: string | Uint8Array;
  requestId?: string;
}): Promise<{ endpoint: string; close: () => Promise<void> }> {
  const server: Server = createServer((_incoming, outgoing) => {
    const value = response();
    outgoing.statusCode = value.status;
    outgoing.setHeader("content-type", value.contentType);
    if (value.requestId) outgoing.setHeader("x-request-id", value.requestId);
    outgoing.end(value.body);
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/_ops/engine-os/os01-census-v1`,
    close: () => new Promise<void>((resolveClose, reject) =>
      server.close((error) => error ? reject(error) : resolveClose())
    )
  };
}

function diagnosticClient(endpoint: string, output: string, passNumber: 1 | 2 = 1): OperatorClient {
  return new OperatorClient(
    { endpoint, censusToken },
    buildAttestation,
    undefined,
    Date.now() + 5_000,
    {
      publisher: new CensusFailureEnvelopePublisher({ output, reservationHash }),
      passNumber
    }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("OS-01 census failure envelope", () => {
  it("records a transport failure without recording an endpoint, exception, or request bytes", async () => {
    const temporary = await serverFor(() => ({ status: 200, contentType: "application/json", body: "{}" }));
    const endpoint = temporary.endpoint;
    await temporary.close();
    const output = outputPath();
    await expect(diagnosticClient(endpoint, output).call({
      operation: "begin",
      passNonce: "d".repeat(32)
    })).rejects.toThrow();

    const envelope = readEnvelope(output);
    expect(envelope.failure).toMatchObject({
      requestOrdinal: 1,
      passNumber: 1,
      operation: "begin",
      stage: "transport",
      outcomeCategory: "transport_failure",
      httpStatus: null,
      contentTypeClass: "absent",
      responseByteLength: null,
      responseSha256: null,
      canonicalJsonErrorCode: null,
      requestIdHash: null,
      responseReceivedAt: null
    });
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(endpoint);
    expect(serialized).not.toContain("ECONNREFUSED");
    expect(serialized).not.toContain(censusToken);
  });

  it("canonicalizes 404, 405, and 500 responses and hashes request identifiers", async () => {
    const cases = [
      { status: 404, error: "not_found" },
      { status: 405, error: "method_not_allowed" },
      { status: 500, error: "census_failed" }
    ];
    for (const testCase of cases) {
      const rawRequestId = `request-${testCase.status}-raw`;
      const body = JSON.stringify({ error: testCase.error });
      const server = await serverFor(() => ({
        status: testCase.status,
        contentType: "application/json; charset=utf-8",
        body,
        requestId: rawRequestId
      }));
      const output = outputPath();
      try {
        await expect(diagnosticClient(server.endpoint, output).call({
          operation: "begin",
          passNonce: "e".repeat(32)
        })).rejects.toThrow();
        const envelope = readEnvelope(output);
        expect(envelope.failure).toMatchObject({
          stage: "http_status",
          outcomeCategory: "http_error",
          httpStatus: testCase.status,
          contentTypeClass: "canonical_json",
          responseByteLength: Buffer.byteLength(body),
          responseSha256: sha256(body),
          canonicalJsonErrorCode: testCase.error
        });
        expect(envelope.failure.requestIdHash).toMatch(/^[a-f0-9]{64}$/u);
        expect(JSON.stringify(envelope)).not.toContain(rawRequestId);
      } finally {
        await server.close();
      }
    }
  });

  it("distinguishes non-JSON content from invalid JSON without retaining either body", async () => {
    const cases = [
      {
        contentType: "text/plain",
        body: "RAW_NON_JSON_BODY_SENTINEL",
        stage: "response_content_type",
        outcome: "response_content_type_failure"
      },
      {
        contentType: "application/json",
        body: "{RAW_INVALID_JSON_SENTINEL",
        stage: "response_json",
        outcome: "response_json_failure"
      }
    ] as const;
    for (const testCase of cases) {
      const server = await serverFor(() => ({
        status: 500,
        contentType: testCase.contentType,
        body: testCase.body
      }));
      const output = outputPath();
      try {
        await expect(diagnosticClient(server.endpoint, output).call({
          operation: "begin",
          passNonce: "f".repeat(32)
        })).rejects.toThrow();
        const envelope = readEnvelope(output);
        expect(envelope.failure).toMatchObject({
          stage: testCase.stage,
          outcomeCategory: testCase.outcome,
          responseByteLength: Buffer.byteLength(testCase.body),
          responseSha256: sha256(testCase.body),
          canonicalJsonErrorCode: null
        });
        expect(JSON.stringify(envelope)).not.toContain(testCase.body);
      } finally {
        await server.close();
      }
    }
  });

  it("preserves the closed oversize failure when stream cancellation rejects", async () => {
    const rawCancellation = "RAW_CANCEL_EXCEPTION_SENTINEL";
    const oversizedBody = new Uint8Array(1_048_577);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversizedBody);
      },
      cancel() {
        return Promise.reject(new Error(rawCancellation));
      }
    });
    vi.stubGlobal("fetch", async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const output = outputPath();

    await expect(diagnosticClient("https://example.invalid/census", output).call({
      operation: "begin",
      passNonce: "9".repeat(32)
    })).rejects.toThrow(/byte limit/u);

    const envelope = readEnvelope(output);
    expect(envelope.failure).toMatchObject({
      stage: "response_body",
      outcomeCategory: "response_body_failure",
      httpStatus: 200,
      responseByteLength: oversizedBody.byteLength,
      responseSha256: sha256(oversizedBody)
    });
    expect(JSON.stringify(envelope)).not.toContain(rawCancellation);
  });

  it("records a successful-HTTP protocol mismatch without exposing response fields", async () => {
    const rawBody = JSON.stringify({ unexpected: "RAW_PROTOCOL_SENTINEL" });
    const server = await serverFor(() => ({
      status: 200,
      contentType: "application/json",
      body: rawBody
    }));
    const output = outputPath();
    try {
      await expect(diagnosticClient(server.endpoint, output).call({
        operation: "begin",
        passNonce: "1".repeat(32)
      })).rejects.toThrow(/operator response contains unexpected fields/u);
      const envelope = readEnvelope(output);
      expect(envelope.failure).toMatchObject({
        stage: "response_protocol",
        outcomeCategory: "protocol_mismatch",
        httpStatus: 200,
        responseByteLength: Buffer.byteLength(rawBody),
        responseSha256: sha256(rawBody)
      });
      expect(JSON.stringify(envelope)).not.toContain("RAW_PROTOCOL_SENTINEL");
    } finally {
      await server.close();
    }
  });

  it("binds a later schema-object validation failure to the last verified response observation", () => {
    const output = outputPath();
    let tick = 0;
    const publisher = new CensusFailureEnvelopePublisher({
      output,
      reservationHash,
      clock: () => new Date(Date.UTC(2026, 7, 28, 20, 0, tick++)).toISOString()
    });
    const context = publisher.beginRequest(2, "schema_object");
    const evidence: CensusResponseEvidence = {
      httpStatus: 200,
      contentTypeClass: "canonical_json",
      responseByteLength: 321,
      responseSha256: "2".repeat(64),
      canonicalJsonErrorCode: null,
      requestIdHash: "3".repeat(64),
      responseReceivedAt: "2026-08-28T20:00:01.000Z"
    };
    publisher.observeResponse(context, evidence);
    publisher.publishAfterValidatedResponse({
      passNumber: 2,
      stage: "second_pass_schema",
      outcomeCategory: "schema_validation_failure"
    });

    expect(readEnvelope(output).failure).toEqual(expect.objectContaining({
      requestOrdinal: 1,
      passNumber: 2,
      operation: "schema_object",
      stage: "second_pass_schema",
      outcomeCategory: "schema_validation_failure",
      ...evidence
    }));
  });

  it("uses only the exact closed redacted schema and maps unknown JSON errors to an enum", async () => {
    const rawRequestId = "RAW_REQUEST_ID_SENTINEL";
    const rawBody = JSON.stringify({
      error: "RAW_ERROR_CODE_SENTINEL",
      exception: "RAW_EXCEPTION_SENTINEL",
      url: "https://example.invalid/path?RAW_QUERY_SENTINEL=1"
    });
    const server = await serverFor(() => ({
      status: 500,
      contentType: "application/json",
      body: rawBody,
      requestId: rawRequestId
    }));
    const output = outputPath();
    try {
      await expect(diagnosticClient(server.endpoint, output).call({
        operation: "begin",
        passNonce: "4".repeat(32)
      })).rejects.toThrow();
      const envelope = readEnvelope(output);
      expect(Object.keys(envelope).sort()).toEqual([
        "failure",
        "failureEnvelopeHash",
        "providerRequests",
        "providerSecretReads",
        "quotaReservations",
        "reservationHash",
        "status",
        "version"
      ]);
      expect(Object.keys(envelope.failure).sort()).toEqual([
        "canonicalJsonErrorCode",
        "contentTypeClass",
        "failedAt",
        "httpStatus",
        "operation",
        "outcomeCategory",
        "passNumber",
        "requestIdHash",
        "requestOrdinal",
        "requestStartedAt",
        "responseByteLength",
        "responseReceivedAt",
        "responseSha256",
        "stage"
      ]);
      expect(envelope.failure.canonicalJsonErrorCode).toBe("unrecognized");
      const serialized = JSON.stringify(envelope);
      for (const raw of [rawRequestId, "RAW_ERROR_CODE_SENTINEL", "RAW_EXCEPTION_SENTINEL", "RAW_QUERY_SENTINEL"]) {
        expect(serialized).not.toContain(raw);
      }
    } finally {
      await server.close();
    }
  });

  it("publishes once, returns the same binding on repeats, and never overwrites existing bytes", () => {
    const output = outputPath();
    const publisher = new CensusFailureEnvelopePublisher({ output, reservationHash });
    const context = publisher.beginRequest(1, "begin");
    const first = publisher.publishRequestFailure({
      context,
      stage: "transport",
      outcomeCategory: "transport_failure"
    });
    const bytes = readFileSync(censusFailurePath(output));
    const repeated = publisher.publishRequestFailure({
      context,
      stage: "response_protocol",
      outcomeCategory: "protocol_mismatch"
    });
    expect(repeated).toEqual(first);
    expect(readFileSync(censusFailurePath(output))).toEqual(bytes);
    expect(() => new CensusFailureEnvelopePublisher({ output, reservationHash }))
      .toThrow(/path already exists/u);
    expect(readFileSync(censusFailurePath(output))).toEqual(bytes);
  });

  it("verifies canonical and byte hashes for rejection-receipt binding and rejects tampering", () => {
    const output = outputPath();
    const publisher = new CensusFailureEnvelopePublisher({ output, reservationHash });
    const context = publisher.beginRequest(1, "foundation");
    const published = publisher.publishRequestFailure({
      context,
      stage: "transport",
      outcomeCategory: "transport_failure"
    });
    expect(readCensusFailureEnvelopeBinding(output)).toEqual(published);

    const envelope = readEnvelope(output);
    writeFileSync(censusFailurePath(output), `${JSON.stringify({
      ...envelope,
      failure: { ...envelope.failure, httpStatus: 500 }
    })}\n`, "utf8");
    expect(() => readCensusFailureEnvelopeBinding(output)).toThrow();
  });
});
