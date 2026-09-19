# Deployed-lineage control amendment and pre-implementation gap sweep

User authorizes generation of a new 2016–2025 rolling-origin control for the exact deployed projection-v2.w2 lineage, fit 8bd58561, calibration and Elo included, 2639 registered games, baseline-compatible game rows. Save immutable content-addressed output under work/projection-v2w/deployed-oof-<hash>.json, recording code commit, fit hash, settings, cadence, and game membership. This artifact is not itself a method promotion.

E-POST candidates and standard gate are unchanged. The audit's 7.757 MAE and -3.40% result now serve only as reference values from another series, NOT reproduction thresholds for the new control. Report new control MAE, projected-minus-actual bias, population projected SD and actual-on-projected slope by season and pooled. Compare to baseline and REPLAY. If historical bias does not share the stated negative sign, stop before candidate evaluation. Direct droplet verification must establish active fit and code identity.

## Batched gaps before fitting

- Tier 1: report bias as projected minus actual, with correction (a) using actual minus projected so negative bias receives a positive correction. Existing engine signed-error convention differs; label explicitly.
- Tier 1: SD is population SD pooled across both teams; separately label any average of seasonal SDs. Use original game membership and keep paired teams together.
- Tier 1: preserve hashes and original registration, supersede the 7.757 tolerance only as explicitly authorized. Previously viewed baseline evidence is not a fresh independent result.
- Tier 3: exact deployed path and three-cutoff state-space replay are not currently the same algorithm. scripts/projection_v3_publish.py uses active_artifact and make_card; scripts/projection_learning.py implements weekly ridge refits. Neither calls the constrained filter or engine/forecast_system/cadence.py; that module explicitly says no production activation. No defensible silent default can both reproduce that path and add state assimilation. Recommendation: exact weekly-refit path as control; intended state-space cadence identified separately. Decision requested before fitting.
- Execution blocker: direct droplet SSH fails host-key verification; cannot establish remote active fit, commit or installation. Trusted connection requested. No SSH checks bypassed.
- Evidence correction: the 14 as-issued games are NOT all from projection-v2.w2. Eight belong to projection-v2-172f3e04-a39aa883 and six to projection-v3-b7a84dbe-2b5d9d0f. Their -3.45 bias is a mixed-version statistic, not a measured 14-game current-lineage statistic. Retain it labeled correctly.

The two blocking issues are batched, not serial stops. No deployed-oof file is fabricated, no candidate is fitted, no gate decision is claimed. Existing closeout prerequisite and queue priority remain. No additional fitting conventions are silently settled while the control identity is unresolved.
