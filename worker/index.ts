import { suit, readSuit } from "../src/server/suit";
import { ourNote } from "../src/server/our-note";
import { readLockedBoard, refreshLockedBoard } from "../src/server/locked-board";
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { listNflverseImportStates } from "../src/server/nflverse/store";
import { getPlayerPropBoard } from "../src/server/player-props";
import { listOddsAutomationRuns } from "../src/server/odds-automation";
import { weeklySlate } from "../src/server/weekly-slate";
import { listOfficialInjuryImportStates } from "../src/server/official-injuries/store";
import { listPregameContextStates } from "../src/server/pregame-context/store";
import { getConfidenceEngineHealth } from "../src/server/confidence-engine/store";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  DB: D1Database;
  ODDS_API_KEY?: string;
  NOTE_EDIT_KEY?: string;
  GABE_EDIT_KEY?: string;
  JARRETT_EDIT_KEY?: string;
  NOTE_SYNC_KEY?: string;
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
    if (["/api/suit-board","/api/suit-entry","/api/suit-entry/sync"].includes(url.pathname)) return suit(request,env);
    if (url.pathname === "/api/our-note" || url.pathname === "/api/our-note/sync") return ourNote(request, env);
    if (url.pathname === "/api/model-board" || url.pathname === "/api/decision-board") {
      if (request.method !== "GET") return json({ error: "Read-only publication" }, 405);
      try { return json(await readLockedBoard(env.DB, fetch, Date.now(), url.searchParams.get("refresh") === "1")); }
      catch { return json({ error: "Locked board unavailable", status: "STALE" }, 503); }
    }
    // Keep automation control outside the framework router so cron, browser wakeups,
    // and production deployments all reach the same Cloudflare-bound D1 database.
    if (url.pathname === "/api/nflverse") {
      return handleNflverseRequest(request, env);
    }
    if (url.pathname === "/api/model-lifecycle") {
      return json({ error: "Public access is read-only" }, 405, { allow: "" });
    }
    if (url.pathname === "/api/confidence-engine") {
      if (request.method !== "GET") return json({ error: "Public access is read-only" }, 405, { allow: "GET" });
      try {
        return json(await getConfidenceEngineHealth(env.DB));
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
    if (url.pathname === "/api/weekly-slate") {
      try {
        const rawWeek = url.searchParams.get("week");
        const week = rawWeek === null ? undefined : Number(rawWeek);
        if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18)) return json({ error: "week must be an integer from 1 through 18" }, 400);
        return json(await weeklySlate({ db: env.DB, week }));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unable to load weekly schedule" }, 503);
      }
    }
    if (url.pathname === "/api/props") {
      return handlePropsRequest(request, env);
    }
    if (url.pathname === "/api/odds-automation") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { allow: "GET" });
      return json({ runs: await listOddsAutomationRuns(env.DB) });
    }
    if (url.pathname === "/api/game-context") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { allow: "GET" });
      return json({
        injuryImports: await listOfficialInjuryImportStates(env.DB),
        pregame: await listPregameContextStates(env.DB)
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
    return handler.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshLockedBoard(env.DB).catch(() => undefined));
    ctx.waitUntil(readSuit(env.DB).catch(() => undefined));

  }
};

export default worker;
