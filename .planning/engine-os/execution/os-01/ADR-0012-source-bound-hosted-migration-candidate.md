# ADR-0012: Source-bound hosted migration candidate

- **Status:** Candidate; deployable only after a fresh owner-only staging refresh
- **Date:** 2026-08-28
- **Scope:** Corrected OS-01 isolated hosted migration-path qualification successor
- **Machine-readable contract:** `config/os01-hosted-migration-qualification.v3.json`
- **Corrected capacity receipt:** `.planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v3.json`
- **Frozen probe source:** `.planning/engine-os/execution/os-01/hosted-capacity-probe-worker.f161104.js.txt`
- **Rejected predecessor:** commit `f157401f02e2e5634f6225bef6eeefb594e65813`

## Rejection carried forward

The v2 receipt named `/__engine-os/os01-d1-capacity-probe/v1`, while the exact probe
source accepted only `/__engine-os/os01-capacity/v1`. The v2 response self-hash,
project restriction, package reproducibility, and fail-closed runtime controls all
passed, but none can make an inaccurate request identity exact. Commit `f157401`, its
v2 contract, receipt, builder, tests, and ADR-0011 remain immutable rejected evidence.
They do not authorize deployment.

## Decision

Create a v3 candidate without altering v1 or v2. Preserve a byte-exact tracked copy
of the source at capacity-probe commit `f161104`. The v3 builder hashes that snapshot
and extracts exactly one request route, request version, and qualification id. It also
requires the source to enforce `POST` and the exact sorted key set
`qualificationId,version`. The v3 receipt and contract must match every extracted
value before any package bytes can be emitted.

The corrected identity is:

- method: `POST`
- route: `/__engine-os/os01-capacity/v1`
- version: `engine-os.os01-d1-capacity-probe-request.v1`
- qualification id: `os01-capacity-20260829-489-readonly`
- exact keys: `qualificationId`, `version`

The response evidence remains unchanged and its self-hash independently recomputes to
`cb7c00a83a66304430c0c61385328568b752a7122069e5cc8c170e849193ed55`.
The exact isolated D1 accepted one read-only 489-statement batch and returned 489
ordered results in 588 milliseconds with zero recorded mutations, provider calls,
provider-secret reads, or capture activations.

## Deployment boundary

The v3 builder accepts only Sites project
`appgprj_6a92435d1d788191b4d6bcaff0a1525d`. It emits a DB-only package with no R2,
provider, schedule, capture, model, production, automatic-migration, or retained-lock
path. Its manifest is `.openai/os01-hosted-migration-package.v3.json` with a separate
SHA-256 digest.

Before deployment, the operator must freshly verify that the exact project is still
owner-only, has no group, editor, or external principal, and exposes only the isolated
`DB` binding required by this package. That live access and binding refresh is the sole
remaining predeployment action. Any drift blocks deployment.

After that refresh, `deploymentAllowed: true` authorizes only replacement of the
read-only probe on this exact temporary project with the v3 qualification Worker. It
does not qualify migration behavior or authorize production.

## Hosted evidence still required

The 489-query probe is read-only. It does not prove that the 295-statement mutating
blank migration batch completes within 30 seconds, rolls back on actual D1 failures,
or reaches the expected terminal state. Those are outcomes of the hosted qualification
run, not assumptions of this contract. A platform limit, timeout, partial response,
hash mismatch, or unverifiable D1 observation rejects the hosted attempt.

Even a passing blank replay does not establish D1 physical-manifest parity, exact
distinct-resource restoration, legacy-forward preservation, partial-failure rollback
on a distinct resource, fresh production census, dormant production migration,
postmigration production parity, OS-01, or ARC-03.

## Claim boundary

The v3 candidate repairs and permanently tests the capacity receipt's request identity.
It remains an isolated staging mechanism. No provider secret was read, no provider or
quota path was called, no capture was activated, no production resource or retained
lock was accessed, and no deployment occurred while creating this successor.
