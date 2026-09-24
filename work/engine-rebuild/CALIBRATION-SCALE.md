# Full-size calibration resource qualification — incomplete

SYNTHETIC ONLY, NOT AN EXPERIMENT. No authoritative NFL outcome or forecast series was opened; no real registration, numerical gate result, promotion or rejection was produced.

**Finding:** the complete calibration workflow is not yet resource-qualified on this droplet. A full-size artificial-data canary failed at its tightened 256 MiB memory limit. The host has only 480,497,664 bytes (458 MiB) of physical RAM; the previously configured 4 GiB process ceiling is not evidence that this capacity is available.

REVIEW REQUESTED: artificial scores and full-size training manifests measure one workload, not a worst-case bound for the real historical experiment. Running the real comparison before its Tuesday prerequisites was not an acceptable alternative.

| Item | Observed evidence |
| --- | --- |
| Population | 768 warmup + 2,639 evaluation games; ten evaluation seasons; 5,278 held-out team targets intended |
| Manifest dimensions | 226 weekly own-model fits; 13 annual legacy donor fits; 403,279 earlier training memberships independently checked, plus two synthetic prehistory sentinels |
| Forecast/fit chronology checks | 6,814 artificial rows checked; no target game in its own fit; both arms use paired actual scores |
| Numerics | Existing evaluator/settings, including 10,000 paired-game, whole-season and three-week-block draws; all 14 source files match local hashes |
| Attempt | `nfl-calibration-scale-20260924.service`, invocation `ccc5d2f0c53d459fbd01b8579ae1c666` |
| Supervisor | One CPU/library thread, zero swap, 570-second whole-job limit; source/output mounts read-only, private network, dispatch fence |
| Memory history | Initially 4 GiB ceiling; tightened to 256 MiB at 01:49 UTC after observing actual host capacity; not represented as a 256 MiB limit throughout |
| Terminal evidence | Kernel `CONSTRAINT_MEMCG` names this test unit and Python PID; manager records `oom-kill` at 01:51:34 UTC, 369.999 service seconds after start |
| Retention | 43 files / 13,653,094 logical bytes remain on host, with every file SHA-256 inventoried; native request/start exist, numerical result and receipt do not |
| Production checks | All five timers active; subsequent cutoff service exit 0 at 01:53:51 UTC; final-reader status file refreshed at 01:53:31 UTC; capture service was observed starting, not asserted completed |

The manager's sampled 200.9 MiB memory peak is **not** the true allocation peak: the kernel separately recorded 260,508 KiB anonymous RSS and 2,688 KiB file RSS at the kill. Do not use the sampled value to claim that this workload fits 256 MiB. No complete file-allocation peak, exact-retry result or retained-report result exists. The run did not reach those acceptance checks. Its failure is operational evidence, never a calibration rejection or predictive finding.

The disposable job's cgroup, not the entire host, hit the limit. The output/source mount and network evidence were captured while the exact invocation was live. Only the isolated attempt and the existing dispatch-lock file were writable. Synthetic prerequisite receipts are labeled as fixtures and never copied into the real experiment ledger. The full failed tree remains at `/mnt/nfl-engine-profiles/calibration-scale-20260924/attempt1`; it is not deleted or represented as a finished experiment.

## Next action and limits

Locate the peak allocation before any repeat. Reduce evaluator/retention memory with exact numerical parity, or qualify an existing separate research worker within the one-worker/4-GiB/45-minute envelope. Do not repeat the unchanged attempt, relax a statistical gate, infer permission to resize the droplet, or qualify the real historical run from these artificial values. The precise allocation that triggered the limit remains unknown; there is no claim that serialization alone caused it.

The first actual Friday cutoff, qualified issuing/public/control association, Tuesday published closeout and weight-only refit still precede real E-CAL registration. Conditional-mean semantics, E-VENUE, authentic reviewers, sustained storage reserve and an observed live cycle remain incomplete. Shipping source, fit, calibration, control authority and public deployment were not changed by this work. Provider calls and additional spending: zero.

Evidence: `calibration-scale/verification.json`, `journal-attempt1.jsonl`, `host-capacity-guard.txt`, `isolation-attempt1.txt`, `host-after-attempt1.txt`, `scheduler-after-attempt1.txt`, `retained-attempt1.json` and `fixture-check.json`. The fixture generator and preregistered operational plan are `profile_calibration_scale.py` and `CALIBRATION-SCALE-PLAN.md`.

Least certain: the exact peak-allocation site. That uncertainty prevented an unmeasured optimization or unchanged retry; the next run requires a targeted diagnosis.

Confidence: near-total that this attempt failed at its cgroup memory limit, meaning arithmetic and identity checks on verified journal/kernel records. Lower to high if independent review cannot match the kernel event to this invocation. Confidence in eventual full-workload readiness remains low until a complete bounded run succeeds.
