# ADR-0009: Read-only production census through an isolated live-base bridge

- **Status:** Frozen before hosted qualification
- **Date:** 2026-08-27
- **Scope:** OS-01 production-prestate discovery only
- **Machine-readable contracts:**
  - `config/os01-production-census.v1.json`
  - `config/os01-production-prestate-classes.v1.json`
  - `config/os01-census-attestation.v1.json`
  - `config/os01-census-trusted-targets.v1.json`

## Problem

The migration-only authority candidate contains migrations `0017` through `0020`,
while production is receipted only through `0016`. Deploying the authority tree merely
to inspect production would let the Sites packaging layer overlay those migrations and
could change the database before its prestate was known. A database census cannot be
allowed to cause the migration it is supposed to authorize.

## Decision

Use three separate, immutable source identities.

1. **A0 authority.** The clean controller, migration candidate, classifiers, tests, and
   contracts. A0 is never deployed for this census.
2. **C0 bridge.** One direct commit on the exact accepted live source commit
   `e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd`. It retains the live Worker byte for byte
   as a dynamically loaded normal-site runtime and adds only the provider-free census
   entry, its three named controls, and boundary tests. Its `drizzle` tree still ends at
   `0016`.
3. **C1 attested bridge.** One direct child of C0 that changes only the frozen source
   anchor literal and readiness boolean.

A0 and C0 are not trusted merely because a receipt names them. The controller compares
the exact Git bytes of `worker/env-boundary.ts`, `worker/os01-census-operator.ts`, and
`worker/os01-census-source-anchor.ts`; the resulting relation root enters the compiled
source anchor. Two distinct clean worktrees must produce identical C0 manifests, and
two other distinct worktrees must produce identical C1 manifests. Every worktree is
credential-free and contains no `.env*` input.

The C1 static census dependency closure may contain only the environment boundary and
census operator. The retained site runtime must remain a dynamic entry. Provider
markers, quota code, and the normal runtime are prohibited from the static census
closure. The full bundle may still contain the retained site runtime; the qualified
claim is execution-closure isolation for the census request, not provider-code absence
from every dynamic chunk.

## Census behavior

- The route is hidden unless all three temporary controls exist, the compiled anchor
  matches, the 256-bit bearer digest matches, and expiry is no more than two hours away.
- Authentication and expiry complete before D1 is resolved.
- Every query uses an explicit `first-primary` read-only session.
- Schema is classified before table content is scanned. Unknown or incompatible state
  produces a bounded `blocked_before_content_scan` receipt and no content-table scan.
- A supported prestate receives two independent full passes. Schema, columns, row
  cardinality, page hashes, table roots, foundation state, and pass roots must match.
- Responses contain hashes and counts, never row values. AES-GCM continuations and a
  domain-separated HMAC bind request, continuation, sequence, query statistics,
  observation time, and payload.
- The controller opens the receipt with exclusive creation before the first network
  call and never overwrites an existing receipt.
- No migration, repair, provider request, provider secret read, quota reservation,
  capture activation, forecast, or interface change is authorized.

## Hosted control-plane boundary

Qualification follows this monotonic lifecycle:

`preregistered → access_verified → controls_staged → bridge_deployed → pre_census_verified → census_complete → post_census_verified → controls_removed → clean_successor_deployed → cleanup_verified`

Any incomplete run after `controls_staged` is rejected and requires cleanup. The Sites
projection must prove an owner-only custom access policy, no groups or external
visitors, exactly the three secret census controls, capture-gate absence, the saved
source commit, successful private deployment, matching environment revision, and one
logical `DB` binding. Environment projection reads only key, type, and secrecy metadata;
it never dereferences values. Cleanup removes exactly the temporary controls, deploys
an owner-only inert 410 successor for staging or restores the clean live source for
production, removes the census route, and verifies target-appropriate bindings.

Sites connector observations are authenticated but not server-signed. Sites does not
expose a physical D1 identifier, a definitive current-live deployment identifier, or a
reproducible mapping from the uploaded gzip bytes to its canonical archive hash. The
receipt therefore states the explicit trust boundary `trusted_sites_connector_plus_trusted_controller`,
keeps local package identity separate from the opaque Sites archive identity, and uses
the compiled operator response as the execution-time deployment check. It does not
claim cryptographic remote attestation or physical-D1 identity.

## Acceptance boundary

Staging qualification proves the bridge and control-plane mechanism only. Production
prestate is accepted only after the same anchored bridge reads the trusted production
origin, yields the required receipt, removes its controls, and restores the exact clean
live source. If provider-value access would be required at any point, production census
is blocked. Current migrations `0019` and `0020` remain undeployable until the production
receipt proves a supported prestate and the isolated migration, rollback, and restore
gates pass.
