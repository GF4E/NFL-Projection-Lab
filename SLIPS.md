# Import Jaret's executed slips

Run from the repository root. These commands record wagers already placed; they never place a bet or call the Odds API.

Pasted text (finish with Control-D), a text file, or a screenshot:

```sh
/opt/anaconda3/bin/python3.12 -B -m engine.slip_ingest --ingest-slip
/opt/anaconda3/bin/python3.12 -B -m engine.slip_ingest --ingest-slip '/absolute/path/slip.txt'
/opt/anaconda3/bin/python3.12 -B -m engine.slip_ingest --ingest-slip '/absolute/path/slip.png'
```

A complete text slip imports immediately. Missing, ambiguous or invalid fields produce `NEEDS_CONFIRMATION`, with no pick row written. Screenshots use local macOS Vision OCR and require review of every extracted field. In a terminal, the command asks field by field. With piped text or API execution, it returns a saved review path and questions; resume with that path and confirmed values:

```sh
/opt/anaconda3/bin/python3.12 -B -m engine.slip_ingest --ingest-slip '/absolute/path/review.json' \
  --set 'game=2026_01_SF_LA' --set 'placed_at=2026-09-10T18:05:00-04:00' \
  --set 'stake=25' --set 'stake_currency=USD'
```

Use `--confirm field` to accept an OCR value, or `--set field=value` to correct it. The timestamp must include its timezone; dollar/Euro/pound amounts and units remain distinct. Use the exact schedule game ID if a matchup appears more than once. Supported markets are straight, full-game spreads (including alternate lines), totals, and two-way moneylines, with overtime included. Multi-leg, player/period, free-bet and cashed-out slips require their own settlement rules and are blocked from automatic import.

The append-only CSV is `outputs/jaret/pick_log.csv`. Each row has `source=jaret`, `status=executed`, `record_class=live`, game, market, side, frozen line/price, stake/currency, book, actual placement time and ingestion time. No approver or executor fields. Exact semantic duplicates return `already_recorded`. Raw text, screenshots and review drafts stay in ignored `private-input/` storage; only hashes and confirmed structured fields enter Git. Missing as-placed model probabilities remain blank.

Grading and source breakdown:

```sh
/opt/anaconda3/bin/python3.12 -B -m engine.slip_grade --scorecard
```

The command prints the paths to the Jaret scorecard and the combined **source scorecard**. Source rows distinguish Jaret, engine picks and registered paper rules; model versions remain separate. The existing `engine.scorecard --scorecard` also supports `executed` rows and source breakdowns for its supplied legacy logs. Original pick-log headers and frozen T75 programs are unchanged.

The hourly `com.gabe.nfl-jaret-scorecard` job uses the existing daily cached nflverse finals. Until both final scores and closing lines exist, slips remain pending. Settlement uses the actual locked line and price, including pushes. Grade records store return per unit and profit in the slip's original stake currency. First grades are immutable; later source corrections cannot silently change them.

Slip CLV compares closing fair probability with the executed price's break-even probability, and closing fair American price with the executed price. It is labeled `nflverse_close_vs_executed_price`. This differs from the T75 model's as-placed forecast-movement CLV and legacy executed-book closing quotes; those means are never pooled. A wager placed after kickoff receives no pregame CLV.

Verification and named immutable replay:

```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
/opt/anaconda3/bin/python3.12 -B scripts/slip_replay.py
```

Evidence: [implementation experiment](work/slip-ingest-v1/experiment.json) and [synthetic screenshot/confirmation/grading rehearsal](work/slip-ingest-v1/synthetic-v1/experiment.json). No real slip was supplied during implementation.
