import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requestTeamMember, TeamAuthenticationError } from "@/server/team-auth";

describe("two-member request authentication", () => {
  const previousMode = process.env.NEXT_PUBLIC_DEMO_MODE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  });

  afterEach(() => {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = previousMode;
  });

  it("maps the Sites-authenticated owner and teammate emails", async () => {
    const gabe = await requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-id": "gabe-id", "oai-authenticated-user-email": "GABEFORREY@gmail.com" }
    }));
    const jarrett = await requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-id": "jarrett-id", "oai-authenticated-user-email": "jwhi0802@YAHOO.com" }
    }));
    expect(gabe).toEqual({ actor: "gabe", email: "gabeforrey@gmail.com", userId: "gabe-id" });
    expect(jarrett).toEqual({ actor: "jarrett", email: "jwhi0802@yahoo.com", userId: "jarrett-id" });
  });

  it("rejects missing and unrecognized identities instead of defaulting to Gabe", async () => {
    await expect(requestTeamMember(new Request("https://example.com/api/plays"))).rejects.toBeInstanceOf(TeamAuthenticationError);
    await expect(requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-id": "outsider-id", "oai-authenticated-user-email": "outsider@example.com" }
    }))).rejects.toBeInstanceOf(TeamAuthenticationError);
    await expect(requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-email": "gabeforrey@gmail.com" }
    }))).rejects.toBeInstanceOf(TeamAuthenticationError);
  });
});
