import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { createPushDelivery } from "@/domain/automation";
import { stableHash } from "@/domain/hash";
import type { PushEventType } from "@/domain/types";
import type { PickedBy } from "@/domain/play-card";

export interface PushMessageData {
  type: PushEventType;
  title: string;
  body: string;
  url: "/sunday";
  idempotencyKey: string;
}

export interface StoredPushSubscription extends PushSubscription {
  id: string;
  recipientId: PickedBy;
}

interface PushSubscriptionRow {
  id: string;
  recipient_id: PickedBy;
  endpoint: string;
  expiration_time: number | null;
  p256dh: string;
  auth: string;
}

interface PushDeliveryRow {
  id: string;
  type: PushEventType;
  recipient_id: PickedBy;
  idempotency_key: string;
  state: "pending" | "sent" | "failed";
  payload_json: string;
  created_at: string;
  sent_at: string | null;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id text PRIMARY KEY NOT NULL,
    recipient_id text NOT NULL CHECK (recipient_id IN ('gabe', 'jarrett')),
    endpoint text NOT NULL UNIQUE,
    expiration_time real,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    revoked_at text
  )`,
  `CREATE TABLE IF NOT EXISTS web_push_deliveries (
    id text PRIMARY KEY NOT NULL,
    type text NOT NULL CHECK (type IN ('awaiting_you', 'edge_threshold')),
    recipient_id text NOT NULL CHECK (recipient_id IN ('gabe', 'jarrett')),
    idempotency_key text NOT NULL UNIQUE,
    state text NOT NULL CHECK (state IN ('pending', 'sent', 'failed')),
    payload_json text NOT NULL,
    created_at text NOT NULL,
    sent_at text,
    last_error text
  )`,
  `CREATE TABLE IF NOT EXISTS web_push_attempts (
    delivery_id text NOT NULL,
    subscription_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('sent', 'failed')),
    attempted_at text NOT NULL,
    response_status integer,
    error_message text,
    PRIMARY KEY (delivery_id, subscription_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_web_push_recipient ON web_push_subscriptions (recipient_id, revoked_at)",
  "CREATE INDEX IF NOT EXISTS idx_web_push_delivery_state ON web_push_deliveries (recipient_id, state, created_at)"
] as const;

export async function ensurePushStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

export function assertSafePushEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateIpv4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
  const privateName = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "::1";
  if (url.protocol !== "https:" || url.username || url.password || privateName || privateIpv4.test(hostname)) {
    throw new Error("Push subscriptions require a public HTTPS endpoint");
  }
  return url;
}

export async function upsertPushSubscription(input: {
  db: D1Database;
  recipientId: PickedBy;
  subscription: PushSubscription;
  now?: string;
}): Promise<StoredPushSubscription> {
  await ensurePushStore(input.db);
  assertSafePushEndpoint(input.subscription.endpoint);
  if (!input.subscription.keys.auth || !input.subscription.keys.p256dh) {
    throw new Error("Push subscription encryption keys are required");
  }
  const now = input.now ?? new Date().toISOString();
  const id = `subscription:${stableHash(input.subscription.endpoint).slice(0, 32)}`;
  await input.db.prepare(`INSERT INTO web_push_subscriptions
      (id, recipient_id, endpoint, expiration_time, p256dh, auth, created_at, updated_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(endpoint) DO UPDATE SET recipient_id = excluded.recipient_id,
        expiration_time = excluded.expiration_time, p256dh = excluded.p256dh, auth = excluded.auth,
        updated_at = excluded.updated_at, revoked_at = NULL`)
    .bind(id, input.recipientId, input.subscription.endpoint, input.subscription.expirationTime,
      input.subscription.keys.p256dh, input.subscription.keys.auth, now, now).run();
  return { id, recipientId: input.recipientId, ...input.subscription };
}

export async function revokePushSubscription(input: {
  db: D1Database;
  recipientId: PickedBy;
  endpoint: string;
  now?: string;
}): Promise<void> {
  await ensurePushStore(input.db);
  const now = input.now ?? new Date().toISOString();
  await input.db.prepare(`UPDATE web_push_subscriptions SET revoked_at = ?, updated_at = ?
    WHERE recipient_id = ? AND endpoint = ?`).bind(
      now, now, input.recipientId, input.endpoint
    ).run();
}

