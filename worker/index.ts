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
import { getConfidenceEngineHealth } from "../src/server/confidence-engine/store";
import { readOnlyD1 } from "../src/server/read-only-d1";
import { assertD1SchemaAuthority } from "../src/server/schema-authority";
import {
  interimSchedulerContract,
  type InterimSchedulerLane
} from "../src/server/engine-os/interim-scheduler-kernel";
import { runInterimSchedulerInvocation } from "../src/server/engine-os/interim-scheduler";
import {
  readCaptureGate,
  readDatabaseBinding,
  selectFrameworkAssetBindings,
  selectImageBindings,
  type PublicDataEnv,
  type WorkerRuntimeEnv
} from "./env-boundary";

async function handlePropsRequest(request: Request, env: PublicDataEnv): Promise<Response> {
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

const DATABASE_READ_PATHS = new Set([
  "/api/nflverse",
  "/api/confidence-engine",
  "/api/decision-board",
  "/api/weekly-slate",
  "/api/props",
  "/api/lines",
  "/api/odds-automation",
  "/api/game-context"
]);

async function handleNflverseRequest(request: Request, env: PublicDataEnv): Promise<Response> {
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
  async fetch(request: Request, env: WorkerRuntimeEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const readDb = readOnlyD1(readDatabaseBinding(env));
    // Vinext resolves module-level Cloudflare bindings itself, so replacing DB
    // in its handler argument is not a security boundary. Deny every mutating
    // HTTP method before routing and handle every public API path explicitly.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Public access is read-only" }, 405, { allow: "GET, HEAD" });
    }
    if (DATABASE_READ_PATHS.has(url.pathname)) {
      try {
        await assertD1SchemaAuthority(readDb);
      } catch (error) {
        return json({
          error: error instanceof Error ? error.message : "D1 schema authority is unavailable"
        }, 503);
      }
    }
    // Keep automation control outside the framework router so cron, browser wakeups,
    // and production deployments all reach the same Cloudflare-bound D1 database.
    if (url.pathname === "/api/nflverse") {
      return handleNflverseRequest(request, { DB: readDb });
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
      return handlePropsRequest(request, { DB: readDb });
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
      const imageBindings = selectImageBindings(env);
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => imageBindings.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await imageBindings.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
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
      selectFrameworkAssetBindings(env),
      ctx
    );
  },
  async scheduled(controller: ScheduledController, env: WorkerRuntimeEnv, ctx: ExecutionContext): Promise<void> {
    // OS-15A remains dormant in production. Even after a future explicit gate,
    // this entrypoint can run only the provider-free qualification scheduler;
    // provider acquisition and model execution are absent from its source graph.
    if (readCaptureGate(env) !== "true") return;
    await assertD1SchemaAuthority(readDatabaseBinding(env));
    const lane: InterimSchedulerLane | null =
      controller.cron === interimSchedulerContract.clock.dispatcherCron ? "dispatcher" :
        controller.cron === interimSchedulerContract.clock.watchdogCron ? "watchdog" : null;
    if (!lane) return;
    ctx.waitUntil(runInterimSchedulerInvocation({
      db: readDatabaseBinding(env),
      lane,
      // Controller time identifies the deterministic trigger only. Invocation,
      // evidence, generation, and persistence are sampled separately in service.
      nominalScheduledAt: new Date(controller.scheduledTime)
    }));
  }
};

export default worker;
