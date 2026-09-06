# Energy geometry: retained-evidence assessment

Status: bounded read-only assessment. The saved current-composition records establish repeated geometry in the tiny declared origin. They do not measure the removable lag-distance cost or establish historical capacity. No science module was imported, grid/law recovered, score evaluated, profiler run or candidate implemented.

## Authenticated scope

Authenticated RF-COMP-04 origin-profile acceptance `93553c563f064232a58215e8e5f96831a80f7573133d1116be4fe26a9322b6a6`, then its archive index and the selected saved record bytes below. Checked current distribution, metrics, Skellam and memoized-distribution source hashes against the accepted input map. This is targeted reuse of the accepted complete archive audit, not a repeated 159-file audit or new scientific exactness review.

The current composed path has 40 actual score callbacks: 36 inner and 4 outer. Its retained 48 fit/recovery callbacks plus 40 score callbacks total 0.22677117108833045 profiled seconds. Base/double-grid energy scoring ran 62 times. Setup scorer calls and copied score rows are excluded from this population. Profiling inflated whole-path time by 2.3426 times with unequal stage effects; all attribution below is qualitative.

## Nonoverlapping direct caller accounting

The sole caller of `research_score_distribution.py:262 energy_score` is `research_score_metrics.py:14 score_forecast`. Its 62 calls total 0.120851958 seconds, including 0.039262915 exclusive self time. The following child edges are direct, disjoint invocations; their inclusive times already include descendants.

| Required probability-dependent child work | Calls | Seconds |
| --- | ---: | ---: |
| `np.fft.rfft2(p, s=shape)` | 62 | 0.024332583 |
| `np.fft.irfft2(transformed * transformed.conj(), s=shape)` | 62 | 0.043629666 |
| `transformed.conj()` | 62 | 0.002776167 |
| Two `np.sum` reductions, correlation `min`, three ndarray `sum` reductions | 124 + 62 + 186 | 0.009948365 |
| Identified required subtotal | | **0.080686781** |

These computations use the current probability array or its correlation. Shape equality cannot authorize reuse of transforms, normalization, validity tests or score terms. Their current arithmetic, correlation/clipped-mass checks, reductions and order remain required under a geometry-only hypothesis.

Separately visible geometry-associated edges total only **0.000843094 seconds**: `np.indices` 0.000601002, padding-shape generator 0.000062006, lag `np.arange` calls 0.000169539, and `where` dispatch 0.000010547. The padding shape must still be determined to select a key. The `where` entry measures dispatch, not all its array computation. Do not add descendants of these edges again.

The large unresolved bucket is energy_score's **0.039262915 exclusive time**. NumPy ufuncs and array arithmetic do not appear as separately attributable function edges here. It mixes both hypot calculations and lag selection with probability-dependent multiplication, clipping, normalization/division, checks and other local work. In particular, the records do not isolate the line `distance = np.hypot(lags[0][:, None], lags[1])`.

Subtracting only the identified required subtotal from the parent gives **0.040165177 seconds** as a deliberately loose ceiling for all remaining work, not a measured geometry cost. That ceiling still contains required operations. It is about 17.71% of profiled fit+score time; the directly timed geometry-associated edges are about 0.37%. No inference may treat the entire 0.120851958-second parent, or its whole exclusive bucket, as removable. Matching a 12.39% reduction of this same tiny callback denominator would require removing roughly 70% of the loose residual ceiling; this is a conditional arithmetic comparison, not a prediction for the historical pilot.

## Exact saved shape population

Matched each of the 40 successful score callbacks, by stage/setting-or-variant/game key, to its saved scientific-witness metric row. All keys are unique. This correctly excludes the copied inner/outer rows, including copied 64×64 metrics that would give the wrong population.

| Energy occurrences | Probability-grid shape | FFT padding / lag-distance shape |
| --- | --- | --- |
| 40 base calls | **80×80** recorded in `metrics.grid_cells` | **256×256** derived from exact padding formula |
| 22 double-grid calls | **160×160** derived from frozen explicit doubling | **512×512** derived from exact padding formula |
| Total | 62 | Two geometry shapes |