export async function hasActivePushSubscription(db: D1Database, recipientId: PickedBy): Promise<boolean> {
  await ensurePushStore(db);
  const row = await db.prepare(`SELECT id FROM web_push_subscriptions
    WHERE recipient_id = ? AND revoked_at IS NULL LIMIT 1`).bind(recipientId).first<{ id: string }>();
  return Boolean(row);
}

function configuredVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export async function queuePush(input: {
  db: D1Database;
  type: PushEventType;
  recipientId: PickedBy;
  idempotencyKey: string;
  title: string;
  body: string;
  now?: string;
}): Promise<string> {
  await ensurePushStore(input.db);
  const now = input.now ?? new Date().toISOString();
  const delivery = createPushDelivery({
    type: input.type,
    recipientId: input.recipientId,
    idempotencyKey: input.idempotencyKey,
    createdAt: now
  });
  const payload: PushMessageData = {
    type: input.type,
    title: input.title,
    body: input.body,
    url: "/sunday",
    idempotencyKey: input.idempotencyKey
  };
  await input.db.prepare(`INSERT OR IGNORE INTO web_push_deliveries
      (id, type, recipient_id, idempotency_key, state, payload_json, created_at, sent_at, last_error)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)`)
    .bind(delivery.id, delivery.type, input.recipientId, delivery.idempotencyKey, JSON.stringify(payload), now).run();
  return delivery.id;
}

async function activeSubscriptions(db: D1Database, recipientId: PickedBy): Promise<StoredPushSubscription[]> {
  const result = await db.prepare(`SELECT id, recipient_id, endpoint, expiration_time, p256dh, auth
    FROM web_push_subscriptions WHERE recipient_id = ? AND revoked_at IS NULL ORDER BY created_at`)
    .bind(recipientId).all<PushSubscriptionRow>();
  return result.results.map((row) => ({
    id: row.id,
    recipientId: row.recipient_id,
    endpoint: row.endpoint,
    expirationTime: row.expiration_time,
    keys: { p256dh: row.p256dh, auth: row.auth }
  }));
}

export interface PushDispatchResult {
  deliveryId: string;
  state: "pending" | "sent" | "failed";
  sent: number;
  failed: number;
}

