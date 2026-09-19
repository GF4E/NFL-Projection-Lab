SERIES NOTICE: This report cites non-authoritative historical/replay series; only work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json is authoritative for future gating. See the SERIES.md catalog.

**REVIEW REQUESTED — nonblocking Tier 2 conventions.** Full sweep and hash: [preregistration addendum](PREREGISTRATION-ADDENDUM.md).

- **C06 Linear decay clock on exceptional schedules:** Retain the corrected implementation: elapsed scheduled assimilation cutoffs from the first forecast cutoff of a season advance the existing linear decay; freeze that weight inside an interval. **Alternative not taken:** Use the forecast game NFL-week label for decay even when two games share one interval. This could change control predictions and conflicts with the frozen-state interpretation.
- **C11 Reference schedule and steady-state diagnostic:** Retain registered symmetric 32 virtual team-versus-league games and posterior P0; diagonal KH gains and offense/defense half-lives remain diagnostics. **Alternative not taken:** A rotating 16-real-matchup reference schedule. Not evaluated; would require an explicit protocol correction if reviewers establish the retained construction is wrong.
- **C12 Preseason injection cross-covariances:** Retain registered C[D P0 D]C congruence with sqrt(2) on flagged components, then the registered lambda transition. **Alternative not taken:** Add flagged diagonal variance alone before projection. Not tested; it changes cross-covariances and could change forecasts.
- **C25 Completion evidence precision and substitutes:** Retain exact qualified completion timestamps for the executable audit. Missing/contradictory clocks remain unknown; do not substitute kickoff plus duration, last-play start, an edit time or a later current FINAL flag. Continue sourcing; stop only the dependent fit. **Alternative not taken:** Accept independently verified completion-time bounds that prove identical cutoff membership while retaining exact time as unknown. This is a possible evidence representation for reviewer consideration, not an approved fabricated timestamp.

# E1 calendar correction — implementation tested; historical replay blocked

The general chronology rule is implemented for the control and all three challengers: take the latest Tuesday 06:00 America/Los_Angeles cutoff strictly before each game's own T-75 issuance; assimilate only games completed strictly before that cutoff. Week labels never determine result availability. Two games inside one interval share a frozen state. DST is handled in the named time zone. This applies equally to rescheduled, flexed, Saturday, Tuesday and international games.

The original preregistration is byte-for-byte unchanged. No new candidates, fitted settings or gate thresholds were introduced. The earlier numerical rejection remains withdrawn and preserved as an invalidated run. There is no first valid E1 result yet, and no model promotion.

## Before and after

| Item | Invalidated run | Corrected implementation |
|---|---|---|
| Assimilation | NFL week grouping | Sourced completion time before scheduled cutoff |
| Same team twice in an interval | Could update between games | Frozen team state for both forecasts |
| Control / k4 / k8 | Week-grouped histories and Elo | Same completion calendar as state-space |
| Decay progression | NFL week label | Elapsed scheduled weekly cutoffs within season |
| Unknown coach + known changed QB1 | Combined flag false | Coach half false; known QB1 change activates variance injection |
| Numerical result | Withdrawn rejection | Not produced: completion-evidence preflight fails |

## Historical audit, all 2016–2025 games

The full-schedule preflight inspected all 2,639 scored games. None has yet been admitted to a verified completion-timestamp manifest. This is a source-qualification failure, not a passing leakage audit. The 2011–2015 training/warmup games also require verified completion evidence. The runner refuses to fit while any required timestamp is unknown.

| Season | Scored games inspected | Verified completion gaps | Affected forecasts |
|---|---:|---:|---|
| 2016 | 256 | 256 | Unknown until completion evidence passes |
| 2017 | 256 | 256 | Unknown until completion evidence passes |
| 2018 | 256 | 256 | Unknown until completion evidence passes |
| 2019 | 256 | 256 | Unknown until completion evidence passes |
| 2020 | 256 | 256 | Unknown until completion evidence passes |
| 2021 | 272 | 272 | Unknown until completion evidence passes |
| 2022 | 271 | 271 | Unknown until completion evidence passes |
| 2023 | 272 | 272 | Unknown until completion evidence passes |
| 2024 | 272 | 272 | Unknown until completion evidence passes |
| 2025 | 272 | 272 | Unknown until completion evidence passes |

