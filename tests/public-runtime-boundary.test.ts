import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readOnlyD1 } from "@/server/read-only-d1";
import { runJob } from "@/server/jobs/runner";

function fakeStatement(): D1PreparedStatement {
  const statement = {
    bind: vi.fn(() => statement),
    first: vi.fn(async () => null),
    run: vi.fn(async () => ({ success: true, meta: {}, results: [] })),
    all: vi.fn(async () => ({ success: true, meta: {}, results: [] })),
    raw: vi.fn(async () => [])
  };
  return statement as unknown as D1PreparedStatement;
}

function fakeDatabase() {
  const statement = fakeStatement();
  const database = {
    prepare: vi.fn(() => statement),
    batch: vi.fn(async () => []),
    exec: vi.fn(async () => ({ count: 0, duration: 0 })),
    withSession: vi.fn(),
    dump: vi.fn(async () => new ArrayBuffer(0))
  };
  return { database: database as unknown as D1Database, statement, spies: database };
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`${name} was not found`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("public runtime boundary", () => {
  it("permits SELECT reads while failing closed on every D1 write capability", async () => {
    const { database, statement, spies } = fakeDatabase();
    const db = readOnlyD1(database);

    await expect(db.prepare("SELECT * FROM nfl_games").all()).resolves.toMatchObject({ results: [] });
    expect(spies.prepare).toHaveBeenCalledWith("SELECT * FROM nfl_games");
    expect(statement.all).toHaveBeenCalledOnce();

    expect(() => db.prepare("UPDATE nfl_games SET week = 2")).toThrow(/read-only/);
    expect(() => db.prepare("CREATE TABLE forbidden \(id text\)")).toThrow(/read-only/);
    expect(() => db.prepare("SELECT 1; DELETE FROM nfl_games")).toThrow(/multiple statements/);
    await expect(db.prepare("SELECT 1").run()).rejects.toThrow(/run\(\) is prohibited/);
    await expect(db.batch([])).rejects.toThrow(/batch\(\) is prohibited/);
    await expect(db.exec("DELETE FROM nfl_games")).rejects.toThrow(/exec\(\) is prohibited/);
    expect(spies.batch).not.toHaveBeenCalled();
    expect(spies.exec).not.toHaveBeenCalled();
  });

  it("keeps browser fetches read-only and scheduled maintenance authoritative", () => {
    const source = readFileSync("worker/index.ts", "utf8");
    const fetchLane = source.slice(source.indexOf("async fetch"), source.indexOf("async scheduled"));
    const scheduledLane = source.slice(source.indexOf("async scheduled"));

    expect(fetchLane).toContain("readOnlyD1(env.DB)");
    expect(fetchLane).toContain('url.pathname === "/__engine-os/operator/migrate-0013"');
    expect(fetchLane).toContain("authorizedUrgentMigrationRequest");
    expect(fetchLane).toContain('return json({ error: "Not found" }, 404)');
    expect(fetchLane).toContain('request.method !== "GET" && request.method !== "HEAD"');
    expect(fetchLane).toContain('url.pathname.startsWith("/api/")');
    expect(fetchLane).toContain('url.pathname === "/api/lines"');
    expect(fetchLane).not.toContain("runBackgroundMaintenance");
    expect(fetchLane).not.toContain("runModelLifecycleAutomation");
    expect(fetchLane).toContain("DB: readDb");
    expect(scheduledLane).toContain("runBackgroundMaintenance");
    expect(scheduledLane).toContain('ENGINE_OS_CAPTURE_ENABLED !== "true"');
    expect(scheduledLane).toContain("now: new Date()");
    expect(scheduledLane).not.toContain("runModelLifecycleAutomation");
    expect(scheduledLane).not.toContain("scheduledTime");

    const maintenance = readFileSync("src/server/background-maintenance.ts", "utf8");
    expect(maintenance).not.toContain("expireStaleTeamDrafts");
    expect(maintenance).not.toContain("settleCompletedTeamPlays");
    expect(maintenance).not.toContain("runModelLifecycleAutomation");
  });

  it("quarantines the obsolete Supabase orchestration path before I/O", async () => {
    const route = readFileSync("src/app/api/jobs/[job]/route.ts", "utf8");
    const runner = readFileSync("src/server/jobs/runner.ts", "utf8");

    expect(route).not.toContain("server/jobs/runner");
    expect(route).toContain("status: 410");
    expect(runner).not.toContain("supabase/admin");
    expect(runner).not.toContain("fetchOddsSnapshots");
    expect(runner).not.toContain("fetchNflverseDataset");
    await expect(runJob()).rejects.toThrow(/quarantined/);
  });

  it("removes Supabase clients and credentials from the active source graph", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packages = { ...packageJson.dependencies, ...packageJson.devDependencies };
    expect(packages).not.toHaveProperty("@supabase/ssr");
    expect(packages).not.toHaveProperty("@supabase/supabase-js");
    expect(readFileSync("pnpm-lock.yaml", "utf8")).not.toContain("@supabase/");
    expect(existsSync("src/server/supabase/server.ts")).toBe(false);
    expect(existsSync("src/server/supabase/admin.ts")).toBe(false);

    for (const file of [
      "src/app/auth/callback/route.ts",
      "src/app/login/actions.ts",
      "src/server/team-auth.ts"
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@supabase|server\/supabase|create(?:Server|User|Admin)Client|SUPABASE_/);
    }
    expect(readFileSync("src/server/team-auth.ts", "utf8")).toContain("Shared-record authentication is retired");
    expect(readFileSync("src/app/auth/callback/route.ts", "utf8")).toContain('new URL("/sunday"');
    expect(readFileSync(".env.example", "utf8")).not.toMatch(/SUPABASE_|PIPELINE_WORKER|CRON_SECRET/);
  });

  it("fails closed on every retired account and shared-record route", () => {
    const worker = readFileSync("worker/index.ts", "utf8");
    const retiredRoutes = [
      ["/api/plays", "src/app/api/plays/route.ts"],
      ["/api/plays/", "src/app/api/plays/[id]/route.ts"],
      ["/api/plays/", "src/app/api/plays/[id]/correction/route.ts"],
      ["/api/qb-override", "src/app/api/qb-override/route.ts"],
      ["/api/push-subscription", "src/app/api/push-subscription/route.ts"],
      ["/api/digest", "src/app/api/digest/route.ts"]
    ] as const;

    expect(worker).toContain('records." }, 410)');
    for (const [pathname, file] of retiredRoutes) {
      expect(worker, pathname).toContain(pathname);
      expect(readFileSync(file, "utf8"), file).toContain("requestTeamMember(request)");
    }

    const auth = readFileSync("src/server/team-auth.ts", "utf8");
    expect(auth).toContain("throw new TeamAuthenticationError");
    expect(auth).not.toMatch(/cookies\(|headers\(|getD1\(|fetch\(|create(?:Server|User|Admin)Client/);
  });

  it("keeps every public data reader free of schema initialization", () => {
    const readers = [
      ["src/server/live-line-store.ts", "listLiveLines"],
      ["src/server/live-line-store.ts", "listSnapshotGameIds"],
      ["src/server/odds-automation.ts", "getMainlineRecoveryStatus"],
      ["src/server/odds-automation.ts", "listOddsAutomationRuns"],
      ["src/server/nflverse/store.ts", "listNflverseImportStates"],
      ["src/server/official-injuries/store.ts", "listOfficialInjuryImportStates"],
      ["src/server/pregame-context/store.ts", "listPregameContextStates"],
      ["src/server/player-props.ts", "getPlayerPropBoard"]
    ] as const;

    for (const [file, name] of readers) {
      expect(functionBody(readFileSync(file, "utf8"), name), `${file}:${name}`).not.toMatch(/await ensure[A-Za-z]+Store\(/);
    }

    for (const file of [
      "src/app/api/confidence-engine/route.ts",
      "src/app/api/decision-board/route.ts",
      "src/app/api/lines/route.ts",
      "src/app/api/nflverse/route.ts",
      "src/app/api/props/route.ts",
      "src/app/api/weekly-slate/route.ts"
    ]) {
      expect(readFileSync(file, "utf8"), file).toContain("readOnlyD1");
    }
  });
});
