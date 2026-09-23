# Retained 2026 inputs: recovery is verified; the refit transition remains open

Infrastructure/data-evidence audit only. No candidate, refit, changed training population or production activation. Snapshot: `555dbc916390b6085a253d3043b6a0de8381581b`, cumulative 2026 Weeks 1–2. The grain is one game with two paired team rows. All 32 finals stay in the inventory.

| Original evidence | Games | Recovered evidence | Qualification |
| --- | ---: | --- | --- |
| AS_ISSUED with embedded features | 18 | Original immutable locks and exact fit associations | Legacy input reproduction |
| AS_ISSUED without embedded features | 12 | Full cache bytes matching Git-retained preparation digests | Legacy input reproduction |
| RETROSPECTIVE | 2 | NE at SEA and SF at LA | Not pregame evidence |

For all 30 AS_ISSUED games, independent standard-library ridge arithmetic reproduces both original team points within the declared 1e-10 comparison tolerance. Maximum absolute difference: **4.973799150320701e-14**. No point estimate, lock or first grade was changed. This is numerical agreement, not evidence that every unused input is correct.

The eight earlier Week 1 games use cache `b45490431085427169fb414fdd593334d26736d1529603fb0adab9de7248dba0`, whose digest appears in commit `247e8016b30c58dfbd41e2794c467e73ba2fb1ae`, recorded at 2026-09-13 13:07:00 UTC, before both their declared issuance and lock. Four later Week 1 games use cache `7e76a52cf24b3f515081aefb991c6e520bfb634386ba63ecfb67ae14868f725e`, whose digest appears in commit `77c755905585818368b3489e13efb250d3b7b4f2`, recorded at 19:09:13 UTC: before their 19:10 lock, but after their 19:03:25 declared issuance. These are Git-recorded clocks, not independent publication receipts. Do not upgrade that evidence into physical pre-issuance availability. Original source manifests are retained, not reconstructed from today's state.

The caches previously lived under mutable, ignored names. Their exact compressed bytes are now retained by hash with their original committed manifests. The collector can reproduce from these archived copies after the mutable caches change. The complete evidence package occupies 1,015,999 bytes. Frozen-lock paths/hashes, original fit associations, exact paired rows and clock limitations are recorded per game in `training-input-audit/current-ref.json` and its referenced compressed audit.

## Why the training handoff is not yet qualified

There is no missing-feature conclusion for the 30 AS_ISSUED games. The remaining issues are method compatibility and chronology. The first 15 AS_ISSUED games precede the HFA release; 15 use the HFA lineage. Six original Week 1 forecasts used calibration alone, while the other 24 used calibration plus Elo. Old state/cutoff receipts and durable input-availability receipts were never recorded. They cannot be synthesized by this audit. The two retrospective games cannot be silently dropped, treated as genuine pregame issues, or used to improve the as-issued record.

Accordingly, **zero games are newly qualified for the strict cutoff refit by this artifact alone**. Its schema is `legacy-training-input-audit-v1`, deliberately distinct from `retained-pregame-training-v1`. The actual refit remains guarded. Next work is an explicit, population-preserving historical-training transition using retained source evidence, with reconstruction labeled separately, followed by the atomic compatible fit/preparation handoff. No new state-space or QB feature enters that work.

## Checks and reproduction

Run `OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B work/engine-rebuild/audit_training_inputs.py`. The audit reference is immutable; a changed result cannot replace it. Run `test_projection_training_evidence.py` for original-row coverage and rejection of altered bytes, duplicate/unpaired sides, wrong identity, embedded outcomes, late/equal clocks, retrospective relabeling, NaN predictions, and point mismatches. Existing team-code aliases are applied only for identity comparison; retained rows are unchanged. The broader projection and standing workflow results are recorded in `tests-training-input-audit.log`.

The first collector attempts exposed two adapter assumptions: display team codes differ from retained OAK/WSH/LAR identities, and current `projection-v2.*` fit versions are locked by the v3 publisher. Both were corrected using existing repository conventions. They did not change forecasts or loosen numerical/temporal checks.

Data review follows the distinction between freshness, correctness and end-to-end delivery in [Google SRE's pipeline guidance](https://sre.google/workbook/data-processing/), and the strictly prior-information condition in [rolling-origin evaluation](https://otexts.com/fpp3/tscv.html). These principles do not independently establish this engine's historical timestamps.

Least certain: how to qualify all legacy 2026 rows under the new state/fit method without overstating historical availability. This kept the audit separate from accepted refit inputs.

Confidence: **near-total in the recovered byte identities and numerical reproduction**, meaning arithmetic on verified rows. Lower to **high** if independent recomputation against the original artifacts differs. Confidence in the full training transition is **medium**, meaning authoritative evidence supports it but a consequential compatibility convention remains unresolved; lower to low if retained source reconstruction fails. Future predictive improvement remains unproved.