“Affected” means a forecast's set of available historical game results differs from the invalid week-label replay. The full count cannot be established from five previously identified late games. The audit computes and records the full dependency-set difference by season once completion evidence is complete; downstream numerical effects are a separate question.

## Source investigation and remaining work

The pinned nflverse schedule provides kickoff dates and times, not game completion timestamps. The NFL play-by-play sample for 2020 BUF–TEN has an END GAME marker with no wall-clock timestamp. ESPN provides final-event fields, but they are not uniformly usable:

- 2013 BAL–DEN: no final event in the retrieved drive list.
- 2016 CAR–DEN: final-event wall clock is earlier than kickoff.
- 2017 KC–NE: final-event wall clock is missing.
- Some final-event wall clocks copy the last-play start timestamp; modification times can reflect much later edits.

Raw source extracts, URLs, retrieval dates and hashes are preserved. No last-play time, generic game duration, or edit timestamp was substituted for completion. A source being unavailable here does not establish that no authoritative completion record exists elsewhere. Remaining work is to source and qualify that evidence, complete the full calendar dependency audit, then run the unchanged E1 comparisons and current-season checks. The corrected runner currently exits before fitting, and there are no corrected MAE or coverage results to report.

## Coaching and QB1

All 448 head-coach, OC and DC team-season entries remain explicitly unknown. Unknown coaching reads false for the coach half of the transition flag. No attempt was made to get around PFR's 403 response; coordinator sourcing stays a separate future data addition.

QB1 coverage is 446 of 448: the gaps are **2017 MIA and 2017 TB**. Known QB1 changes independently activate 152 team-season variance flags; unknown prior-year comparisons remain unknown. See staff-flag-correction.json for every unknown team-season, coverage by season and the new file hash. This change does not enable any live continuity weight.

## Verification and release status

310 tests pass: 218 Week 1, 57 projection, 20 forecast-system, and 15 E1/calendar/protocol tests. These include strict cutoff equality, DST, week-label independence, two games sharing one state, row-order determinism, unknown-completion rejection and identical calendar availability for all candidates. The full historical preflight fails separately, as it must with missing evidence.

Original registration, prior as-issued forecasts, first grades, Phase A and the invalidated E1 archive are preserved. Linear remains live. No PFF ingestion, E2 comparison or paid provider call occurred. The corrected run, once it passes every check, must be logged as the first valid E1 result; that claim is not made now.

## Decision-latency follow-through

The gap sweep was hashed and pushed before this follow-through in commit `5349830a4f77ad2cd77e6257ae7c9542dbc61d00`. It contains 22 Tier 1 decisions, four nonblocking Tier 2 choices and one Tier 3 evidence blocker. Original registration/candidates/gates/metrics/population remain unchanged. The sweep was not backdated over the earlier invalidated run.

Implemented below Tier 3: addendum integrity checking; an exact 2,639-game population guard (equal reduced intersections are rejected); paired-game leave-one-out MAE sensitivity as reporting only; corrected-directory stage wiring and current-fit cache lineage; and accurate report/unknown-QB wording. The 14 current-season frozen games all use the September 8, 2026 06:00 PT cutoff. No new current-season exception is required.

The corrected entry point was attempted again after the sweep. Its historical completion-evidence preflight still fails before fitting. Tier 2 review flags did not cause the stop. B01 is the entire current Tier 3 batch: source authoritative completion evidence while retaining the population and strict boundaries; do not infer duration or silently delay/drop observations. The post-preflight numerical pipeline has not been exercised on qualified full-history data, and there is still no first valid E1 result.

Least certain: whether the available source fields establish actual completion. Contradictory/missing clocks remain unknown; that changed execution into a failed preflight rather than an invented chronology.
