NON-AUTHORITATIVE: inactive chronology diagnostic, not a registered method result or a released control.

REVIEW REQUESTED — Tier 2: retain target-week preseason blending on a shared cutoff observation/Elo state. The alternative, advancing that blend at every cutoff, changes the update method and was not taken.

# Numerical cutoff verification — September 22, 2026

The approved production mathematics now has an inactive cutoff-aware feature entry point. The legacy path reproduced every authoritative HFA control point exactly before the timing comparison. The new path preserves the existing point model and isolates which completed games enter the feature history. No Kalman filter, new fitted parameter, new calibration or method candidate was introduced.

| Season | Games | Direct input changes | Including propagated refits | Mean absolute point change per team |
|---|---:|---:|---:|---:|
| 2016 | 256 | 207 | 256 | 0.023747 |
| 2017 | 256 | 195 | 256 | 0.028593 |
| 2018 | 256 | 193 | 256 | 0.031093 |
| 2019 | 256 | 193 | 256 | 0.024119 |
| 2020 | 256 | 173 | 256 | 0.030084 |
| 2021 | 272 | 209 | 272 | 0.025179 |
| 2022 | 271 | 221 | 271 | 0.022157 |
| 2023 | 272 | 222 | 272 | 0.024687 |
| 2024 | 272 | 220 | 272 | 0.023535 |
| 2025 | 272 | 220 | 272 | 0.021976 |

Direct changes: 2053/2,639. Including historical refit propagation: 2,639/2,639. A change means either team differs by more than 1e-9 points. Per-game records name every earlier-available or withheld result, state cutoff and both training hashes; no direct change lacks an observation-membership/order explanation.

A result can affect other matchups through league/opponent adjustment, not only the two teams that played it. Refitting on changed historical features then propagates the difference to later forecasts. These are the expected consequences of applying the approved three-cutoff calendar to the same mathematical model; their tiny descriptive MAE difference is not evidence of a newly successful method. See SERIES.md for all descriptive metrics.

Verification:
- Every one of the 2,639 forecasts uses the most recent Friday/Monday/Tuesday 06:00 PT cutoff strictly before its own T75.
- Every observation is included once, only after kickoff+4h; independently checked expected observation sets match at every forecast. Zero early or duplicate observations.
- 627 in-season cutoffs including 2014–2015 warmup; 5,790 output team-feature rows including 2015. Source team-stat coverage has no exclusions in this historical run.
- Reversing all schedule/statistics rows preserves every feature and lineage record. Reversing all 175 training populations preserves fitted bodies and all 5,278 evaluated points exactly. This tests order invariance; it is not an independent implementation of the ridge.
- Full replay: 145.04 seconds, 799,948,800 observed peak resident bytes on the pinned Mac runtime with one BLAS worker. Independent permutation execution: 51.37 seconds. Observed RSS is not an OS-enforced memory ceiling or a full-slate production benchmark.
- Fixtures cover Thursday-to-Sunday state, equality/delayed availability, future-result exclusion, duplicate/pair rejection, same-interval state, and refusal to backdate live issuance or prepare a final forecast before its required cutoff.

Time semantics: nflverse schedule times are parsed as Eastern, then UTC, regardless of stadium. [Provider dictionary](https://nflseedr.com/reference/load_sharpe_games.html). Kickoff+4h remains a governing proxy rather than an observed completion clock. Historical source availability is UNKNOWN and explicitly assumed only in reconstruction. Live mode requires recorded final and team-stat arrival times; missing evidence remains a named exclusion.

Limitations and next action: this is a new, inactive module, not the shipping publisher entry point. It retains the legacy recorded year/week training memberships to isolate feature timing. A source-qualified bootstrap, persistent live cutoff state, a provisional-preview adapter and the actual Tuesday fit driver still need integration and verification. Earlier board previews cannot be treated as final eligible forecasts. Do not replace the authoritative registry control until the corrected issuing path is qualified. Full rollback, durable host capacity, own-lineage calibration warmup and actual statistical/reviewer decisions remain open.

Every attempt is preserved in prior-attempts.json. Current-ref.json pins the final compressed result; code and source hashes are inside it. The original earlier attempt bytes remain privately preserved; no evidence was deleted. Production fits, locks and website are unchanged by this inactive increment.

Least certain: whether historical availability assumptions match provider arrivals. This led to an explicit reconstruction mode and live guards instead of a claim that historical replay proves live eligibility.

Confidence: medium — the timing effect holds on the authoritative population but depends on source-availability and target-week context choices that could reasonably differ. Lower to low if qualified source vintages materially change observation membership. Exact point reproduction and order equality are arithmetic on verified rows; they do not establish operational readiness or predictive improvement.

## September 22 state-restoration rerun

The current reference now pins `work/engine-rebuild/numerical-cutoff/replay-8a9e0f89dc915f3eb1324bf7001a3849b186c2b34bbb3b3b95847fec7b7469b6.json.gz` (SHA256 `8a9e0f89dc915f3eb1324bf7001a3849b186c2b34bbb3b3b95847fec7b7469b6`). The prior selected replay remains preserved above and on disk. The new code separately gates final-score and paired-statistics availability and reconstructs cumulative state in played order. `state-reconciliation.json` verifies exact equality of all 2,639 per-game forecast/training records and all annual counts with the prior replay. All descriptive metrics in the original table therefore remain unchanged. The authoritative control remains the HFA series. This rerun took 161.93 seconds and 830,439,424 peak resident bytes; it does not install a new live scheduler or qualify historical source vintages.

Persisted state and a label-free shadow adapter now have isolated recovery evidence; production integration remains pending. Finals can update Elo/rest before paired statistics arrive, preserving legacy behavior. Missing statistics are explicit, not zero. See ../CUTOFF-STATE.md and ../cutoff-state-canary.json.

Confidence: high in numerical equality with the prior diagnostic across all ten seasons; this survives reversed-row and delayed-arrival fixtures. Lower to medium if independent reconstruction finds a changed point or training identity. Historical live availability and operational readiness remain unqualified.
