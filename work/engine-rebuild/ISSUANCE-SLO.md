# Durable issuance SLO — qualified observer increment

Infrastructure lane only. The monitor now consumes the publisher's existing physical commit receipts instead of hardcoding all issuance evidence as absent. All fifty issuing files are unchanged; no forecast, lock, grade, fit, gate, release pointer, resource limit or registered experiment is changed.

## Actual host result

At 2026-09-24T03:34:41Z: 32 due games, 30 legacy AS_ISSUED forecasts with matching frozen records, two retrospective games, and 32 published first grades. Physical issuance timing is unknown for the 30 legacy forecasts. The retrospective pair cannot earn an on-time success. The all-season rate is therefore null/PARTIAL, not zero and not 30/32. Grade latency remains UNKNOWN for all 32; a refreshed final feed cannot establish first availability.

## Receipt verification

For due cutoff-contract cards only, the collector verifies the immutable bundle, compatible release, exact fit and calibration, committed calculation and issuance receipt through the existing validators. The card's deadline must equal the independently pinned schedule's deadline. Logical issuance must be no later than physical commit; physical commit must be strictly earlier than T-75. Corruption or a missing new-contract receipt is a named ISSUANCE_RECEIPT_UNVERIFIED finding. There is no regeneration, replay or fitting in observation. Missing/invalid/retrospective games remain in the denominator. Upcoming games are not yet due.

This measures durable local forecast-bundle availability, not Git acknowledgment or public delivery. Public payload freshness and lock matching remain separate observations. Historical records cannot be upgraded to timed issuance by inspecting file modification times.

## Tests and bounded host evidence

- Eight focused real-publisher receipt tests pass; 28 existing watchdog and eight cutoff-publication tests pass.
- Broad projection suite: 650 tests in 63.893 seconds, three platform skips, no failures.
- All fifty issuing files match the pre-change hashes.
- Initial Linux attempt loaded the entire publication unittest harness inside the observer's limits and timed out at 30 seconds, before emitting a fixture result. Exact failed unit and journal retained; peak cgroup memory 58,810,368 bytes. This is not a successful observer qualification.
- Corrected measurement prepares the synthetic fixture outside the timed process. Under actual service identity, 64 MiB, zero swap, 10% CPU and 30-second cap, the observer reads actual host data and verifies the same real publisher-created synthetic bundle sixteen times, without changing any fixture file. It succeeds in 8.915 seconds; reported process maximum RSS 57,942,016 bytes; fixture checks 3.709 seconds. This is a repeated-bundle cost probe, not sixteen distinct games or a full-season stress qualification. No resource cap was relaxed.
- Source hashes, actual host assessment, successful/failed invocation journals and both logs are retained alongside this report. The new-contract path is fixture-qualified; actual host history is still legacy. Scheduled installation evidence will be added after push.

## Remaining dependencies

Actual new-contract issuance still requires the future Friday state cutoff and fenced initial handoff; this observer change does not activate it. Full-season receipt volume and sustained headroom remain to be measured. Per-game final first-seen and grade-commit evidence are still absent. E-CAL's actual issuing/public/control association, published Tuesday closeout/refit order, bounded research capacity, statistical gates and genuine reviewers remain required. The separate RAM purchase request is unanswered. No new spending, provider calls or storage changes occurred.

Least certain: cost once a full season of new-contract receipts exists. Consequently this report limits its capacity claim to the measured probe and existing live legacy state.

Confidence: high in the observer's receipt classification under the tested cases, meaning the claim survives the obvious alternative interpretations (logical time, public time, missing records). This is operational verification, not a cross-season accuracy claim. Lower to medium if an independent receipt recomputation differs or a larger legitimate workload cannot meet the installed limits.
