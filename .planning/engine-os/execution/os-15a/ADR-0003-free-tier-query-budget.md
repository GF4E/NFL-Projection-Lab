# ADR-0003 — Free-tier D1 query budget

## Status

Accepted for OS-15A qualification on 2026-08-26. This amends ADR-0002; it does not erase the rejected 30-slot design.

## Falsification result

The v2 watchdog allowed 30 recovery slots. A missing slot required a read plus two durable writes, so the watchdog alone could exceed Cloudflare D1's documented Free-plan limit of 50 queries per Worker invocation. Local SQLite success did not establish deployability. The v2 design is rejected.

## Decision

The v3 scheduler:

- qualifies against the 50-query Free-plan limit, counting every statement in a D1 batch;
- processes current due origins with set-based job creation, unique-token fenced claims, audit events, and terminal publication;
- caps a due-origin batch at 32, which exceeds the maximum 16 simultaneous games in the pinned 2026 regular-season schedule;
- aggregates missed-tick, unresolved-set, and superseded-job evidence rather than issuing one D1 statement per item;
- caps watchdog recovery at 12 one-minute slots and resumes from the append-only checkpoint;
- reserves at least four queries of headroom and fails closed before the next database operation if the budget would be exceeded; and
- requires instrumented worst-case qualification in addition to local functional tests.

The provider lane remains absent and capture remains disabled. This is a scheduler-operability correction only; it does not accept prospective capture or any model.
