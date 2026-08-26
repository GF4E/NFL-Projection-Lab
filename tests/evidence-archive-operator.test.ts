import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type EvidenceArchiveAllowlist,
  evidenceArchiveOperatorContract,
  handleEvidenceArchiveOperator
} from "@/server/engine-os/evidence-archive-operator";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function checksum(digest: string): ArrayBuffer {
  return Uint8Array.from(Buffer.from(digest, "hex")).buffer;
}

class MemoryR2 {
  private readonly objects = new Map<string, { bytes: Uint8Array; object: R2Object }>();

  async head(key: string): Promise<R2Object | null> {
    return this.objects.get(key)?.object ?? null;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(stored.bytes);
        controller.close();
      }
    });
    return {
      ...stored.object,
      body,
      bodyUsed: false,
      arrayBuffer: async () => stored.bytes.slice().buffer as ArrayBuffer,
      text: async () => new TextDecoder().decode(stored.bytes),
      json: async () => JSON.parse(new TextDecoder().decode(stored.bytes)),
      blob: async () => new Blob([stored.bytes.slice().buffer as ArrayBuffer])
    } as R2ObjectBody;
  }

  async put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: R2PutOptions): Promise<R2Object | null> {
    if (this.objects.has(key)) return null;
    let bytes: Uint8Array;
    if (value instanceof ReadableStream) {
      const chunks: Uint8Array[] = [];
      const reader = value.getReader();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        chunks.push(next.value);
      }
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else if (typeof value === "string") {
      bytes = new TextEncoder().encode(value);
    } else if (value instanceof Blob) {
      bytes = new Uint8Array(await value.arrayBuffer());
    } else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value);
    } else {
      bytes = new Uint8Array();
    }
    const digest = sha256(bytes);
    if (options?.sha256 !== digest) throw new Error("synthetic checksum mismatch");
    const object = {
      key,
      version: "v1",
      size: bytes.byteLength,
      etag: digest,
      httpEtag: `"${digest}"`,
      uploaded: new Date("2026-08-26T00:00:00.000Z"),
      httpMetadata: options?.httpMetadata ?? {},
      customMetadata: options?.customMetadata ?? {},
      checksums: { sha256: checksum(digest) },
      storageClass: "Standard",
      writeHttpMetadata() {}
    } as unknown as R2Object;
    this.objects.set(key, { bytes, object });
    return object;
  }
}

const token = "test-token-with-at-least-thirty-two-bytes";
const activeWindow = {
  now: new Date("2026-08-26T16:00:00.000Z"),
  expiresAt: "2026-08-26T17:00:00.000Z"
};

function request(method: string, key: string, bytes?: Uint8Array, overrides?: HeadersInit): Request {
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (bytes) {
    headers.set("content-length", String(bytes.byteLength));
    headers.set("x-content-sha256", sha256(bytes));
  }
  new Headers(overrides).forEach((value, name) => headers.set(name, value));
  return new Request(
    `https://example.test${evidenceArchiveOperatorContract.path}?key=${encodeURIComponent(key)}`,
    {
      method,
      headers,
      body: bytes
        ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        : undefined
    }
  );
}

function allow(key: string, bytes: Uint8Array): EvidenceArchiveAllowlist {
  return new Map([[key, { bytes: bytes.byteLength, sha256: sha256(bytes) }]]);
}

