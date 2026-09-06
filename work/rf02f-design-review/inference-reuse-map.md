# RF-02F inference reuse map

2026-09-05. Read-only implementation planning; no inference, scoring, fitting, historical computation or fixture regeneration performed. Repository: `/private/tmp/os01-gen15-rebuild.9ny71k`. This is not implementation acceptance. The RF-02F registry below is the draft config snapshot; the final read includes root's distinction between a 600-second synthetic integration and a 120-second frozen-fixture capacity smoke.

## Smallest complete path

Add one RF-02F public evaluator with its own exact registry, input validator, scorecard orchestration and decision function. Reuse the existing statistical kernel unchanged. Keep the production entry point fixed at 19 series × 3407 ordered games, split into 3135 development and 272 exposed-2025 games, with 226 outer origins. There is no need for another bootstrap implementation or an inference framework.

The registry is 13 E3 variants followed by six original references: N0 full/24h, E2 full/24h, E1 full, S1 full. Energy contrasts are the six configured external-to-E3 comparisons followed by E3 full→its 12 variants. The eight actual-mass cells are E3 full then E3 availability_24h, each home/away/margin/total at 80. Read these orders directly from `config/research-team-score-split.v1.json` and verify exact registered content, not counts alone.

| Existing function | Safe reuse and boundary |
| --- | --- |
| `research_score_inference.block_weights` line 22 | Direct reuse: 12 development seasons, 10000 members, lengths 1/3/6, seed BASE_SEED+length, nonwrapping weekly blocks, original season lengths. Do not expose member/season overrides in the new public gate. |
| `research_score_inference.weekly_sums` line 45 | Direct reuse; preserves actual sampled game-count weighting. |
| `research_score_inference.simultaneous_intervals` line 52 | Direct reuse twice per block: 18 energy gains jointly and eight residual means jointly. Retain the centered standardized maximum, linear quantile, finite checks and inconsistent-zero-variance rejection. |
| `research_score_conditional_inference.paired_block_statistics` line 124 | Direct reuse. It already validates explicit matrix shapes/values, uses sampled denominators, recomputes relative gains per sample, and returns both simultaneous families. It has no 20/28/16 registry constant. |
| `research_score_conditional_inference._infer` line 160 | Smallest orchestration reuse. Accepts supplied series/comparisons/cells and fixes the three real 10000-member calculations. Its `mapped` argument also determines nominal-coverage and PIT diagnostic population. To retain those diagnostics for **all 19** series, call it with all 19 as that argument and `raw=()`, plus the configured 18 comparisons/eight cells. This is a parameter-name mismatch only; it performs no conditional transform or family-specific decision. Document this call explicitly. Alternatively, a small new orchestrator can directly call the same generic kernel; do not fork its numerical mathematics. |
| `research_score_metrics.aggregate` line 140 | Direct reuse for development, all-issued, every complete season and native-success scorecards. It includes RMSE, PIT, mean calibration and win calibration. Explicitly handle empty native-success subsets as unavailable with counts; do not invent a score. |
| `research_score_conditional_inference._validate_calibration` line 208 | Generic direct reuse for required calibration: checks finite available estimates and proves exact constant-predictor unavailability from the actual rows. Required diagnostic scope must follow RF-02F, not the old mapped-only loop. |
| `_all_bounds` line 223 / `_cell_checks` line 228 | Arithmetic helpers are generic and the fixed three block lengths agree. Exact registered contrast/cell membership must already be validated; filtering must not silently drop a required cell. |
| `research_score_conditional_infer_archive.metric_fields` line 338 / `validate_metrics` line 352 | Generic exact 104-field original versus 108-field mass-augmented schema and admitted-observation validation. Can be reused for saved metric records if the controller supplies the anchored observation. They do not replace proper-loss, interval, probability, PIT or cross-series validation. |
| `research_score_conditional_infer_archive.parse` line 54; `research_score_contract.encoded` | Reusable strict JSON and canonical-byte boundary. Persist actual scorer values, verify durable bytes, then parse; encoded metric values, including signed zero, must remain identical. No hand coercion or field dropping. |

