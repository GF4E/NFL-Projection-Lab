# Game Card v3 implementation plan

Source: supplied GAME CARD v3 request, saved as SPEC.md beside this plan.
This plan was written before implementation. Status starts PLANNED, not satisfied.

## Implementation boundary

New `game_card_v3` presentation/selection artifact alongside the existing model record. Preserve model-pick-v1 outputs, historical locks, original grading evidence and registered betting gates. No Odds API calls in this build. New card locks cannot be fabricated for completed or MISSED games. Site renders engine-produced values only. Both reader branches publish the same components.

An explicit user decision is pending on G6: SEA has no original winner/total lock. SF also has no original winner projection. Proposed treatment: SEA FINAL with its recorded executed spread PUSH and missing original tile grades explicitly not recorded; SF FINAL with spread WIN, total LOSS, and winner not recorded. No retrospective invention.

## Requirement-to-file map

| Requirement | File(s) that will satisfy it | Verification |
|---|---|---|
| A | engine/game_card_v3.py; reader src/components/game-card-v3.tsx | Three named tiles; source and probability present or explicitly unavailable |
| B1 | engine/game_card_v3.py | Contract completeness, statuses, finals |
| B2 | engine/game_card_v3.py | Capture-backed consensus and all book/market sides; unavailable moneyline null |
| B3 | engine/game_card_v3.py | Original model output preserved in DTO |
| B4 | engine/game_card_v3.py | Registered fired rules only |
| B5 | engine/game_card_v3.py; existing suit number store | Hidden entries, disagreement, null handling |
| B6 | engine/game_card_v3.py; engine/suit_publish.py | Existing named blocks, ranks and sample sizes |
| B7 | engine/game_card_v3.py | Existing executed records |
| B8 | engine/game_card_v3.py; existing grading outputs | Original grades only; missing lock remains unknown |
| B9 | engine/game_card_v3.py | Version, freeze and distribution hash |
| C1 | engine/game_card_v3.py | Winner probability from eligible human numbers or market |
| C2 | engine/game_card_v3.py | Spread precedence and source selection |
| C3 | engine/game_card_v3.py | Total precedence and source selection |
| C4 | engine/game_card_v3.py | Exactly one allowed source per tile |
| C5 | engine/game_card_v3.py | Best captured executable offer for selected side; no invented price |
| C6 | engine/game_card_v3.py; existing grade adapters | Grade locked selection at frozen line; no retrospective grades |
| C7 | engine/game_card_v3.py; existing suit lock store | T75 freeze and POST_LOCK exclusion |
| D1 | engine/game_card_why.py | Measured-field templates and magnitude |
| D2 | engine/game_card_why.py | Top three; human first; under 90 characters; values at end |
| D3 | engine/game_card_why.py | No padding; MEASURE/UNMEASURED excluded |
| D4 | tests/test_week1_game_card_v3.py | Determinism and human/unknown cases |
| E1 | reader src/components/game-card-v3.tsx; reader src/styles/game-card-v3.css | Exact tokens, limited gold/team colors, tabular numerals |
| E2 | reader src/components/game-card-v3.tsx | Header, winner bar, tiles, WHY, wager, footer in order |
| E3 | reader src/components/game-card-v3.tsx; existing suit entry component | Sheet blocks, independent numbers, analysis and notes |
| E4 | reader src/styles/game-card-v3.css | 360/390/1280 widths, 1/2/3 columns, max420, no horizontal overflow |
| E5 | reader src/components/game-card-board.tsx | Week selector, requested four record groups, scorecard link |
| E6 | reader src/styles/game-card-v3.css | Only ring and grade animations; reduced-motion support |
| E7 | reader scripts/check-game-card-contrast.mjs; components | Contrast, alt text, keyboard, accessible probabilities |
| E8 | reader src/components/game-card-v3.tsx | Status only in chips |
| F1 | reader tests/game-card-v3.test.tsx; fixtures | Market-only upcoming |
| F2 | reader tests/game-card-v3.test.tsx; fixtures | One human |
| F3 | reader tests/game-card-v3.test.tsx; fixtures | Both same side |
| F4 | reader tests/game-card-v3.test.tsx; fixtures | PASS_DISAGREE |
| F5 | reader tests/game-card-v3.test.tsx; fixtures | Total rule |
| F6 | reader tests/game-card-v3.test.tsx; fixtures | Locked |
| F7 | reader tests/game-card-v3.test.tsx; fixtures | Final, three grades, CLV |
| F8 | reader tests/game-card-v3.test.tsx; fixtures | Missed, no invented historical pick |
| F9 | reader tests/game-card-v3.test.tsx; fixtures | Final with executed wager |
| G1 | tests/test_week1_game_card_v3.py | C1-C7 including POST_LOCK |
| G2 | reader tests/game-card-v3.test.tsx; committed snapshots | F1-F9 at390 and1280 |
| G3 | work/game-card-v3/screenshots/ | Upcoming/final each at390 and1280 via browser screenshot |
| G4 | reader scripts/check-game-card-contrast.mjs | Every actual text/background pair |
| G5 | existing engine and reader tests | Full required suites and both builds |
| G6 | work/game-card-v3/experiment.json | Deployed Week1 against artifact; SEA exception needs decision |

## Execution sequence

1. Inspect current captures, moneyline availability, suit data, number hiding and grading/lock stores. Resolve contractual contradictions without inventing inputs.
2. Implement engine DTO, deterministic precedence and WHY; test pure behavior and lock preservation.
3. Implement shared reader cards and existing number-entry integration; snapshot all nine states and contrast checks.
4. Publish artifacts offline, verify original records unchanged; build both readers.
5. Push engine-v2 and main, publish Sites, inspect actual upcoming/final cards at both widths, commit verification evidence.
6. Audit every numbered row above and record PASS/BLOCKED with evidence before DONE.

## Readiness findings before implementation

- Confirmed from the current artifact: SEA final SEA13–NE10, model lock MISSED, no original model selections or winner projection. Executed Seattle−3 is a separate wager record.
- Confirmed: SF final SF27–LA7, original spread SF+3.5 WIN and Over47.5 LOSS; original winner projection not recorded.
- Latest raw capture contains spreads and totals only. B2 moneyline prices must remain explicitly null until a qualifying scheduled source exists; C5 cannot invent an executable moneyline quote.
- Existing Iron Man sheet is Week2. Week1 sheet values need an eligible Week1 preparation, not relabeling Week2 data.
- Supplied text tokens pass 4.5:1 against both supplied dark surfaces; team winner-bar colors still need per-team text contrast checks.
- No implementation code or live data has been changed in this readiness pass. Final G6 acceptance is blocked on the historical exception requested from Gabe.
