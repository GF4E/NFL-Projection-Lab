# Projection Engine v1 implementation plan

Written before implementation. Governing request: SPEC.md; replaces earlier card projections, sources, confidence, entry and WHY. Frozen experiments and historical issued records remain immutable. No Odds API calls.

| Requirement | File | Verification/implementation |
|---|---|---|
| 1 | engine/projection/contracts.py; scripts/projection_prepare.py | Strict football-only DTO boundary; no provider artifact or financial fields in projections/cards/grader. |
| 2.1–2.3 | engine/projection/features.py; config/staff_history.json | Venue and divisional HFA fitted; continuity slot zero until staff file seeded. |
| 2.4–2.7 | scripts/projection_prepare.py; engine/projection/features.py | Garbage-filtered PBP aggregates, incidence ridge ratings, pace, kicking, matchup and QB inputs; source hashes. |
| 2.8–2.10 | engine/projection/features.py | Officials inactive until registered positive study; four-game momentum and scoring/luck components. |
| 2.11 | engine/projection/features.py; engine/elo.py | Existing base Elo with one-third offseason reversion toward 1505; ANY/A adjustment INACTIVE under the authorized missing-history decision. |
| 2.12–2.15 | engine/projection/features.py; config/stadiums.json | Opponent-adjusted schedule strength, Pythagorean 2.37, rest/travel, stored forecast wind. |
| 3.1 | engine/projection/model.py | Per-drive offense/defense matchup and expected pace baseline; hand-solvable test. |
| 3.2 | engine/projection/train.py | 2015 warmup; 2016–2025 season-origin replay. Penalty and decay selected strictly on earlier OOF years. Deterministic sorted rows, fitted weights only. |
| 3.3–3.4 | engine/projection/model.py; scripts/projection_publish.py | Both team points and additive contributions; version from feature and fit hashes. |
| 4.1–4.3 | engine/projection/distribution.py | Integer empirical OOF residual mass; winner probability and margin/total intervals; no external probability source. |
| 4.4 | engine/projection/grade.py; work/projection-v1/report.md | Seasonal coverage and ±3 percentage-point flags. |
| 5 | engine/projection/edits.py; reader projection-entry endpoint | Shared edits to away/home points; same residual distributions; late edits cannot change a lock. |
| 6.1–6.4 | reader projection-card.tsx; projection-board.tsx | Football-only headers, winner bar, projected/edited points, WINNER/MARGIN/TOTAL tiles. |
| 6.5 | engine/projection/card.py | Top three point contributions and largest counter contribution, football-only vocabulary. |
| 6.6–6.7 | reader projection-card.tsx; game-card-v3.css | Actuals/errors/interval hits and preserved visual/accessibility tokens. |
| 7 | engine/projection/grade.py; reader projection-board.tsx | Accuracy only, weekly/seasonal, PROJECTION and OURS distinct. Existing wager grading untouched/off-card. |
| 8.1–8.7 | tests/test_projection_v1.py | Arithmetic, contribution sum, strict separation, mass, flags, post-lock, deterministic replay. |
| 8.8–8.9 | reader tests/projection-v1.test.tsx; work/projection-v1/verification/ | Three snapshot states; live Week 2 acceptance and historical-evidence resolution before retrospective display. |
| 9 | work/projection-v1/experiment.json; report.md; screenshots/ | Pushed branch hashes, source/fit receipts, annual metrics, BAL/IND mobile/desktop evidence. |

## Preregistered operational definitions

- Season weights follow the existing linear rule: prior=(6-week)/5 for Weeks 1–5; current=(week-1)/5; current only from Week 6. Additional within-season decay candidates and ridge penalties are frozen before results.
- Garbage exclusion: fourth quarter with nflverse wp <0.05 or >0.95; endpoints retained; missing wp explicitly tracked.
- Baseline: arithmetic mean of adjusted offensive and opposing defensive points per drive, multiplied by mean expected offensive drives from both teams. The baseline coefficient is fitted in the final ridge.
- Team inputs are computed from completed games strictly before the target week, with target final scores available only to training/scoring. Historical starter identity and forecast availability must carry explicit evidence labels.
- Missing measured inputs remain missing; training-only imputation and missingness indicators, if used, must be registered before results. Entirely unavailable inputs cannot be described as fitted. No invented injury, pressure, forecast or staff evidence.
- New football sources are sanitized by an explicit column allowlist outside engine/projection before model access. Source file hashes remain attached. The separation test also scans reader card dependencies.
- New retrospective estimates for Week 1 finals require explicit display/evidence resolution; never invent an original frozen projection or mix retrospective estimates into prospective accuracy.

## Build order
1. Audit source coverage and write definitions/source inventory before fitting.
2. Football-only preparation, chronology-safe features and numerical primitives.
3. Rolling-origin fit, residual distributions, accuracy report, deterministic replay.
4. Shared projection edits, independent locks and accuracy-only publication.
5. Reader replacement, deployment and live acceptance checks.
6. Review every requirement, record limitations, commit and verify both branches.

## Authorized missing-history resolution

Both pending decisions approved. Inputs without qualified history are INACTIVE with zero contribution and no replacement measurement. Wind is PARTIAL_HISTORY, fit on 2022–2025 archive only. Week 1 reconstructions are RETROSPECTIVE and scored separately. Penalties 1/10/100 and within-season half-life none/8 are registered before comparative results; first-fold default 10/none. See experiment.json for complete definitions.
