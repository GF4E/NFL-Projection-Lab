GAME CARD v3, FINAL. This supersedes every earlier board, card, layout, WHY, and confidence-mapping instruction, including the one you are partway through. Read all sections before writing code. Write `work/game-card-v3/PLAN.md` listing each numbered requirement with the file that satisfies it before implementing; the DONE report links that plan. Before the DONE report, ask yourself whether each numbered requirement is met exactly as written; if any is not, fix it and ask again.

## A. Purpose

Every game shows three stated picks: WINNER, SPREAD, TOTAL. Each carries a probability, a source, the best executable book and price in small type, and a WHY written as football. Picks are always stated; a coin flip shows 50% and says so. Gabe and Jarrett decide together; the site never names either person. The language is "our lean", "our number", "our wager".

## B. Data contract (`board.json`, one object per game)

Every field present or explicitly null, never missing.

B1. `game_id`, `week`, `season`, `kickoff_utc`, `home`, `away`, `venue`, `roof`, `status` in {UPCOMING, LOCKED, FINAL, MISSED}, `final` {home_score, away_score, margin, total} or null.
B2. `market`: consensus devigged `spread`, `total`, `home_win_prob`, capture time; per-book best line and price for each side of spread, total, moneyline; teaser near-miss fields.
B3. `model`: `model-pick-v1` spread and total: side, line, book, price, fair_probability, EV, edge_source in {price, tiebreak}.
B4. `rules`: fired registered rules with pick, probability, rule id; or empty.
B5. `ours`: one shared entry: spread, total, confidence 1 to 5, tags, entered_at; or null. `post_lock` boolean.
B6. `sheet`: Iron Man blocks as built (4, 6, 7, 9, 10 now; others as they land), each with values, ranks, sample sizes, and a `measured` flag.
B7. `wagers`: our ingested wagers for this game, or empty.
B8. `grades`: WINNER, SPREAD, TOTAL each WIN, LOSS, PUSH, NOT_RECORDED, or null; `clv` or null.
B9. `version`, `freeze_timestamp`, `distribution_hash`.

The card renders from this object only. The site computes nothing.

## C. Pick logic (engine side, unit tested)

C1. WINNER probability: market `home_win_prob`, replaced by the probability implied by `ours.spread` through the pinned empirical margin distribution when `ours` exists and `post_lock` is false.
C2. SPREAD precedence: (1) `ours` exists: our side, probability from the pinned distribution centered on our spread at the best executable line, source OURS, size from confidence; (2) fired rule: rule pick and probability, source RULE; (3) `model.edge_source = price`: model pick and fair_probability, source MODEL; (4) otherwise market side with the better price, 50%, source MARKET, subtitle "coin flip".
C3. TOTAL: identical to C2 with totals.
C4. `confidence_source` in {MARKET, MODEL, RULE, OURS}. Exactly one per tile.
C5. Book and price = best executable book (BetMGM, Caesars, DraftKings, FanDuel) for the picked side at the last capture.
C6. Grades: WINNER on final score; SPREAD and TOTAL on the tile's stated line and price at LOCKED; CLV against nflverse close; unchanged grading job.
C7. At T-75 tile values freeze. A number entered after lock is stored with `post_lock = true` and changes nothing on the tile.
C8. A tile with no locked pick under the version that issued the game shows NOT_RECORDED, is excluded from every record line and the scorecard, and is never derived after the fact. SEA: all three NOT_RECORDED, our wager PUSH retained. SF: WINNER NOT_RECORDED, SPREAD WIN, TOTAL LOSS, our wager LOSS retained.

## D. WHY generator, football only (engine side, deterministic)

The WHY answers one question: why lean toward this team, and why are we comfortable with it. No prices, books, break-even, EV, cushion, key-number arithmetic, line movement, or filter language anywhere in the WHY. That material lives only in the tile's small book-and-price line and the expanded analytics.

D1. Sources, in priority order: (1) our entered tags and text, verbatim, first; (2) Block 7 QB: starter, EPA per dropback, CPOE, backup flag; (3) Block 6 matchups: largest rank gaps among rush O vs rush D, pass O vs pass D, pressure generated vs allowed, explosive rate; the QB support and pressure-vs-explosive lines; (4) Block 4 efficiency: EPA per play and points per drive, offense and defense, opponent-adjusted; (5) Block 9 momentum: roll index, components, regression base rate with sample size; (6) Block 10 scoring composition: luck index and its driving components; (7) Block 3 continuity and coaching once built; (8) weather only when a rule fires or wind exceeds 10 mph; (9) situational: rest, travel, divisional, home/road split.
D2. Output: a two-sentence lean statement, then three to five bullets. Sentence one names the team and the single strongest football reason. Sentence two names the single strongest counter-reason from the same sources. Bullets are one line each, under 100 characters, each citing the field and its value or rank, written as football ("PIT pass rush 3rd in pressure rate vs ATL line 27th in pressure allowed").
D3. Source MARKET: the lean statement says the market favors that side; the bullets still describe the football matchup so the reader can decide whether to agree.
D4. Source OURS: the lean statement is written from our tags; bullets support or challenge it from the sheet; one bullet marked "Against:" is always present.
D5. No bullet from a field with `measured = false`. No padding: fewer than three bullets if fewer exist.
D6. Tests: no WHY output contains "price", "book", "cents", "break-even", "EV", "cushion", "reference", "filter", "stale", "Jarrett", "Gabe", or a dollar sign; identical input yields identical output; our tags appear first when present; an "Against:" bullet appears whenever `ours` exists.

