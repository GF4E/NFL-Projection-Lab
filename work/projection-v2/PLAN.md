> Governance update, 2026-09-15: `work/projection-governance-v2/GOVERNANCE.md` and its weekly queue now govern. Architecture phase ordering and gates below are historical/superseded. The Phase A artifacts remain unchanged exploratory evidence and do not consume E2.

# Forecast-system v2 requirement map

Registered 2026-09-15 before comparative results. User Forecast-System Architecture and Addendum 1 govern; addendum wins conflicts. Prior qualification protocol preserved byte-for-byte in PLAN-qualification-2026-09-13.md and git history. Original forecasts/grades/artifacts remain unchanged. Namespace forecast_system and version forecast-system-v2 avoid earlier version collisions.

## Calibration history decision
EMOS requires exactly three prior seasons of OOF forecasts. Cached OOF begins 2016. The specified 2015 warmup cannot supply 2013–2015 calibration for the 2016 gate. User approved generating 2013–2015 calibration-only forecasts with earlier training, retaining 2016–2025 scored gates. No in-sample, future-data, shorter-window or omitted-year substitute. Independent synthetic implementation can proceed.

## Requirement mapping
All paths relative to repo; entries are planned destinations, NOT completion evidence. Short phase paths mean work/projection-v2/phase-<letter>/.

| Requirement | Phase | Implementation and evidence |
|---|---|---|
| 0 layered football-only system, parameter economy | all | engine/forecast_system/; tests/test_forecast_system.py; phase reports |
| 1 PPD/pace core, fifteen inputs, active QB/pressure/kicker, ridge chronology | A | engine/projection_v3/model.py and personnel.py preserved; scripts/forecast_system_phase_a.py; phase-a/core-manifest.json |
| 2 state, shrink, noises, half-life, W2–6 MAE and dispersion gates | B | engine/forecast_system/assimilation.py; phase-b/report.md |
| 3 seeded 500-member distributions, coverage/spread-skill gate | C | engine/forecast_system/ensemble.py; phase-c/report.md |
| 4 CRPS EMOS, bands, slope/scale, chronology, MAE/coverage | A/C | engine/forecast_system/postprocess.py; phase-a/report.md |
| 5.1 T80 weather fields, kickoff/3h/15min, sourced stadium metadata, roofs | D | engine/forecast_system/weather.py; config/stadiums.json; phase-d/sources.json |
| 5.2 forecast-only shipping fits, separate proxy study, overlap coefficients/SE | D | engine/forecast_system/weather.py; phase-d/report.md |
| 5.3.1 along/cross-field wind | D | engine/forecast_system/weather.py; phase-d/report.md |
| 5.3.2 piecewise 10/20mph fallback, 15–20 bucket | D | same weather module; phase-d/report.md |
| 5.3.3 gust excess | D | same weather module; phase-d/report.md |
| 5.3.4 passing and kicking interactions | D | same weather module; phase-d/report.md |
| 5.3.5 precipitation amount/probability | D | same weather module; phase-d/report.md |
| 5.3.6 snow/wide prior | D | same weather module; phase-d/report.md |
| 5.3.7 altitude | D | same weather module; phase-d/report.md |
| 5.3.8 seasonal surface/wet grass | D | same weather module; phase-d/report.md |
| 5.3.9 strongly shrunk stadium shielding | D | same weather module; phase-d/report.md |
| 5.3.10 cold acclimation, restricted temperature | D | same weather module; phase-d/report.md |
| 5.4 multiplicative PPD, wind mean-only variance test, precipitation/snow dispersion | D | same weather module; phase-d/report.md |
| 5.5 separate ordered outdoor MAE/coverage gates | D | scripts/forecast_system_phase_d.py; phase-d/gate.json |
| 6.1 league/team climatology, last-four persistence,v1; MSE skill | A | engine/forecast_system/verification.py; scripts/forecast_system_phase_a.py |
| 6.2 CRPS/PIT/reliability/spread-skill/coverage each week | A | engine/forecast_system/verification.py; phase-a/report.md |
| 6.3 simulation floor and repeated-matchup comparator | C | three functions in engine/forecast_system/ensemble.py (no floor module); phase-c/report.md |
| 6.4 separate lead-time scoring | E | scripts/projection_learning.py adapter; phase-e/report.md |
| 7 OURS separate suite, confidence/tags, lock eligibility | E | verification.py; existing shared-edit adapter; phase-e/report.md |
| 8 board v5 preservation, expanded weather and verification | E | reader component path resolved at phase E; phase-e/report.md |
| 9 phase/version/gate sequence, separation | all | phase-*/gate.json; tests/test_forecast_system.py |
| 10 phase commits/gates/tables/self-review, D coefficients/bucket | all | phase-*/report.md; CHANGELOG.md |
| Addendum A observation offsets, weekly Kalman, doubled variance flag, diagnostic-only Elo after gate | B | assimilation.py; phase-b/report.md |
| Addendum B designation play rates/backup, bounded weather errors, posterior draws, medians/quantiles/WHY means | C | ensemble.py; phase-c/report.md |
| Addendum C three-prior-season CRPS, offseason/W9 cadence, fixed bands, inert rule | A/C | postprocess.py; tests/test_forecast_system.py; phase-a/report.md |
| Addendum D 10000 fixed-input drive simulations, SD beside MAEs, reorder invariant | C | three ensemble.py functions; tests/test_forecast_system.py |
| Addendum E Sunday20 PARTIAL/Tuesday06/Friday12/Sunday07/T80/T75/W9 | B/C/E | scripts/cloud_scheduler.py adapters; phase reports |
| Addendum F one worker,4GiB,45min gate/10min weekly,caching,report reads only | all | phase runners; phase-*/compute.json |
| Addendum G synthetic slope/chronology, known state/half-life, seeds/rates/bands/floor, weather provenance | respective phases | tests/test_forecast_system.py |
| Addendum G all-phase separation and row reorder | all | tests/test_forecast_system.py |
| Addendum H parameter counts/games-per-parameter/noises/bands; BAL–IND WHY | all/A | phase reports; phase-a/BAL-IND.md |

