const QUERY_COUNT = 489;
const REQUEST_VERSION = "engine-os.os01-d1-capacity-probe-request.v1";
const RESPONSE_VERSION = "engine-os.os01-d1-capacity-probe-response.v1";
const QUALIFICATION_ID = "os01-capacity-20260829-489-readonly";

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/__engine-os/os01-capacity/v1") {
      return json({ status: "temporary_capacity_probe", active: true }, 404);
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.DB || typeof env.DB.batch !== "function") {
      return json({ error: "d1_binding_unavailable" }, 503);
    }
    let input;
    try {
      input = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (
      !input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).sort().join(",") !== "qualificationId,version" ||
      input.version !== REQUEST_VERSION || input.qualificationId !== QUALIFICATION_ID
    ) {
      return json({ error: "request_identity_mismatch" }, 400);
    }

    const statements = Array.from({ length: QUERY_COUNT }, (_, index) =>
      env.DB.prepare("SELECT ?1 AS ordinal, 1 AS probe").bind(index)
    );
    const startedAt = Date.now();
    try {
      const results = await env.DB.batch(statements);
      const completedAt = Date.now();
      if (!Array.isArray(results) || results.length !== QUERY_COUNT) {
        return json({ error: "incomplete_batch", resultCount: Array.isArray(results) ? results.length : null }, 500);
      }
      const ordinals = results.map((result, index) => {
        const row = result?.results?.[0];
        if (!result?.success || row?.ordinal !== index || row?.probe !== 1) {
          throw new Error(`invalid_result_${index}`);
        }
        return row.ordinal;
      });
      const evidence = {
        version: RESPONSE_VERSION,
        qualificationId: QUALIFICATION_ID,
        queryCount: QUERY_COUNT,
        batchCount: 1,
        resultCount: results.length,
        firstOrdinal: ordinals[0],
        lastOrdinal: ordinals.at(-1),
        elapsedMilliseconds: completedAt - startedAt,
        underThirtySeconds: completedAt - startedAt < 30000,
        databaseMutations: 0,
        providerCalls: 0,
        providerSecretReads: 0,
        captureActivations: 0
      };
      return json({ ...evidence, receiptHash: await digest(JSON.stringify(evidence)) });
    } catch (error) {
      return json({
        version: RESPONSE_VERSION,
        qualificationId: QUALIFICATION_ID,
        status: "blocked",
        error: error instanceof Error ? error.message : "unknown_capacity_failure",
        queryCount: QUERY_COUNT,
        databaseMutations: 0,
        providerCalls: 0,
        providerSecretReads: 0,
        captureActivations: 0
      }, 503);
    }
  }
};

export default worker;
