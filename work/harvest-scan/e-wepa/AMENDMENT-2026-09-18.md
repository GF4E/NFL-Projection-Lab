# E-WEPA binding amendment — 2026-09-18

Supersedes frozen 2013–2020 fitting and the unresolved unit/promotion clauses. Original SPEC and registration remain preserved.

For each outer season S=2016,...,2025, fit play-context WEPA weights only on nflverse play-by-play from 2006 through S-1. Use published wepa_v2 objective: maximize prediction of future margin with first-half versus second-half season split for internal validation. Freeze weights throughout S. Report the fitted vector per fold and cross-season stability. No in-season weight refit. If per-fold fitting exceeds the 45-minute gate ceiling, use one fit on 2006–2012 frozen across all evaluation seasons and label FALLBACK; no selecting fallback by accuracy. Log timed-out attempt and use one design consistently, not mixed hidden fold results.

Convert observation: team WEPA per play times team plays per drive over the same completed-game window, minus league mean of that same quantity over the same window, all as of the permitted assimilation cutoff. Report season-by-season correlation against the current PPD observation. No future games or extra fitted conversion factor. The converted unit is expected points per drive above league average.

Candidate a changes core efficiency input and state observation; b changes observation only; c raw EPA control. Only E-WEPA's own unchanged method gate authorizes promotion. The earlier E1 rejection does not preclude testing E-WEPA, nor does this amendment independently promote state-space. Pin paired control construction and inherited state-space parameters before comparison; do not silently grant any separate live promotion.

Standard 2016–2025 nested chronological evaluation, identical eligible games, candidate-specific calibration from earlier OOF residuals, paired uncertainty, >=1% team-points MAE improvement and margin/total 50/80 coverage within three points remain. Historical seasons used to fit a fold are not scored as its held-out evidence. Existing no-market, license, immutable forecasts, lineage, computation and review requirements stand.

Queue position remains after league scoring environment. No experiment implementation/fitting begins before Tuesday closeout publication. Original registration preserved; this amended registration supersedes its blockers. Tuesday activation hashes the then-final baseline, complete executable weight definitions and source/configuration before comparative results; this is a preregistration amendment, not an experiment run.
