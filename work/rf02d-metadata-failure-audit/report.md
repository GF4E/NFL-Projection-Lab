RF-02D supplemental metadata audit — 2026-09-05

PASS. All 20 N0/E2 selected series contain all 3,407 games: 68,140 rows, zero native failures, and zero disagreements between forecast and archived loss failure flags. Every family/variant/year cell has zero failures. No distributions were recovered, conditional cases constructed, parameters estimated, forecasts generated or scores computed.

For every series, yearly rows in 2013–2025 are `256,256,256,256,256,256,256,256,272,271,272,272,272`. Prior rows at each target year's first origin are `0,256,512,768,1024,1280,1536,1792,2048,2320,2591,2863,3135`. Native-success-only prior counts are exactly the same. The complete 20-by-13 failure/count matrices are in `result.json`.

All 437 referenced indexed mapper objects passed: 685–1,539 empirical atoms, maximum empirical total 105, below the proposed 65,536-row/200-total limits. Atoms exactly match the sorted, deduplicated home/away-symmetrized score pairs from the corresponding admitted eligible input IDs, as the frozen mapper constructor specifies. All 4,175 admitted observations and all 3,407 selected outer observations have totals at most 105. These finite-component limits do not truncate the unbounded Poisson background.

Temporal checks passed under the unchanged `retrospective_inferred` availability classification. All selected forecast origins precede kickoff. Original eligible-input availability is strictly earlier than the matching origin for both 12h and 24h: 556,492 and 556,253 source comparisons. All previous selected outcomes are available strictly before each subsequent annual first-origin cutoff in both regimes: 805,000 comparisons. No claim of verified contemporaneous original publication is added.

Fallback mapping is confirmed from frozen `research_score_run.py` lines 316–318 and `research_score_replay.py` lines 120–138. E2's common variants use same-game N0 of that same variant; `no_offense` and `no_defense` use N0 full. There are zero actual failed rows, so no fallback descriptor equality check is exercised by this archive. The audit script contains that exact check for a nonzero failure, rather than claiming an observed fallback example.

Recommended training/failure semantics to freeze before fitting:

- Authenticate every expected prior selected row first. Partition by its original pre-outcome `native_failure` field. Fit each ordinary E2 family/variant scalar only on native-success rows, with uniform game weights. Record expected, native-success and failed/fallback counts and every excluded failure key/reason. A failed candidate's scalar is unused at prediction, so its fallback must not train that candidate scalar. The native-only rule and all-row rule coincide on this frozen run.
- At inherited E2 failure, emit the corresponding mapped N0 forecast using N0's annual scalar, retaining E2's original failure flag. Do not pass the raw fallback through E2's scalar. Required N0 reference failure invalidates the protocol. N0 ordinary scalar training likewise requires native-success reference rows; all current references pass.
- Keep minimum support as one complete prior selected season and at least 256 eligible native-success rows. The complete expected archive must still be present. The 2013 empty history is `identity_no_prior_outer_support`; a fully accounted history below the native-success minimum would be `identity_insufficient_native_support`, with recorded counts. Missing/corrupt/duplicate evidence or timing failure is protocol invalidity, never a support fallback.
- A new case-builder, estimator or adapter numerical failure should invalidate this bounded experiment, not become an identity result or an outcome-dependent excluded row. Preserve all original model failure ceilings separately. The two post-calibration independence controls inherit the mapped full distribution and its scalar; they do not fit separate raw-independence calibration cases.

This refines the earlier historical-reuse draft's treatment of fallback rows: retain them in completeness/failure accounting and final scoring, but exclude them from the unused E2-parameter training pool. The refinement has zero population effect here because all original native-failure counts are zero.

Authenticated scope: 1,115 indexed forecast/state/loss/mapper artifacts, 1,437,356,413 bytes, plus pinned run manifest/index and admitted source data. This is a targeted metadata audit, not a replacement for the accepted complete 1.86 GB artifact audit. Source/research artifacts were not modified; only this scratch audit and its reports were written.

Result SHA-256: `ed580ce3401ecb7286886764deefd647f659d5f23f0065b0142d376773166bdd`.
Checked-artifact ledger SHA-256: `c018dc87a5a740245b14a153e265a962b3018adaa3bcb0aa37686abd45e403f6`.
Mapper-metadata ledger SHA-256: `be561d6366f03214e855a4c92e9fdcb1b41e4715b460ab58846d71d6f7a35276`.
