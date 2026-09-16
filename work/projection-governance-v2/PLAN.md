# Governance adoption and E1 preparation

The governing Week 2 experiment protocol applies to every queued experiment. GOVERNANCE.md overrides ARCHITECTURE.md and Addendum 1 where inconsistent. Architecture phase order and gates are superseded; their historical failure record is retained unchanged and does not consume E2. No unseen-holdout claim may be made for previously inspected Phase A history.

## Mapping

| Requirement | Implementation/evidence |
|---|---|
| §1 precedence, one method/week, registered gates | GOVERNANCE.md; queue.json; engine/projection_experiments.py |
| §2.1 primary team MAE and registered coverage | engine/projection_experiments.py release validation |
| §2.2 correction/method separation | mandatory decision data_corrections field |
| §2.3 cap, preregistration/hash/chronology/tie/disproof | e1/registration.json; e1/CONVENTIONS.md; locked registration required by decision validator |
| §2.4 evidence populations | existing build_report split retained; release validator evidence labels |
| §2.5 automated refits never promote methods | scripts/projection_learning.py; scripts/projection_learning_gate.py; tests/test_projection_governance.py |
| §2.6 method hashes, rollback, deployment verification | release validation requires lineage and hashes; deployment receipt separate |
| §2.7 weekly predicted/actual SD | engine/projection_learning.py metrics and canonical columns |
| §2.8 skill/PIT/floor reporting only | per-experiment standing tables; floor explicitly NOT_BUILT until E4 |
| §3 queue E1–E8, later weather/lead-time | queue.json; no future-week runner activated |
| §4 no-market/no-names/OURS separation | existing engine boundaries and tests preserved; decision evidence cannot originate engine weights from edits |
| §5 two reviewers, four questions, leak/double-count objections block | engine/projection_experiments.py; REVIEW-PACKET.md |
| §6 sources motivate, not validate | GOVERNANCE.md; no extrapolated performance claims |
| §7 per-experiment deliverables | e1/report.md and verification.json after replay; governance implementation report distinct |

## E1 prerequisites

Baseline is the actually deployed method, identified by active-fit-ref.json, not the new raw Phase A core. Candidate changes may not activate previously absent core groups. All candidates use identical games and their own strictly earlier calibration. Linear through Week5 is control; control is outside the cap; the three challengers are k=4, k=8, and state-space. Registration was frozen before comparisons; The initial E1 run is INVALID because NFL week labels do not enforce Tuesday cutoffs for postponed games. See e1/validity.json; the numeric rejection is withdrawn pending a correct replay.

State-space requires two PPD states per team, fitted observation/process noise and shrink, Tuesday-only updates, the specified venue/non-strength offsets, Elo RETAINED in E1. Elo removal is E5 only. The September 16 supplement and constrained A.2 replacement are implemented in engine/forecast_system/state_space.py and state_fit.py. Staff QB1 coverage is 446/448; PFR coaching remains explicitly unknown. Binding A.3 now authorizes false unknown transition flags, with the limitation reported. Exact covariance and identification conventions are frozen in e1/CONVENTIONS.md and the hashed registration before comparisons. Missing required inputs or unresolved registration definitions prevent a release decision; they are not numerical rejection evidence.

Reused historical results remain development evidence. Gate is >=1% OOF team MAE improvement versus the actual baseline and 50/80 coverage within 3pp, plus explicitly registered experiment gates. The old mandatory SD>=4 and positive skill every year are not carried into E1. Compression is audited beside actual SD, not forced to match it.

## E1 execution mapping

- Data addition and unknown coverage: scripts/e1_staff_seed.py; config/staff_history.json; e1/staff-coverage.json.
- Three candidate replay and gate: scripts/e1_prepare.py; scripts/e1_evaluate.py.
- Constrained covariance, synthetic recovery, row-order and within-week causality: tests/test_forecast_state_space.py.
- Frozen issued-input counterfactuals, separate from original forecasts: scripts/e1_current.py; e1/current-season-protocol.json.
- Report-only tables and figures: scripts/e1_report.py; scripts/e1_figures.py.
- Reviewer questions and explicit missing responses: e1/REVIEW-PACKET.md. No method activation in these scripts.
