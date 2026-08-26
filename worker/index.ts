import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { listNflverseImportStates } from "../src/server/nflverse/store";
import { buildDecisionBoard } from "../src/server/decision-board";
import { getPlayerPropBoard } from "../src/server/player-props";
import { getMainlineRecoveryStatus, listOddsAutomationRuns } from "../src/server/odds-automation";
import { listLiveLines, listSnapshotGameIds } from "../src/server/live-line-store";
import { weeklySlate } from "../src/server/weekly-slate";
import { listOfficialInjuryImportStates } from "../src/server/official-injuries/store";
import { listPregameContextStates } from "../src/server/pregame-context/store";
import { runBackgroundMaintenance } from "../src/server/background-maintenance";
import { getConfidenceEngineHealth } from "../src/server/confidence-engine/store";
import { readOnlyD1 } from "../src/server/read-only-d1";
import { qualifyLiveOddsQuota } from "../src/server/engine-os/quota-live-qualification";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  DB: D1Database;
  EVIDENCE: R2Bucket;
  ENGINE_OS_CAPTURE_ENABLED?: string;
  ENGINE_OS_QUOTA_QUALIFICATION_ENABLED?: string;
  ENGINE_OS_QUOTA_QUALIFICATION_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

async function handlePropsRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Public access is read-only" }, 405, { allow: "GET" });
  const gameId = new URL(request.url).searchParams.get("gameId");
  if (!gameId) return json({ error: "gameId is required" }, 400);
  try {
    return json(await getPlayerPropBoard(gameId, env.DB));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to load props" }, 503);
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

function json(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers
    }
  });
}

