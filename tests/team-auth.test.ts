import { describe, expect, it } from "vitest";
import { configuredTeamActor, requestTeamMember, TeamAuthenticationError } from "@/server/team-auth";

describe("retired shared-record authentication", () => {
  it("has no active identity mapping", () => {
    expect(configuredTeamActor("owner@example.invalid")).toBeNull();
    expect(configuredTeamActor("collaborator@example.invalid")).toBeNull();
  });

  it("rejects every identity source before account or record access", async () => {
    await expect(requestTeamMember(new Request("https://example.com/api/plays"))).rejects.toBeInstanceOf(TeamAuthenticationError);
    await expect(requestTeamMember(new Request("https://example.com/api/plays", {
      headers: { "oai-authenticated-user-id": "legacy-owner-id", "oai-authenticated-user-email": "owner@example.invalid" }
    }))).rejects.toBeInstanceOf(TeamAuthenticationError);
  });
});
