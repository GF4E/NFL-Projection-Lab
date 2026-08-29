# ADR-0002: Hold the Statistical Architecture at R1

- **Status:** Accepted hold; not an R3 branch decision
- **Decision date:** 2026-08-25
- **Gate:** R1 `reviewer_independence_blocked`
- **Evidence:** `artifacts/engine-os/r1/status.json`

## Decision

Do not run Module 2B and do not begin a drive, quarterback, player, or other
football module. R1 ended `protocol_invalid` because its frozen independent
target review requires two distinct blinded natural-person reviewers and a
third natural-person adjudicator. Those roles are not yet bound, so target
agreement has not been established.

Module 1 and Module 2 remain `reject_all`. C0 and P0 remain research benchmarks
only. P1 is not eligible for shadow use, and no possession result may be routed
conditionally around the failed gate.

## Preserved evidence

- The preregistration was hashed before any selected official gamebook review.
- The deterministic sample contains 64 unique completed regular-season games.
- Exact official NFL gamebook bytes for all 64 games were captured and hashed.
- Both blinded entry sheets and the adjudication ledger remain blank.
- R2 authorization is explicitly `false`.

## Reversal condition

This hold can be lifted only if three distinct people bind to the frozen roles,
both blinded sheets are independently completed and hashed, a third person
adjudicates disagreements, and every frozen R1 agreement and severe-error gate
passes. A changed reviewer design requires a new R1 experiment identity and
cannot rewrite this result.

Only after R1 passes may the exact D0-versus-D1 Module 2B experiment run. R3
remains blocked until that experiment has a terminal result.
