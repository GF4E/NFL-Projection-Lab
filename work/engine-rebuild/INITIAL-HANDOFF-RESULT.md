# Initial pipeline handoff — implemented and tested, not activated

DONE: the initial operator stages a migration-boundary training ledger, source/runtime admission record, configuration-bound target, compatible rollback checkpoint and expiring plan without modifying live pointers. Activation rechecks technical evidence and the exact owner, fit and prepared state. The existing release journal now couples weekly configuration with fit/preparation/active-release writes. Partial switches block consumers; the scheduler may reconcile only the exact already-begun initial transaction. Three attempts bound recovery; an unused expired plan cannot activate. Rollback disables configuration with an explicit null when appropriate and never deletes original records. Weekly refits inherit the installed configuration.

Source/recovery admission now requires the exact complete 46-file issuing set, including the operator and its recovery verifiers. The old 41-file recovery packet is rejected before activation; the retained negative check is `initial-handoff-old-proof-rejection.log`. This is an intentional qualification boundary. It is not a new human-approval requirement or a statistical gate change. Tier 2 conventions remain review requests while authorized chronology work proceeds.

TESTS: 540 projection tests passed locally in 63.043 seconds. Linux passed 85 focused initial/release/weekly/preflight/training tests in 96.194 seconds. Fault coverage includes configuration writes before/after interruption, lost acknowledgments, preserved prior configuration/training, owner and preparation changes, expired unused plans, changed evidence, retry exhaustion, no automatic start, source-file omission, scheduler ordering, rollback and guarded consumers.

The full captured 2,927-game / 5,854-row refit and 16-game slate passed on the actual Linux interpreter using separately staged source. All 16 locks and 16 synthetic first grades completed; rollback and duplicate-run checks passed; all 52 original source records and the original active-fit pointer remained unchanged. Numerical work used one worker and the unchanged 570-second / 4-GiB ceiling. Harness elapsed 364.131 seconds; service runtime 368.672 seconds; process peak RSS 227,192,832 bytes. Systemd reported memory peak 219.1 MiB and swap peak 182.6 MiB. Both test and slate units terminated successfully; none remains running.

| Canary phase | Elapsed seconds |
| --- | ---: |
| Captured state ready | 12.954 |
| Simulated public closeout verified | 36.190 |
| Full recorded refit and release | 165.805 |
| All 16 games locked | 314.248 |
| Rollback and idempotent grades verified | 363.671 |

The first slate attempt stopped before numerical work because the new profile parent directory was root-owned. Its log remains `initial-handoff-slate-attempt1.log`. Only that new test directory's ownership was corrected; attempt 2 used a new unit/log/output. No production record was changed or deleted and no failed result was relabeled.

ARTIFACTS: `initial-handoff-slate-attempt2.json` and `.log`, Linux/local test logs, `initial-handoff-source-manifest.json`, `INITIAL-HANDOFF-RUNBOOK.md`, and the two source harnesses. The archived source manifest verifies 342 staged Python/harness files; its hash is `6d980e6aa5a361318804aa96dc76e502ec519da86f93debd55c3a1d4ccf22ccf`. All 46 issuing hashes in the resulting receipt match the current checkout. Simulated source availability, closeout HTTP response, future clocks and final scores remain labeled fixtures. These results establish operational compatibility, not predictive improvement, live publication, full initial-operator timing or fresh executable restoration.

COMMIT: `a0e3e0504541f9440dc0a6409f22060d0445df34` implements the handoff. COMMIT: `eeea8079202e09249fcca7af55de5cb0cdc82e3a` makes staged-code versus captured-data provenance explicit. The canary used staged source at eeea80792 and captured data from host commit `7e63e7a91c2850b9926a542076f6a158791aa6a6`. Active fit remained `801ef07927ea59bc112fc955ad86249b981d5e60a0f4a9636f39b2eb23be623f`.

REMAINING: qualify/restorably retain the new complete source version with the accepted runtime, bind that actual restored-consumer result in a fresh packet, then exercise the initial operator on a captured full boundary. Actual activation additionally needs the acknowledged eligible cutoff; the installed first cutoff is Friday September 25 at 06:00 Pacific. Verify actual host and public issuing provenance before any control-authority designation. The training-boundary and complete-source admission changes are not enabled by the earlier recovery receipt. E-CAL remains unregistered; the corrected replay remains non-authoritative. The full goal, genuine reviewer decisions for method promotion, conditional-mean/distribution migration, prospective evidence and an observed live cycle remain unfinished.

Provider requests and new spending: zero. No new volume or provider subscription was requested. Existing approved storage remains unchanged.

Least certain: full initial-operator staging/activation latency and reconstruction availability assumptions. Consequently those remain explicitly unqualified/flagged rather than inferred from the weekly-path canary.

Confidence: medium in release readiness. Compatibility holds on authoritative captured host data, but readiness still depends on the reasonable reconstruction convention and unfinished actual-source/live-transition qualification. Lower to low if independent recomputation finds a source, training-population or recovery discrepancy.
