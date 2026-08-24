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
      void fetch("/api/nflverse", { method: "GET", credentials: "same-origin" }).then((response) => {
        if (response.ok) window.dispatchEvent(new Event("projection-lab:data-refreshed"));
      }).catch(() => {
        // Each background runner preserves its last good snapshot and records its own stale state.
      });
    };

    refresh();
    const interval = window.setInterval(refresh, FIVE_MINUTES);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}
