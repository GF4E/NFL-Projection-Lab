# Historical calibration boundary implemented

BUILT AND VERIFIED ON FIXTURES; INACTIVE IN PRODUCTION. No historical candidate comparison, calibration migration, preregistration, promotion or control change occurred. This implements the empirical family and separation rules already specified in E-CAL-PREFLIGHT.md, not a new uncertainty method.

`engine/projection/calibration_history.py` constructs a hash-bound bank from an explicitly enumerated prior-season donor population. It binds donor and receiving point-method identities separately, requires the declared own-lineage or legacy-donor relation, and checks unique games, finite predictions, integer nonnegative final scores, fit-before-issuance timing, exclusion of the target from its own training population, and outcome availability before calibration fitting. Fit-evidence hashes name the evidence manifests, not fitted coefficient hashes. Current/future-season records cannot enter the bank; listing them in the expected population fails rather than silently reducing the population.

The bank preserves raw actual-minus-predicted residuals. Team errors are pooled; margin and total errors are differences and sums within the same game. No independence assumption, recentering, smoothing, clipping or searched dispersion parameter is introduced. Consumption verifies the expected bank hash and reconstructs its counts from retained donor evidence. A correctly hashed but numerically altered table still fails.

Uncertainty attaches to an already-computed point forecast. The adapter performs no ridge fitting, preserves team/margin/total points exactly, and rejects inconsistent input totals/margins. It adds integer 50/80 intervals for each team, margin and total; strict win probabilities and tie probability remain separate from the existing tie-split display probability. Actual marginal means and negative team/total score mass are disclosed. Legacy centers remain labeled as such; the adapter does not make the separate marginals a coherent joint model or resolve invalid negative score support.

Batch attachment validates a bank once per batch rather than rebuilding the same bank for every historical game. It requires distinct games, compatible season/method, and calibration availability strictly before every issuance. Full historical performance and host resource qualification have not yet been measured.

## Verification and limits

Fifteen new fixture tests plus eight existing calibration-gate tests pass. Ten existing v3 numerical tests also pass: 33 total. Covered cases include paired hand-calculated errors, exact point preservation, interval nesting, integer quantiles, tie events, negative support, row-order invariance, current-season exclusion at both allowed refits, missing/duplicate games, donor/receiver mismatch, self-trained targets, unavailable fits/outcomes, nonfinite/fractional outcomes, undeclared market fields, missing sources, bank tampering and batch parity. The initial 21-test log is retained; batch and allowlist tests bring the final calibration subset to 23. No test is presented as football accuracy evidence.

The bank checks declared evidence; it cannot prove that a caller's source hashes are authoritative, that training manifests tell the truth, or that historical features were originally available. OFFSEASON and WEEK9 select the declared policy; verifying actual scheduled execution dates and preventing additional revisions remain the orchestrator's responsibility. Those remain required external qualification and preregistration checks. The existing common historical point scorer still refuses direct current-residual transplantation. No publisher or active pipeline calls this new adapter. Reports do not invoke fitting.

Next: verify and bind the complete donor histories to the final authoritative control, then wire the adapter into the registered evaluator after publication and registration prerequisites. Preserve the earlier Tier 2 warmup/window flags and all full-goal requirements. No current residual table may be reused backward in time, no population may shrink, and no passing fixture permits release.

## Operational observation

Read-only host check at 2026-09-23T08:32:00Z: root available bytes 49,942,528; free inodes 1,013,392. Root remains critically short of headroom. This turn did not clean caches, delete artifacts, purchase capacity or change services. Durable capacity approval remains pending. Evidence: calibration-adapter-host-space.json. Host/deploy: no changes by this work. Provider calls/spending: zero.

Least certain: compatibility and qualification of the full historical donor populations. The adapter therefore remains inactive and makes no release or improvement claim.

Confidence: medium in readiness for historical evaluation, meaning the implementation follows verified code and declared evidence but depends on donor/window choices that could reasonably differ. Lower to low if the complete source-qualified replay violates a declared boundary or requires changing the registered family or population. Predictive improvement remains unproved.