`_infer` computes nominal percentile intervals at 50/80/95 and per-series/target ten-bin simultaneous PIT bands. Those remain their named pointwise/local diagnostics, distinct from the 18-contrast and eight-cell families. Retaining actual mass on all 13 new series is compatible with only eight registered decision cells; raw reference records keep their original schema.

## Code that must not be reused as the new public gate

- Original `comparison_family`/`infer`/`decide` require 40 series, 42 contrasts and the old S1→E1→E2 family ladder. They do not implement RF-02F.
- Conditional `_registered` pins the old canonical config and 20 mapped + six raw / 28 comparisons / 16 cells. `_validate` calls it and enforces old N0C/E2C failure aliases. E3 native failures are new; do not equate them with E2's flags, or blindly inherit the conditional full/independent failure equality.
- Conditional `_decision` implements mapping-versus-candidate labels, E2C/N0C references and only the old removal requirements. Conditional `evaluate` invokes these and reports three old scorecard slices, not the new all-issued/every-season/native-only requirements. Calling either old public evaluator with rewritten inputs is not a valid RF-02F implementation.
- The saved-archive RF-02E controller binds 45 files, RF-02D receipts, 904 files and a 600-second derivation. Its public run/authentication/annual-case recipe machinery is not the RF-02F controller.

The new validator can retain the old exact metadata types, year counts, origin count, ordered aligned rows, finite built-in numeric types, integer grid shape, proper-loss/probability/PIT checks, interval identities and consistent observed targets. Add the exact new registry and explicit audit evidence contract. Counts and synchronized row IDs alone do not prove original game membership/order, within-origin population, availability or native **reasons**: the controller must authenticate those against the source cohort. All-issued native failure ceilings concern the 13 E3 plus four required N0/E2 full/24h references; E1/S1 failures remain visible without an extra veto. N0 fallback absence/failure remains invalid.

## Decision pitfalls to test directly

Internal mechanism support requires the ≥1% point gain and all-three lower bounds >0 against E2; eight positive development seasons, positive every leave-one-out gain and positive exposed-2025 gain; all four removal upper bounds <0; no non-full/non-24h variant stably beating full; positive matched N0/E2 24h gains; required failure and integrity checks. The four removals include both old O/D removals and both new zero-rate removals.

The research-candidate conditions are additional: N0 point/evidence/stability gates, resolved positive E1 gain, no stable S1 dominance, matched full/24h secondary checks against **both** N0 and E2, nominal coverage range **and** all-three nominal intervals containing 0.8, plus all eight actual-mass intervals containing zero. Width exceptions use each candidate/variant's own gain against its matched reference. Use development metrics for these performance checks, all 3407 for native failures, and report 2025 separately. Preserve all/any signs and the labels `reject_all`, `mechanism_supported_distribution_unqualified`, `research_shadow_candidate`; integrity failure is `protocol_invalid`.

## Existing real-scorer fixture and the smaller smoke

The correct reusable fixture **pattern** is `tests/research-score-conditional-margin/test_infer_archive.py`: `synthetic_original` line 47, `scored` line 60, `FullArchiveFixture` line 68, and `test_complete_real_wrapper_and_all_bootstraps` line 537. It constructs 3407 genuine game IDs over the correct 226 origins/year counts, cycles seven observed pairs, scores small full-support laws with the actual game ID and True/True scorer flags, adds mass from the same law, and reuses metrics only across identical laws for the **same** game. The test verifies PIT from the actual-ID uniform and compares ordered saved-row/metric digests, preserving signed zero.

Do not instantiate its full archive constructor for RF-02F smoke: it builds irrelevant conditional transforms, 56430 cases, annual receipts and synthetic acceptance chains. Its final recorded fixture generation alone took **122.815238958s**, followed by a **55.698505292s** real wrapper; full process **199.349268s**, peak **1165.078125 MiB**. That is not evidence that the new 120-second smoke passes. The retained directory has evaluation/manifest/ledgers/terminal evidence, not the temporary per-game score cache; there is no surviving ready-to-load 19-series metric dataset identified here.