## E. Visual specification

E1. Tokens: background #0B0F14; surface #121820; text #F2F4F7; muted #8B95A5; accent gold #D4AF37 for actions, the WIN chip, focus; LOSS #E5484D; PUSH and NOT_RECORDED #8B95A5; team colors from the existing asset set, used only in the winner bar and logo ring. Existing site sans; numerals tabular.
E2. Card anatomy, fixed order:
   1. Header, 56px: away logo 32px, away code, "at", home logo 32px, home code; right: status chip UPCOMING with kickoff local, LOCKED with freeze time, FINAL with score, MISSED as a small grey chip only.
   2. Winner bar, 40px, full width, split at WINNER probability, away color left, home color right, 28px numerals at each end, favored side bold.
   3. Three verdict tiles, equal columns, minimum 104px: label 11px uppercase muted; pick 22px bold ("PIT", "PIT -6", "UNDER 41.5"); confidence ring 44px with percentage; source label 11px; book and price 12px muted; grade chip 18px when graded; NOT_RECORDED tiles show that text in muted 14px and nothing else.
   4. WHY: lean statement 15px, then bullets 14px, 4px leading.
   5. Our wager line when present, 13px muted: "Our wager · LA -3 -120 · LOSS".
   6. Footer, 11px muted: version short hash, freeze time, expand affordance.
E3. Expanded state: full Iron Man sheet in spec order; our-number entry (one spread, one total, one confidence 1 to 5, one tag set, one submit; no per-person fields); analytics including the price panel and consensus line; the "choose another side or book" selector and "add to slip" control live here, never on the card.
E4. Grid: one card per row under 640px, two from 640px, three from 1024px; card max width 420px in multi-column; padding 16px; radius 12px; no horizontal scroll at 360px.
E5. Week header: week selector; four record lines MODEL, PRICE, RULES, OURS; scorecard link. Nothing else.
E6. Motion: ring fill 400ms on mount; grade chip scale 200ms; nothing else.
E7. Accessibility: contrast at least 4.5:1 on every text/surface pair; logo alt text; tiles keyboard focusable; probability present as text for screen readers.
E8. Headlines never read STALE or MISSED; those are chips only.
E9. No personal name appears anywhere on the site. Replace every "Jarrett" with "Our wager" or "our lean". Pick-log source value `ours` for wagers and leans. Scorecard record line OURS.

## F. Confidence mapping, one shared map

F1. `config/confidence_map.json`, provisional v1: 1 = 0.52, 2 = 0.55, 3 = 0.58, 4 = 0.62, 5 = 0.66. One map, not per person.
F2. Nothing derived from the map is displayed until 50 graded leans exist; until then the scorecard shows hit rate by confidence level only.
F3. From 50 leans: two Brier columns, one against the map, one against the probability implied by our number's gap to market; weekly recompute of the map as a Beta posterior per level with the provisional value as prior mean and prior weight 20, versioned, observed rate shown beside provisional.
F4. Flag CONFLICT when the gap-implied probability sits more than one level from the stated confidence; log it; from 50 leans report whether confidence or number predicted better.

## G. States (each renders and is snapshot-tested)

G1. UPCOMING, no number, no rule, no edge: three tiles at market, coin flip labels on SPREAD and TOTAL.
G2. UPCOMING with our number.
G3. UPCOMING with a fired rule on TOTAL.
G4. LOCKED.
G5. FINAL with all three grades and CLV.
G6. FINAL with NOT_RECORDED tiles (SEA and SF patterns from C8).
G7. MISSED.
G8. FINAL with our wager line.

## H. Tests and acceptance

H1. Engine unit tests for C1 to C8, including post-lock immutability and NOT_RECORDED exclusion from records.
H2. WHY tests per D6.
H3. Snapshot tests for G1 to G8 at 390px and 1280px, committed.
H4. Playwright screenshots of one UPCOMING and one FINAL card at both widths; paths in the report.
H5. Contrast script passes for every token pair used.
H6. Existing tests pass; no data path removed.
H7. Acceptance: open the Week 1 board; every locked game shows three stated picks with probability and source; SEA and SF render per C8; no headline reads STALE or MISSED; no personal name appears; no WHY contains a banned string.

Push both branches. Report both COMMIT lines, the plan path, the screenshot paths, and one line naming the requirement you were least sure you met and what you changed because of it.