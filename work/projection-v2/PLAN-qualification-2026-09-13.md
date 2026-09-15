# Projection v2 qualification protocol

Registered before viewing v2 comparative results, 2026-09-13. User authorizes qualification, removal of failing components and measured football WHY. V1 fits, code, locks, grades and experiments are preserved. No provider calls or credits required. No existing registered experiment gate is changed.

## Fixed design

- Sources: the exact hashed training manifest and feature construction of projection-v1-67c39f9a-2e58a851. Results are reconstructed historical development evidence, not a fresh unseen holdout or evidence of pregame starter availability.
- Control: raw football baseline, average adjusted offensive/opposing defensive points per drive times average drives. No financial inputs. Controls and candidates use identical paired games.
- V2: additive ridge correction to that fixed baseline. Feature groups below are the only candidates. Missing measurements contribute zero correction, never a substituted observation. Unqualified slots remain inactive. An intercept and baseline slope adjustment exist only in the calibration group.
- Candidate half-lives: none, 8 weeks. Ridge penalties: 1, 10, 100. For each subset and each 2016–2025 test season, settings use earlier out-of-fold team-score MAE; first fold uses none/10. Training contains seasons before the tested season only. Warmup 2015; no same-week results in features.
- Mandatory raw control uses no additional within-season decay. Candidate corrections and baseline use the selected candidate decay. Comparisons always include the complete candidate forecast versus the fixed control, so a decay benefit cannot be hidden.
- Eligibility: at least three test seasons with at least 100 paired games per season in which the group has qualifying measurements in both the prior training and tested features. Results for a group missing an OOF training history cannot qualify it. Wind is PARTIAL_HISTORY, only 2022–2025 stitched forecast values, never described as exact as-issued history.
- Useful group: paired mean team-score MAE reduction >=0.5% versus its comparator, margin and total MAE do not worsen, positive seasonal team-score improvement in at least 60% of eligible seasons. This is a development admission rule, not statistical proof of an independently predictive feature. Report deterministic 95% paired three-week moving-block bootstrap intervals (10,000 replicates, both teams and all games in a week together, within seasons); these intervals are descriptive, not multiplicity-adjusted superiority claims.
- Qualification before each historical test season: first test each group alone versus the raw control on earlier OOF seasons; then test each surviving group by refitted leave-one-group-out comparisons on that same earlier population. Remove all failures simultaneously, repeat until every retained group passes or none remain. Refit and retune every ablation using earlier seasons only. No reinterpretation of failed gates after seeing results.
- Evaluate the resulting adaptive qualification procedure out of sample by season, not the final retrospectively chosen subset. Re-run qualification through 2025 to select the frozen future subset. Also report its historical development comparison distinctly.
- Release check: adaptive procedure must improve aggregate team MAE over raw control with a positive one-sided 95% week-block lower bound and must not worsen mean margin or total MAE. Otherwise deploy the raw football control with no optional group, documenting the failed qualification. No betting superiority claim.
- Intervals: integer unsmoothed residuals from earlier adaptive OOF seasons only. 2016 has no prior OOF errors and no interval score. 2017–2025 coverage at 50/80%, sigma and MAE reported with denominators and +/-3 point coverage flags. Deployment residuals may use all completed OOF years because they precede future projections. Never calibrate a historical interval using that season's errors.

## Fixed feature groups

Calibration (baseline correction/intercept); venue (divisional/non-divisional home, divisional, neutral); efficiency (off/def PPD and YPP); pace (drives, opposing drives, plays/drive); passing (off/def pass EPA and CPOE); rushing (off/def rush EPA/success); explosiveness (off/def explosive rate); kicking (season FG bands); target shares (TE/RB); momentum; scoring composition (red-zone TD, return points, FG share); turnovers/luck (turnover margin, fumble recovery, close-game record, luck index); Elo (rating and difference); schedule strength; Pythagorean; rest/travel; wind.

## Delivery and verification

1. Engine qualification/replay emits pinned protocol, source hashes, availability by season, marginal and conditional decisions, chronological forecasts, per-season scorecard and fitted subset.
2. Tests cover future-label independence of selection/calibration, missing group histories, baseline arithmetic, paired denominators, season/block boundaries, ablation pruning, retained contributions, WHY signs/counterevidence and frozen v1 preservation.
3. New v2 publisher preserves v1 locked/final/retrospective records; only unfrozen future cards use v2. No new retrospective v2 projections. Accuracy remains split by version and evidence.
4. WHY groups actual point contributions into positive support and distinct opposing evidence. Include measured football values/ranks; never causal claims, fictitious reasons or padding to three if fewer exist. No financial text. Baseline contribution explained even if no optional group qualifies.
5. Deploy engine-v2 and authorized reader changes to main, verify cloud/runtime, live artifact and desktop/mobile presentation. Preserve the existing card layout and edit/lock flow.
