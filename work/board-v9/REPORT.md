# BOARD v9 — score context publication

2026-09-20. Presentation and descriptive data only; no fit, prediction, issuance, grade, gate or diagnostic calculation changes.

Six board columns: MATCHUP, OUR SCORE, OUR SPREAD, TOTAL, CONTEXT, RESULT. Market columns and outcomes are removed from every board state. Weekly reference diagnostics stay in reports. Projected winners use a team-color dot, white bold code and white score; actual winners retain the separate inverted chip. Home teams stay on the bottom.

## Conventions

Percentiles rank full-precision displayed points against actual regular-season scores: 100 times (number below plus half the number equal) divided by sample size. Current team references require the exact issuing version and an as-issued lock. Below four qualifying games, prior-season actual scores are used with visible season/count/fallback labels. Historical versions are never inferred. Weekly version bumps can therefore keep teams in the prior-season fallback.

League totals use current-season completed games, without prior substitution. Empty cohorts state their shortfall. Completion is actual played kickoff plus four hours, strictly before issuance; retrospective cards are also bounded by their original pregame cutoff. nflverse gametime uses the existing repository Eastern-time convention. Latest recorded final-source schedule is SHA256-verified; no provider refresh.

Total 50% intervals come directly from the issuing projection, rounded only for display. Team interval membership uses full-precision bands from the existing issuing distribution. Error means actual minus displayed projection. Edits use their displayed points. Context binds version, issuance and displayed points; stale or invalid context gives a named shortfall.

## Verification

32 games, 1,401 history references checked before issuance, 64 correctly flagged team fallbacks, no missing kickoffs. Context SHA256: 3e5ed240b41dc0c2a9454d1896cdeedac3bf78947343bac1a1e16ddb1482ec42.

Four new engine tests pass: chronology, exact-version filtering, four-game switch, midrank, retrospective boundaries, missing timestamps and ordering invariance. The 218 existing week-one tests pass. Main holds website tests and screenshots in work/board-v9. The regular board-v7 publisher now refreshes this artifact automatically; reports never refit.

Confidence: high — chronology and arithmetic survive row reordering and boundary fixtures and presentation is checked independently. Lower to medium if independent recomputation finds a kickoff, version attribution or issuing-distribution mismatch.
