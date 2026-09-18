# BOARD v8 implementation plan

Status: specification read; pre-implementation sweep published; reference access blocked. No implementation or deployment performed.

Repository of record: https://github.com/GF4E/NFL-Projection-Lab.git. Display checkout: /Users/gabe/Documents/Codex/2026-09-04/nfl-board-main, branch main. Engine checkout: /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6, branch engine-v2. Build-only deployment mirror policy remains binding.

Read SPEC.md and GAP-SWEEP.md before implementing. The required approved table reference is https://claude.ai/artifact/SdNcayRszVDKsibJ196wjQ, project/Board-Table.dc.html. Browser verification on September 17 returned “Sign in to view this page”. No callable Artifact reader was found; local filename searches did not locate the reference. The approved Expanded artboard must also be supplied or made accessible. Do not claim visual parity without viewing both.

| Section | Implementation files | Required verification |
|---|---|---|
| 1 Table replaces score lanes | src/components/board-v8.tsx (new); current Sunday route integration | One schedule-ordered table; no card fills, logos, or point lanes in SCORES |
| 2 Display-only book source | src/domain/board-v8-market.ts; src/server/board-v8-market.ts (new); src/server/board-v7.ts render payload join; if needed engine-side scripts/board_v8_market_publish.py outside projection package | Caesars then BetMGM, same captured book pair, content hash and source/capture timestamps; no transport invocation or refit; separation test |
| 3 Desktop dimensions | src/styles/board-v8.css (new) | DOM widths [152,86,26,86,86,14,96,72,26,52,56,96,24,270], total 1242; 42px rows; 9px mono headers, no vertical rules |
| 4 Cells/gap/result | src/domain/board-v8-market.ts; src/components/board-v8.tsx | Signed home-margin gap; 6px per point capped at 48px; thresholds before rounding; ET kickoff; spread/total push handling; no implied financial recommendation |
| 5 Two winner mechanisms | src/components/board-v8.tsx; src/styles/board-v8.css | Independent bold projection and actual chip, disagreement case, tie, no-lock case |
| 6 Key line | src/components/board-v8.tsx | Exact meaning of bold, chip, two-point emphasis and display-only books |
| 7 Manual ERROR lens | src/components/board-v8.tsx; reusable error geometry in src/components/board-v7.tsx and src/domain/board-v7.ts | SCORES default; stable IDs/order; actual minus expected; -30 to +30; both shaded zones, empty-state labels, eligible-only count |
| 8 Expanded row | src/components/board-v8.tsx; existing Entry, Contributions, Trajectory helpers | Approved reference parity, ordered sections, 10 quantile dots/team and actual ring, joint-margin probability note, only one expansion, WHY absent when collapsed |
| 9 Uncertainty language | src/components/board-v8.tsx; src/components/season-v7.tsx where applicable | Quantity and 50/80 levels, single-game predictive wording, constant-width and 2639-game rejection disclosure; OPEN heteroscedastic hypothesis retained |
| 10 Mobile | src/styles/board-v8.css | 96px blocks under 640; four specified lines when final, 44px targets, no disagreement bar, no overflow at 360 |
| 11 Tokens/type | src/styles/board-v8.css | Exact new tokens, tabular mono numbers, sans codes, half-point book preservation, gold limited to toggle/links |
| 12 Tests | tests/board-v8.test.tsx; tests/board-v8-market.test.ts; work/board-v8/browser-check.mjs; engine tests/test_board_v8_separation.py if publisher added | Geometry, 2.0/1.9 emphasis, missing books, winners/ties, projection isolation, personal-name/coin-flip checks, ET, stable lenses, expansion; screenshots of all requested fixtures |
| 13 Report/publish | work/board-v8/REPORT.md; work/board-v8/screenshots/; existing scripts/publish_build_mirror.py | Week 2 coverage by game/book/timestamp, credits, exact source commits, build provenance, live verification, least-sure requirement |

## Execution sequence
1. Resolve approved-reference access. Complete a visual inventory of table and Expanded artboards; amend this plan if their structure requires it.
2. Inspect the current scheduled capture schema and quota ledger read-only. Build a strictly display-only adapter; never trigger an unscheduled odds capture. Missing qualifying captures remain missing.
3. Implement pure comparison functions and test signs, thresholds, pushes and absent quotes before UI wiring.
4. Implement table, ERROR and ordered expansion; render synthetic edge-case fixtures and actual current data.
5. Verify every numbered requirement individually. Record exact PASS/FAIL/evidence, fix failures, then repeat review. Never call a partial implementation DONE.
6. Commit/push affected source branches to the repository of record, publish only generated output through the approved mirror, verify live source hash and UI, report both source COMMIT lines where both branches changed. If a branch required no change, report its verified current hash explicitly as unchanged.

No model fitting, candidate selection, gate change, frozen artifact rewrite or paid provider call belongs to this display work.
