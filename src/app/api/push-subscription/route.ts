import { NextResponse } from "next/server";
import { z } from "zod";
import { getD1 } from "../../../../db";
import { isTeamAuthenticationError, requestTeamMember } from "@/server/team-auth";
import {
  dispatchPendingPushes,
  hasActivePushSubscription,
  revokePushSubscription,
  upsertPushSubscription,
  vapidPublicKey
} from "@/server/push/store";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2_048),
  expirationTime: z.number().nullable(),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256)
  })
});

const revokeSchema = z.object({ endpoint: z.string().url().max(2_048) });

export async function GET(request: Request) {
  try {
    const member = await requestTeamMember(request);
    const publicKey = vapidPublicKey();
    return NextResponse.json({
      configured: Boolean(publicKey),
      publicKey,
      subscribed: await hasActivePushSubscription(getD1(), member.actor)
    });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read alert settings" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const member = await requestTeamMember(request);
    const subscription = subscriptionSchema.parse(await request.json());
    const db = getD1();
    await upsertPushSubscription({ db, recipientId: member.actor, subscription });
    await dispatchPendingPushes({ db, recipientId: member.actor });
    return NextResponse.json({ subscribed: true });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid subscription" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to enable alerts" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const member = await requestTeamMember(request);
    const { endpoint } = revokeSchema.parse(await request.json());
    await revokePushSubscription({ db: getD1(), recipientId: member.actor, endpoint });
    return NextResponse.json({ subscribed: false });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid subscription" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to disable alerts" }, { status: 503 });
  }
}
