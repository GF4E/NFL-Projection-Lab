import teamConfig from "../../config/team.config.json";
import type { PickedBy } from "./play-card";

export const TEAM_SESSION_COOKIE = "projection_lab_team";
export const TEAM_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface TeamSessionPayload {
  actor: PickedBy;
  email: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  if (secret.length < 32) throw new Error("Team session secret must contain at least 32 characters");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function createTeamSession(input: {
  actor: PickedBy;
  secret: string;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const member = teamConfig.members[input.actor];
  const payload: TeamSessionPayload = {
    actor: input.actor,
    email: member.email.toLowerCase(),
    userId: `team:${input.actor}`,
    issuedAt: now.getTime(),
    expiresAt: now.getTime() + TEAM_SESSION_MAX_AGE_SECONDS * 1_000
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmac(encoded, input.secret));
  return `${encoded}.${signature}`;
}

export async function verifyTeamSession(input: {
  token: string | null | undefined;
  secret: string | undefined;
  now?: Date;
}): Promise<TeamSessionPayload | null> {
  if (!input.token || !input.secret) return null;
  const [encoded, signature, extra] = input.token.split(".");
  if (!encoded || !signature || extra) return null;
  try {
    const expected = await hmac(encoded, input.secret);
    if (!constantTimeEqual(expected, base64UrlToBytes(signature))) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as TeamSessionPayload;
    const member = teamConfig.members[payload.actor];
    const now = (input.now ?? new Date()).getTime();
    if (!member || payload.email !== member.email.toLowerCase() || payload.userId !== `team:${payload.actor}`) return null;
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) return null;
    if (payload.issuedAt > now + 60_000 || payload.expiresAt <= now || payload.expiresAt - payload.issuedAt > TEAM_SESSION_MAX_AGE_SECONDS * 1_000) return null;
    return payload;
  } catch {
    return null;
  }
}

async function tokenDigest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function actorForTeamAccessToken(input: {
  token: string | null | undefined;
  gabeToken: string | undefined;
  jarrettToken: string | undefined;
}): Promise<PickedBy | null> {
  if (!input.token || input.token.length < 32) return null;
  const candidate = await tokenDigest(input.token);
  for (const [actor, token] of [["gabe", input.gabeToken], ["jarrett", input.jarrettToken]] as const) {
    if (!token) continue;
    if (constantTimeEqual(candidate, await tokenDigest(token))) return actor;
  }
  return null;
}

export function teamSessionCookie(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const pair of raw.split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name === TEAM_SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function serializedTeamSessionCookie(token: string): string {
  return `${TEAM_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TEAM_SESSION_MAX_AGE_SECONDS}`;
}

export function expiredTeamSessionCookie(): string {
  return `${TEAM_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
