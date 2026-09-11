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
