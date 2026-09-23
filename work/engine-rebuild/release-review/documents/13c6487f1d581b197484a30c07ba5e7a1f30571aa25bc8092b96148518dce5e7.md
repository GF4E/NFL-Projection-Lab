# Recorded weight-only refit handoff

Infrastructure implementation under the full rebuild; no statistical promotion or live activation.

Gap sweep before implementation:
- Tier 1: state method identity excludes score coefficients. Retain the original worker configuration/state fit reference and compare its method with the new scoring artifact; never re-assimilate or replace a state merely because ridge weights changed. Existing cutoff_state.method defines the method.
- Tier 1: convert only a completed recorded weight-only fit into a normal immutable issuing envelope. Preserve every parent method/calibration field; change fitted numerical values and declared weekly lineage only. Physical availability comes from the original durable fit receipt. No shadow or reconstructed forecast becomes AS_ISSUED.
- Tier 1: stage prepared rows and manifest without changing active pointers. Then use the existing fenced intent journal to switch fit, preparation and release together. Any interrupted write blocks ordinary consumers until the same operation reconciles. Rollback preserves all visible games and original locks.
- Tier 2 REVIEW REQUESTED: exact executable/runtime remains required in this increment. Weight-only forward/rollback compatibility is added; general executable/runtime rollback still requires its own qualification. Alternative: runtime switching in the same transaction; deferred because restoring an interpreter is a different operation, not an approximation.

Acceptance: candidate receipt/parent/method/calibration validation; no pointer mutation during staging; a changed fit scores through the actual preparer/publisher; fit and state method identities are separate; crash/retry at fit/preparation/release writes; superseded operation rejection; unchanged locked records; preserved publication population. Actual weekly dispatch, public closeout proof and deployment remain separate required acceptance items. Captured fixtures do not authorize activation.

## Implemented evidence

`refit_release.py` retains a production-readable immutable derivative of a completed recorded fit. Every parent method/calibration field remains identical; only ridge fit and weekly lineage change. It preserves the durable availability receipt, validates finite scoring fields and fixed feature/penalty settings, and rejects unrelated rollback targets. The state worker keeps its original configuration and recorded state references; its method, rather than the coefficient artifact's identity, must match.

`stage_refit` runs the actual scheduled preparer and scorer without changing active pointers, then builds the release checkpoint. The existing intent journal now carries the original fit and switches fit, prepared pointer and release under the shared locks/fence. An unfinished journal blocks ordinary consumers. Existing locked records are never rewritten by this transition. Original saved bundles verify after rollback; the fixture publisher shows the expected 0.25-point change from a deliberately altered intercept.

The actual Linux service interpreter (Python 3.12.2, UID 1000) passes 25 focused tests in 17.118 seconds, with 49,827,840 bytes peak parent RSS. These are synthetic fixtures through the actual publisher, not a captured-slate or live-cycle result. Source hashes are recorded in host-refit-handoff.json. An external 120-second deadline bounds the remote process. Tests use /dev/shm; no active production pointer or timer is changed. Read-only host inspection showed 82,542,592 root bytes available; durable capacity remains unresolved.

Failure evidence: the first broader run passed 341 of 342 tests; one new assertion incorrectly compared the newline-bearing state digest with the canonical fit digest. The assertion now uses the engine's actual fit-hash convention. Preserve tests-refit-handoff-projection.log; this was a test identity error, not a changed model result. Final local verification: 342 projection tests, 218 standing Week 1 tests and 10 closeout tests pass (570 total). The final suite and standing-check logs are retained separately.

Remaining required work: connect the recorded refitter/training ledger and staged handoff to the actual weekly scheduler; validate public closeout publication before activation; run a captured-data end-to-end refit → stage → release → lock → grade → rollback canary; general executable/runtime rollback; durable storage; own-lineage calibration/venue experiments with real review prerequisites; prospective evaluation and an observed live cycle. Do not interpret these fixture passes as complete unattended operation or better accuracy.

Least certain: the complete real weekly dispatch transaction, which still uses the legacy refitter. It remains blocked from silently using this new path. Confidence: medium in operational readiness—verified implementation evidence supports the handoff, but its real scheduler/publication integration could change the conclusion. Lower to low if a captured or live consumer bypasses the journal or changes an original lock.

## Weekly dispatch integration sweep (before implementation)

- Tier 1: reuse the scheduler's already-held dispatch lock by verifying the passed descriptor identifies the exact lock file and taking/retaining its exclusive flock. Do not open a second description of the same lock. Standalone calls still acquire their own lock. The preparation lock protects each mutation, and ownership is rechecked before release.
- Tier 1: one durable weekly request freezes owner, parent release/fit, Tuesday state, training-ledger reference, closeout identity and fit-start time. Later hourly retries reuse that request and the recorded fit. No second refit after a completed release or rollback.
- Tier 1: append only original qualifying locks for completed games absent from the migration ledger. Missing locks fail explicitly, never silently drop games or rebuild features from current data.
- Tier 1: an interrupted weekly release reconciles only its own recorded target and operation ID, before other scheduler/provider/publication work. Unrecognized pending switches still require explicit reconciliation.
- Tier 1: source-repository publication is insufficient for the adopted user-visible closeout requirement. Require a separately verified public-closeout receipt; missing evidence returns a named wait before any new refit. This integration does not invent that receipt or claim the website supports it today.
- Tier 2 REVIEW REQUESTED: configuration stays uninstalled until the training transition and public publication channel qualify. Tests exercise explicit simulated publication evidence. The alternative, shipping behind source-only publication, would waive a required boundary and is rejected.
