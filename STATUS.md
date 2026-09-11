# Current status — teaser and weather repair, September 11, 2026

Current step: dated teaser-price configuration and asynchronous GFS forecast repair implemented. Eight upcoming outdoor kickoff forecasts restored; Saturday 12:00 PT evaluation is wired and tested, not yet observed. Only T75 locks enter scoring. Zero Odds API credits spent; 56 Week 1 credits remain. FanDuel current two-/three-leg prices still need account confirmation; its entries remain null. BetMGM and Caesars posted references retain source-age/jurisdiction warnings. [Experiment](work/teaser-wind-fix-v1/experiment.json), [wind and pricing report](work/teaser-wind-fix-v1/report.md). Last verified engine commit: `f320273f25e1f24f188da8c57b67b7ddf50601ad`; main: `05312d0d4574e6234f9e41bf0786eb0d8ac7bbaa`. Cloud source and tests verified; both timers active. Website release succeeded and its public endpoint returned eight forecasts and teaser near misses. This evidence commit is available in Git. Earlier entries below are historical.

# Current status — live lifecycle September 11, 2026

Mutable Friday/Saturday/Sunday/T80 selections and T75 locking are implemented. The compact grid opens measured analysis and a shared pre-lock note, with frozen human leans graded separately. Jarrett is the canonical source; both Caesars rows and original outcomes are preserved. Friday capture completed at 11:33 PT: 14 games, 28 live picks, two credits used, 56 Week 1 credits remaining. Only the two existing locked model picks are in the pick log. Wind is unavailable because provider component runs differ; the rule stays off. Shared-note read/sync and rejection after lock are verified live. The compact reader is deployed and verified with all 14 live games, expanded analysis and shared note controls; upstream stale-cache refresh is fixed. No decision is needed from Gabe. Use the local `.cloud-private/TEAM-EDIT-CODE.txt` for note access. Current artifact commit: `f7941c010a075d3207a404d7a6b81e7b67c6ceb4`. [Experiment](work/live-lifecycle-v1/experiment.json). Earlier status entries below are historical.

# Current status — cloud primary verified September 11, 2026

Current step: cloud scheduler migration complete. DigitalOcean `nfl-engine-primary` (`159.89.185.88`, NYC3) runs the original T80/T75 workers under systemd. Both timers are enabled and both jobs have observed exit 0. Cloud synthetic capture/lock/grade produced two picks and two grades with no provider requests; the host successfully committed and pushed artifacts to `engine-v2`. [Deployment evidence](work/cloud-migration-v1/experiment.json).

Mac capture and daily launchd jobs remain loaded as standby and have been observed yielding to the cloud ownership lock. Ownership is durable; failover requires fencing the old host and reconciling any pending dispatch before assigning the Mac. No automatic takeover on heartbeat loss. [Runbook](ops/cloud/README.md).

Verification: 133 tests passed on each platform, no failures. Synthetic picks and consensus match exactly, and all 14 frozen runtime hashes remain unchanged. Linux pins Python 3.12.2; its pandas 2.2.3 compatibility exception and complete dependency lock are recorded. Odds API spend for migration: zero; Week 1 remains at 58 of 60 credits available. Next registered capture: September 13 at 15:40 UTC, lock at 15:45 UTC. Future capture success remains unverified.

No deployment decision is needed from Gabe. Earlier missing wager details remain unknown. Cloud-generated artifact commit verified: `258b0c1c01f1be0aab8b6f803002a251f3f9f97a`; this final deployment record's commit is available through Git. Earlier status entries below are historical.

# Current status — September 11, 2026

Current step: compact locked-pick board, SF/LA final grades, and Caesars executions completed. SF +3.5 is WIN; Over 47.5 is LOSS. Seattle -3 is PUSH and Rams -3 is LOSS in the separate Jarrett log. [Evidence and tests](work/board-redesign-v1/experiment.json).

