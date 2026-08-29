# ADR-0001: Interim 2026 scheduler boundary

- Status: frozen for OS-15A qualification
- Date: 2026-08-26
- Decision owner: Prediction Engine OS

## Context

The legacy scheduler is tied to the Tuesday-only `forecast_origins` table and has owner-only leases. OS-02A established `forecast_origin_versions` as the authoritative, append-only identity chain for all five forecast horizons. Retrofitting the legacy tables would create a second origin authority and would not make stale-worker publication safe.

The −15 horizon has a frozen maximum persistence delay of 300 seconds. A five-minute scheduler cadence consumes that entire window and leaves no bounded recovery opportunity.

## Decision

OS-15A will add an isolated v2 scheduler lane bound directly to eligible current heads in `forecast_origin_versions`. Accepted migrations 0013 through 0015 and the legacy scheduler remain unchanged.

The frozen machine-readable contract is `config/interim-scheduler-contract-2026.v1.json`. It establishes one-minute dispatcher ticks, an independent odd-minute watchdog, 90-second renewable leases, 30-second heartbeats, unique attempt-token hashes, monotonically increasing fences, atomic terminal publication, and the per-horizon effective deadline:

`min(origin + horizon maximum persistence delay, kickoff - 1 second)`

Qualification cannot dispatch providers, read the Odds secret, activate capture, execute a model, or publish a production forecast. It may prove the delivery sink only with immutable `no_eligible_package`, approved failure, or late nonprospective withholding records in isolated fixtures.

## Reschedules and unresolved games

Only current origin-version heads may be claimed or published. Superseded pending jobs retain history but lose publication eligibility. Unresolved origins do not receive fabricated trigger times. If later resolution reveals a past origin, it receives a nonprospective `schedule_unavailable_at_origin` closure and is never backfilled as prospective.

## Cutover

`config/interim-scheduler-cutover-2026.v1.json` freezes the OS-15 import boundary. Nonexpired leases block cutover, terminal records transfer unchanged, only future pending current heads transfer, and no missed origin may be replayed. Only one scheduler may possess publication authority.

## Consequences

- OS-15A can qualify scheduler coordination without claiming OS-13A’s complete formal forecast ledger.
- The legacy tables remain preserved evidence and are not a source of v2 scheduler identity.
- Production stays fail-closed while `ENGINE_OS_CAPTURE_ENABLED` is absent.
- A later OS-15 package must deliberately adopt the cutover contract; acceptance is not implied here.
