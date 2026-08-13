import teamConfig from "../../config/team.config.json";
import { approvalActorForEmail, type PickedBy } from "@/domain/play-card";
import { createUserClient } from "@/server/supabase/server";

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
  return approvalActorForEmail(
    email,
    teamConfig.members.gabe.email,
    teamConfig.members.jarrett.email
  );
}

export async function requestTeamMember(request: Request): Promise<AuthenticatedTeamMember> {
  const sitesManagedAccess = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  let email: string | null = null;
  let userId: string | null = null;

  if (sitesManagedAccess) {
    email = request.headers.get("oai-authenticated-user-email");
    userId = request.headers.get("oai-authenticated-user-id");
    if (!email && !userId && process.env.NODE_ENV === "development") {
      email = teamConfig.members.gabe.email;
      userId = "local-owner";
    }
  } else {
    const supabase = await createUserClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw new TeamAuthenticationError("Your sign-in session could not be verified");
    email = user?.email ?? null;
    userId = user?.id ?? null;
  }

  const actor = configuredTeamActor(email);
  if (!actor || !email || !userId) throw new TeamAuthenticationError();
  return { actor, email: email.trim().toLowerCase(), userId };
}

export function isTeamAuthenticationError(error: unknown): error is TeamAuthenticationError {
  return error instanceof TeamAuthenticationError;
}
