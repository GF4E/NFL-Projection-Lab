# Verified closeout reader repair

The initial public reader failed because the hosting Worker rejects fetch redirect mode `error` before making a request. The installed workerd runtime reproduced the exact TypeError. Node tests had accepted the option. Main now uses `manual` and rejects all non-success responses, including redirects, so it still never follows an alternate source. A dedicated regression test checks the option and single request. scripts/verify_closeout_worker.mjs runs the real reader in the installed Worker runtime against actual commit-pinned upstream bytes; all three hashes match.

Source main: c4310d7b9eef4e4b22790a48fcd2751639cf96e2. Build-only mirror: 9d33013b110bd11d7412c08521ce9c4761a87615. Native deployment succeeded; the matching build provenance was also verified over HTTP. Main source is pushed to GF4E/NFL-Projection-Lab. The mirror contains generated build output only. No point model, calibration, gate, fit, locked forecast or first grade changed.

## Live verification

At 2026-09-23T07:55:31Z, authorized owner-authenticated GETs returned 200 for scorecard, season and trend, with exact hashes matching the frozen Week 2 receipt. /api/board-v7 returned VERIFIED_CLOSEOUT, the expected receipt identity, and seasonEvidence deeply equal to the frozen season.json. The initial failed verification is retained separately. The repaired verification record does not overwrite it.

The in-app browser visibly rendered the Week 2 scorecard, all sixteen projected/final score pairs, error/coverage tables and best/worst five. Its Season link opened the completed Week 2 page with 30 graded games across two weeks, 60 PIT team observations and all five historical overlay seasons. This verifies those rendered components, not every interaction or missing scientific quantity. The predictability-floor reference remains missing and original lineage limitations remain disclosed in the acceptance matrix.

## Checks and limits

366 website tests pass, one existing test skipped. Typecheck, lint and build pass; lint retains existing warnings. The changed source/test/script files have no lint errors or warnings. The local Worker integration reads all three real artifacts successfully; the live endpoint verification independently checks exact bytes and release identity. No provider spending.

Unattended access is NOT qualified. A read-only request from the actual droplet at 2026-09-23T07:56:39Z returned HTTP 403 without credentials. The successful observed check used a temporary owner credential held in process memory only. No credential was persisted or access control weakened. config/projection-closeout-publication.json remains uninstalled, and the new pipeline remains inactive. Resolving unattended verification requires a supported durable access mechanism; this is separate from the now-fixed reader defect.

Root free space at that host observation: 60,973,056 bytes. Durable storage approval remains pending; this turn did not remove files or spend money. Full rebuild scope is unchanged: retained training migration/review, full-pipeline leakage tests, own-lineage calibration and venue experiments with real reviews, compatible runtime rollback, capacity/restore qualification, prospective evidence and an observed live cycle remain open.

Next: investigate the supported unattended access contract without persisting a short-lived token or bypassing policy; continue full feature/tuning/calibration leakage qualification independently. Do not restart completed split/baseline checks merely because another goal turn begins.

Least certain: unattended publication access, now explicitly distinguished from application correctness by the actual-host 403.

Confidence: high in the narrow runtime repair, meaning the failure reproduces in the deployment runtime and the fix survives fixture, real-source and live exact-byte checks. Lower to medium if an independent live read cannot reproduce the receipt and artifact hashes. Overall operational readiness remains medium; better future prediction accuracy is unproved.
