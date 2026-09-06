# Energy-score geometry: static numerical/error contract

Assessment: a narrow, bounded, caller-owned reuse of deterministic geometry can plausibly preserve the original score bits under the pinned runtime. This is conditional on measured materiality and future qualification. It does not justify caching probabilities, grids, observations, transforms, scores or outcomes. No implementation, import, numerical call, test or profile was performed for this assessment.

## Exact dependency split

The frozen `research_score_distribution.energy_score` starts at line262. Let the actual probability array shape be `(m, n)` and define the original padded shape exactly as `tuple(1 << (2*k - 2).bit_length() for k in p.shape)`; write it as `(M, N)`.

| Value | Dependency and reuse boundary |
| --- | --- |
| `home, away = np.indices(p.shape)` | Shape-only, including coordinate orientation. Preserve the original dense integer indices and axis order. |
| Padded FFT shape `(M, N)` | Shape-only. Preserve the exact integer expression, even though it represents power-of-two padding of the correlation support for positive dimensions. |
| Each lag vector from the original `np.where`/`np.arange` expression | Padded-shape-only. The cutoff is `(k - 1)//2`; for even lengths, the Nyquist position is assigned the negative lag. Preserve that expression. |
| `distance = np.hypot(lags[0][:, None], lags[1])` | Shape-only. It measures displacement between score cells, independently of the current observation or law. |
| `home-observed[0]`, `away-observed[1]`, their `np.hypot` result | Observation-dependent. Recompute for every energy invocation, even when the shape matches. |
| First-term products and `first` | Both observation- and probability-dependent. Recompute with the same multiplication, sum and float conversion. |
| `transformed`, `transformed.conj()`, their product, inverse FFT and correlation | Probability-dependent. None is reusable merely because the grid shape matches. |
| Correlation checks, clipping, repeated sums and in-place normalization | Probability-dependent; perform all original operations on fresh arrays every call. |
| `correlation * distance`, its sum, `answer` and final clamp | Probability-dependent; retain original operation/reduction order. |

Grid creation itself remains law-dependent: empirical support determines its starting size; rates, mixture weight and tail budgets determine expansion; all PMFs, atom insertion, omitted-mass correction, normalization and any product of marginals are fresh. Geometry lookup must follow actual successful grid construction. A family, setting, iteration count, requested mean, shape estimate or previously used law is not a substitute for the actual grid shape.

`marginal` also creates indices for total/margin CRPS, but its probabilities, bincounts and score arithmetic are separate. Reusing those arrays or changing CRPS is outside this proposed energy-only boundary.

## Dtype, layout, ownership and runtime

The normal caller obtains `p` from unchanged `JointDistribution.grid`; its Poisson/empirical arithmetic produces the ordinary two-dimensional float64 ndarray. The current compute wrappers inherit grid unchanged. Normal grids have positive dimensions in multiples of16, bounded by512 per axis for the base grid and1024 for the explicitly doubled grid. Direct `energy_score` is less constrained: it does not validate array rank, dtype, strides, observation shape or even probability normalization before beginning arithmetic.

`np.indices` defaults to `dtype=int`; on the pinned Darwin64 runtime this is the platform integer dtype. Its two dense coordinate views come from the original allocated index array. Lag arrays use the default integer `np.arange`/`np.where` path; `np.hypot` generates the corresponding floating distance matrix. Preserve actual dtype, axis orientation, shape, C-order bytes and layout as produced by those original constructors. Do not introduce float32 coordinates, broadcast-only replacements, transposition, alternate distance formulas, custom norm computations, flattened reductions or an FFT-shape-only key for a record that also stores `(m,n)` coordinates. Record both actual and padded shapes.

For reference, storing both dense int64 coordinate arrays and the float64 distance matrix costs `16*m*n + 8*M*N` bytes, plus lag arrays if retained. At the largest normal doubled shape1024×1024 and padded2048×2048, those main arrays alone occupy48 MiB. This is arithmetic storage size, not a measured process peak, and cannot replace a bounded memory qualification. No unlimited per-shape global map is warranted.

