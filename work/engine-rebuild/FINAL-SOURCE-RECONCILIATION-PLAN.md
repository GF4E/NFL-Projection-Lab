# Final-source semantic reconciliation — plan before implementation

Infrastructure observer correction only. Preserve the frozen fifty-file issuer, every original lock/grade, active fit/calibration, provider schedule and gates. Latest live read at 2026-09-24T03:51:00Z found all 7,308 feed scores equal to the parsed hash-verified source, with no missing source rows. This is an uncovered verification path, not evidence that existing grades are wrong.

## Gap sweep

- Tier 1: a byte hash proves file identity, not agreement between derived scores and raw rows. Reuse finals.parse on source_archive.read_source output; independently compare every source/feed row and compare published current-season grades against those validated source scores. Existing parser validates nonnegative integer scores and result/total identities. No new outcome definition.
- Tier 1: preserve last-good feed games missing from the latest source. A read-only monitor never removes them. Report their current-source evidence as unavailable, rather than treating their stored score as newly verified or searching arbitrary older archives for a convenient match.
- Tier 1: separate a feed-value conflict, source-row unavailability and source game absent from the feed. Named current-season due-game findings are actionable; report whole-source reconciliation counts without widening the pinned scheduled-game SLO denominator.
- Tier 1: use the hash-verified source scores for observed final/grade comparisons. Emit a separate feed conflict when the feed differs; never silently repair the feed, original grade or board. Reconciliation itself makes no provider request or persistent source write.
- Tier 2 REVIEW REQUESTED: evidence for a last-good carry-forward absent from the latest source is UNKNOWN until its original per-game source association is available; do not label it a wrong score. Alternative: scan all historical archives each monitor cycle. Not taken because it adds unbounded work and cannot prove the exact original association.

## Verification

Meaningful fixture: a correctly hashed source plus a self-consistent feed/commit receipt with a wrong score must be flagged, and the board compared against the source rather than the wrong feed. Cover source-only, carry-forward-only, no due games, normal agreement, immutable input hashes and existing concurrency/legacy paths. Run focused observer/source tests and suitable regressions. Verify all frozen issuer files unchanged; measure the complete current host source read inside the existing 64 MiB/30-second observer limits, then verify installed scheduled output and preserve original locks/grades. No statistical or capacity activation.
