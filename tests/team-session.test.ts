import { describe, expect, it } from "vitest";
import {
  actorForTeamAccessToken,
  createTeamSession,
  isPublicTeamGatePath,
  verifyTeamSession
} from "@/domain/team-session";

describe("signed two-person worker session", () => {
  const secret = "session-secret-that-is-longer-than-thirty-two-characters";

  it("authenticates only the configured private access tokens", async () => {
    expect(await actorForTeamAccessToken({ token: "g".repeat(48), analyst_aToken: "g".repeat(48), analyst_bToken: "j".repeat(48) })).toBe("analyst_a");
    expect(await actorForTeamAccessToken({ token: "j".repeat(48), analyst_aToken: "g".repeat(48), analyst_bToken: "j".repeat(48) })).toBe("analyst_b");
    expect(await actorForTeamAccessToken({ token: "x".repeat(48), analyst_aToken: "g".repeat(48), analyst_bToken: "j".repeat(48) })).toBeNull();
  });

  it("signs identity, rejects tampering, and expires the session", async () => {
    const now = new Date("2026-08-13T16:00:00.000Z");
    const token = await createTeamSession({ actor: "analyst_b", secret, now });
    expect((await verifyTeamSession({ token, secret, now }))?.actor).toBe("analyst_b");
    expect(await verifyTeamSession({ token: `${token.slice(0, -1)}x`, secret, now })).toBeNull();
    expect(await verifyTeamSession({ token, secret, now: new Date("2026-10-01T16:00:00.000Z") })).toBeNull();
  });

  it("exposes only the login exchange and its required static assets", () => {
    expect(isPublicTeamGatePath("/login")).toBe(true);
    expect(isPublicTeamGatePath("/api/team-session")).toBe(true);
    expect(isPublicTeamGatePath("/_next/static/login.js")).toBe(true);
    expect(isPublicTeamGatePath("/_vinext/static/login.css")).toBe(true);
    expect(isPublicTeamGatePath("/assets/example.svg")).toBe(true);
    expect(isPublicTeamGatePath("/sunday")).toBe(false);
    expect(isPublicTeamGatePath("/api/weekly-slate")).toBe(false);
    expect(isPublicTeamGatePath("/api/private-export.png")).toBe(false);
    expect(isPublicTeamGatePath("/sw.js")).toBe(false);
  });
});
