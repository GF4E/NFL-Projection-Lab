# ADR-0011: Capacity-qualified hosted migration candidate

- **Status:** Candidate; deployable only to one exact owner-only staging project
- **Date:** 2026-08-28
- **Scope:** OS-01 isolated hosted migration-path qualification successor
- **Machine-readable contract:** `config/os01-hosted-migration-qualification.v2.json`
- **Capacity receipt:** `.planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v2.json`
- **Rejected predecessor:** ADR-0010 and `config/os01-hosted-migration-qualification.v1.json`

## Decision

Preserve the v1 contract and its terminal capacity rejection unchanged. A separately
deployed, owner-only, read-only Worker has now executed one D1 `batch` containing
exactly 489 statements on the temporary Sites project
`appgprj_6a92435d1d788191b4d6bcaff0a1525d`. The response contained 489 ordered results,
completed in 588 milliseconds, and recorded zero database mutations, provider calls,
provider-secret reads, and capture activations. Its exact source commit, archive hash,
response receipt hash, access observation, and result are frozen in the v2 capacity
receipt.

That bounded result resolves only the predeployment question of whether the exact
staging D1 accepts at least 489 statements in one Worker invocation and one batch.
It does not establish the duration or behavior of the 295-statement mutating
migration batch. The v2 migration harness is therefore a candidate that may be
deployed only to the exact project named above, using only its isolated `DB` binding.
The build rejects every other project id.

The route and request protocol remain
`POST /__engine-os/os01-hosted-migration/v1` and
`engine-os.os01-hosted-migration-request.v1`. They are unchanged because the runtime
migration semantics and receipt shape did not change. Only the package contract,
capacity evidence, and deployment boundary advance to v2.

## Frozen package boundary

The v2 builder validates all of the following before producing bytes:

1. the original v1 contract still has its frozen SHA-256 and remains terminally
   rejected;
2. the v2 contract is candidate-only, production-disabled, provider-disabled, and
   capture-disabled;
3. the capacity receipt bytes have their frozen SHA-256 and every decisive field
   matches the v2 contract;
4. the requested project id is exactly the capacity-qualified temporary project;
5. the accepted d24 authority and semicolon-aware 489-query accounting are unchanged;
6. the output contains only the DB-bound qualification Worker and immutable package
   metadata, with no SQL files, automatic migrations, provider binding, or schedule.

The package manifest is
`.openai/os01-hosted-migration-package.v2.json`, and its companion digest is
`.openai/os01-hosted-migration-package.v2.sha256`. `deploymentAllowed: true` means
only that the exact candidate package may replace the read-only probe on the exact
temporary project. It does not authorize another temporary project or production.

## Required hosted sequence

1. Reconfirm the named project remains owner-only and has only the isolated `DB`
   binding.
2. Build twice from the same commit and exact project id; require identical entry,
   authority, contract, capacity-receipt, and manifest hashes.
3. Save and deploy that exact archive to the named temporary project.
4. Run `blank_replay` with a fresh 64-hex qualification id and preserve exact request,
   response, HTTP status, deployment, access, and D1 observations.
5. Run `verify_blank_terminal` and require the same deterministic receipt identity.
6. Treat a limit, timeout, partial failure, unexpected HTTP response, or unverifiable
   receipt as a failed qualification. It is not migration evidence.
7. Do not reuse the mutated D1 for the legacy, restore, or failure profiles. Those
   require distinct fresh isolated resources and separately frozen target contracts.

## Remaining gates

A passing blank replay still establishes only the named raw-catalog and DDL-parity
mechanism. The following remain unaccepted: D1 physical-manifest parity, exact
distinct-resource backup and restore, legacy forward migration, actual partial-failure
rollback on a distinct resource, fresh production census, dormant production
migration, postmigration row preservation, OS-01, and ARC-03.

## Credential and production boundary

The candidate has no provider binding, provider route, scheduled trigger, R2 binding,
capture path, model, or production dependency. No provider secret may be read or
included in its build or qualification. It must not call a provider, reserve quota,
activate capture, access production, or access the retained production lock.

## Claim boundary

The passed probe qualifies 489 read-only statements in one D1 batch on one exact
owner-only temporary Sites project. It makes the v2 migration harness deployable only
to that project for isolated qualification. Neither this ADR nor a package build is
hosted migration evidence, OS-01 acceptance, ARC-03 acceptance, restoration evidence,
physical-parity evidence, or production authorization.
