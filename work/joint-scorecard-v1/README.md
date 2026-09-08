# Joint pick log and scorecard

[Experiment and verification](experiment.json). Live and paper logs each contain joint picks with no person roles. The selected book remains on the record. A repeat of the same ID and content is idempotent; conflicting contents are rejected. No approval/execution workflow is required.

Append one live joint pick (use `--paper` for a paper entry):
```sh
/opt/anaconda3/bin/python3.12 -B scripts/append_pick.py --pricing-csv PRICING.csv --quote-id QUOTE_ID --pick-id UNIQUE_ID
```
`--status` defaults to `picked`; use `--status declined` to retain a declined decision without counting a bet.

Generate the current scorecard from both default logs:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.scorecard --scorecard
```
With results and CLV grades:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.scorecard --scorecard \
  --results results.csv \
  --grades outputs/grades/LIVE_RUN/pick_clv.csv outputs/grades/PAPER_RUN/pick_clv.csv
```
Results require `event_id,home_score,away_score,status`, with `status=final`; optional season/week are checked against the pick. Run the existing `--grade` command separately on each class's log to produce closing-value inputs. Omit missing grades; absent CLV stays blank. All commands are offline.

`outputs/scorecard.csv` contains spreads and totals separately, each with `combined`, `live`, and `paper` rows at cumulative and season/week scopes. Fields include wins, losses, pushes, pending, declined, CLV sample size and mean CLV in American cents. Combined counts both classes; it never relabels paper bets as live. `outputs/scorecard_picks.csv` presents all individual records together with class and paper flag, settlement and available CLV. Declined rows are visible but excluded from bet counts and CLV averages. No picks currently exist, so the initial report has only empty cumulative rows.

The report and its input-hash receipt are regenerated on each command; pick ledgers remain append-only. No scheduled automation or provider call is added.

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```
Replay the named experiment from its immutable input snapshots without results or credits:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.scorecard --scorecard --picks work/joint-scorecard-v1/inputs/pick_log.csv work/joint-scorecard-v1/inputs/paper_pick_log.csv --output work/joint-scorecard-v1/replay/scorecard.csv
```
 Test-fixture scorecards under `work/joint-scorecard-tests/` are synthetic and separate from the actual output.
