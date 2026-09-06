# Completed team-model backtest

Private research readout · September 6, 2026 · RF-COMP-09

**The complete run is valid, and the split-rate Elo candidate is rejected.** Its small improvement does not pass the registered effect-size, uncertainty, stability, mechanism and calibration requirements. The operational timer repair is retained.

All 277 forecast origins completed. The comparison below uses the same 3,135 development games from 2013–2024. Lower scores are better; the table is descriptive and does not select a new champion. All 272 games from 2025 remain a separate, already exposed retrospective slice.

| Model | Joint energy ↓ | Joint log loss ↓ | Margin MAE ↓ | Total MAE ↓ |
|---|---:|---:|---:|---:|
| Naive baseline (N0) | 8.47841 | 7.89102 | 10.427 | 10.853 |
| SRS baseline (S1) | 8.56849 | 7.91229 | 10.532 | 11.027 |
| Classical Elo (E1) | 8.55137 | 7.90836 | 10.416 | 11.027 |
| Offense/defense Elo (E2) | 8.42853 | 7.88208 | 10.296 | 10.913 |
| Split-rate Elo (E3) | 8.41697 | 7.87885 | 10.292 | 10.879 |

E3 reduces mean joint energy loss by **0.137% versus E2** and **0.725% versus N0**, short of the unchanged 1% research floor. The corrected uncertainty bounds do not establish the required advantage. Five of twelve development seasons improve versus E2; exposed 2025 worsens by **0.300%**. Removing defense or the scoring-level update does not establish the required mechanism evidence.

The nominal 80% margin interval covers 85.04% of development outcomes. Discrete interval mass explains only part of that difference: coverage exceeds the model's own interval mass by **3.77 percentage points**, with a block-6 simultaneous interval of **1.23 to 6.30 points**. Calibration therefore remains a material problem even where average errors improve.

The worker completed in **28.43 minutes**, peaking at **1.73 GiB**, within the approved 150-minute / 4-GiB limit. All 27 qualification checks passed beforehand. Separate result reviews verified 163,202 saved rows, prior-only annual choices and the complete archive. The audits reused authenticated fits and statistical resamples; they did not independently rerun every fitted diagnostic or bootstrap member.

**What changes next:** retire this split-rate candidate and preserve the complete negative result. Keep enhanced Elo as the required research foundation, with its acceptance still open. Return to the player-population evidence gap before any player fit. Additional tuning, a new graph framework or repeated runs of the same experiment have no current evidence-based justification.

The external 5% performance target remains untested; no eligible comparison archive has been admitted. No prospective or production model has been accepted from this result. The public front page remains within the approved Beta scope; this report is private.

[Complete metric extract: all 19 series and 16 populations](team-scorecard.csv) · [Updated goal](updated-goal.md) · [Evidence needed next](player-data-next-step.md)
