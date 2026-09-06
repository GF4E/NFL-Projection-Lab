# NFL engine: computational candidate results

Private research update, September 6, 2026.

The new probability and serialization shortcuts passed **21 focused tests** and preserved the original forecasts and complete scores in **288 synthetic callback observations**. The combined candidate reduced the sum of measured fitting/scoring maxima by **22.38%** for the pilot-like workload. That is useful, but insufficient to justify another historical backtest.

| Mode | Fit + score maxima, pilot-like synthetic cases | Reduction from original |
|---|---:|---:|
| Original | 11.54 ms | — |
| Probability shortcut | 9.55 ms | 17.21% |
| Encoding shortcut | 11.51 ms | 0.21% |
| Both | 8.96 ms | 22.38% |

The unchanged historical cost equation requires fit + score maxima at most **7.46 ms**, holding its other terms fixed. The combined candidate exceeds that number even in this synthetic test. The broader stress cases improve about 21.74% and also miss it. These short synthetic measurements do not reproduce historical conditions or establish historical capacity; an apparent synthetic pass would still require further qualification.

The entire qualification took **4.76 seconds / 205.31 MiB**, including setup, tests, output checks and measurements. Every mode retained double grids, diagnostics, descriptor recovery and authentication. Tests compared exact probability values, types, grid bytes, JSON bytes and selected failures, including unusual numbers, unsupported inputs, empty arrays and cache isolation. Independent review rehashed the saved descriptor and 104-field metric bodies and checked the timing calculations. All 66 original frozen files remain unchanged. New candidate and test files are separately pinned.

Retain the tested probability helper as a candidate component. The encoder's additional benefit is small and noisy, so defer integrating it or the combined candidate into the historical controller. The follow-up profile is complete and independently reviewed: 1.41 seconds / 125.53 MiB, with all 16 output sets matching. Remaining Skellam probability dispatch accounts for about one-third of instrumented full-score time. These overlapping profile fractions do not predict achievable savings. The next experiment tests a guarded call to the same probability backend, retaining the original encoder, full diagnostics and all fit/recovery checks.

This improves our engineering evidence, not predictive accuracy. The enhanced Elo engine, external **5% predictive improvement** target, prospective confirmation and useful tested product remain unfinished. Public updates remain front-page Beta only. See the [updated goal](updated-goal.md) and [earlier profile findings](compute-profile-findings.md).
