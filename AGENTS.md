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

Current deliverable: market pricing, CSV pick log, four-book execution board and scheduled T65 mainline captures with immutable T60 artifacts. No model, power simulation or teaser work before September 10 and the later authorized steps. Execution books: BetMGM, Caesars, FanDuel, DraftKings. Preserve the consensus filter and all registered mathematics. Never modify frozen experiments, archived forecasts or saved scorecards; never reverse E3's rejection. Keep approved/declined and executed/paper pick records separate.

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
