import archiveManifest from "../../../.planning/engine-os/execution/os-00/r2-archive-manifest.v1.json";

const OPERATOR_PATH = "/__engine-os/evidence-archive/v1/object";
const HEX_64 = /^[a-f0-9]{64}$/;

export interface EvidenceArchiveObjectContract {
  bytes: number;
  sha256: string;
}

export type EvidenceArchiveAllowlist = ReadonlyMap<string, EvidenceArchiveObjectContract>;

const frozenAllowlist: EvidenceArchiveAllowlist = new Map(
  archiveManifest.objects.map((object) => [
    object.r2Key,
    { bytes: object.bytes, sha256: object.sha256 }
  ])
);

export interface EvidenceArchiveOperatorInput {
  request: Request;
  bucket: R2Bucket;
  enabled: boolean;
  expiresAt?: string;
  token?: string;
  now?: Date;
  /** Test-only injection point. Production always uses the frozen tracked manifest. */
  allowedObjects?: EvidenceArchiveAllowlist;
}

function json(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store", ...headers }
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function authorized(request: Request, expectedToken?: string): boolean {
  if (!expectedToken || expectedToken.length < 32) return false;
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice("Bearer ".length), expectedToken);
}

function checksumHex(checksum: ArrayBuffer | undefined): string | null {
  if (!checksum) return null;
  return [...new Uint8Array(checksum)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function verifiedObject(
  object: R2Object,
  expectedKey: string,
  expectedSha256: string,
  expectedBytes?: number
): boolean {
  const storedChecksum = checksumHex(object.checksums.sha256);
  return object.key === expectedKey &&
    object.customMetadata?.sha256 === expectedSha256 &&
    storedChecksum === expectedSha256 &&
    (expectedBytes === undefined || object.size === expectedBytes);
}

function hasActiveFailSafeExpiry(expiresAt: string | undefined, now: Date): boolean {
  const expiry = Date.parse(expiresAt ?? "");
  const remaining = expiry - now.getTime();
  return Number.isFinite(expiry) && remaining > 0 && remaining <= 12 * 60 * 60 * 1000;
}

function objectHeaders(object: R2Object, sha256: string): Headers {
  return new Headers({
    "cache-control": "no-store",
    "content-length": String(object.size),
    "content-type": "application/octet-stream",
    "etag": object.httpEtag,
    "x-content-sha256": sha256,
    "x-engine-os-contract": "engine-os.os-00-r2-archive-operator.v1"
  });
}

export async function handleEvidenceArchiveOperator(
  input: EvidenceArchiveOperatorInput
): Promise<Response | null> {
  const url = new URL(input.request.url);
  if (url.pathname !== OPERATOR_PATH) return null;
  if (!input.enabled || !hasActiveFailSafeExpiry(input.expiresAt, input.now ?? new Date())) {
    return json({ error: "Not found" }, 404);
  }
  if (!authorized(input.request, input.token)) {
    return json({ error: "Unauthorized" }, 401, { "www-authenticate": "Bearer" });
  }

  const key = url.searchParams.get("key") ?? "";
  const allowlist = input.allowedObjects ?? frozenAllowlist;
  const contract = allowlist.get(key);
  if (!contract || !HEX_64.test(contract.sha256) || !key.endsWith(`/${contract.sha256}`)) {
    return json({ error: "Object is not present in the frozen preservation manifest" }, 400);
  }
  const keySha256 = contract.sha256;
  const expectedBytes = contract.bytes;

  if (input.request.method === "HEAD") {
    const object = await input.bucket.head(key);
    if (!object) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    if (!verifiedObject(object, key, keySha256, expectedBytes)) {
      return json({ error: "Stored object failed immutable metadata verification" }, 409);
    }
    return new Response(null, { status: 200, headers: objectHeaders(object, keySha256) });
  }

  if (input.request.method === "GET") {
    const object = await input.bucket.get(key);
    if (!object) return json({ error: "Object not found" }, 404);
    if (!verifiedObject(object, key, keySha256, expectedBytes)) {
      return json({ error: "Stored object failed immutable metadata verification" }, 409);
    }
    return new Response(object.body, { status: 200, headers: objectHeaders(object, keySha256) });
  }

  if (input.request.method !== "PUT") {
    return json({ error: "Method not allowed" }, 405, { allow: "GET, HEAD, PUT" });
  }

  const expectedSha256 = input.request.headers.get("x-content-sha256") ?? "";
  if (!HEX_64.test(expectedSha256) || expectedSha256 !== keySha256) {
    return json({ error: "Content digest does not match the object key" }, 400);
  }
  const rawLength = input.request.headers.get("content-length") ?? "";
  const suppliedBytes = Number(rawLength);
  if (!Number.isSafeInteger(suppliedBytes) || suppliedBytes !== expectedBytes || expectedBytes <= 0 ||
      expectedBytes > 100_000_000) {
    return json({ error: "Content length does not match the frozen preservation manifest" }, 400);
  }
  if (!input.request.body) return json({ error: "Object body is required" }, 400);

  const existing = await input.bucket.head(key);
  if (existing) {
    if (!verifiedObject(existing, key, expectedSha256, expectedBytes)) {
      return json({ error: "Immutable object key already contains different evidence" }, 409);
    }
    return json({ status: "deduplicated", key, sha256: expectedSha256, bytes: expectedBytes });
  }

  const stored = await input.bucket.put(key, input.request.body, {
    onlyIf: new Headers({ "if-none-match": "*" }),
    sha256: expectedSha256,
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: {
      sha256: expectedSha256,
      contract: "engine-os.os-00-r2-archive-object.v1",
      state: "immutable"
    }
  });
  if (!stored) {
    const winner = await input.bucket.head(key);
    if (!winner || !verifiedObject(winner, key, expectedSha256, expectedBytes)) {
      return json({ error: "Concurrent immutable object write did not verify" }, 409);
    }
    return json({ status: "deduplicated", key, sha256: expectedSha256, bytes: expectedBytes });
  }
  if (!verifiedObject(stored, key, expectedSha256, expectedBytes)) {
    return json({ error: "R2 did not return the required checksum evidence" }, 503);
  }
  const persisted = await input.bucket.head(key);
  if (!persisted || !verifiedObject(persisted, key, expectedSha256, expectedBytes)) {
    return json({ error: "Stored evidence did not survive read-after-write verification" }, 503);
  }
  return json({ status: "stored", key, sha256: expectedSha256, bytes: expectedBytes }, 201);
}

export const evidenceArchiveOperatorContract = {
  path: OPERATOR_PATH,
  allowedKeyFamilies: [
    "model-lab/raw/sha256/{sha256}",
    "model-lab/raw/index/sha256/{sha256}",
    "experiments/{experimentId}/sha256/{sha256}",
    "raw/nfl/official-gamebook/sha256/{sha256}"
  ],
  allowedObjectCount: archiveManifest.objectCount,
  manifestSchema: archiveManifest.schemaVersion,
  maxObjectBytes: 100_000_000,
  publicByDefault: false,
  maximumActivationHours: 12,
  deleteAllowed: false
} as const;
