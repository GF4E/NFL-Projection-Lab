# ADR-0007: Treat the persistence deadline as an open prospective boundary

**Status:** Accepted for OS-15A qualification  
**Date:** 2026-08-26

## Context

The v4 scheduler contract and the first 0016 schema definition disagreed at one exact instant. Current-head classification already treated `observed_at >= persistence_deadline_at` as late and nonprospective, while the publication ordering, pure timing evaluator, and record-table check allowed `persisted_at = persistence_deadline_at` to remain timely. That boundary contradiction could let the same origin receive different scientific eligibility depending on which guard evaluated it.

## Decision

Version 5 makes the prospective persistence window half-open: a record is timely only when `persisted_at < persistence_deadline_at`. Equality and every later instant are `late`, `prospective_eligible = 0`, and—when the origin was otherwise eligible—use `late_origin_excluded`. Lease renewal also stops at equality. The table check and atomic publication trigger enforce the strict comparator, while the late branch requires the opposite `persisted_at >= persistence_deadline_at` predicate.

The v5 scheduler contract, v5 cutover contract, and v6 manifest supersede but do not mutate their v4/v5 predecessors. The cutover contract requires a later scheduler to preserve this boundary classification unchanged. The registered 0016 definition hash changes with the corrected preactivation schema. Any disposable qualification database that applied the prior 0016 definition must be rolled back while all interim tables are empty or recreated before the amended qualification run; prior scheduler evidence must never be rewritten.

## Verification

Kernel tests reject renewal and prospective timing at equality. Migration and runtime regressions reject the timely form at equality, accept the nonprospective late form at equality, and reject a premature late form before the deadline. These opposite-form tests prevent weakening either half of the boundary.
