# Next efficiency decision — 2026-09-06

**Recommendation: defer further optimization code and any successor controller. Make one bounded, read-only decision about the complete inner-scoring dependency path before choosing another candidate.** The objective remains a completed, scientifically valid enhanced-Elo comparison and the external 5% goal. Another isolated speedup does not establish either.

The root reports that the sole COMP07 experiment completed: 25 tests, 128 observations and 160 full saved-fixture scoring calls were exact; aggregate timing ratio 0.8908471484 and maximum-callback ratio 0.8568699402 both missed the fixed 0.7738077598 threshold. Independent actual-result reviews are separate. This recommendation does not grant acceptance, retiming, integration or a historical retry. COMP06 and COMP07 gains must not be added together.

## Reachable path and the critical constraint

The concrete path is `PublishedOriginGrader.grade` in `scripts/research_score_split_compute_integration.py:111–170` → complete `score_forecast` → saved/reloaded inner metrics → `StrictSelectionFeed.add` in `scripts/research_score_split_archive.py:671–705` → prior-two-season selection. The frozen completed experiment requires 65,646 new inner scores. The selector consumes their joint energy and native-failure status; it does not consume the other inner metric values. Nevertheless, the grader and `archive._metrics` require the complete 28-field inner schema, and the scorer's CRPS, likelihood, grid bounds and first-per-season/setting double-grid calculations participate in validation or failure behavior. They cannot simply be removed because the selector reads one field. Publication must still precede labels and grading.

This is a concrete dependency question with potentially broad workload reach, but **no removable-cost estimate is established**. The retained tiny-origin profile includes 36 new inner and four new outer score callbacks. It is insufficient to assign all scorer time to work unused by selection, or to predict long-history savings.

More importantly, `scripts/research_score_split_budget.py:pilot_projection` charges every future weighted game

`C + 31 × (2 × Fmax + 2 × Smax)`.

The preserved COMP04 projection was 7,933.312 seconds against 7,200. Holding the other terms fixed requires about 12.39% less combined maximum fit/score time, or 42.05% less remainder C. A cheaper average inner score or fewer actual calls does **not** by itself reduce this fixed maximum-based projection. A proposal must identify a supported route to a lower maximum callback or C; changing the multiplier, omitting required flags or redefining the gate would be a separate experimental-design change. The failed lag-geometry study does not justify one.

## One next action, with a stopping rule

Use one short source-only pass to finish a flat consumer table for the inner scorer's metric groups: selection input, required numerical/failure check, persisted audit evidence, and any downstream use. Trace the exact owning scorer, grader, archive validator and selector; reuse the existing saved callback records. For any apparently avoidable group, state whether its removal changes native failure semantics or saved evidence, and whether its cost can reach Fmax, Smax or C under the unchanged screen. Do not build a graph framework, regenerate fixtures, profile, time, fit or rewrite the controller.

**Stop without another candidate if that table yields only average-throughput savings, altered scientific checks, or an unmeasured contribution to the governing maximum.** That is the present default. Any later proposal to simplify the experimental contract needs a separate scientific decision preserving the full joint-score target, temporal controls and acceptance requirements; this note does not make that decision. This single dependency assessment is proportionate preparation. Another expensive qualification for a known partial gain is not currently justified.

Evidence reused: the accepted origin-profile attribution and `work/rf-energy-geometry/attribution-assessment.md`; immutable COMP04 pilot findings; targeted static reads of the current frozen controller, grader, metric schema and selector. No scientific execution, new quantitative attribution or frozen-file modification was performed for this assessment.
