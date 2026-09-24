# Operator instructions and actual service limits reconciled

REVIEW REQUESTED (Tier 2): 570 seconds bounds the whole daily/learning/cutoff service, including preparation and lock wait, rather than adding separate phase supervisors. This is conservative within the ten-minute weekly/slate budget; the alternative is phase-specific child limits and a longer outer window. Existing capture remains 240 seconds. No model, population, fitted parameter, gate or experiment clock changes.

The host at 2026-09-24 00:22:43 UTC still used issuing source d2f7adaff and active fit 801ef079. Packet 10bc9361 matches all fifty issuing files. Both corrected-pipeline/weekly-configuration pointers are absent; the installed shadow worker waits for Friday September 25 at 13:00 UTC. Source 3990df9de and the accepted runtime restore exist; retired source-1c34/source-76 expanded paths do not. The main, initial-handoff and runtime-recovery runbooks now reflect those facts rather than obsolete milestones.

The outside observer verifies public board bytes using anonymous curl and reports the final reader HEALTHY. Its only active host finding is STORAGE_HEADROOM_UNQUALIFIED. Approved storage migration and measured captured peak are verified, while sustained growth and complete workload reserves are not. Public access is no longer the pending dependency; the first real cutoff, initial activation, actual issuing/public/control association and authentic method reviews remain distinct requirements.

## Installed correction

The read-only inspection found that the weekly oneshot had no memory limit and a thirty-minute start timeout; daily allowed twelve minutes. Those settings contradicted the standing resource contract even though captured canaries used stricter limits.

| Service | Prior start limit | Current hard start limit | Current resident memory / swap ceiling |
|---|---:|---:|---|
| Capture | 240 seconds | 240 seconds | 400 MiB / 1,500 MiB (preserved) |
| Daily | 720 seconds | 570 seconds | 400 MiB / 1,500 MiB (preserved) |
| Learning | 1,800 seconds | 570 seconds | 4 GiB / zero |
| Cutoff state | 600 seconds | 570 seconds | 4 GiB / zero (preserved) |

All four now have one-CPU quota, one thread for each numerical-library environment, and SIGKILL/control-group timeout semantics. The shared dispatch fence still supplies cross-job exclusion; a quota is not that fence. The separate experiment CLI retains its 2,700-second phase timeout and hard address-space limit. No real experiment starts here.

`systemd-analyze verify` accepted the units. Under UID 1000, an isolated two-second oneshot with a parent and child both ignoring SIGTERM ended with the expected timeout/SIGKILL; both PIDs were absent afterward. Its deliberate service failure is retained as successful negative-test evidence, never reported as a production failure or a successful forecast job. The tiny fixture does not establish full-job runtime or prove all possible recovery behavior.

Installation stopped only the four writing timers, took the actual dispatch fence, required workers terminal, atomically replaced the reviewed units and restored every prior active/enabled timer state. Storage dependency drop-ins remain present. All 52 original locks/grades plus the active-fit pointer were unchanged. A follow-up explicitly set learning swap to zero so its 4 GiB resident cap cannot be extended with swap; the first installation receipt remains preserved and the final learning file is identified by learning-swap-bound.json. No manual production worker, source refresh, fitting, paid request, extra storage purchase or model activation was performed.

## Evidence and operational boundaries

- `runbook-reconciliation/host.json`: initial actual host/source/pointer/mount/units observation.
- `outside-monitor.json`: necessary fields from the independently scheduled Mac observation, with original snapshot hash and observation time.
- `timeout-proof.json`: exact isolated test invocation, manager evidence and absent parent/child processes.
- `install-receipt.json` and `learning-swap-bound.json`: retained before/after hashes and actual loaded limits.
- `installed-timers.json`: actual timer definitions and active states, unchanged schedules.
- `RUNBOOK.md`, `INITIAL-HANDOFF-RUNBOOK.md`, `RUNTIME-RECOVERY-RUNBOOK.md`: current operator instructions. Historical reports and immutable packet snapshots remain unchanged.

This operations/documentation change leaves the fifty-file issuing closure and diagnostics module unchanged. It does not need another numerical replay, source archive or recovery canary. The same verified source/runtime recovery point remains applicable; installed service limits are qualified by their own evidence. An actual future daily/learning job still needs its own completion/latency receipt. Whole-machine restoration, always-on outside-host coverage and sustained headroom remain unqualified.

Least certain: whether the conservative whole-job deadline leaves enough headroom under a future slow provider or cold filesystem. A timeout must retain failure evidence and undergo diagnosis; it does not authorize extending the budget.

Confidence: medium in operational readiness—authoritative installed settings and the timeout test agree, but the whole-job budget choice could reasonably differ and future live execution remains unobserved. Lower to low if an independent unit inspection disagrees or the next due job cannot complete within its standing budget. Predictive improvement is not claimed.
