# NFL engine: guarded margin-probability experiment

Private research update, September 6, 2026.

The guarded Skellam call passed **18 focused tests** and preserved all **168 saved callback observations** against the accepted original references. All 104 scoring fields and forecast descriptors matched. Both evidence reviews and the root check are complete; acceptance is limited to synthetic exactness and the measured timing miss.

| Scoring mode | Fit + score maxima, pilot-like synthetic cases | Reduction from original |
|---|---:|---:|
| Original | 10.918167 ms | 0.00% |
| Poisson shortcut | 9.037208 ms | 17.23% |
| Poisson + Skellam shortcuts | 7.524541 ms | 31.08% |

The combined candidate is still above the unchanged **7.461492 ms** target by **0.063049 ms**. This is a miss. Broader stress improves **29.11%**, with combined fit-and-score maxima of **14.455584 ms**. These short synthetic timings are noisy and do not establish historical capacity, even if a synthetic threshold were passed.

The command completed in **3.46 seconds / 186.67 MiB**, including setup, the new tests, all measurements and saved-output comparisons. The original encoder, actual fit, validation grid, independent descriptor recovery, double scoring grids and diagnostics stayed active. The prior Poisson/encoder unit suite was reused as evidence instead of rerun. Tests cover exact types and bytes, asymmetric and tiny rates, supported boundaries, fallback inputs, backend argument shapes, warning/exception behavior, cache isolation and complete scoring.

Retain the tested probability improvements as candidate evidence. The next proposed efficiency question is whether repeated encoding of exactly the same finite-float list can be reused within one fit while preserving independent parameter reconstruction and every hash check. This is under design review, with no implementation or historical execution yet.

The enhanced Elo accuracy goal, external **5% predictive improvement**, prospective confirmation and useful tested product remain unfinished. Public updates remain limited to the Beta front page. See the [updated goal](updated-goal.md) and [previous candidate findings](compute-candidate-findings.md).
