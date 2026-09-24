# Engine findings

This index was added on 2026-09-24 to consolidate existing evidence; no earlier FINDINGS.md was present in the checked repository. It does not create new experimental findings or transfer control authority.

## Predictive variance — E-UNC

**Coefficient uncertainty is under 0.2 percent of predictive variance, so interval width is not expected to narrow materially within a season.**

Source: [E-UNC variance decomposition](work/e-unc/variance.json), SHA-256 `fe0bc8695efc42a5fc7d0faeedbf87467bf435d9d4c0996980c3cbbf3ae726e5`; decision context: [closeout](work/e-unc/CLOSEOUT.md) and [series status](work/e-unc/SERIES.md). Ten seasonal rows, 2016–2025, 2,639 games; coefficient fractions range from 0.0595936 to 0.1939413 percent. These are seasonal fractions, not a newly fitted pooled estimate.

Applicability: historical **REPLAY**, not the authoritative deployed-lineage control. Every source row explicitly says residual variance includes model discrepancy and physical irreducible variance is not identifiable. The finding supports E-MC's shape-first purpose; it does not prove that no better information/model can ever change widths, nor establish a simulation's SD as a lower bound on score MAE. E-MC's fixed-input simulation floor will be a separate, model-dependent diagnostic. Future gates must use the then-authoritative deployed lineage.

Confidence: near-total in the stated arithmetic on verified saved rows; lower to high if independent file verification or recomputation disagrees. Generalization to a new production lineage remains to be established.
