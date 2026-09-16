# BOARD v7 implementation map

Repository of record: GF4E/NFL-Projection-Lab. Display checkout: ../nfl-board-main (main). Engine checkout: nfl-prediction-engine-gpt6 (engine-v2). Preserve forecast arithmetic, frozen objects, versions, grades and experiment queue. New presentation metadata is separate from frozen projections.

| Requirement | Files / verification |
|---|---|
| 1 Scope and forbidden DOM | main: app-shell.tsx, board-v7.tsx, season-v7.tsx; board-v7 DOM tests |
| 2 One board / two manual lenses | main: board-v7.tsx, domain/board-v7.ts |
| 3 Tokens/type | main: styles/board-v7.css |
| 4 POINTS anatomy / exact coordinates | main: board-v7.tsx PointsAxis; geometry browser test |
| 5 ERROR lanes / issued interval bounds / count | main: board-v7.tsx ErrorAxis; engine: board_v7.py presentation metadata |
| 6 Stable sorts | main: domain/board-v7.ts; unit tests |
| 7 Expanded detail / no collapsed WHY | main: board-v7.tsx Detail; component tests |
| 8 Calibration trust / probability | engine: board_v7.py; main: board-v7.tsx |
| 9 Header | main: board-v7.tsx |
| 10 Season four blocks | engine: board_v7.py; main: season-v7.tsx and season route |
| 11 Shared entries / post-lock | main: existing projection-entry server retained; reusable edit form; season metadata |
| 12 Responsive layout | main: styles/board-v7.css; 360/390/1280 browser checks |
| 13 Accessibility/motion | main: styles/board-v7.css, board-v7.tsx; keyboard/reduced-motion tests |
| 14 Tests/screenshots | main: tests/board-v7.test.tsx; browser fixtures/screenshots; engine tests/test_board_v7.py |
| 15 Evidence | work/board-v7/report.md, screenshots, two verified remote commit hashes |

## Conventions and open specification conflicts

- Plot full-precision values; round text only. Error = actual minus frozen expected. Preserve AS_ISSUED versus RETROSPECTIVE; retrospective games have no qualified lock and never enter calibration.
- Derive team intervals only from the distribution pinned to the issuing version, with the existing PMF quantile convention. Store new display metadata outside frozen projection objects. If unavailable, report unknown, never fabricate an interval.
- Error-sort scalar: maximum absolute error of the two team projections; ties kickoff then game ID. Unplayed/no-lock remain last.
- Per-game interval readout is the worse of the two team coverage statuses. Trust/footer count team observations individually.
- ERROR bands must use each row's issued intervals, translated to residual coordinates, to keep spatial hit status identical to immutable grading; never substitute a later version's widths.
- Resolved by binding user amendment: the edit label is confidence; muted text is raised until the contrast script passes; the 24px ERROR drawing lane inside a 44px mobile row target is intended, not an exception. See resolution-2026-09-16.md.
- Reference floor stays explicitly uncomputed until governed E4; no new model fitted for display work.

### Season recovery
Section 10: `src/server/board-v7.ts` reads the self-contained Season artifact independently of the board's current publication hash; board intervals still require an exact hash match. `src/components/season-v7.tsx` always renders all blocks, with named game-count shortfalls; one graded week is sufficient for a point and coverage tables. Reference gaps remain explicit, never invented. Tests cover loading/missing evidence and a single graded week with all five historical seasons.
