# Rolling-origin series registry

Sole authoritative gate control: work/e-elo-hfa-release/deployed-oof-66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f.json

Updated 2026-09-20 to agree with catalog.json and the verified HFA release. The pre-HFA 6a0238fc series remains preserved as a superseded comparator. This corrects the stale prose pointer; it does not change the catalog or any projection.

All other catalogued series are non-authoritative. Full identity, per-fold fit references, dates, metrics and hashes are in catalog.json and each containing directory’s SERIES.md. Raw immutable series remain unchanged.

- work/e-unc/SERIES.md (6 components)
- work/projection-governance-v2/e1/SERIES.md (8 components)
- work/projection-governance-v2/e1-calendar-corrected/SERIES.md (8 components)
- work/projection-governance-v2/e1-week-label-run/SERIES.md (12 components)
- work/projection-v1/SERIES.md (3 components)
- work/projection-v2/SERIES.md (2 components)
- work/projection-v2/phase-a/SERIES.md (4 components)
- work/projection-v2w/SERIES.md (1 components)
- work/projection-v3/SERIES.md (2 components)

Effective 2026-09-19: nfelo EXCLUDED as a market-free benchmark because closing lines enter its rating updates; pre-regression does not cure that ancestry. Closing line AUDIT_REFERENCE_ONLY. No replacement admitted.

## Reference-line metric reproduction, 2026-09-20

See [reconciliation report](../reference-line-metric-v1/REPORT.md). Rollout is PAUSED under the requested 0.5-percentage-point reproduction tolerance: supplied figures reproduce on pre-HFA 6a0238fc, while two disagreement buckets differ beyond tolerance on current HFA 66a3a60c. This metric is reporting only, never a gate; OPEN and CLOSE remain audit references outside projection inputs.

User-specified historical wording, scoped to the **superseded pre-HFA series**, preserved verbatim:

> across ten seasons and 2,574 games the deployed engine shows no demonstrated edge against the closing number in any season or subset. With a standard error of 0.99 percentage points, a true break-even model is not excluded by this evidence; what is excluded is a large edge. A simulated unbiased engine that is a noisy copy of the line covers 49.9 percent, and the measured 50.58 is consistent with that.

“Any season or subset” here means the examined seasons and one-point disagreement buckets against an illustrative 52.38% break-even rate at -110, not all conceivable subsets or proof of no edge. The 49.9% simulation is user-reported; the independently seeded illustration produces 49.9701%. The pooled independent-game power calculation, assumptions, and distinction between 50% directional accuracy and priced break-even are recorded in the report and reproduction.json.

Confidence: near-total — the lineage/count discrepancy is arithmetic on verified rows. Move down to high if the source hash or line-sign interpretation is invalidated.

## Reconciliation accepted — 2026-09-20 supersession

The above stop is resolved by the user's revised tolerance: headline ATS/total within 0.5 percentage points; buckets within max(1.0 percentage points, one game). All comparisons pass. Both series are authoritative for their own lineage. Current HFA 66a3a60c is the live audit figure; pre-HFA 6a0238fc is the historical record. No further lineage reconciliation is required for this metric. Future gate-control authority is unchanged.

ATS measures 50.5 percent with a 95 percent interval reaching 52.5, so break-even at 52.4 is not excluded by this evidence, while a large edge is. Power against a 50 percent null remains supporting detail only. OPEN spread: 577/1,151, 50.13%, interval 47.25–53.01; 1,177/1,359 reference coverage (86.6%) in 2021–2025. OPEN total: 227/460 with 466/1,359 coverage (34.3%), INSUFFICIENT, no inference. Sources and all scoped tables: work/reference-line-metric-v2/REPORT.md and its audit appendix.

Confidence: near-total — these rates and the reconciliation are arithmetic on verified rows. Move down to high if a row hash or line sign fails independent recomputation.

## DIAGNOSTIC ONLY — supplied condition-search finding

Provenance: user-supplied findings, recorded verbatim; not independently recomputed. No search, rule, registration, implementation or forward test is authorized by this record.

a search of 38 conditions over 2,639 games found no condition clearing break-even after multiplicity correction; the best candidate, totals in games with a closing spread of 7 or more, ran 416 of 747 at 55.69 percent with a Bonferroni interval of 49.9 to 61.5 and 8 of 10 seasons above break-even, and is recorded as an unconfirmed observation, not an edge and not a queued experiment.

Dead ends — do not retest:

wind 10 or more at 47.7 percent on totals, wind 10 to 15 at 47.5, cold under 40F at 45.2 on spreads, engine-versus-line disagreement of 3 or more points at 49.6 on spreads and 50.1 on totals, pick'em games at 46.5 on totals, and divisional, dome, rest edge, high and low totals all within two points of 50.

These observations cannot score, gate, tune, rank, select or justify any statistical model change.

Confidence: low on the numerical search finding — it rests on one supplied search on one series and could invert under independent recomputation. No lower rating category is defined; contradictory source rows would make the finding unsupported. The supplied text is preserved as an unconfirmed observation.
