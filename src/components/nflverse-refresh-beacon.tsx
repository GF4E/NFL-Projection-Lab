"use client";

import { useEffect } from "react";

const SESSION_KEY = "projection-lab:nflverse-refresh";
const FIVE_MINUTES = 5 * 60_000;

export function NflverseRefreshBeacon() {
  useEffect(() => {
    const refresh = () => {
      const previous = Number(window.sessionStorage.getItem(SESSION_KEY) ?? "0");
      if (Date.now() - previous < FIVE_MINUTES) return;
      window.sessionStorage.setItem(SESSION_KEY, String(Date.now()));
      void fetch("/api/nflverse", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" }
      });
    };

    refresh();
    const interval = window.setInterval(refresh, FIVE_MINUTES);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}