async function qualificationBearerMatches(request: Request, expected: string): Promise<boolean> {
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const encoder = new TextEncoder();
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const left = new Uint8Array(suppliedHash);
  const right = new Uint8Array(expectedHash);
  let difference = supplied.length === expected.length ? 0 : 1;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

async function handleNflverseRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Public access is read-only" }, 405, { allow: "GET" });
  }

  try {
    return json({ states: await listNflverseImportStates(env.DB) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Automatic nflverse refresh aborted" },
      503
    );
  }
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const readDb = readOnlyD1(env.DB);
    if (url.pathname === "/_ops/engine-os/qualify-odds-quota") {
      if (
        request.method !== "POST" ||
        env.ENGINE_OS_QUOTA_QUALIFICATION_ENABLED !== "true" ||
        !env.ENGINE_OS_QUOTA_QUALIFICATION_TOKEN ||
        !await qualificationBearerMatches(request, env.ENGINE_OS_QUOTA_QUALIFICATION_TOKEN)
      ) {
        return json({ error: "Not found" }, 404);
      }
      try {
        return json(await qualifyLiveOddsQuota(env.DB));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Quota qualification failed" }, 503);
      }
    }
    // Vinext resolves module-level Cloudflare bindings itself, so replacing DB
    // in its handler argument is not a security boundary. Deny every mutating
    // HTTP method before routing and handle every public API path explicitly.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Public access is read-only" }, 405, { allow: "GET, HEAD" });
    }
    // Keep automation control outside the framework router so cron, browser wakeups,
    // and production deployments all reach the same Cloudflare-bound D1 database.
    if (url.pathname === "/api/nflverse") {
      return handleNflverseRequest(request, { ...env, DB: readDb });
    }
    if (url.pathname === "/api/model-lifecycle") {
      return json({ error: "Public access is read-only" }, 405, { allow: "" });
    }
    if (url.pathname === "/api/confidence-engine") {
      if (request.method !== "GET") return json({ error: "Public access is read-only" }, 405, { allow: "GET" });
      try {
        return json(await getConfidenceEngineHealth(readDb));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unable to load confidence-engine health" }, 503);
      }
    }
    if (
      url.pathname === "/api/plays" || url.pathname.startsWith("/api/plays/") ||
      url.pathname === "/api/push-subscription" || url.pathname === "/api/qb-override" ||
      url.pathname === "/api/digest"
    ) {
      return json({ error: "This public analytics site has no accounts or shared records." }, 410);
    }
    if (url.pathname === "/api/decision-board") {
      if (request.method !== "GET") return json({ error: "Public access is read-only" }, 405, { allow: "GET" });
      try {
        const rawWeek = url.searchParams.get("week");
        const week = rawWeek === null ? undefined : Number(rawWeek);
        if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18)) return json({ error: "week must be an integer from 1 through 18" }, 400);
        return json(await buildDecisionBoard(readDb, { week }));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unable to build decision board" }, 503);
      }
    }
    if (url.pathname === "/api/weekly-slate") {
      if (request.method !== "GET") return json({ error: "Public access is read-only" }, 405, { allow: "GET" });
      try {
        const rawWeek = url.searchParams.get("week");
        const week = rawWeek === null ? undefined : Number(rawWeek);
        if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18)) return json({ error: "week must be an integer from 1 through 18" }, 400);
        return json(await weeklySlate({ db: readDb, week }));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unable to load weekly schedule" }, 503);
      }
    }
    if (url.pathname === "/api/props") {
      return handlePropsRequest(request, { ...env, DB: readDb });
    }
    if (url.pathname === "/api/lines") {
      try {
        const rawWeek = url.searchParams.get("week");
        const week = rawWeek === null ? undefined : Number(rawWeek);
        if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18)) {
          return json({ error: "week must be an integer from 1 through 18" }, 400);
        }
        const slate = await weeklySlate({ db: readDb, week });
        const gameIds = slate.games.map((game) => game.id);
        const lines = await listLiveLines(readDb, gameIds);
        const recovery = await getMainlineRecoveryStatus({ db: readDb, lineCount: lines.length });
        const currentGameIds = recovery.runStatus === "succeeded" && recovery.expectedSnapshotKey
          ? await listSnapshotGameIds(recovery.expectedSnapshotKey, readDb)
          : [];
        const currentGames = new Set(currentGameIds);
        const staleGameIds = recovery.stale
          ? gameIds
          : gameIds.filter((gameId) => !currentGames.has(gameId));
        return json({
          lines,
          season: slate.season,
          week: slate.week,
          // The credential lane is severed until OS-18A/OS-19A are accepted.
          // A hidden provider secret must not make cached reads look active.
          configured: false,
          comparisonBooks: ["betmgm", "fanduel"],
          stale: staleGameIds.length > 0,
          partial: currentGameIds.length > 0 && staleGameIds.length > 0,
          currentGameIds,
          staleGameIds
        });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unable to load cached lines" }, 503);
      }
    }
    if (url.pathname === "/api/odds-automation") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { allow: "GET" });
      return json({ runs: await listOddsAutomationRuns(readDb) });
    }
    if (url.pathname === "/api/game-context") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { allow: "GET" });
      return json({
        injuryImports: await listOfficialInjuryImportStates(readDb),
        pregame: await listPregameContextStates(readDb)
      });
    }
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        }
      }, allowedWidths);
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Unknown public API route" }, 404);
    }
    // Only GET/HEAD page and asset rendering reaches Vinext. All API calls and
    // every mutating method have already been terminated above.
    return handler.fetch(
      request,
      { ...env, DB: readDb } as unknown as Parameters<typeof handler.fetch>[1],
      ctx
    );
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // OS-00 is deployed fail-closed. Capture/ledger activation is a separate
    // operator decision after credential rotation, quota bootstrap, migration
    // proof, and the remaining OS-02A/03A/13A gates. Never use the nominal cron
    // timestamp as a generation or persistence time.
    if (env.ENGINE_OS_CAPTURE_ENABLED !== "true") return;
    ctx.waitUntil(runBackgroundMaintenance({
      db: env.DB,
      evidenceBucket: env.EVIDENCE,
      apiKey: undefined,
      now: new Date()
    }));
  }
};

export default worker;
