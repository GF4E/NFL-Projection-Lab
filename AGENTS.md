# NFL engine operating instructions

## Standing autonomy grant

Gabe authorizes creating files, installing Python packages in the pinned environment, writing launchd agents, and committing and pushing to `engine-v2`. Execute routine work without asking again. The only remaining stop conditions are spending beyond the cumulative 300 Odds API credits for this deliverable, deleting any file, or changing a registered gate. Obtain a decision before crossing one of those boundaries.

## Six prompting rules

These consolidate Gabe's standing instructions into operating rules; they are not a quotation of a separate six-rule document.

1. Read the current repository state and governing records first. Carry forward accepted decisions and the latest scope reset; do not relitigate frozen results.
2. Act on authorized requests and continue until the requested outcome is complete. Do not ask again for permission already granted.
3. Decide routine implementation details independently and log material decisions in the experiment record. Use existing code and data before adding process or dependencies.
4. Stop only at the three boundaries in the autonomy grant. Keep budget uncertainty accounted for and never silently loosen a gate.
5. Test meaningful behavior regularly, inspect results, and fix failures. Distinguish verified execution from future scheduled outcomes; never backdate evidence.
6. Work in one continuous run, give concise progress updates, and report once after verification and a pushed commit. Use DONE, TESTS, ARTIFACTS, BLOCKED, COMMIT lines; include credits spent for provider work.

## Scope and safeguards

Current deliverable: market pricing, CSV pick log, four-book execution board and scheduled T65 mainline captures with immutable T60 artifacts. The September 8 request authorizes the empirical market residual distribution, teaser leg probabilities, consensus-or-model board filter, and offline grading now. Power simulation and other model/teaser work remain deferred. Execution books: BetMGM, Caesars, FanDuel, DraftKings. The September 8 authorized filter passes either consensus or empirical-model edge at the unchanged 60–70% band and 10-cent threshold; preserve other registered mathematics. Never modify frozen experiments, archived forecasts or saved scorecards; never reverse E3's rejection. The joint pick log has no approver or executor: one picked/declined entry, labeled live or paper. Weekly and cumulative scorecards show both classes together and separately without collapsing their identities.

Pin ingested sources by hash; preserve versions, quota accounting, chronology safeguards and last-good publication. No credentials in code, logs or Git. Never make unscheduled Odds API calls. Respect the existing reserved live budget within the cumulative cap.

Use `/opt/anaconda3/bin/python3.12`. Verify this workflow with:

```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```

Offline replay of the named capture set:

```sh
/opt/anaconda3/bin/python3.12 -B scripts/week1_pricing.py --manifest work/week1-followups-v1/combined-manifest.json
```

Only push `engine-v2` to `https://github.com/GF4E/NFL-Projection-Lab.git`; never push `main` or `os01-hosted-diagnostic-v1`. Use conventional commits and run `scripts/nfl_engine_autopush.py --check` with pinned Python before committing. Verify the remote commit before reporting completion. Reports cite experiment records for numerical claims.

## Weekly harvest

Gabe authorizes the weekly candidate harvest documented in HARVEST.md and the `engine.harvest --harvest` runner. Port only licensed implementations; nfelo permits methodology-based independent work and reference CSV use in this request, never code copying. The September 11 six-week queue in HARVEST.md supersedes the open-ended weekly schedule. Execute Weeks 2 through 7 in order, with each listed success criterion as its promotion gate; track status in work/harvest-methods-review-2026-09-11/queue.json. Log failures as negative and do not revisit them this season. Preserve historical gates and outcomes, evidence qualification, and the T75 live-package freeze below. Register operational definitions before comparative results; unresolved gate definitions remain blocked. Missing QB inputs or totals are blockers, not zero-valued forecasts or successful comparisons. Weekly research uses no Odds API credits.

The executable `--harvest elo-anya-v2` comparison pairs plain 538-default Elo and a reconstructed rolling-ANY/A QB proxy with a shared league-mean totals companion. ANY/A is not 538 VALUE. Most-attempts starter identity is retrospective; prior-week value windows do not establish pregame starter availability. Record that evidence distinction.

## T75 standing model-pick deliverable (September 10 supersession)

The current capture/lock schedule is T80/T75, replacing the scheduled T65 worker. The immutable runtime manifest is `work/model-pick-v1/runtime-config.json`; its version includes the cutoff and empirical distribution hash. Cloud migration is verified in work/cloud-migration-v1/experiment.json. The primary is DigitalOcean droplet 599707390; systemd invokes scripts/cloud_scheduler.py around the unchanged frozen workers. Mac launchd remains standby and yields to the committed ownership lock. Never invoke the frozen runner directly on either host to bypass ownership. Ownership has no timeout: fence the previous owner and reconcile dispatch receipts and the quota ledger before a handoff. See ops/cloud/README.md. Linux uses the pinned runtime and explicit platform lock in that deployment record; Mac retains /opt/anaconda3/bin/python3.12.

The new live schedule has its own authorized **60 credits per NFL week** hard cap, reserving three per kickoff group and accounting for uncertain dispatches. This supersedes the prior deliverable's cumulative cap for these new prospective requests; keep the old ledger unchanged. No manual/unscheduled refresh, retry after uncertain dispatch, or backfill.

One spread and one total model pick per game, or a reasoned MISSED record. Four execution books plus Pinnacle reference; leave-one-out power-devig consensus. EV includes push-zero return. Shadow inputs never alter the actual selection. Model picks are paper records, not executed wagers. Preserve every T75 lock and first final grade. No pick logic, coefficient, distribution, cutoff or books change before the Week 4 review; any subsequent approved change requires a new version.

Preparation (`engine.t75_prepare`) may read prior-week results for shadow state and writes label-free schedule DTOs. The lock worker never reads final/closing feeds. Scoring (`engine.t75_report`) never opens T80 captures and explicitly labels `nflverse_close` CLV. Keep this reference separate from legacy executed-book CLV. Reports remain descriptive, separated by version. Inactives unavailable means unknown, not active.

Verify with the existing `test_week1*.py` command. Replay the named immutable synthetic experiment with `/opt/anaconda3/bin/python3.12 -B scripts/model_pick_replay.py`. Scorecard and shadow diagnostics: `/opt/anaconda3/bin/python3.12 -B -m engine.t75_report --scorecard --diagnose`. Add `--refresh-results` only for the daily public nflverse results ingestion; it uses no Odds API credits. Reports are content-addressed under `outputs/model-pick-v1/reports/`. See `work/model-pick-v1/experiment.json` for conventions and deployment evidence.

## September 11 live-pick lifecycle supersession

Gabe authorizes Friday 12:00 PT, Saturday 12:00 PT, Sunday 07:00 PT and T80 captures under the existing 60-credit weekly cap, plus the explicit first Friday capture now. `scripts/live_pick_runner.py` replaces the frozen runner operationally without modifying its archived code or model arithmetic. One current live record per game contains one spread and one total selection; captures overwrite it. At T75 the latest live record becomes LOCKED, and only locks enter the pick log and scorecard. No new live version snapshots. Existing historical locks, first grades and experiments stay preserved. The shared note closes at T75 using server time and is saved with the lock; human leans are graded separately. The note editor requires the private team code; never commit it. Canonical current wager source and paths use `jarrett`. Historical evidence containing the prior spelling remains reference-only and is not double-counted. This request authorizes the compact reader/note endpoint changes on main as well as engine-v2; production engine data stays off main.
