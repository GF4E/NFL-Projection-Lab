# Implementation state

## Current position

- Phase: `01-confidence-engine`
- Plan: `01`
- Status: complete
- Started: `2026-08-24`

## Fixed decisions

- One joint home/away score distribution supplies every mainline probability.
- Pooled non-push log loss remains the coefficient-promotion metric with calibration as a hard gate.
- Market-anchored discrete, correlated-count, and possession-simulation candidates share one evaluation harness.
- Supported unresolved states remain explicit and produce robust, fragile, or indeterminate decision status.
- Human adjustments are measured separately and never enter training.

## Blockers

- None for the implementation spine.
- Paid historical odds and licensed raw tracking remain evidence/data dependencies, not implementation blockers.

## Verification

- Completed: `2026-08-24`
- `pnpm verify`: passed
- Tests: 230 passed, 1 intentionally skipped validation suite
- Production build: passed with the read-only confidence-engine health route included
