# Matched chronological score benchmarks

Written before computing the comparison. This is descriptive evaluation of the saved NON_AUTHORITATIVE_REPLAY, not a registered statistical candidate, new fit, gate decision or transfer of production authority. The full rebuild remains active.

Implement three score benchmarks on exactly the replay's games and state cutoffs: prior-season league mean; prior-season home/away mean, excluding neutral-site games from those role means and using the league mean for neutral fixtures; and the team's mean score over its last four completed regular-season games. Preserve fractional forecasts and both integer team targets. Use the same NFL franchise aliases already present in engine/board_v9.py. A persistence history shorter than four uses its available observations with a count; zero uses the league mean with an explicit fallback flag. Missing prior-season data stops the comparison rather than dropping a game.

## Convention sweep

| Tier | Convention and reason | Alternative / limit |
| --- | --- | --- |
| 1 | Chronological completed-game eligibility: kickoff plus four hours strictly before the saved Fri/Mon/Tue cutoff; validate that cutoff against the issuance. Existing calendar convention applies identically. | Historical provider-vintage availability remains unknown. |
| 1 | Persistence is the last-four-game mean, following scripts/e1_evaluate.py. | It is not the last-single-observation naive forecast; label it precisely. |
| 1 | Prior-season league mean follows the September 21 score audit; no window is tuned against these results. | The existing E1 expanding climatology is a different descriptive baseline, not silently substituted. |
| 2 | REVIEW REQUESTED: venue benchmark uses prior-season non-neutral role means; neutral targets receive the league mean. This is a simple descriptive comparator with no fit search or promotion path. | An expanding or pooled multi-season venue mean could differ; do not infer a venue-feature gain from this comparison. |
| 1 | Exact target population, deterministic row order, raw source hashes, full-precision scoring and immutable compressed exports; missing calibration stays explicitly unavailable. | Reused historical seasons remain development evidence, not a pristine final test. |

Acceptance: hand-calculated forecasts/errors; future and target labels cannot move their own benchmark; boundary-equality and rescheduling behavior; row-order invariance; neutral and franchise identity; no silently omitted games; independent recomputation of all exported forecasts and pooled/seasonal metrics. Keep the saved engine rows and forecasts unchanged. Report observed differences only, without a significance or future-skill claim. No new gate, candidate, experiment slot, production write or paid provider request.

Sources: existing September 21 REPORT.md and scripts/e1_evaluate.py; Hyndman and Athanasopoulos, [rolling-origin evaluation](https://otexts.com/fpp3/tscv.html), [simple forecasting benchmarks](https://otexts.com/fpp3/simple-methods.html), and [forecast accuracy](https://otexts.com/fpp3/accuracy.html), reviewed 2026-09-22 Pacific. These support chronological testing and benchmarking; the exact NFL windows above are explicit repository conventions, not claims that the text prescribes them.

Next: implement and verify the baseline comparison, retain report and tests, commit/push engine-v2. Then resume the unresolved public closeout adapter, reviewed training transition and remaining rebuild acceptance; this increment does not replace that work.