The double-grid calls are identified by actual `double_grid=True` callback flags. The source requests exactly twice the base dimensions. `grid(cells=...)` either accepts that explicit shape or raises; it does not silently grow it. Successful callbacks plus the 62-call energy record corroborate this derivation. Doubled shapes and FFT shapes are source-derived metadata, not newly observed arrays or recomputed grids.

Every matched saved observation pair is (21, 17), including both synthetic game IDs. Thus observation-distance geometry also repeats in this fixture, but that coincidence is not a historical assumption and is excluded from the smallest proposed target.

Lag coordinates and the lag-distance matrix depend only on the FFT padding shape, not the distribution, observation, game ID, score flags or fitted parameters. This tiny population offers 40 occurrences of one geometry and 22 of another: across an explicitly shared owner, at most 60 repeat constructions after two cold fills. This establishes a potential reuse opportunity, not any actual cache hits or savings. A fresh cache per scoring call would have no repeated lag-distance key here: its base and doubled shapes differ. The retained full matrices would total 2.5 MiB if stored as the original float64 results, before small keys/lag arrays and allocator overhead. Historical shape prevalence, cold-fill/eviction costs and memory behavior are unmeasured.

## Smallest next action

The evidence supports one narrow **lag-distance-matrix reuse contract**, conditional on the independent numerical/cache review. Keep probability transforms, both reductions, clipping/normalization, all validity checks and the observed-distance term unchanged. Do not combine this with CRPS geometry, FFT reuse, another serializer or a broader scorer rewrite.

The next reviewable step is to specify an explicit bounded owner that survives multiple scored forecasts, a shape/runtime/dtype-safe key, immutable arrays, cold-fill accounting and unchanged fallback beyond the exact supported domain. This matters: per-call ownership cannot realize the saved two-key reuse, and a mutable global patch is not an acceptable integration mechanism. The exact exception/warning/arithmetic and array ownership contract is for the parallel numerical review to resolve. No candidate is authorized by this assessment.

If that minimal contract is supported, one separately frozen complete-callback equality-first comparison on retained genuine synthetic fixtures can answer the still-unmeasured cost question. It must include cold construction, ownership checks, key lookup, bounded retention/eviction and fallback inside the callback/resource clock, preserving complete grid/diagnostic flags. Use one fixed comparison and unique lossless fixtures with hash references; no historical retry, blanket profile or favorable-timing selection. Stop the branch if exactness fails or the complete-callback gain is not useful. Passing microscopic geometry timing alone would not resolve the current 12.39% conditional callback target.

## Exact record pointers

All paths below are within `work/rf-origin-profile/profile-685708ac9c57a623/` unless stated otherwise.

- `artifact-index.json`: `ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b`.
- `INPUT-PINS.json`: `685708ac9c57a623aa22267c1ae5f88f4c08dc692f4fda73767e447fde9fa28e`.
- `profiled/pstats-records.json`: `6151b41734cff6c0a120cd684212f65a52992a7e98b732e3253b9f62a188a021`.
- `profiled/scientific-witness.json`: `e695fcbcfc6f1c03754e1186c344cdc42bfa4cc45575ff517ecc4703f75f4db2`.
- `profiled/accounting.json`: `1eb7c06ab05ee1f35fd98f45ffdc8d68db038be65020f7afc9ace1eec0b99ae0`.
- `profiled/route-result.json`: `9dc88452b2bf19a7833e9d3a09da8202d8d0ec883bb32d78bbf928ecfad1ef18`.
- Frozen `research_score_distribution.py` (grid at 177; energy score at 262): `aaa557304054788603f29d56a11fa7e4fe98d3f32b7e699c7f9919f8d7b41ba1`.
- Frozen `research_score_metrics.py` (base/double-grid score contract at 14): `8afc0500345467f50d8c9dad4a33e95f55959727eb022696b5ab41fee7df7d97`.

All 79 frozen files and closed attempts remain untouched. This report contains metadata/source deductions only; it does not reconstruct distributions, create new forecasts or modify any accepted result.