The cache must own private geometry only and expose no writable references to scoring or assembly. It must never retain a probability view, grid object, observation, distribution, FFT output or score. Mark retained geometry read-only while preserving its values; avoid mutation of the original input, including read-only/noncontiguous arrays. Cache scope, count/byte limits and eviction behavior must be explicit. A successfully constructed geometry record is immutable; failed construction must not leave a partially usable entry. A conservative first design would publish an entry only after the originating energy call has succeeded.

Keep original NumPy FFT calls and arguments: `rfft2(p, s=shape)`, conjugate multiplication, `irfft2(..., s=shape)`, default axes and normalization. Do not transpose/contiguize/cast `p`, replace the FFT backend, reuse a transform or cache backend plans. The original internal FFT layout and dtype remain the backend's responsibility; neither should be replaced with an assumed order. Pin the actual NumPy implementation/native backend and runtime; geometry built under another implementation is not automatically authenticated by shape alone.

## Failure order and unsupported inputs

The current order is significant:

1. Read `grid.probability`; construct dense indices; index the observation and calculate the first term.
2. Derive the padded shape; execute forward FFT, conjugate/product and inverse FFT.
3. Reject correlation minimum below−1e−12 or mass error above1e−10 with `fft_correlation_invalid`.
4. Apply `np.maximum(correlation, 0)`; reject its mass error above1e−10 with `fft_clipped_mass_invalid`; normalize using the original fresh sum.
5. Construct lag vectors and distance; compute final weighted sum, subtraction and float conversion.
6. Reject a result below−1e−10 or nonfinite with `invalid_energy_score`; return original `max(0.0, answer)`.

Keep the original short-circuit conditions and all repeated reductions. In particular, NaN comparisons do not behave like a new early finite-value validator: some malformed inputs reach the final energy failure after earlier comparisons evaluate false. Do not change that route or normalize invalid correlations into success. Unexpected NumPy/FFT errors must propagate, with no catch-and-retry numerical path.

On a cache miss, constructing the entire geometry bundle before computing `first` or checking the FFT would move lag/distance allocation and backend failures earlier. Build/retrieve coordinates at their original stage, and build/retrieve lag geometry only after correlation validation/normalization. Both stages must remain inside the full scoring callback/resource clock. A warm hit deliberately skips geometry construction; it cannot promise to reproduce an allocation failure from a constructor it no longer invokes. State this optimization boundary honestly rather than claiming equivalence for arbitrary monkeypatched constructors or memory exhaustion.

A future fast domain should be explicit and narrow: genuine original grid objects and exact ndarray/type/dtype/rank/dimension conditions backed by the caller. Unsupported types/subclasses, shapes and numerical domains should delegate to the unchanged original function without coercion. Guard inspection itself must not introduce new hook calls or change attribute/index failure order. Do not add probability-value scans or early rejection merely to establish shape eligibility; they can change original diagnostics and cost. Tests must determine what the proposed guard actually guarantees. The current original function has no numerical fallback approximation; any proposed fallback means calling that unchanged implementation.

## Actual caller lifetime and meaningful falsifiers

`research_score_metrics.score_forecast` first converts/validates the observed pair, calls `distribution.grid()` and energy once, computes CRPS, and—when `double_grid=True`—constructs the doubled grid and calls energy again before checking the combined1e−6 grid discrepancy. Diagnostics=False does not skip energy. `MemoizedDistribution`, `ProbabilityDistribution` and `SkellamDistribution` all forward into this unchanged metrics function; they currently optimize CDF behavior, not energy.

Base and doubled grids have different actual shapes. Therefore a new cache created inside each ordinary score call has no normal repeated-shape hit. Useful caller-local reuse would need an explicitly owned lifetime spanning multiple score calls, with bounded retention and base/doubled alternation considered. A distribution subclass alone cannot change the existing metrics function's directly imported `energy_score` binding. Future integration needs a separately reviewed explicit binding; no frozen-module rebinding, runtime function cloning or hidden global cache.

