"use client";

import { useEffect, useState } from "react";

type PushState = "checking" | "available" | "enabled" | "denied" | "unsupported" | "error";

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function PushPermission() {
  const [state, setState] = useState<PushState>("checking");

  useEffect(() => {
    let active = true;
    const inspect = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
        if (active) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setState("denied");
        return;
      }
      const response = await fetch("/api/push-subscription", { credentials: "same-origin" });
      const data = await response.json() as { configured?: boolean; subscribed?: boolean };
      if (active) setState(response.ok && data.configured ? data.subscribed ? "enabled" : "available" : "unsupported");
    };
    void inspect().catch(() => active && setState("error"));
    return () => { active = false; };
  }, []);

  async function enable() {
    setState("checking");
    try {
      const configResponse = await fetch("/api/push-subscription", { credentials: "same-origin" });
      const config = await configResponse.json() as { publicKey?: string | null; error?: string };
      if (!configResponse.ok || !config.publicKey) throw new Error(config.error ?? "Alerts are not configured");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "available");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(config.publicKey)
      });
      const response = await fetch("/api/push-subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON())
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "Alert subscription failed");
      }
      setState("enabled");
    } catch {
      setState("error");
    }
  }

  const label = state === "enabled" ? "Alerts on"
    : state === "checking" ? "Checking alerts…"
      : state === "denied" ? "Alerts blocked"
        : state === "unsupported" ? "Alerts unavailable"
          : state === "error" ? "Retry alerts"
            : "Enable alerts";
  return <button className={`push-toggle ${state}`} onClick={enable}
    disabled={state === "enabled" || state === "checking" || state === "denied" || state === "unsupported"}
    title="Only Awaiting You and Edge Threshold notifications are permitted">{label}</button>;
}