No Odds API credits used by this change. Week 1 has 58 of 60 credits remaining after the scheduled SF/LA capture; see the experiment budget snapshot. The T80/T75 schedule and frozen engine remain unchanged. The read-only refresh button fetches the latest published board; it does not dispatch odds requests. Hourly public final refreshes preserve every source and first grade.

Next information from Gabe: Rams stake and timezone-qualified placement times for both Caesars bets. These are marked unknown; this does not block result grading or the board. Last verified implementation commit: `9a7a4b9`; this update's commit is available through Git.

Earlier status entries below are historical and superseded where they conflict with this current snapshot.

# Current status

Date: September 10, 2026 (Europe/Rome).

Current deliverable: T80 capture / T75 immutable model picks installed on the existing Mac. Capture and daily preparation/scoring launchd jobs have observed exit 0. Cloud remains unprovisioned; Mac sleep remains a capture risk. The required next action from Gabe is provider sign-in and API access at [DigitalOcean billing](https://cloud.digitalocean.com/account/billing) to resume the separately blocked cloud migration.

Version: `model-pick-v1-T75-4a14b3fdf51d13786a2e905526f21d4fe7601226e01da29583be8ff3210a7041`. Runtime: [pinned manifest](work/model-pick-v1/runtime-config.json). Evidence: [experiment](work/model-pick-v1/experiment.json).

Last verified pushed commit before this update: `28e2fee344dd7e688c89d697153755731dc141ab`, branch `engine-v2`. This update's hash is available from `git log -1 --format=%H`.

Odds API budget: 0 credits spent by this build; 60 remain for the new Week 1 schedule. Three credits reserved before each dispatch. The old deliverable ledger is preserved separately. Next capture: September 11, 01:15 CEST; cutoff 01:20 CEST, SF at LA. The missed opener stays MISSED in the new version; no live picks have yet been captured or graded. [Budget, schedule and verification record](work/model-pick-v1/experiment.json).

Verification: 105 tests passed, 0 failed. Named synthetic replay created two picks and two grades and reproduced the identical pick hash. These are synthetic results, not evidence of a live capture. [Rehearsal](work/model-pick-v1/synthetic-v1/experiment.json).

```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
/opt/anaconda3/bin/python3.12 -B scripts/model_pick_replay.py
/opt/anaconda3/bin/python3.12 -B -m engine.t75_report --scorecard --diagnose
```

Reports: `outputs/model-pick-v1/reports/`, separated by version; CLV reference is explicitly `nflverse_close`. T60 artifacts and legacy scorecards remain separate. Pick logic and frozen shadow coefficients remain fixed through the Week 4 review. Current ESPN probes expose no dedicated inactives collection; scheduled pulls record unknowns if still unavailable.

## Executed slip ingestion

Implemented `--ingest-slip` for pasted text and local screenshots. Production log: `outputs/jarrett/pick_log.csv`, source `jarrett`, status `executed`. Missing fields and all OCR fields require confirmation before append. No real slip was supplied. The hourly cached-results grading job has observed exit 0; source scorecards retain separate model versions and CLV references. [Usage](SLIPS.md), [experiment](work/slip-ingest-v1/experiment.json).

Verification: 117 passed, 0 failed; local screenshot rehearsal and duplicate/idempotent grading verified. Odds API credits spent: 0. Evidence and commands are in the linked experiment. Frozen T75 file hashes are unchanged. Last verified pushed commit before this update: `53916c86cdb70b0012ffe9a23fad48b4aefe2dca`.

## Locked board bridge — September 11, 2026

Read-only board export and website reader implemented. NE at SEA is 13–10 FINAL, with both immutable model records MISSED; no retrospective picks or grades were invented. Frozen runtime hashes are unchanged. Zero Odds API credits. Verification and decisions: [experiment](work/board-bridge-v1/experiment.json). Reader deployed and verified live. Capture and daily-grade publication wrappers are loaded and each has observed exit 0. The site displays the real final and MISSED state; W/L/PUSH display is covered by synthetic tests. Last verified engine commit before this change: `fa1008c5f5918016f89f4c3427282490c6668512`. Jarrett slip remains pending confirmation of the placement timezone.