describe("OS-00 evidence archive operator", () => {
  it("stays absent unless the one-shot gate is enabled", async () => {
    const bytes = new TextEncoder().encode("evidence");
    const digest = sha256(bytes);
    const response = await handleEvidenceArchiveOperator({
      request: request("PUT", `model-lab/raw/sha256/${digest}`, bytes),
      bucket: new MemoryR2() as unknown as R2Bucket,
      enabled: false,
      ...activeWindow,
      token,
      allowedObjects: allow(`model-lab/raw/sha256/${digest}`, bytes)
    });
    expect(response?.status).toBe(404);
  });

  it("requires the secret and a content-addressed allowlisted key", async () => {
    const bytes = new TextEncoder().encode("evidence");
    const digest = sha256(bytes);
    const bucket = new MemoryR2();
    const unauthorized = await handleEvidenceArchiveOperator({
      request: new Request(
        `https://example.test${evidenceArchiveOperatorContract.path}?key=model-lab/raw/sha256/${digest}`,
        { method: "HEAD" }
      ),
      bucket: bucket as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects: allow(`model-lab/raw/sha256/${digest}`, bytes)
    });
    expect(unauthorized?.status).toBe(401);
    const invalid = await handleEvidenceArchiveOperator({
      request: request("PUT", `arbitrary/${digest}`, bytes),
      bucket: bucket as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects: allow(`model-lab/raw/sha256/${digest}`, bytes)
    });
    expect(invalid?.status).toBe(400);
  });

  it("stores with SHA-256 enforcement, streams it back, and deduplicates", async () => {
    const bytes = new TextEncoder().encode("immutable evidence bytes");
    const digest = sha256(bytes);
    const key = `experiments/module2.2026-08-25.8/sha256/${digest}`;
    const allowedObjects = allow(key, bytes);
    const bucket = new MemoryR2();
    const first = await handleEvidenceArchiveOperator({
      request: request("PUT", key, bytes),
      bucket: bucket as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects
    });
    expect(first?.status).toBe(201);
    expect(await first?.json()).toMatchObject({ status: "stored", sha256: digest, bytes: bytes.length });

    const duplicate = await handleEvidenceArchiveOperator({
      request: request("PUT", key, bytes),
      bucket: bucket as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects
    });
    expect(duplicate?.status).toBe(200);
    expect(await duplicate?.json()).toMatchObject({ status: "deduplicated" });

    const head = await handleEvidenceArchiveOperator({
      request: request("HEAD", key),
      bucket: bucket as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects
    });
    expect(head?.headers.get("x-content-sha256")).toBe(digest);
    expect(head?.headers.get("content-length")).toBe(String(bytes.length));

    const get = await handleEvidenceArchiveOperator({
      request: request("GET", key),
      bucket: bucket as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects
    });
    expect(new Uint8Array(await get!.arrayBuffer())).toEqual(bytes);
  });

  it("rejects a digest mismatch and has no delete operation", async () => {
    const bytes = new TextEncoder().encode("evidence");
    const digest = sha256(bytes);
    const key = `raw/nfl/official-gamebook/sha256/${digest}`;
    const allowedObjects = allow(key, bytes);
    const bucket = new MemoryR2();
    const mismatch = await handleEvidenceArchiveOperator({
      request: request("PUT", key, bytes, { "x-content-sha256": "0".repeat(64) }),
      bucket: bucket as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects
    });
    expect(mismatch?.status).toBe(400);
    const deletion = await handleEvidenceArchiveOperator({
      request: request("DELETE", key),
      bucket: bucket as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects
    });
    expect(deletion?.status).toBe(405);
  });

  it("rejects a valid-looking key and byte count that are absent from the exact manifest", async () => {
    const bytes = new TextEncoder().encode("unlisted evidence");
    const digest = sha256(bytes);
    const key = `model-lab/raw/sha256/${digest}`;
    const response = await handleEvidenceArchiveOperator({
      request: request("PUT", key, bytes),
      bucket: new MemoryR2() as unknown as R2Bucket,
      enabled: true,
      ...activeWindow,
      token,
      allowedObjects: new Map()
    });
    expect(response?.status).toBe(400);
  });

  it("fails closed when the one-shot activation has expired or has no expiry", async () => {
    const bytes = new TextEncoder().encode("evidence");
    const digest = sha256(bytes);
    const key = `model-lab/raw/sha256/${digest}`;
    const base = {
      request: request("HEAD", key),
      bucket: new MemoryR2() as unknown as R2Bucket,
      enabled: true,
      token,
      allowedObjects: allow(key, bytes),
      now: activeWindow.now
    };
    expect((await handleEvidenceArchiveOperator(base))?.status).toBe(404);
    expect((await handleEvidenceArchiveOperator({
      ...base,
      expiresAt: "2026-08-26T15:59:59.000Z"
    }))?.status).toBe(404);
    expect((await handleEvidenceArchiveOperator({
      ...base,
      expiresAt: "2026-08-27T05:00:01.000Z"
    }))?.status).toBe(404);
  });
});
