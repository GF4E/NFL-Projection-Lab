"use client";

import { useState } from "react";

export function PushPermission() {
  const [state, setState] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  async function request() {
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined") return setState("unsupported");
    await navigator.serviceWorker.register("/sw.js");
    setState(await Notification.requestPermission());
  }
  return <button className="ghost-button" onClick={request} disabled={state === "granted" || state === "unsupported"}>{state === "granted" ? "Push enabled" : state === "unsupported" ? "Push unavailable" : "Enable the two push alerts"}</button>;
}
