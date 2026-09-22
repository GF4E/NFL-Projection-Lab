NON-AUTHORITATIVE: inactive numerical state and recovery verification. No model or control promotion.

REVIEW REQUESTED — Tier 2: late older games and numerical revisions cause reconstruction of the eligible set in played-kickoff order. The alternative, applying an old result after newer results or applying a revision a second time, would change Elo and recent-history order. Earlier committed states remain immutable. This choice adds no fitted parameter and is not a registered candidate.

# Restorable cutoff state

The state writer uses the approved production Elo/efficiency method, not the rejected Kalman filter. It binds the exact method/code, fit reference, observation snapshot, cutoff, parent, incorporated game IDs, numerical fingerprints, Elo and complete-state hash. Restore reloads verified facts and reconstructs that exact state. It rejects incompatible executables, altered source/state bytes, withdrawals, skipped cutoffs and concurrent writers. A compatible executable archive is still required to restore an older state after a code migration.

Only recorded snapshots with a real collection clock strictly before the cutoff can supply facts. Kickoff plus four hours must also be strictly before the cutoff. A snapshot collected later cannot be backdated. Cutoffs follow Friday, Monday and Tuesday 06:00 Pacific. The current first source receipt was collected Tuesday September 22 after that day's cutoff; its first possible live use is Friday September 25. This increment simulates that future execution in an isolated directory; it does not claim that Friday has occurred.

Final scores and paired statistics have separate availability checks. The existing engine updates Elo and rest from a final even if play-by-play statistics are delayed. Later statistics populate efficiency history without adding another Elo result. Missing required count fields fail validation; they are never filled with zero. A score correction while statistics remain absent now produces a new receipt. Old receipts remain readable.

Durable state data is written and verified before an immutable per-cutoff receipt. The current pointer moves last. Duplicate dispatch or a lost response returns the same committed receipt; a failed pointer write is repaired from it. Reading an older committed cutoff never rewinds the latest pointer. An interrupted write before the receipt may leave an unaccepted object, which is preserved. No failed attempt is a completed update. Changed fit requests under an already committed cutoff fail; a later cutoff may bind a new weight-only fit with the identical approved state method.

The shadow forecast adapter rejects target/market fields and duplicate games, requires each game's own cutoff strictly before T75, and returns label-free rows explicitly marked SHADOW_NOT_ISSUED. It does not fit, issue, lock or publish. Target-week weighting remains the previously disclosed contextual convention.

## Evidence

- Captured-source canary: 3,183 game bodies reproduce from exact source bytes; three simulated future states restore, empty cutoffs add no duplicate effects, and 28 team-feature rows match the separate legacy weekly builder exactly. All 52 frozen records are unchanged. Local evidence is in cutoff-state-canary.json, including source-remote graph verification.
- Full 2016–2025 diagnostic rerun: all 2,639 authoritative control games reproduce exactly. Every per-game point and training-hash record agrees exactly with the prior inactive replay. The new reference is in numerical-cutoff/current-ref.json; state-reconciliation.json preserves the comparison. No new accuracy result is claimed. The rerun took 161.93 seconds and 830,439,424 peak resident bytes.
- Fault fixtures cover independent arrival clocks, strict equality, unavailable bootstrap, future/non-scheduled execution, pointer failure/lost response, object/receipt interruption, late older games, revisions, withdrawal, missing required counts, corruption, ownership, incompatible method, fit-key conflict and forecast input separation. The final local suite passes 227 projection and 218 Week 1 tests. Linux verification passed 39 then-current targeted fixtures plus the full captured-source canary in 86.60 seconds and 196,571,136 peak resident bytes under the enforced 4 GiB address-space limit. See host-cutoff-state-canary.json and STATUS.md. The full permutation proof preserves all 5,278 team forecasts and 175 fits exactly.

The scheduler omission discovered during restoration is fixed: work/projection-observations-v1 is now in the artifact publisher allowlist. The canary verifies every referenced receipt/source dependency against the fetched remote tree, in addition to source-body recomputation. Host-only existence was insufficient evidence of a recoverable remote graph; the earlier host-only result remains scoped accordingly.

## Limits and next step

Numerical states are not yet scheduled on the host or used by production issuance. Actual Tuesday refit integration, provisional preview versus final issuance, compatible whole-pipeline rollback and corrected-control authority still require verification. Historical provider vintages remain UNKNOWN. The original all-paired historical replay cannot prove live availability. No experiment, calibration, frozen record or board presentation is changed by this inactive writer.

Next: connect the bounded inactive state worker to durable cutoff receipts, then qualify common preparation/refit/issuance before numerical activation. Preserve the original control until that path is verified. Durable capacity approval, statistical gates/reviews and the observed full live cycle remain open.

Confidence: high in the tested preservation and reconstruction claim: it holds across the historical seasons and the tested alternative arrival/retry orders. Lower to medium if independent restoration, a qualified provider revision or a compatible-runtime test changes a saved state's numerical result. This is not a high-confidence claim of full operational readiness or improved predictive accuracy.
