# ADR-0001: Prediction Engine Authority and Execution Planes

- **Status:** Accepted for the engine OS; enforcement work remains listed below
- **Decision date:** 2026-08-25
- **Owners:** Prediction Engine OS
- **Requirements:** ARC-01, ARC-02, ARC-04, ARC-05
- **Machine-readable registry:** `.planning/engine-os/execution/os-00/ownership-registry.json`

## Context

The repository began with a live Cloudflare Worker/D1 path and a separate Supabase job and authentication path. It also mixed public reads with background maintenance, creates some D1 tables at runtime, assigns coefficient work to the Worker, and keeps large Model Lab evidence only in the local working copy. Those conditions made it impossible to answer four basic questions reliably: which store is authoritative, which scheduler may execute, what was known at a forecast origin, and whether a result can be reproduced from preserved bytes.

The operating system needs a small architecture that fits a hobby project without giving up scientific provenance. It does not need a warehouse, event bus, hosted feature store, or second production database.

## Decision

Use exactly five authoritative planes:

```text
                         control and small manifests
                                   Git
                                    |
Providers -> Worker acquisition -> R2 immutable objects
                  |                   |
                  +---------------> D1 metadata/state
                                      |
Compute runner <--- frozen inputs -----+
      |                               |
      +-- verified package -> R2 + D1 registry
                                      |
                           Worker inference/publication
                                      |
                         inert public read from snapshot
```

### Git

Git owns code, protocols, configuration, feature and target definitions, ordered migrations, ADRs, and small content-addressed manifests. Git never stores credentials or mutable operational state. Changing a frozen scientific question creates a new experiment identity; it does not rewrite the previous protocol.

### R2

R2 owns immutable source bytes, large origin-keyed datasets, experiment artifacts, model packages, full forecast distributions, and publication payloads. Objects are addressed by SHA-256 and are write-once. A changed byte creates a new key. D1 may point to an R2 object but may not replace its content.

### D1

D1 is the sole production metadata and operational state database. It owns canonical identities, source manifests, compact point-in-time rows, job leases and checkpoints, experiment and model registry records, forecast summaries or withholding records, evaluations, alerts, and atomic serving pointers. Ordered Git migrations are the only schema authority after OS-01; runtime DDL is a known temporary violation, not a second accepted schema system.

### Cloudflare Worker

The Worker owns scheduled lightweight coordination, bounded source acquisition and validation, verified low-latency inference, atomic last-good publication, and public reads. A public request is never a scheduler. It may not fetch a provider, start maintenance, fit a model, archive a forecast, mutate D1 or R2, or consume provider quota.

### Authenticated compute runner

The compute runner owns historical replay, feature materialization too large for the Worker, model fitting, rolling-origin evaluation, bootstrap or ensemble work, and package construction. It reads frozen Git definitions plus D1/R2 manifests, runs with bounded resources in a locked environment, and publishes immutable outputs. The Worker promotes or serves only a registered package whose hashes and capability pass the frozen gate.

## Scientific evidence decision

The Model Lab evidence is frozen without reinterpretation:

- Module 1 version `module1.2026-08-24.4` remains `reject_all`; `c0_naive_points` is a benchmark only.
- Module 2 version `module2.2026-08-25.8` remains `reject_all`; `p0_league_season_naive` is a benchmark only.
- The earlier Module 2 v7 `protocol_invalid` result remains preserved as a separate failed run.
- All 2025 results are retrospective and research-exposed.
- Neither run changed production.
- The only authorized next possession question is the preregistered D0-versus-D1 Module 2B kernel falsification after R0 and R1 pass.

The content-addressed inventory at `.planning/engine-os/execution/os-00/evidence-inventory.json` is the authority for the preserved files and cache contract. A missing object is a preservation failure; downloading the current upstream version is not proof that it is the original object.

## Supabase quarantine

Supabase has no production authority. The client packages and client source files have been removed. The job runner is an unimported no-I/O tombstone, its API returns HTTP 410, login and callback redirect to the public site, and shared-record authentication always fails closed. Historical migrations remain evidence only. None may receive writes, schedule work, serve as fallback, or be used for dual-read reconciliation.

The active runtime quarantine requires all of the following:

1. The active build cannot import `src/server/jobs/runner.ts` or either Supabase client.
2. `/api/jobs/*`, login, and callback paths cannot invoke Supabase.
3. Repository deployment configuration contains no Supabase service-role, anonymous, pipeline-worker, or legacy cron credential.
4. A one-time export decision is recorded for any row that must be retained.
5. Any rollback is time-bounded to export only and cannot resume production writes.