For the later new test, adapt only its deterministic cohort, observed-pair cycle, actual-scorer function and durable JSON/PIT/digest checks. Use a small declared set of real synthetic laws and reuse a scored payload across series only when law, observation and game ID are identical. Two or three laws may be sufficient for nontrivial numerical capacity coverage; that is an unmeasured fixture-design proposal, not a passed budget claim. Keep new mean→mapper→scorer/fallback/independence behavior covered by a separate compact real synthetic bridge so the capacity fixture does not pretend its fixed toy laws are 3407 learned E3 forecasts. Give the new public evaluator full 3407 inputs; it must select exactly 3135 internally for bootstrap.

Do not use `test_inference.production_fixture` line 49 for the real capacity qualification: it copies manually populated constant metric dictionaries across unrelated IDs and therefore does not establish scorer/PIT provenance. It remains useful only for cheap validator/gate mutations. Avoid a new bootstrap for each negative. One full real evaluator result must contain all 19 scorecards, exact comparison/cell order and every 10000-member block, rather than merely return an early invalid result. The final draft separates a **600-second/4096-MiB synthetic integration**, including fixture generation and the real scoring/persistence/JSON/public-evaluator chain, from the later **120-second initial capacity smoke** that authenticates/reloads that frozen real-scorer fixture and runs the real public evaluator. Persist all 64733 synthetic scored rows and their provenance; do not hide generation cost or regenerate them in the smoke. Record full evaluator time T separately for the pilot reserve. No speedup or cap pass is claimed before measurement.

Keep the RF-02D NumPy lesson explicit: the scorer's finite `grid_transport_bound` can be `np.float64`, while `_number` requires exact built-in types. Durable encoded JSON reread preserves values and crosses this boundary. Also, unchanged evaluators catch `Exception`; a signal-raised deadline may become an invalid return. The controller must recheck its budget immediately after the public call and route invalid output persistence through its bounded failure-finalization path.

## Read source hashes

| Repository-relative path | SHA256 |
| --- | --- |
| `config/research-team-score-split.v1.json` (latest draft snapshot) | `d3ad76915ebf6ed23e691c4ef4c14b31b8b6d2a3a6ca40909420dac0da461095` |
| `scripts/research_score_inference.py` | `4b61e0d4477eb49064353d9fd7b4e1c6ac37fc68553e0df0387d9f71bb8db078` |
| `scripts/research_score_conditional_inference.py` | `acaf57739ebb30f6a7a4abcb3c2673bbbd649ceca7fa3af6c435c27be9dd1604` |
| `scripts/research_score_metrics.py` | `8afc0500345467f50d8c9dad4a33e95f55959727eb022696b5ab41fee7df7d97` |
| `scripts/research_score_compute_distribution.py` | `8000026887b63eaf387ef53791bd5cb4badda944f74fdf9725eea2fcff0feaa1` |
| `scripts/research_score_contract.py` | `9b945dd445f567e410fee76c62a1e4058c7aac42b8362b4683eea7118c90ae34` |
| `scripts/research_score_conditional_infer_archive.py` | `f464c04fb8c0173571c56589e0823aec64719d5c1e3c6bbf9deb3bbadd4a8601` |
| `tests/research-score-conditional-margin/test_infer_archive.py` | `aef020dfcf0d8b8a860b05345dc3fce46d7cd615fe83d43e7bb0edc3555ac3b9` |
| `tests/research-score-conditional-margin/test_inference.py` | `598d40031b1630993ff2f2aceb13a7d280dc86a5d4789e572c383d54da1ea629` |

Prior synthetic evidence: workspace `work/rf02e-implementation/qualification-e076795149b683e0.json`, SHA256 `15210002536f2ebedd46151b21cd37c82145b20d8ec5d2b0b5aa13d2a2e3bdca`; process result `work/rf02e-implementation/author-tests-aef020dfcf0d8b8a.json`. These qualify the old synthetic wrapper only.