## Phase A preregistered choices
- Empirical residuals, paired home/away dependence for joint outputs; no Gaussian substitute or display rounding during fitting.
- Affine location plus band offsets, positive residual scale; unrestricted slope. Middle band offset fixed zero for identifiability; report three offsets and five free parameters (a,b,c,two offsets). This does not restrict the representable location family.
- Bands from raw core medians: <20, inclusive20–27, >27. Median-center empirical residuals so the location equals predictive median. Deterministic sorted input and optimizer; fail closed on invalid data/nonconvergence.
- Dispersion means population SD of unrounded projected team points across game-team observations. Report pooled and each season; require >=4 each season. Report skill for team/margin/total against prior-data climatology and all specified alternative baselines.
- All applicable section4 and phaseA gates apply, not only positive skill. Report denominators and every year; no omitted early years.
- Week9 EMOS still uses prior three seasons, excluding current-season outcomes per Addendum C; version refits. Reports never refit.
- PhaseA spread is residual-distribution SD, explicitly not a 500-member ensemble before PhaseC.
- Simulation SD is conditional variability, displayed with units beside MAE, never asserted as a universally proven MAE lower bound.
- Existing adaptive OOF caches are baseline evidence only, not a replacement for a core with required active personnel inputs.

## Status
A: numerical gate FAIL, logged in phase-a/gate.json. No release or production activation. See phase-a/report.md.
B–E: NOT STARTED. Next phase requires prior phase pass logged. No production mutation.

## Bootstrap registration (before historical results)
2011 input warmup, 2012 first training season, 2013–2015 calibration-only OOF. Ridge penalty choices 1,10,100, selected using earlier OOF team MAE, first fold10; linear v1 decay fixed through Week5. No core calibration group: a,b belong to the new postprocessor. All measured football groups including QB/pressure/career kicking retained. Unqualified slots remain explicit. Wind remains unavailable until forecast-only provenance is established in D; no stitched/reanalysis weather weights ship. Historical target shares lacking roster history remain missing, not imputed measurements. Personnel weekly proxies remain issuance-unverified.
