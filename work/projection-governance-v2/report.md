# Governance implementation report

The experiment queue now supersedes the architecture phase ordering/gates. The earlier Phase A result is retained unchanged exploratory evidence, not an E2 queue decision. No E1 comparative result has been viewed.

## Implemented

- Removed automatic method proposal/activation from the weekly runner. The legacy proposal endpoint is inert and cannot replay historical promotion receipts. Weight-only refits, old evidence, and lineage are preserved.
- Added population SD of projected and actual team points to canonical weekly/cumulative metrics, separately for AS_ISSUED and RETROSPECTIVE. Same graded games on both sides.
- Added a pure release-eligibility validator for hashed preregistration/evidence, capped candidates, chronology, paired populations, candidate calibration, >=1% team-MAE improvement, registered coverage/extra gates, correction disclosure, lineage, rollback and two completed reviews. Unresolved leak/double-count objections block eligibility. The validator never deploys a method.
- Saved the source governance document, fixed queue, requirement map, E1 registration draft and reviewer packet template.
- E1 control is unchanged linear decay; the three challengers are shrinkage k4, shrinkage k8 and state-space. Control is outside the challenger cap, selected before comparisons under the user's best-statistical-practices direction.

## Current compression audit

| Evidence | Week | Games | Projected team SD | Actual team SD |
|---|---:|---:|---:|---:|
| AS_ISSUED | 1 | 14 | 1.977 | 10.838 |
| RETROSPECTIVE | 1 | 2 | 0.924 | 7.661 |

This is reporting, not a gate. Actual scores contain game noise; their SD is not a target that point predictions should be forced to match.

## E1 status and remaining work

DRAFT_NOT_REGISTERED; not evaluated or promoted. Preseason staff history is unseeded. State-space needs evidence-qualified coach/QB1 transitions and registered covariance/noise-fitting conventions before comparison. Missing transitions may not silently become false. Completing that source audit and preregistration is the next implementation step. No candidate is claimed to have passed or failed E1 yet.

## Validation

57 projection/governance tests and 218 Week1 regression tests passed (275 total). New checks prove the weekly job never calls method promotion, old receipts cannot reactivate it through the compatibility endpoint, compression arithmetic preserves inputs, mismatched registration/evidence blocks eligibility, and reviewer leak/double-count objections block eligibility. Existing immutable-refit and post-lock-edit tests still pass. Zero paid API credits.

Production verification is recorded separately in deployment-receipt.json after push; a commit alone is not a deployed-behavior claim. No input weights or model predictions are changed by this governance patch.

Least sure: how the candidate cap applied to E1's four named configurations. The unchanged linear rule is the control outside the cap, leaving exactly three challengers; this choice was recorded before comparative results.
