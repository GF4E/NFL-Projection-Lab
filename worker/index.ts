import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { listNflverseImportStates } from "../src/server/nflverse/store";
import { buildDecisionBoard } from "../src/server/decision-board";
import { getPlayerPropBoard, refreshPlayerPropBoard } from "../src/server/player-props";
import { listOddsAutomationRuns } from "../src/server/odds-automation";
import { weeklySlate } from "../src/server/weekly-slate";
import { listOfficialInjuryImportStates } from "../src/server/official-injuries/store";
import { listPregameContextStates } from "../src/server/pregame-context/store";
import { runBackgroundMaintenance } from "../src/server/background-maintenance";
import { runModelLifecycleAutomation } from "../src/server/model-lifecycle/automation";
import { scheduledMaintenanceLane } from "../src/domain/background-maintenance";
import {
  actorForTeamAccessToken,
  createTeamSession,
  expiredTeamSessionCookie,
  isPublicTeamGatePath,
  serializedTeamSessionCookie,
  teamSessionCookie,
  verifyTeamSession
} from "../src/domain/team-session";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  DB: D1Database;
  ODDS_API_KEY?: string;
  INTERNAL_TEAM_GATE_ENABLED?: string;
  TEAM_SESSION_SECRET?: string;
  GABE_ACCESS_TOKEN?: string;
  JARRETT_ACCESS_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

async function handlePropsRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed" }, 405, { allow: "GET, POST" });
  const gameId = new URL(request.url).searchParams.get("gameId");
  if (!gameId) return json({ error: "gameId is required" }, 400);
  try {
    const payload = request.method === "POST"
      ? await refreshPlayerPropBoard({ gameId, apiKey: env.ODDS_API_KEY, db: env.DB })
      : await getPlayerPropBoard(gameId, env.DB);
    return json(payload);
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
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { allow: "GET, POST" });
  }

  try {
    if (request.method === "POST") {
      const maintenance = await runBackgroundMaintenance({ db: env.DB, apiKey: env.ODDS_API_KEY });
      return json({ maintenance, states: await listNflverseImportStates(env.DB) });
    }
    return json({ states: await listNflverseImportStates(env.DB) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Automatic nflverse refresh aborted" },
      503
    );
  }
}

async function handleModelLifecycleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { allow: "POST" });
  try {
    return json({ lifecycle: await runModelLifecycleAutomation({ db: env.DB }) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Model lifecycle aborted" }, 503);
  }
}

async function handleTeamSessionRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "DELETE") {
    return json({ signedOut: true }, 200, { "set-cookie": expiredTeamSessionCookie() });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { allow: "POST, DELETE" });
  try {
    const body = await request.json() as { token?: unknown };
    const actor = await actorForTeamAccessToken({
      token: typeof body.token === "string" ? body.token : null,
      gabeToken: env.GABE_ACCESS_TOKEN,
      jarrettToken: env.JARRETT_ACCESS_TOKEN
    });
    if (!actor || !env.TEAM_SESSION_SECRET) return json({ error: "That private access link is invalid" }, 401);
    const session = await createTeamSession({ actor, secret: env.TEAM_SESSION_SECRET });
    return json({ actor }, 200, { "set-cookie": serializedTeamSessionCookie(session) });
  } catch {
    return json({ error: "That private access link is invalid" }, 401);
  }
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (env.INTERNAL_TEAM_GATE_ENABLED === "true") {
      if (url.pathname === "/api/team-session") return handleTeamSessionRequest(request, env);
      if (!isPublicTeamGatePath(url.pathname)) {
        const session = await verifyTeamSession({
          token: teamSessionCookie(request),
          secret: env.TEAM_SESSION_SECRET
        });
        if (!session) {
          return url.pathname.startsWith("/api/")
            ? json({ error: "Private team sign-in required" }, 401)
            : Response.redirect(new URL("/login", request.url), 302);
        }
        if (url.pathname === "/api/model-lifecycle" && session.actor !== "gabe") {
          return json({ error: "Only the owner may run the model lifecycle" }, 403);
        }
        const headers = new Headers(request.headers);
        headers.set("oai-authenticated-user-email", session.email);
        headers.set("oai-authenticated-user-id", session.userId);
        request = new Request(request, { headers });
      }
    }
    // Keep automation control outside the framework router so cron, browser wakeups,
    // and production deployments all reach the same Cloudflare-bound D1 database.
    if (url.pathname === "/api/nflverse") {
      return handleNflverseRequest(request, env);
    }
    if (url.pathname === "/api/model-lifecycle") {
      return handleModelLifecycleRequest(request, env);
    }
    if (url.pathname === "/api/decision-board") {
      try {
        const rawWeek = url.searchParams.get("week");
        const week = rawWeek === null ? undefined : Number(rawWeek);
        if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18)) return json({ error: "week must be an integer from 1 through 18" }, 400);
        return json(await buildDecisionBoard(env.DB, { week }));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unable to build decision board" }, 503);
      }
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
    const scheduledAt = new Date(controller.scheduledTime);
    ctx.waitUntil(scheduledMaintenanceLane(scheduledAt) === "lifecycle"
      ? runModelLifecycleAutomation({ db: env.DB, now: scheduledAt })
      : runBackgroundMaintenance({ db: env.DB, apiKey: env.ODDS_API_KEY, now: scheduledAt }));
  }
};

export default worker;