Items 1 through 3 are now enforced by source, package, deployment-config, and post-build scans. External credential revocation and any one-time export remain operator actions under OS-18 because repository evidence cannot prove the state of an external Supabase project or hosting secret store. The exact legacy paths, tables, job names, and secret names are enumerated in the ownership registry. That registry deliberately records `owner: none-quarantined`; assigning those objects to D1 later requires an explicit migration rather than a dual write.

The metadata-only Sites environment receipt at `.planning/engine-os/execution/os-00/sites-environment-receipt.v1.json` records that revision 8 has an empty key set, including no Supabase, team-gate, push, pipeline, cron, acquisition-switch, or Odds credential names. That is deployed-configuration key-set evidence for the next deployment, not evidence that an external provider credential has been revoked.

## Interfaces

### Source publication

```text
fetch -> redact request metadata -> preserve exact bytes in R2
      -> insert D1 manifest -> parse -> validate -> stage -> atomic publish
```

No parse or validation failure may delete or replace the last good product. Source and receipt times remain distinct.

### Compute dispatch

The Worker creates an idempotent job record keyed by job type, frozen input manifest, code/config hashes, and scheduled origin. The compute runner authenticates, acquires a lease, and publishes content-addressed outputs. Completion changes only a D1 pointer after every declared hash verifies. Retry is safe because the identity and objects are immutable.

### Forecast publication

A forecast record binds the model package, configuration, input manifest, schema, origin, generation time, and immutable distribution hash. A missing dependency produces a contemporaneous withholding record. Market evidence is attached later in a separate ledger and cannot mutate the football forecast.

### Public read

The public API reads one versioned publication pointer and its precomputed payload. It performs no provider request, fit, replay, large join, or write. Cache and stale behavior will be numerically frozen by OS-00B and implemented by OS-20.

## Enforcement and verification

- `scripts/verify_os00_evidence.py` verifies the frozen Git files, large evidence objects, source-cache objects, nested artifact manifests, and terminal statuses.
- OS-00 runtime tests must prove public GET requests cause zero writes, provider calls, or quota changes.
- `scripts/verify_active_build_graph.py` rejects Supabase packages, imports, runtime credentials, client code, or the retired runner from the completed production bundle.
- OS-01 must make a blank D1 migrate completely and remove production runtime DDL.
- OS-15 must move heavy fitting behind the authenticated compute interface.
- OS-03 must upload and verify the local Model Lab cache and large artifacts in R2 before local copies are treated as disposable.

## Current exceptions and their owners

This decision assigns authority; it does not disguise current failures as complete:

| Exception | Requirement | Closure task |
|---|---|---|
| External Supabase, pipeline, or legacy cron credential revocation cannot be proven from repository state | OPS-07 | OS-18 operator action |
| D1 runtime `CREATE TABLE` statements coexist with migrations | ARC-03 | OS-01 |
| No authenticated external compute runner exists; retained heavy lifecycle source is unreachable | ARC-04 / OPS-02 | OS-15 |
| Model Lab source cache and large outputs are not durably in R2 | DATA-01 | OS-03 |

The `/sunday` maintenance side effect has been removed. The Worker rejects mutating HTTP methods before framework routing, handles every public API through an explicit SELECT-only path, and rejects unknown APIs; focused request-boundary tests pass. Supabase is absent from the active source, package, deployment-config, empty Sites revision 8 key inventory, and production-build graphs; the remaining credential-revocation statement is explicitly limited to what repository evidence cannot observe. The 17 Git-designated Model Lab files are tracked in integration commit `bbd77d3`. Full evidence durability still depends on the OS-03 R2 upload and restored-cache proof.

## Consequences and trade-offs

- D1/R2 keeps operations inexpensive and close to the existing Worker, at the cost of implementing explicit manifests and a separate batch runner.
- Content addressing duplicates changed objects rather than updating them, trading storage for auditability and safe rollback.
- Eliminating Supabase removes a convenient auth/database path, but the public analytics scope no longer needs personal accounts and dual authority is a larger risk.
- The Worker remains a good scheduler and serving edge but is intentionally not the research computer.
- Large evidence does not belong in Git. Until R2 upload exists, the local cache is a single-host preservation risk that the verifier reports rather than hiding.

## Revisit conditions

Revisit the storage or execution split only if measured R2/D1 limits, compute-runner cost, or serving latency violate the frozen OS-00B targets. Introduce no warehouse, stream bus, or hosted feature store without a concrete capacity failure and a migration/rollback plan.
