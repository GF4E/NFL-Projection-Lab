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
