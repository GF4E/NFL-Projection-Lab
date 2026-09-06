> Superseded active board: see [four-book coverage and T60 follow-up](FOLLOWUP.md). Earlier snapshots below remain preserved.

# Week 1 pricing release

[Week 1 board](4ea6e3bf91f17387/week1_board.csv) · [All priced offers](4ea6e3bf91f17387/pricing.csv) · [Decision record](../../work/week1-pricing-v1/experiment.json)

The current snapshot contains 16 games and 9,800 priced offers. **No executable offer passes both the inclusive 60–70% consensus probability band and the ten-cent price advantage.** The board CSV intentionally contains its header and no picks. Caesars was requested but not returned. Pinnacle is the selected sharp reference. These are recorded observations, not missing values filled with another book. [Snapshot result](../../work/week1-pricing-v1/result-4ea6e3bf91f17387.json)

Credits: 163 confirmed by provider headers plus 3 conservatively reserved after a transport failure, **166 of 300 accounted**. No more live calls are needed to reproduce these files. [Credit ledger](../../work/week1-pricing-v1/credits.jsonl)

Fair probabilities are market consensus, not a prediction engine. Book probabilities are power-devigged at matching lines. Consensus fair line is the offered threshold closest to even probability, with no interpolation. Best prices are for the exact quoted side and line. Execution is restricted to BetMGM/Caesars; other books are references. The CSV carries both book and consensus probabilities, source identities, timestamps, coverage and edge fields. Two-way probabilities at push-capable lines are conditional on no push; this release has no model-based push estimate.

The capture included mainlines, alternate spreads/totals and five common prop types. Missing markets are not invented. A CSV for each source snapshot is in `4ea6e3bf91f17387/snapshots/`. Earlier generated snapshots remain preserved; use the linked active result above.

## Commands

From the repository root, verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p test_week1_pricing.py
```

Offline replay, with no provider calls:
```sh
/opt/anaconda3/bin/python3.12 -B scripts/week1_pricing.py
```

Explicit fresh mainline snapshot, charged against the same remaining delivery cap:
```sh
/opt/anaconda3/bin/python3.12 -B scripts/week1_pricing.py --refresh-mainlines
```
The refresh prints its new CSV paths and writes an immutable manifest. Replay a refreshed manifest using `--manifest PATH`. Mainline refresh does not claim refreshed alternate/prop prices. Cached evidence remains unchanged.

## Append a decision

Use a quote ID from the pricing CSV, an actual approver and a unique decision-event ID:
```sh
/opt/anaconda3/bin/python3.12 -B scripts/append_pick.py \
  --pricing-csv outputs/week1-pricing/4ea6e3bf91f17387/pricing.csv \
  --quote-id QUOTE_ID --pick-id UNIQUE_DECISION_ID \
  --status approved --approver APPROVER
```

Use `--status declined` for a declined offer. Add `--paper` for a paper decision. Use `--status executed` only to assert an actual fill at that exact quote, as a separate event ID. An approval is not a fill. No bet is submitted by this script. Repeat submissions with the same ID and contents are idempotent; conflicting contents are rejected. Logs append under an exclusive lock with fsync.

[pick_log.csv](pick_log.csv) stores execution intentions and asserted fills. [paper_pick_log.csv](paper_pick_log.csv) is separate. Both are intentionally empty until real decisions occur. Do not merge them. The model-probability field remains blank and the consensus source label is explicit.

[Verification evidence](../../work/week1-pricing-v1/verification.json) includes numerical tests, exact offline reproduction, capture hashes, budget checks and confirmation that no picks were fabricated.
