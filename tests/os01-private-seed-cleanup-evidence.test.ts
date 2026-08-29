import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  validateBindingObservation,
  validateCleanupHttpObservations,
  validateProviderStateObservation,
  validateSourceRestorationObservation
} from "../scripts/run_os01_private_seed_session";

const origin = "https://cleanup.example.test";
const route = "/api/internal/os01-production-census";
const cleanCommit = "e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd";

function hash(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const quotaStateRoot = createHash("sha256").update(JSON.stringify({
  lastCost: 0,
  outstandingReservations: 0,
  projectionComplete: true,
  remaining: 462,
  source: "production_d1_read_only_quota_metadata",
  used: 38
})).digest("hex");

function http(name: string, method: string, url: string, status: number, observedAt: string) {
  const body = Buffer.from(`${name}-body`, "utf8");
  return {
    name,
    method,
    url,
    status,
    observedAt,
    bodyBase64: body.toString("base64"),
    bodySha256: hash(body)
  };
}

describe("OS-01 private-seed cleanup evidence", () => {
  it("requires fresh exact HTTP responses and scans their decoded bytes", () => {
    const now = Date.now();
    const observedAt = new Date(now).toISOString();
    const scanned: string[] = [];
    const result = validateCleanupHttpObservations({
      value: [
        http("sunday", "GET", `${origin}/sunday`, 200, observedAt),
        http("census_get", "GET", `${origin}${route}`, 404, observedAt),
        http("census_post", "POST", `${origin}${route}`, 405, observedAt)
      ],
      origin,
      censusRoute: route,
      notBeforeMs: now - 1_000,
      notAfterMs: now + 1_000,
      scan: (_bytes, label) => scanned.push(label)
    });
    expect(result).toHaveLength(3);
    expect(scanned).toHaveLength(3);
    expect(() => validateCleanupHttpObservations({
      value: [
        http("sunday", "GET", `${origin}/sunday`, 201, observedAt),
        http("census_get", "GET", `${origin}${route}`, 404, observedAt),
        http("census_post", "POST", `${origin}${route}`, 405, observedAt)
      ],
      origin,
      censusRoute: route,
      notBeforeMs: now - 1_000,
      notAfterMs: now + 1_000,
      scan: () => undefined
    })).toThrow(/response observation is invalid/u);
  });

  it("rejects stale projections and binds exact D1, R2, and quota metadata", () => {
    const now = Date.now();
    const observedAt = new Date(now).toISOString();
    const interval = { notBeforeMs: now - 1_000, notAfterMs: now + 1_000 };
    expect(validateBindingObservation({
      observedAt,
      projectId: "project",
      projectionComplete: true,
      d1Bindings: ["DB"],
      r2Bindings: ["EVIDENCE"]
    }, { projectId: "project", ...interval })).toMatchObject({ d1Bindings: ["DB"], r2Bindings: ["EVIDENCE"] });
    expect(validateProviderStateObservation({
      observedAt,
      source: "production_d1_read_only_quota_metadata",
      projectionComplete: true,
      stateRoot: quotaStateRoot,
      used: 38,
      remaining: 462,
      lastCost: 0,
      outstandingReservations: 0
    }, interval)).toMatchObject({ used: 38, remaining: 462, outstandingReservations: 0 });
    const stale = new Date(now - 700_000).toISOString();
    expect(() => validateProviderStateObservation({
      observedAt: stale,
      source: "production_d1_read_only_quota_metadata",
      projectionComplete: true,
      stateRoot: quotaStateRoot,
      used: 38,
      remaining: 462,
      lastCost: 0,
      outstandingReservations: 0
    }, { notBeforeMs: now - 800_000, notAfterMs: now })).toThrow(/not fresh/u);
  });

  it("requires compare-and-swap restoration from the temporary deployment head", () => {
    const now = Date.now();
    const observedAt = new Date(now).toISOString();
    const deploymentCommit = "7".repeat(40);
    const deploymentTreeObjectId = "8".repeat(40);
    const cleanTreeObjectId = "9".repeat(40);
    const value = {
      observedAt,
      branch: "main",
      preRestoreHead: deploymentCommit,
      preRestoreTreeObjectId: deploymentTreeObjectId,
      expectedOldHead: deploymentCommit,
      restoredHead: cleanCommit,
      postRestoreHead: cleanCommit,
      postRestoreTreeObjectId: cleanTreeObjectId,
      compareAndSwapApplied: true,
      projectionComplete: true
    };
    expect(validateSourceRestorationObservation(value, {
      deploymentCommit,
      deploymentTreeObjectId,
      cleanTreeObjectId,
      notBeforeMs: now - 1_000,
      notAfterMs: now + 1_000
    })).toMatchObject({ restoredHead: cleanCommit, compareAndSwapApplied: true });
    expect(() => validateSourceRestorationObservation({
      ...value,
      expectedOldHead: "8".repeat(40)
    }, {
      deploymentCommit,
      deploymentTreeObjectId,
      cleanTreeObjectId,
      notBeforeMs: now - 1_000,
      notAfterMs: now + 1_000
    })).toThrow(/compare-and-swap boundary/u);
  });
});
