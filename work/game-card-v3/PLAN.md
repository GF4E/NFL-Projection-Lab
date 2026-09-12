# Game Card v3 FINAL implementation plan

Final user specification: SPEC-final.md. This revision precedes implementation of the final changes. Earlier incomplete card code is superseded; historical evidence stays intact.

| Requirement | Implementation | Verification |
|---|---|---|
| B1 | engine/game_card_v3.py; engine/game_card_runtime.py | `game_id`, `week`, `season`, `kickoff_utc`, `home`, `away`, `venue`, `roof`, `status` in {UPCOMING, LOCKED, FI |
| B2 | engine/game_card_v3.py; engine/game_card_runtime.py | `market`: consensus devigged `spread`, `total`, `home_win_prob`, capture time; per-book best line and price fo |
| B3 | engine/game_card_v3.py; engine/game_card_runtime.py | `model`: `model-pick-v1` spread and total: side, line, book, price, fair_probability, EV, edge_source in {pric |
| B4 | engine/game_card_v3.py; engine/game_card_runtime.py | `rules`: fired registered rules with pick, probability, rule id; or empty. |
| B5 | engine/game_card_v3.py; engine/game_card_runtime.py | `ours`: one shared entry: spread, total, confidence 1 to 5, tags, entered_at; or null. `post_lock` boolean. |
| B6 | engine/game_card_v3.py; engine/game_card_runtime.py | `sheet`: Iron Man blocks as built (4, 6, 7, 9, 10 now; others as they land), each with values, ranks, sample s |
| B7 | engine/game_card_v3.py; engine/game_card_runtime.py | `wagers`: our ingested wagers for this game, or empty. |
| B8 | engine/game_card_v3.py; engine/game_card_runtime.py | `grades`: WINNER, SPREAD, TOTAL each WIN, LOSS, PUSH, NOT_RECORDED, or null; `clv` or null. |
| B9 | engine/game_card_v3.py; engine/game_card_runtime.py | `version`, `freeze_timestamp`, `distribution_hash`. |
| C1 | engine/game_card_v3.py; engine/game_card_runtime.py | WINNER probability: market `home_win_prob`, replaced by the probability implied by `ours.spread` through the p |
| C2 | engine/game_card_v3.py; engine/game_card_runtime.py | SPREAD precedence: (1) `ours` exists: our side, probability from the pinned distribution centered on our sprea |
| C3 | engine/game_card_v3.py; engine/game_card_runtime.py | TOTAL: identical to C2 with totals. |
| C4 | engine/game_card_v3.py; engine/game_card_runtime.py | `confidence_source` in {MARKET, MODEL, RULE, OURS}. Exactly one per tile. |
| C5 | engine/game_card_v3.py; engine/game_card_runtime.py | Book and price = best executable book (BetMGM, Caesars, DraftKings, FanDuel) for the picked side at the last c |
| C6 | engine/game_card_v3.py; engine/game_card_runtime.py | Grades: WINNER on final score; SPREAD and TOTAL on the tile's stated line and price at LOCKED; CLV against nfl |
| C7 | engine/game_card_v3.py; engine/game_card_runtime.py | At T-75 tile values freeze. A number entered after lock is stored with `post_lock = true` and changes nothing  |
| C8 | engine/game_card_v3.py; engine/game_card_runtime.py | A tile with no locked pick under the version that issued the game shows NOT_RECORDED, is excluded from every r |
| D1 | engine/game_card_why.py | Sources, in priority order: (1) our entered tags and text, verbatim, first; (2) Block 7 QB: starter, EPA per d |
| D2 | engine/game_card_why.py | Output: a two-sentence lean statement, then three to five bullets. Sentence one names the team and the single  |
| D3 | engine/game_card_why.py | Source MARKET: the lean statement says the market favors that side; the bullets still describe the football ma |
| D4 | engine/game_card_why.py | Source OURS: the lean statement is written from our tags; bullets support or challenge it from the sheet; one  |
| D5 | engine/game_card_why.py | No bullet from a field with `measured = false`. No padding: fewer than three bullets if fewer exist. |
| D6 | engine/game_card_why.py | Tests: no WHY output contains "price", "book", "cents", "break-even", "EV", "cushion", "reference", "filter",  |
| E1 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | Tokens: background #0B0F14; surface #121820; text #F2F4F7; muted #8B95A5; accent gold #D4AF37 for actions, the |
| E2 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | Card anatomy, fixed order: |
| E3 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | Expanded state: full Iron Man sheet in spec order; our-number entry (one spread, one total, one confidence 1 t |
| E4 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | Grid: one card per row under 640px, two from 640px, three from 1024px; card max width 420px in multi-column; p |
| E5 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | Week header: week selector; four record lines MODEL, PRICE, RULES, OURS; scorecard link. Nothing else. |
| E6 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | Motion: ring fill 400ms on mount; grade chip scale 200ms; nothing else. |
| E7 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | Accessibility: contrast at least 4.5:1 on every text/surface pair; logo alt text; tiles keyboard focusable; pr |
| E8 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | Headlines never read STALE or MISSED; those are chips only. |
| E9 | reader src/components/game-card-v3.tsx; game-card-board.tsx; styles/game-card-v3.css; server/shared-display.ts | No personal name appears anywhere on the site. Replace every "Jarrett" with "Our wager" or "our lean". Pick-lo |
| F1 | engine/shared_confidence.py; config/confidence_map.json | `config/confidence_map.json`, provisional v1: 1 = 0.52, 2 = 0.55, 3 = 0.58, 4 = 0.62, 5 = 0.66. One map, not p |
| F2 | engine/shared_confidence.py; config/confidence_map.json | Nothing derived from the map is displayed until 50 graded leans exist; until then the scorecard shows hit rate |
| F3 | engine/shared_confidence.py; config/confidence_map.json | From 50 leans: two Brier columns, one against the map, one against the probability implied by our number's gap |
| F4 | engine/shared_confidence.py; config/confidence_map.json | Flag CONFLICT when the gap-implied probability sits more than one level from the stated confidence; log it; fr |
| G1 | reader tests/game-card-v3.test.tsx; committed snapshots | UPCOMING, no number, no rule, no edge: three tiles at market, coin flip labels on SPREAD and TOTAL. |
| G2 | reader tests/game-card-v3.test.tsx; committed snapshots | UPCOMING with our number. |
| G3 | reader tests/game-card-v3.test.tsx; committed snapshots | UPCOMING with a fired rule on TOTAL. |
| G4 | reader tests/game-card-v3.test.tsx; committed snapshots | LOCKED. |
| G5 | reader tests/game-card-v3.test.tsx; committed snapshots | FINAL with all three grades and CLV. |
| G6 | reader tests/game-card-v3.test.tsx; committed snapshots | FINAL with NOT_RECORDED tiles (SEA and SF patterns from C8). |
| G7 | reader tests/game-card-v3.test.tsx; committed snapshots | MISSED. |
| G8 | reader tests/game-card-v3.test.tsx; committed snapshots | FINAL with our wager line. |
| H1 | tests/test_week1_game_card_v3.py; tests/test_week1_shared_confidence.py; reader tests; scripts/check-game-card-contrast.mjs; work/game-card-v3/screenshots/ | Engine unit tests for C1 to C8, including post-lock immutability and NOT_RECORDED exclusion from records. |
| H2 | tests/test_week1_game_card_v3.py; tests/test_week1_shared_confidence.py; reader tests; scripts/check-game-card-contrast.mjs; work/game-card-v3/screenshots/ | WHY tests per D6. |
| H3 | tests/test_week1_game_card_v3.py; tests/test_week1_shared_confidence.py; reader tests; scripts/check-game-card-contrast.mjs; work/game-card-v3/screenshots/ | Snapshot tests for G1 to G8 at 390px and 1280px, committed. |
| H4 | tests/test_week1_game_card_v3.py; tests/test_week1_shared_confidence.py; reader tests; scripts/check-game-card-contrast.mjs; work/game-card-v3/screenshots/ | Playwright screenshots of one UPCOMING and one FINAL card at both widths; paths in the report. |
| H5 | tests/test_week1_game_card_v3.py; tests/test_week1_shared_confidence.py; reader tests; scripts/check-game-card-contrast.mjs; work/game-card-v3/screenshots/ | Contrast script passes for every token pair used. |
| H6 | tests/test_week1_game_card_v3.py; tests/test_week1_shared_confidence.py; reader tests; scripts/check-game-card-contrast.mjs; work/game-card-v3/screenshots/ | Existing tests pass; no data path removed. |
| H7 | tests/test_week1_game_card_v3.py; tests/test_week1_shared_confidence.py; reader tests; scripts/check-game-card-contrast.mjs; work/game-card-v3/screenshots/ | Acceptance: open the Week 1 board; every locked game shows three stated picks with probability and source; SEA |

## Sequence
1. Replace the engine adapter and WHY with the final shared contract; add the shared confidence ledger and versioning without rewriting historical locks.
2. Replace the reader entry endpoint and form, records and all visible personal-name labels. Render only engine values.
3. Test precedence, lock preservation, missing-record exclusion, football WHY, confidence thresholds and weekly updates; capture all eight render states at both sizes.
4. Publish offline, test existing suites/builds, push both branches and deploy Sites. Verify live cards and capture screenshots.
5. Audit each numbered requirement against evidence before DONE.

## Resolved implementation boundaries
- NOT_RECORDED supersedes small N/R for missing tiles. SEA all three absent; SF winner absent, existing spread WIN and total LOSS retained.
- Missing moneyline quotes remain null. Winner probability can be published without inventing a book price.
- New shared entries accept football tags/text only. A prohibited financial or personal-name string is rejected, preserving accepted text verbatim. Existing unqualified fields cannot create WHY bullets.
- When no measured counter-reason exists, state its absence; never fabricate opposition or pad bullets.
- Wager/lean current guide sources become ours through a canonical projection; frozen source ledgers remain unchanged.
- No Odds API calls or model-gate changes.

## Immediate final display amendment

The later direct request supersedes B2/C5/E2/E3 display requirements: retain quote fields in engine evidence, but no bookmaker, odds price, EV, break-even, movement, or book selector is rendered. The only line beneath picks is the consensus: Line: HOME handicap · Total total. Section D football WHY appears only with existing measured sheet blocks. The removal was committed first: main 9e274da and engine-v2 8065ff4.

## Completion evidence

B1–B9, C1–C8, D1–D6, E1–E9 (with immediate display amendment), F1–F4, G1–G8 and H1–H7 are implemented. `experiment.json`, `live-readback.json`, `rendered-readback.json`, `verification/` and `screenshots/` hold the checks. Missing historical tiles stay NOT_RECORDED; future scheduled locks remain prospective. No book-level detail is rendered. Snapshot coverage is synthetic; live screenshot coverage includes the existing FINAL and UPCOMING states.
