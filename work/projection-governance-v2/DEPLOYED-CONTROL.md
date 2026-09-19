# Governing control correction — effective immediately

Every experiment is gated against the deployed model's rolling-origin series. The expanding-refit series is retained only as a diagnostic labeled REPLAY. Production identity must be established by tracing the issuance code, active fit and version lineage; similar aggregate errors do not establish identity.

E1 and E-UNC remain valid within their replay and are not tested against production. Each may be re-registered once against the deployed series. Preserve their original records and decisions; this annotation changes applicability, not historical results.

E-POST is registered at highest queue priority. Candidates: (a) additive correction equal to mean actual-minus-projected error in the prior two completed seasons; (b) EMOS actual=a+b*projected fit on all prior seasons, applied forward, with CRPS-fit dispersion using engine/forecast_system/postprocess.py; (c) (b) plus home-field offset from prior-season residuals. Prefer simpler on ties. Standard team-MAE and coverage gate unchanged. Reproduce candidate (b) MAE 7.757 within 0.02 before new fitting; preserve paired-game bootstrap design. Audit expected improvement -3.40%, interval [-4.44,-2.33], nine of nine seasons improved is prior viewed evidence, not a new result.

Registration is BLOCKED_CONTROL_RECONCILIATION under the user's explicit stop: today's active production artifact is projection-v2.w2, not established as the named baseline OOF. Candidate evaluation and executable preregistration gap sweep resume only after the control identity is resolved. No change to candidates or gates is authorized by this blocker. Existing closeout prerequisite and Tuesday-to-Tuesday clock continue to apply; registration does not fabricate a Tuesday activation or published closeout.

## Authoritative control, fixed 2026-09-19

The sole gate control is work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json. Catalog and identity: work/series-registry/SERIES.md. E-POST closed REJECTED_ON_PREMISE, not rejected on gate. Its earlier blocked status above is historical and superseded. The audit used the stale v3 baseline as production and pooled fourteen games from two superseded fits.
