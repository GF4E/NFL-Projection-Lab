# Durable issuance observation — plan and conventions

Infrastructure lane only. Read-only watchdog consumption of existing cutoff-card receipts; no issuer, point, calibration, gate, schedule or frozen-record change. Existing numerical source files remain frozen. Full rebuild remains incomplete.

## Gap sweep before implementation

- Tier 1: a logical issuance/freeze timestamp is not a durable commit receipt. Legacy records remain UNKNOWN; never infer commit time from mtime, publication, scoring completion or a fresh observation. Source: adopted rebuild section 4 and existing watchdog convention.
- Tier 1: use the pinned schedule for every due-game denominator. A missing, retrospective or invalid forecast cannot earn an on-time success. Unknown valid legacy records remain in the denominator. Source: adopted rebuild section 4.
- Tier 1: consume existing cutoff_publication.verify_receipt and bundle.verify_card, including immutable bundle/release/fit/calibration/forecast association, without replay, fitting or any source write. Verify the card deadline against the independent pinned schedule. Boundary equality is late. Source: existing cutoff publication contract and calendar tests.
- Tier 1: the receipt proves a durable local forecast bundle before lock, not remote publication or Git push. Public freshness/completeness and frozen-lock matching stay separately reported. Source: receipt implementation and adopted section 4.
- Tier 1: missing or invalid receipts on a due new-contract card are observable failures; old valid cards without the new contract remain unmeasured. A fully measured rate is null while unknown records remain. Do not silently exclude older games to manufacture a full-season rate.
- Tier 1: per-game grade latency remains UNKNOWN because the source lacks first-verified-final availability and grade-commit evidence. No timestamps invented.

No Tier 2 or Tier 3 choice introduced. No statistical registration, activation, provider request, spending or capacity change.

## Implementation / evidence

1. Add an optional per-game verified receipt map to pure watchdog assessment and a read-only collector in the existing monitor runner.
2. Test real publisher-created bundle/receipt success, missing receipt, digest corruption, schedule mismatch, exact deadline, provisional/absent/retrospective cases, legacy unknowns, unchanged inputs and all-due denominator.
3. Run monitor/publication tests and relevant regression checks, verify all 50 issuing files retain their pre-change hashes. Observe the actual legacy host state without fabricating prospective success.
4. Push engine-v2 under existing authority. Verify installed observer source and a scheduled monitor result; preserve the frozen issuing manifest and all locks/first grades. Document remaining unknowns and runtime cost.
