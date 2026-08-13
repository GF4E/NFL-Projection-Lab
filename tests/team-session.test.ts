import { describe, expect, it } from "vitest";
import { actorForTeamAccessToken, createTeamSession, verifyTeamSession } from "@/domain/team-session";

describe("signed two-person worker session", () => {
  const secret = "session-secret-that-is-longer-than-thirty-two-characters";

  it("authenticates only the configured private access tokens", async () => {
    expect(await actorForTeamAccessToken({ token: "g".repeat(48), gabeToken: "g".repeat(48), jarrettToken: "j".repeat(48) })).toBe("gabe");
    expect(await actorForTeamAccessToken({ token: "j".repeat(48), gabeToken: "g".repeat(48), jarrettToken: "j".repeat(48) })).toBe("jarrett");
    expect(await actorForTeamAccessToken({ token: "x".repeat(48), gabeToken: "g".repeat(48), jarrettToken: "j".repeat(48) })).toBeNull();
  });

  it("signs identity, rejects tampering, and expires the session", async () => {
    const now = new Date("2026-08-13T16:00:00.000Z");
    const token = await createTeamSession({ actor: "jarrett", secret, now });
    expect((await verifyTeamSession({ token, secret, now }))?.actor).toBe("jarrett");
    expect(await verifyTeamSession({ token: `${token.slice(0, -1)}x`, secret, now })).toBeNull();
    expect(await verifyTeamSession({ token, secret, now: new Date("2026-10-01T16:00:00.000Z") })).toBeNull();
  });
});
