# ADR-0004 — Watchdog activation cursor

## Status

Accepted for OS-15A qualification on 2026-08-26.

## Falsification result

Without a prior watchdog checkpoint, the v3 runtime inspected only the most recent normal interval. If the watchdog itself failed immediately after activation, older missed dispatcher ticks could disappear permanently.

## Decision

The accepted OS-00/OS-01 append-only `engine_activations` row is the lower boundary for watchdog recovery. The first recoverable dispatcher slot is the first minute strictly after `activated_at`. A watchdog with neither a prior checkpoint nor a matching activation cursor aborts without advancing a checkpoint. OS-15A tests may seed this row only in isolated resources; qualification creates no production activation.

Future cutover must preserve the activation row and verify the cursor before enabling capture. Missed pre-activation slots are never replayed.
