# E-SCORE tooling reconciliation

No forecast changed. Tail CRPS is a new diagnostic, compared with an independent transformed-distribution reference. Frozen historical functions retained for exact archived replay.

| Metric | Fixtures | Maximum absolute difference |
|---|---:|---:|
| CRPS | 6 | 0 |
| CRPS postprocess | 6 | 0 |
| CRPS weighted PMF | 3 | 0 |
| Winkler | 10 | 0 |
| Brier | 15 | 8.32667268469e-17 |
| twCRPS both tails | 5 | 0 |

Discrepancies above 1e-6: 0.

Library API differences encountered before the adapter was accepted: estimator keyword is `nrg` (energy formula); direct public Brier rejects outcome 0.5. Tie adapter computes one half of the binary-0 and binary-1 library scores minus 0.25, algebraically preserving (p-0.5)^2. This is not the expected binary Brier, which would be 0.25 larger.

The active engine.uncertainty scoring interface delegates to engine.scoring. Frozen harvest/postprocess reference functions remain unchanged for archived reproducibility. New experiment/report code should use engine.scoring, including exact weighted PMFs and tail_crps. Package installed in local pinned Python only; cloud dependency is declared but cloud installation is not claimed.