export async function dispatchPushDelivery(input: {
  db: D1Database;
  deliveryId: string;
  fetcher?: typeof fetch;
  now?: string;
}): Promise<PushDispatchResult> {
  await ensurePushStore(input.db);
  const delivery = await input.db.prepare("SELECT * FROM web_push_deliveries WHERE id = ?")
    .bind(input.deliveryId).first<PushDeliveryRow>();
  if (!delivery) throw new Error("Push delivery does not exist");
  if (delivery.state === "sent") return { deliveryId: delivery.id, state: "sent", sent: 0, failed: 0 };
  const vapid = configuredVapid();
  if (!vapid) return { deliveryId: delivery.id, state: "pending", sent: 0, failed: 0 };
  const subscriptions = await activeSubscriptions(input.db, delivery.recipient_id);
  if (!subscriptions.length) return { deliveryId: delivery.id, state: "pending", sent: 0, failed: 0 };
  const payload = JSON.parse(delivery.payload_json) as PushMessageData;
  const now = input.now ?? new Date().toISOString();
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    const prior = await input.db.prepare(`SELECT state FROM web_push_attempts
      WHERE delivery_id = ? AND subscription_id = ?`).bind(delivery.id, subscription.id).first<{ state: "sent" | "failed" }>();
    if (prior?.state === "sent") continue;
    let responseStatus: number | null = null;
    let errorMessage: string | null = null;
    let state: "sent" | "failed" = "failed";
    try {
      const data: Record<string, string> = { ...payload };
      const request = await buildPushPayload({ data, options: { ttl: delivery.type === "awaiting_you" ? 43_200 : 7_200, urgency: "normal", topic: stableHash(delivery.idempotency_key).slice(0, 24) } }, subscription, vapid);
      const body = request.body.buffer.slice(
        request.body.byteOffset,
        request.body.byteOffset + request.body.byteLength
      ) as ArrayBuffer;
      const response = await (input.fetcher ?? fetch)(subscription.endpoint, { ...request, body });
      responseStatus = response.status;
      if (response.ok) {
        state = "sent";
        sent += 1;
      } else {
        failed += 1;
        errorMessage = `Push endpoint returned HTTP ${response.status}`;
        if (response.status === 404 || response.status === 410) {
          await input.db.prepare("UPDATE web_push_subscriptions SET revoked_at = ?, updated_at = ? WHERE id = ?")
            .bind(now, now, subscription.id).run();
        }
      }
    } catch (error) {
      failed += 1;
      errorMessage = error instanceof Error ? error.message : "Push delivery failed";
    }
    await input.db.prepare(`INSERT INTO web_push_attempts
      (delivery_id, subscription_id, state, attempted_at, response_status, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(delivery_id, subscription_id) DO UPDATE SET state = excluded.state,
        attempted_at = excluded.attempted_at, response_status = excluded.response_status,
        error_message = excluded.error_message`)
      .bind(delivery.id, subscription.id, state, now, responseStatus, errorMessage).run();
  }
  const remaining = await input.db.prepare(`SELECT COUNT(*) AS count FROM web_push_subscriptions s
    WHERE s.recipient_id = ? AND s.revoked_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM web_push_attempts a WHERE a.delivery_id = ? AND a.subscription_id = s.id AND a.state = 'sent'
    )`).bind(delivery.recipient_id, delivery.id).first<{ count: number }>();
  const successful = await input.db.prepare(`SELECT COUNT(*) AS count FROM web_push_attempts
    WHERE delivery_id = ? AND state = 'sent'`).bind(delivery.id).first<{ count: number }>();
  const finalState: PushDispatchResult["state"] = Number(remaining?.count ?? 0) === 0 && Number(successful?.count ?? 0) > 0
    ? "sent"
    : failed ? "failed" : "pending";
  await input.db.prepare(`UPDATE web_push_deliveries SET state = ?, sent_at = ?, last_error = ? WHERE id = ?`)
    .bind(finalState, finalState === "sent" ? now : null, finalState === "failed" ? "One or more subscriptions failed" : null, delivery.id).run();
  return { deliveryId: delivery.id, state: finalState, sent, failed };
}

export async function queueAndDispatchPush(input: Parameters<typeof queuePush>[0] & { fetcher?: typeof fetch }) {
  const deliveryId = await queuePush(input);
  return dispatchPushDelivery({ db: input.db, deliveryId, fetcher: input.fetcher, now: input.now });
}

export async function dispatchPendingPushes(input: {
  db: D1Database;
  recipientId?: PickedBy;
  fetcher?: typeof fetch;
  now?: string;
}): Promise<PushDispatchResult[]> {
  await ensurePushStore(input.db);
  const now = input.now ?? new Date().toISOString();
  const edgeCutoff = new Date(Date.parse(now) - 2 * 60 * 60_000).toISOString();
  const approvalCutoff = new Date(Date.parse(now) - 12 * 60 * 60_000).toISOString();
  await input.db.prepare(`UPDATE web_push_deliveries SET state = 'failed', last_error = 'Expired before delivery'
    WHERE state <> 'sent' AND ((type = 'edge_threshold' AND created_at < ?)
      OR (type = 'awaiting_you' AND created_at < ?))`).bind(edgeCutoff, approvalCutoff).run();
  const where = input.recipientId ? "WHERE state <> 'sent' AND recipient_id = ?" : "WHERE state <> 'sent'";
  const freshness = "AND ((type = 'edge_threshold' AND created_at >= ?) OR (type = 'awaiting_you' AND created_at >= ?))";
  const statement = input.db.prepare(`SELECT id FROM web_push_deliveries ${where} ${freshness} ORDER BY created_at DESC LIMIT 40`);
  const rows = input.recipientId
    ? await statement.bind(input.recipientId, edgeCutoff, approvalCutoff).all<{ id: string }>()
    : await statement.bind(edgeCutoff, approvalCutoff).all<{ id: string }>();
  const output: PushDispatchResult[] = [];
  for (const row of rows.results) output.push(await dispatchPushDelivery({ ...input, deliveryId: row.id }));
  return output;
}