If attribution warrants one candidate, meaningful tests should establish:

- Exact result type and float bits on cold and warm calls versus the unchanged original, followed by complete encoded scorer metric dictionaries with diagnostics and double-grid flags both exercised. Tolerance-based direct-pair oracles remain supplemental mathematical checks, not byte-parity acceptance.
- Dirac, two-atom, sparse/asymmetric and rectangular grids; swapped axes;1×1 and singleton-axis direct cases if admitted; normal16-step shapes around FFT-padding changes; base/doubled alternation; repeated shape with different probabilities and different observations. Same padded FFT shape must not make distinct actual shapes interchangeable.
- Mutations/replacements of probabilities and observations between calls, signed zeros, views/read-only/noncontiguous inputs, immutable retained geometry, independent cache owners, eviction and failed miss followed by a valid call. No input or result may be accidentally reused.
- All three named energy failures, including the existing aggregate-clipped-mass falsifier (many individually small negative correlation cells). Include nonfinite/negative/malformed inputs and deterministic injected FFT/geometry failures with exact original error type/message/order on the supported contract and fallback paths. Do not patch shared frozen NumPy/module globals in shipping code or conflate intended geometry-hit call reductions with skipped FFT work.
- Spies wrapping real numerical dependencies must show a fresh forward/inverse FFT, correlation validation and current-data arithmetic on every call, while only registered geometry construction is reused. Persist outcomes and call evidence before assertions; do not use score templates or stubs as numerical parity evidence.
- Full callback timing and all cold construction/lookup/ownership/eviction costs under a preset resource limit, using a fixed declared shape/workload sequence. Report hit/miss counts, retained bytes and all outcomes. Do not infer historical capacity from a warm geometry microbenchmark or the prior instrumented profile.

The frozen distribution tests already contain small direct-pair energy checks, swapped-law checks, double-grid checks and an injected clipped-mass failure. Their comparisons are mostly numerical tolerances; they do not establish exact cache-hit/cold parity or a safe lifetime. Their test module also reloads the original distribution module, so a future harness must preserve its reference class identities deliberately when comparing exceptions.

## Source pins read

| Source | SHA-256 |
| --- | --- |
| scripts/research_score_distribution.py | aaa557304054788603f29d56a11fa7e4fe98d3f32b7e699c7f9919f8d7b41ba1 |
| scripts/research_score_metrics.py | 8afc0500345467f50d8c9dad4a33e95f55959727eb022696b5ab41fee7df7d97 |
| scripts/research_score_compute_distribution.py | 8000026887b63eaf387ef53791bd5cb4badda944f74fdf9725eea2fcff0feaa1 |
| scripts/research_score_probability_compute.py | 0ac0ecd32415720cc7e6fb1d2ec0c9229de3a46d6437d5ff380e9ebe2ee83661 |
| scripts/research_score_skellam_compute.py | 3a88ed783f87cd9fdbfed9fae177edbb8d72d36be8fcfd5374a25a9c4ef8a7d0 |
| scripts/research_score_split_compute_integration.py | f07fc0abe7361dbd5e137ce294908a20fb01ff1015f31b47670e0b88dbc6ddef |
| scripts/research_score_split_grade.py | 042ed7773ee8e0fa0979eb22b7a2bc20f699c8ec2e2a05f761fce80a5aa81f4e |
| tests/research-score/test_distribution.py | b671c6a4b97757a8122a54b98491a4ca79952cceb78a2985c685a9d630f7fc14 |
| numpy/core/numeric.py | 0e06a36820d78a2411fb3b96febaf1fd0840a52b1ae64e4538d2b7524f667d3b |
| numpy/fft/_pocketfft.py | 5e49bcc1c3f827204d31ba746681c85a13439609625f6e11ceb0eea36f6e464b |

The NumPy paths are under `/opt/anaconda3/lib/python3.12/site-packages/`. No new source or scientific criterion is authorized by this assessment. Materiality and any next design remain separate decisions.
