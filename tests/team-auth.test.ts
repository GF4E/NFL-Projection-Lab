import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requestTeamMember, TeamAuthenticationError } from "@/server/team-auth";

describe("retired shared-record authentication", () => {
  const previousMode = process.env.NEXT_PUBLIC_DEMO_MODE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  });

  afterEach(() => {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = previousMode;
  });

  it("contains no personal email addresses in the inert legacy mapping", async () => {
    const analyst_a = await requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-id": "legacy-owner-id", "oai-authenticated-user-email": "OWNER@EXAMPLE.INVALID" }
    }));
    const analyst_b = await requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-id": "legacy-collaborator-id", "oai-authenticated-user-email": "COLLABORATOR@EXAMPLE.INVALID" }
    }));
    expect(analyst_a).toEqual({ actor: "analyst_a", email: "owner@example.invalid", userId: "legacy-owner-id" });
    expect(analyst_b).toEqual({ actor: "analyst_b", email: "collaborator@example.invalid", userId: "legacy-collaborator-id" });
  });

  it("rejects missing and unrecognized identities", async () => {
    await expect(requestTeamMember(new Request("https://example.com/api/plays"))).rejects.toBeInstanceOf(TeamAuthenticationError);
    await expect(requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-id": "outsider-id", "oai-authenticated-user-email": "outsider@example.com" }
    }))).rejects.toBeInstanceOf(TeamAuthenticationError);
    await expect(requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-email": "owner@example.invalid" }
    }))).rejects.toBeInstanceOf(TeamAuthenticationError);
  });
});
