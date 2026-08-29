import { stdin, stdout } from "node:process";

import { Os01ProductionSessionLock } from "../../scripts/os01-production-session-lock";

const path = process.argv[2];
const mode = process.argv[3];
if (!path || !["armed_signal", "unarmed_eof", "armed_expiry"].includes(mode ?? "")) {
  throw new Error("OS-01 lock-child fixture arguments are invalid");
}

const lock = Os01ProductionSessionLock.acquire({
  targetProjectId: "appgprj_os01_lock_child",
  runId: "44444444-4444-4444-8444-444444444444",
  seedCommitment: "e".repeat(64),
  startedAt: "2026-08-28T12:00:00.000Z",
  expiresAt: "2026-08-28T13:00:00.000Z"
}, path);

if (mode !== "unarmed_eof") lock.armExternalMutation("f".repeat(64));

let terminal = false;
function terminate(cause: "signal" | "eof" | "expiry"): void {
  if (terminal) return;
  terminal = true;
  const disposition = lock.terminalDisposition();
  lock.close();
  stdin.pause();
  stdout.write(`${JSON.stringify({ event: "terminated", cause, ...disposition })}\n`, () => {
    process.exit(disposition.cleanupRequired ? 75 : 0);
  });
}

process.once("SIGTERM", () => terminate("signal"));
stdin.once("end", () => terminate("eof"));
stdin.resume();
if (mode === "armed_expiry") setTimeout(() => terminate("expiry"), 50);
stdout.write(`${JSON.stringify({ event: "ready", mode })}\n`);
