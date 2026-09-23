NON-AUTHORITATIVE RECONSTRUCTION — legacy calibration donor preparation, not a new model comparison or promotion.

REVIEW REQUESTED — Tier 2: preserve the legacy personnel window ending before the first game date of its labeled week, while excluding any result unavailable at the target cutoff. Expanding all personnel histories to the latest cutoff is a different information horizon and was not done.

# Corrected-calendar donor selection

The original adaptive method reproduces exactly on its archived inputs: all ten annual qualification records (including numerical admission evidence), selected settings and all 2,639 forecast pairs match. Reconstructing the same method on corrected three-cutoff inputs changes the 2024 selected groups. It selects no additive correction that year, rather than the original calibration group. This is historical-method reconstruction; its internal admission rule is not a replacement for the current release gate.

| Season | Original groups | Corrected groups | Corrected decay / penalty | Games with changed points |
| --- | --- | --- | --- | ---: |
| 2016 | baseline only | baseline only | none / 10 | 207 |
| 2017 | baseline only | baseline only | none / 10 | 195 |
| 2018 | baseline only | baseline only | none / 10 | 193 |
| 2019 | calibration, venue, elo | calibration, venue, elo | none / 100 | 256 |
| 2020 | calibration, elo | calibration, elo | none / 100 | 256 |
| 2021 | elo | elo | none / 10 | 272 |
| 2022 | calibration, elo | calibration, elo | none / 100 | 271 |
| 2023 | calibration, elo | calibration, elo | none / 100 | 272 |
| 2024 | calibration | baseline only | none / 10 | 272 |
| 2025 | calibration, elo | calibration, elo | none / 100 | 272 |

Across all seasons, 2,466 donor forecast pairs change above 1e-10; maximum team-point difference is 4.3644. Counts include downstream refitting and selection changes, not just changed target inputs. No accuracy gain is asserted or scored against an E-CAL challenger. The authoritative HFA series 66a3a60c… remains byte-identical.

## Cutoff failure and correction

Attempt 1 stopped before fitting: the global personnel history window could include a result after the state cutoff. The exhaustive check finds two forecast games: 2020_14_NE_LA and 2021_16_SF_TEN. Across both decay caches this is eight team-window checks. Re-enrichment after filtering the offending histories changes zero personnel or wind values; those later games did not affect the target players/teams. Therefore this is a repaired boundary defect, not evidence of an observed leaked QB contribution. Keep the failed script and log.

The check covers 11,580 team-feature rows across two decay configurations, including training-year rows. It checks 2,176 timestamped chart references and records 20,658 untimestamped chart references; these are repeated row/configuration references, not unique source reports. Weekly chart availability and stitched forecast-wind history remain assumptions. No receipt was backdated.

## Verification and scope

- Four focused tests pass: strict kickoff+4h equality, original history-date cap, unavailable player-outcome perturbation with a positive control, and unknown recent-game failure.
- Independent augmented least squares checks every selected annual fit; corrected maximum discrepancy is 1.07e-14. Training-row reversal is invariant.
- All forecast pairs preserve the 2,639-game population and original finals. Training game IDs precede each tested season and exclude target games.
- A separate verifier matches every original qualification value exactly, recounts changed forecasts, checks archive/code hashes and compares every retained personnel/wind value.
- Runtime 234.55 seconds; peak RSS 1,871,970,304 bytes; one worker. No host writes or paid calls.

Reproduce with reconstruct_donor_qualification.py, then verify_donor_qualification.py. donor-qualification-current.json pins the immutable summary and both feature caches, annual fit/decision/forecast checkpoints and complete original/corrected series. donor-qualification-source-verification.json additionally records the clean committed engine source and supplemental dependency hashes. Tests and failure logs are retained beside these records.

## Remaining work

Bind the reconstructed donor and own-lineage histories to the calibration adapter with explicit fit-availability and method identities; check the complete prior-season banks before E-CAL registration. This does not qualify historical provider vintages, establish control authority for the corrected point replay, release a distribution or resolve publication/capacity/reviewer/live-cycle dependencies. Earlier 2013–2015 warmup conventions and all full-goal acceptance requirements remain. No experiment clock, candidate or gate was changed.

Least certain: the historical availability assumptions for untimestamped charts and forecast wind. Their presence in an archive cannot prove availability at the original issuance.

Confidence: medium in readiness for the final calibration experiment: reconstruction passes on pinned records, but the conservative personnel horizon and historical availability assumptions could reasonably differ. Lower to low if an independent reconstruction changes the selection or violates a cutoff.
