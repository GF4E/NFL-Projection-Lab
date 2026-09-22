# Cloud scheduler

DigitalOcean Basic 512 MB / 1 CPU, New York, with 2 GiB swap. The engine checkout uses the Mac's absolute path so pinned evidence references remain valid. Only the operational wrapper is new; every frozen runtime hash is checked by the existing worker.

The Linux environment is pinned in `environment.yml`, with a platform-specific explicit lock stored in the deployment record. Python and the main numerical dependencies match the Mac. Linux uses pandas 2.2.3 because pandas 1.5.3 has no CPython 3.12 Linux package; the full regression suite and isolated synthetic capture/lock/grade drill must pass before activation.

`nfl-engine-capture.timer` checks the original T80/T75 windows every 15 seconds. The hourly `nfl-engine-daily.timer` preserves the existing daily idempotent preparation/grade and hourly public-final refresh. Grading defers during capture windows. systemd loads the Odds API and DigitalOcean secrets from root-only `/etc/nfl-engine/secrets.env`; Git uses a separate repository-scoped SSH deploy key and a branch-restricting pre-push hook. No provider call is made by the synthetic drill.

## Ownership and fallback

`work/cloud-migration-v1/ownership.json` on origin/engine-v2 is the durable single-owner lock. Both launchd and systemd wrappers read the remote lock before any worker operation. Only its ACTIVE owner can work. A local advisory lock also serializes capture and grading. Publication failure blocks the next worker until available artifacts are pushed. Mac launchd remains loaded as a standby and yields to the cloud owner.

The lock deliberately does not expire. A dead heartbeat cannot establish whether a paid capture happened. There is no automatic takeover during a network partition. To transfer to the Mac, first stop/disable both cloud timers and services (or fence/power off the host through DigitalOcean if it is unreachable), recover and push its outstanding captures, quota ledger and first grades, then change the committed owner to `mac-fallback`. If a dispatch is uncertain, preserve its reservation and do not retry it. Resolve that uncertainty before handoff. Never use force push or reset; conflicting artifact histories stop for inspection.

## Verification

Run the existing `test_week1*.py` suite using the pinned platform interpreter. For a new isolated capture drill:

```sh
/opt/nfl-runtime/env/bin/python -B scripts/cloud_synthetic.py --output work/cloud-migration-v1/NEW_SYNTHETIC_RUN
```

Replay the existing immutable baseline without changing its contents:

```sh
/opt/nfl-runtime/env/bin/python -B scripts/model_pick_replay.py
```

Inspect `systemctl list-timers 'nfl-engine-*'` and `systemctl show nfl-engine-capture.service nfl-engine-daily.service -p Result -p ExecMainStatus`. Successful synthetic execution proves the transport substitute, lock and grader work on Linux; the next actual scheduled paid capture remains prospective.

### In-season learning loop

`nfl-learning.timer` runs Tuesday 06:00 America/Los_Angeles (DST-aware), with `Persistent=true`. Its service uses the same durable owner and `.cloud-dispatch.lock` as capture/daily, public football source refresh, entry sync, grading, then `scripts/projection_learning.py` refit/gate/report. Incomplete grades or PBP fail closed; the existing hourly daily job retries after data arrive. Receipt `outputs/in-season-learning-v1/refits/2026-wN.json` pins the issuing fit SHA256. `work/in-season-learning-v1/active-fit-ref.json` changes only on a completed refit or logged promotion. All original locks and grades retain their issuing fit/distribution. No Odds API call is added by learning mode. `--trend` prints the canonical table report; `outputs/in-season-learning-v1/trend.json` supplies the TREND page. The current season is explicitly 2026; Week 18 completes this season's refit cycle.

## Numerical shadow cutoff worker (September 22 rebuild)

`nfl-cutoff-state.timer` checks Friday, Monday and Tuesday 06:00 America/Los_Angeles and every 60 seconds for ordered catchup. Its service invokes `cloud_scheduler.py cutoff` under the same committed host owner and dispatch lock as capture/daily. It has one BLAS worker, a 600-second ceiling and 4 GiB memory limit. The worker is NUMERICAL_SHADOW: it records source-qualified states but cannot issue forecasts, refit, call providers or promote a control.

One-time setup is `cloud_scheduler.py cutoff-configure --host digitalocean:599707390` under the service identity and existing owner fence. This pins the currently qualified method and the first cutoff strictly after configuration. Never copy a simulation into live state or backdate the first cutoff. `work/projection-cutoff-state-v1/worker-config.json`, cutoff receipts, operations and operation-history are preserved/published alongside the observation receipt graph. Installing or changing the executable does not authorize incompatible configuration replacement.

The independent watchdog reads these receipts and the timer. A missing receipt becomes overdue after 661 seconds; input shortfalls, failed operations and missing acknowledgments remain explicit. On FAILED_CLOSED, inspect the named reason and retained intent/state hashes, check disk/inodes/source integrity, and reconcile whether an immutable cutoff receipt already committed. Do not delete the operation, reset an attempt counter or advance the pointer by hand. Interrupted executions reconcile automatically within three attempts and ten minutes; hard source/configuration/local-I/O failures require a reviewed compatible repair. This increment provides detection and safe stopping for those hard failures, not an automatic repair of arbitrary corruption.

See work/engine-rebuild/CUTOFF-WORKER.md and its installed/canary receipts. Actual production numerical activation, common Tuesday ordering and final-issuance integration remain pending. A timer returning WAITING_FOR_CUTOFF before Friday is correct behavior, not evidence that a live assimilation has run.
