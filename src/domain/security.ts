import type { Role } from "./types";

export type ProtectedAction =
  | "read_team"
  | "edit_candidate"
  | "approve_candidate"
  | "qb_override"
  | "correction"
  | "configuration"
  | "access_management";

export function authorize(role: Role | null, action: ProtectedAction): boolean {
  if (!role) return false;
  if (["read_team", "edit_candidate", "approve_candidate"].includes(action)) return true;
  return role === "owner";
}

export function assertNoUnauthenticatedApi(role: Role | null): void {
  if (!role) throw new Error("Unauthenticated application API access is prohibited");
}
