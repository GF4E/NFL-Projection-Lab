# Final-source reconciliation — observer correction

REVIEW REQUESTED — Tier 2: a retained last-good score absent from the current raw source is reported UNKNOWN, not wrong. The alternative of scanning every older archive each poll was not taken: it is unbounded and does not establish the original per-game association. See the pre-implementation plan. This change does not remove any carried score or repair any original grade.

## Claim and actual evidence

At 2026-09-24T03:55:11Z, every one of the actual host feed's 7,308 finals agreed with the parsed, hash-verified current NFL source; there were zero conflicting, omitted or unverified carry-forward rows. All 32 due current-season finals had published grades matching that source. This is evidence about the captured live feed, not a claim that every historical source revision or original grade has been independently audited.

The prior watchdog verified source bytes and the feed's commit digest separately, but did not compare derived final scores against the archived rows. A self-consistent incorrect feed and grade could therefore validate each other. The observer now parses the verified archive with the existing final parser, reports whole-source agreement counts, and uses those validated source scores for due-game grade comparisons. Three separate findings distinguish FINAL_FEED_VALUE_CONFLICT, FINAL_FEED_ROW_MISSING and FINAL_SOURCE_ROW_UNAVAILABLE. The pinned current-season schedule still supplies the alert and SLO population. Grade latency remains unknown; this does not fabricate first-seen times.

## Verification and limits

Seven new fixtures cover valid integer/float agreement, carry-forward unknowns, omitted feed rows, non-due/out-of-season alert exclusion, boolean impostors, a self-consistent wrong feed and board, and malformed maps. The integration fixture verifies no source file changes. All 28 existing watchdog tests pass after replacing their placeholder source bytes with actual valid CSV. The broad projection suite passes 657 tests in 64.840 seconds, three platform skips; final memory-only population reduction was then checked with all 35 focused tests and the host canary.

The first Linux candidate runs those seven fixtures and reads the real host under service identity, 64 MiB, zero swap, 10% CPU and a 30-second ceiling: 7.906 seconds, maximum process RSS 60,817,408 bytes. The final version releases out-of-population score dictionaries before bundle observation. It verifies actual host data plus sixteen repeated checks of the retained publisher-created synthetic cutoff bundle in 13.707 seconds, maximum RSS 58,912,768 bytes, under the same bounds; all fixture files retain their original hashes. This is a repeated-bundle cost probe, not sixteen distinct live games or a full-season resource guarantee. Both exact source identities and terminal journals are retained. Fifty frozen issuing files remain unchanged.

No point forecast, distribution, gate, control authority, release pointer, provider call, paid resource, lock or first grade changes. This is detection and truthful reporting, not automatic repair of corrupted grades. E-CAL's future actual-cutoff/control/publication association, Tuesday ordering, research capacity qualification and genuine reviewers remain prerequisites; conditional-mean and venue work remain pending. Grade source association and exact latency are still incomplete acceptance items.

Scheduled host installation evidence will be recorded after the push. The full rebuild remains active and incomplete; this increment must not be treated as a gate decision or accuracy gain.

Least certain: per-game provenance for carry-forward scores when a later source omits a row. Accordingly their validity is unknown until their original association is qualified.

Confidence: near-total in the 7,308-row agreement claim—arithmetic on verified rows. Lower to high if independent source parsing or a hash check disagrees. This does not rate long-term operational reliability or predictive improvement.
