import type { PickedBy } from "@/domain/play-card";

export class TeamAuthenticationError extends Error {
  constructor(message = "This email is not authorized for the shared team") {
    super(message);
    this.name = "TeamAuthenticationError";
  }
}

export interface AuthenticatedTeamMember {
  actor: PickedBy;
  email: string;
  userId: string;
}

export function configuredTeamActor(email: string | null | undefined): PickedBy | null {
  void email;
  return null;
}

export async function requestTeamMember(request: Request): Promise<AuthenticatedTeamMember> {
  void request;
  throw new TeamAuthenticationError("Shared-record authentication is retired on the public analytics site");
}

export function isTeamAuthenticationError(error: unknown): error is TeamAuthenticationError {
  return error instanceof TeamAuthenticationError;
}
