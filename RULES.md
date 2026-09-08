# Registered paper rules

## WIND-UNDER-10-15-V1

Registered September 8, 2026, before the 2026 regular season. Status: **PAPER ONLY**, active for 2026 regular-season Weeks 1–4. This is a distinct paper experiment; it does not change the live board's probability/price filter or the model promotion gate.

Eligibility and execution:

- Outdoor venue: nflverse `roof` is `outdoors` or `open`. Closed roofs and domes do not qualify. Missing roof or forecast evidence means no pick.
- Kickoff-hour 10-metre wind forecast is **10 <= mph < 15**, retaining harvest three's bucket boundaries. Use the latest forecast actually available at or before T60 (kickoff minus 60 minutes), never a later-issued forecast, reanalysis, or stitched historical series. Preserve model, run initialization where supplied, public availability evidence, retrieval timestamp, kickoff-hour valid timestamp, units, raw response and SHA-256. Initialization time alone is not issuance/availability evidence.
- Freeze the qualifying consensus total at T60 from the pricing layer. Select **Under at that exact total**, at the best available American price across BetMGM, Caesars, FanDuel and DraftKings. Do not substitute another total to obtain a better price. Ties use book key alphabetical order. Require the existing qualifying-quote and consensus coverage checks; skip if no executable quote exists at the consensus line.
- One joint paper entry per game, identified `WIND-UNDER-10-15-V1:<event_id>`, in `outputs/weather-paper/pick_log.csv`, using the existing joint-pick schema. Store the frozen quote, consensus reference, book, total and price. No approver or executor. Preserve weather evidence in an immutable sidecar keyed to the pick ID. Log skipped opportunities and reasons separately; do not turn missing data into a pick.
- `probability_source` identifies this paper rule. Consensus fair probability remains the pricing layer's value; no historical bucket hit rate is inserted as a model probability. This rule does not require or override the existing live model-edge gate because it places no live bet.

Monday grading:

Use the existing scorecard engine on this rule's dedicated paper log, final results and verified closing grades. Report weekly and cumulative Under W–L–P, ATS rate = W/(W+L), total picks, pending outcomes, CLV sample count and mean CLV. A Monday report leaves any unfinished Monday-night game pending; reconcile it on the next grading run. Closing grades must match the frozen selected book, exact total, side and quote. Missing CLV stays missing, not zero. This rule's results must be shown separately from other paper strategies, alongside the board's combined/live/paper scorecards.

```sh
/opt/anaconda3/bin/python3.12 -B -m engine.scorecard --scorecard \
  --picks outputs/weather-paper/pick_log.csv \
  --results RESULTS.csv --grades VERIFIED_PICK_CLV.csv \
  --output outputs/weather-paper/scorecard.csv
```

`RESULTS.csv` and `VERIFIED_PICK_CLV.csv` denote the actual available final-results and executed-book closing-grade artifacts, not fabricated placeholders. A run without those arguments reports pending picks and missing CLV honestly.

**Live-money gate:** no live money until at least **30 paper picks** have been registered under this rule and their verified **mean CLV is positive**. Report CLV coverage alongside the mean. Hit rate is descriptive, never a gate. Passing these necessary conditions does not itself place a live bet or promote an engine model. The Weeks 1–4 window does not extend automatically to reach 30 picks; an unmet gate leaves the rule paper-only and expired after Week 4.

Registration is complete. The existing T65 odds schedule remains unchanged. The T65 runner now captures exact-run Open-Meteo forecasts, freezes T60-weather.json, evaluates the rule only from that stored forecast, and appends qualifying paper picks. Missing, late, unverified or out-of-window forecasts cannot trigger the rule. Existing frozen artifacts are never backfilled. Actual prospective captures and closing-price grades remain future evidence. The default scorecard includes this dedicated paper log; the command above reports the rule separately.

Evidence: [follow-up experiment](work/harvest-weather-followup-v1/run-1/experiment.json). Historical forecast issuance at T60 is not established by the stitched archive diagnostic.

Forecast implementation: [T60 weather experiment](work/t60-weather-v1/experiment.json). GFS Global uses a pinned run initialization and metadata API availability time as the issuance field, with the documented replication delay respected. Venue game IDs/roofs come from nflverse; coordinates are separately attributed in the hashed manifest. A documented MCG roof correction preserves the erroneous source value alongside the effective outdoor value. Unknown retractable-roof status remains ineligible.
