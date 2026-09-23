# Research trial and evaluation-exposure ledger

REVIEW REQUESTED — Tier 2: the historical import is a declared document catalog, not an exhaustive count of configurations or past views. The alternative of inferring a complete trial history from filenames and reports is rejected because absent evidence cannot establish no unrecorded attempts. Further historical reconciliation remains open.

The append-only ledger preserves exact evidence bytes and actual observation times. One operation key binds one payload; identical retries preserve the first event and timestamp, and changed payloads fail. Corrupted snapshots/envelopes fail verification. Source dates remain claims inside retained documents, not reconstructed registration or human-viewing times. REPORT_GENERATED and EVALUATION_VIEWED are distinct events. No event authorizes a fit, gate, promotion or release.

## Actual imported evidence

29 documents, 176,492 source bytes, from pinned Git commit abe5cadcf24d32c5cb7849c9bb5237a3e67acd8e. Import manifest SHA-256: 8dff3069117740c0f228a108ac47146a0a2e3c3063c3188a5ba54f86688ab527. The manifest enumerates the exact historical registration/experiment documents and five explicit queue/rebuild correction indexes. Imported evidence is labeled RETROSPECTIVE_DOCUMENT_IMPORT, original predeclaration NOT_ESTABLISHED_BY_IMPORT and past human viewing UNKNOWN. This is 29 documents, not 29 verified trials.

The independent standard-library/Git verifier recomputes event identities, envelope hashes, snapshot bytes and membership against the pinned source. Re-import preserved event hashes and timestamps. Read inventory using `python -B scripts/projection_research_ledger.py inventory`; verify this initial import using `python -B work/engine-rebuild/verify_research_ledger.py`. The latter deliberately checks the fixed initial catalog, not later events. Future general integrity reads use inventory.

## Calibration integration

The supervised calibration CLI retains native execution request/start/result/receipt records as authority and mirrors all retained attempts before returning. Failure receipts are indexed without inventing a gate rejection. Report publication synchronizes retained attempts and records its generated files before returning. A ledger write failure stops return; a subsequent report retry restores the mirror without invoking a numerical worker. A killed process can leave native records ahead of the central mirror; the next report sync reconciles those records. Missing receipts are never inferred failures. Future calibration registrations bind the new ledger/report source files.

Historical failed/invalidated trials outside the declared catalog, other experiment runners and unrecorded prior human views are not claimed complete. No prospective comparison was registered or started. Its frozen update policies, eligible population and review dates remain to be declared separately. Requirement 10b is PARTIAL, not complete.

## Verification and retained failures

Local: 10 ledger plus 88 calibration tests pass. Tests include simultaneous duplicate dispatch, failed commit and lost response, changed operation payload, corrupt evidence, path escape, explicit views, native failed-attempt mirroring and no-refit report recovery. The initial local calibration failure was a CLI fixture mocking the old boundary; the fixture now mocks the new wrapper for its exit-code test while the real wrapper has a dedicated retained-failure test. Preserve both logs.

Linux: 98 tests pass against 345 individually hashed staged source files, as the actual service user, with private network, one numerical thread and 4 GiB/570-second hard limits captured while the unit was loaded. Application verification took 25.177 seconds; the exact-invocation manager journal records terminal success over 29.026 seconds. The first Linux attempt failed because staging omitted the existing calibration-input helper and its dependency; preserve its manifest, log and loaded limits. Attempt 2 adds only those two unchanged helper files and reruns the same suite. This is synthetic fixture verification, not a scientific fit or live activation.

All 52 original production locks/grades plus the fit pointer are unchanged. All 46 issuing files match their prior committed bytes. No numerical forecast change, new provider request, spending, unique record deletion, control promotion or experiment registration occurred. The ledger addition does not invalidate the existing issuing-source recovery proof.

Confidence: high in the bounded retention and retry claim, supported by independent exact-byte reconstruction and fault/concurrency tests on both platforms; high means the claim survives obvious alternative checks. Lower to medium if an independent read finds missing or inconsistent events for a native calibration attempt. This rating does not certify exhaustive historical coverage or predictive improvement. Least certain: coverage of unrecorded historical trials and human views, which remains explicitly unknown.
