# Weekly recorded refit — scheduler integration

REVIEW REQUESTED — the public closeout adapter and training-transition configuration remain uninstalled. Exact-byte HTTP verification is implemented, but no claim is made that the current website exposes the required endpoints. A transformed response needs its own qualified adapter; a source Git push cannot substitute for served-content evidence.

The actual `projection_learning.weekly_refit` routes an activated scheduled pipeline to the recorded path. `cloud_scheduler` passes its owner and live dispatch-lock descriptor and reconciles only a matching pending weekly release before provider/publication work. The descriptor is checked against the scheduler lock inode and held exclusively; standalone runs obtain their own lock. Legacy operation stays selected when no pipeline manifest is active.

One immutable request freezes the Tuesday state, original fit-start boundary, parent release/fit, owner generation, training-ledger reference and source/public closeout identities. Additional completed games require their original qualified locks. Later hourly retries reuse the recorded request and fit. Three failed computation/staging attempts exhaust the operation. Deadline checks prevent activation beyond 600 seconds per attempt; these elapsed-time checks do not by themselves terminate a stuck native worker. Full production hard-deadline qualification remains required.

The new fit is staged/scored and switched using the existing recovery journal. An interrupted fit-pointer write resumes its exact target without fitting again. A completed operation never silently reverses a later rollback. A previous unfinished weekly operation blocks starting another one, while preserving its evidence. A changed owner generation, source artifact or publication proof fails before dependent work.

The public acknowledgment verifier performs bounded HTTPS reads against an explicitly installed endpoint base, compares the returned bytes with every immutable closeout artifact, and records URL/hash/time evidence. Week-specific URLs are derived automatically. Missing mapping/evidence or inaccessible endpoints produces a named wait before fitting. Changed content or an invalid clock is an integrity failure. This code publishes nothing and installs no endpoint mapping; production access remains unqualified. Future public delivery must also obey the build-output-only mirror and privacy rules.

## Verification scope

Final local verification passes 581 tests: 353 projection, 218 standing Week 1 and 10 closeout checks. See tests-weekly-integration-verified.log. A read-only host disk check showed 77,520,896 bytes free; durable capacity remains unresolved.

Eleven weekly integration fixtures exercise real fitting, actual preparation/scoring, release switching, physical fit availability, retry/rollback, ownership, publication responses and timeouts. Their retained training rows are synthetic and the full ledger reader is mocked; ledger reconstruction is tested separately. The actual service Python on Linux passes 36 handoff/weekly fixtures in 33.796 seconds, peak parent RSS 51,187,712 bytes. Tested source hashes match the working source. The harness has an external 120-second deadline and writes only to temporary /dev/shm storage. This is not the requested complete captured-NFL-data lifecycle or an observed live cycle.

Failures are preserved: an inherited test patch handle initially shadowed its source helper; an explicit fixture preparation clock equaled schedule capture; an old scheduler mock lacked the new owner/descriptor parameters. Fixing the second exposed the real staging-clock boundary: automatic staging now reads preparation time after schedule capture. The old scheduler test now asserts that the correct owner and open descriptor are passed. Earlier and final logs retain their separate scopes.

## Still required

Run the full captured-data recorded-refit → stage → switch → lock → grade → rollback canary with all retained rows and consumers. Qualify the public closeout/Season delivery channel and training migration; then install the explicit configuration under existing authority. Complete general executable/runtime rollback, durable capacity, own-lineage calibration warmup, E-CAL-LINEAGE and E-VENUE-DIRECT under their weekly gates/reviews, prospective evaluation and an observed live operational cycle. The installed state worker's first scheduled cutoff remains September 25 at 06:00 PT; a simulation cannot establish that observed event.

Least certain: the public closeout adapter required by the existing website. No default endpoint or success receipt was invented, and no production configuration was installed because of that uncertainty.

Confidence: medium in operational readiness—verified implementation evidence exists, but readiness depends on the unqualified publication adapter and complete captured-data integration. Lower to low if an independently exercised consumer bypasses a chronology, publication or recovery check. Better future accuracy remains unproved.
