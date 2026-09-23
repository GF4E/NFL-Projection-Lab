# Completed-week publication reader

The site now reads the engine publication index and verifies exact receipt/artifact bytes at pinned Git commits. Read-only routes serve scorecard, trend and Season artifacts separately under the 8 MiB bound. Missing indexes retain explicitly labeled legacy Season data; changed or unavailable proof produces a named verification failure. The Season snapshot links to its completed-week scorecard and retains the same receipt identity. Board marker evidence remains independent, preserving BOARD v9.

REVIEW REQUESTED (Tier 2): Season follows the last complete published closeout; current-week games remain on the board. A separately labeled provisional Season is the alternative. The closeout preserves its historical actual-minus-projection bias convention explicitly. No score, calibration, original grade or engine gate changed.

Validation: 365 tests pass, one existing test is skipped; typecheck and production build pass. Full-site lint has zero errors and 27 existing warnings. Nine pre-existing lint errors were corrected: test types, JSX apostrophes, callback-only projection fetch updates, a subscribed entry clock and storage-backed edit-code hydration. Ticket idempotency keys still originate when a selection is added or edited; numerical/selection/lock mathematics remain unchanged. New tests cover exact response bytes, pinned commits, tampering, invalid paths, missing/denied access, regressed pointers, bounded reads, report content and Season identity. Independent engine recomputation verifies the frozen 16-game scorecard values.

Source publishing uses the approved generated-build-only mirror, with main's source hash in build provenance and the deployment commit. Public HTTP proof and final deployment receipt are recorded with the engine rebuild evidence after publishing; a source push or successful build alone is not a served-content claim. Unattended credential lifecycle, training migration and broader rebuild readiness remain separate requirements.

Confidence: high in reader integrity across the tested valid, missing and corrupted source cases; lower to medium if the deployed runtime returns content inconsistent with the pinned receipt. This does not assert predictive improvement.


## September 23 runtime correction

The first deployed reader returned HTTP 503. An isolated run in the installed workerd runtime reproduced an immediate TypeError: fetch does not support redirect mode `error`. Node fixtures had accepted that option and therefore missed the deployment defect. The reader now uses `manual` and rejects every non-success response, including redirects, without following an alternate source. A regression test checks both the supported option and no second request.

`scripts/verify_closeout_worker.mjs` bundles the real reader and runs it inside the installed Worker runtime against the actual indexed, commit-pinned source files. All three returned byte hashes and the receipt identity match the frozen Week 2 publication. This is a real upstream read in a local Worker, not yet evidence of the repaired live deployment. The initial failed HTTP records remain in the engine evidence directory.

This correction changes no forecast, score, locked record, source permissions or gate. Live and unattended access qualification remain separate acceptance items.
