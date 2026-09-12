GAME CARD v3. This supersedes every earlier board or layout instruction. Read all sections before writing code. Do not begin until you have written a short plan file `work/game-card-v3/PLAN.md` listing each numbered requirement below with the file that satisfies it; the DONE report links that plan. Before the DONE report, ask yourself whether each numbered requirement is met exactly as written; if any is not, fix it and ask again.

## A. Purpose

Every game shows three stated picks: WINNER, SPREAD, TOTAL. Each pick carries a probability, a source, the best executable book and price, and a WHY built only from measured fields. Picks are always stated. A coin flip shows 50% and is labeled as such. The card is the product; the grid is the index to it.

## B. Data contract (`board.json`, one object per game)

Fields the card consumes; every one must be present or explicitly null, never missing:

B1. `game_id`, `week`, `season`, `kickoff_utc`, `home`, `away` (team codes), `venue`, `roof`, `status` in {UPCOMING, LOCKED, FINAL, MISSED}, `final` {home_score, away_score, margin, total} or null.
B2. `market`: consensus devigged `spread`, `total`, `home_win_prob`, capture time, per-book best line and price for each side of spread and total and moneyline, teaser near-miss fields.
B3. `model`: `model-pick-v1` output for spread and total: side, line, book, price, fair_probability, EV, edge_source in {price, tiebreak}.
B4. `rules`: list of fired registered rules with pick, probability, and rule id, or empty.
B5. `numbers`: for each of gabe and jarrett: spread, total, confidence 1 to 5, tags, entered_at, or null; plus `both_entered` boolean and `disagreement` in {NONE, SAME_SIDE, OPPOSITE, PASS_DISAGREE}.
B6. `sheet`: the Iron Man blocks that exist (4, 6, 7, 9, 10 now; others as built), each a named object with values, ranks, and sample sizes.
B7. `executed`: Jarrett's ingested wagers for this game or empty.
B8. `grades`: for each of WINNER, SPREAD, TOTAL: WIN, LOSS, PUSH, or null; `clv` cents or null.
B9. `version`, `freeze_timestamp`, `distribution_hash`.

The card renders from this object only. The site computes nothing.

## C. Pick logic (implemented in the engine, output into B, unit tested)

C1. WINNER probability = market home_win_prob adjusted by the human number when one exists: convert the human spread to a win probability through the pinned empirical margin distribution; if both entered, use the mean of the two spreads unless `disagreement = PASS_DISAGREE`, in which case use the market. Source label follows C4.
C2. SPREAD pick precedence: (1) `PASS_DISAGREE`: state the market side with 50% and source MARKET, chip "PASS". (2) Both numbers entered, same side: pick that side, probability from the pinned distribution centered on the mean human spread at the best executable line, source GABE+JARRETT, size from the lower confidence. (3) One number entered: same computation, source GABE or JARRETT. (4) A fired rule: rule pick and probability, source RULE. (5) `model.edge_source = price`: model pick and fair_probability, source MODEL. (6) Otherwise: market side with the better price, 50%, source MARKET, subtitle "coin flip".
C3. TOTAL pick precedence: identical to C2 with totals.
C4. `confidence_source` in {MARKET, MODEL, RULE, GABE, JARRETT, GABE+JARRETT}. Exactly one per tile.
C5. Book and price on each tile = best executable book for the picked side at the last capture; executable means one of BetMGM, Caesars, DraftKings, FanDuel.
C6. Grades: WINNER graded on final score; SPREAD and TOTAL graded on the tile's stated line and price at LOCKED; CLV against nflverse close. Grades come from the existing grading job unchanged.
C7. Locking: at T-75 the tile values freeze; a number entered after the lock is stored as POST_LOCK and does not change the tile.

## D. WHY generator (engine side, deterministic, no free prose)

D1. Candidate lines are produced from templates keyed to sheet fields, each with a magnitude score: rank gap (e.g. "PIT rush offense 4th vs ATL rush defense 29th"), EPA per play differential, QB EPA per dropback gap, roll index and its regression base rate with sample size, luck index components, wind if a rule fired or wind exceeds 10 mph, key-number note when the spread sits on 3 or 7, price note when a book beats consensus by 5 cents or more, and each entered human reason tag with its text.
D2. Show the top three by magnitude, each under 90 characters, each ending with the value in parentheses. Human reasons, when present, always occupy the first line.
D3. If fewer than three candidates exist, show what exists; never pad. Never generate a line from a field marked MEASURE or UNMEASURED.
D4. Unit tests: identical input produces identical lines; a field marked UNMEASURED never appears; a human tag appears first when present.

## E. Visual specification

E1. Tokens: background #0B0F14; surface #121820; text #F2F4F7; muted #8B95A5; accent gold #D4AF37 used only for actions, the WIN chip, and focus states; LOSS #E5484D; PUSH #8B95A5; team colors from the existing asset set, used only in the winner bar and the logo ring. Fonts: existing site sans for body; numerals in tabular figures.
E2. Card anatomy, top to bottom, fixed order:
   1. Header row, 56px: away logo 32px, away code, "at", home logo 32px, home code; right side status chip (UPCOMING with kickoff local time, LOCKED with freeze time, FINAL with score, MISSED as a small grey chip only).
   2. Winner bar, 40px tall, full width, split at WINNER probability, left segment in away color, right in home color, probability numerals 28px at each end, favored side bold.
   3. Verdict tiles, three equal columns, minimum 104px tall each: label 11px uppercase muted; pick in 22px bold ("PIT", "PIT -6", "UNDER 41.5"); confidence ring 44px with percentage inside; source label 11px; book and price 12px; grade chip 18px tall when graded.
   4. WHY, up to three lines, 14px, 4px leading between, numbers in tabular figures.
   5. Jarrett's wager line when present, 13px muted, prefixed by his code.
   6. Footer, 11px muted: version short hash, freeze time, "expand" affordance.
E3. Expanded state below the footer: full Iron Man sheet blocks in spec order, the your-number entry (two hidden inputs, confidence, tags, submit), analysis, notes.
E4. Grid: one card per row on mobile (breakpoint under 640px), two per row from 640px, three from 1024px. Card max width 420px in multi-column. Padding 16px. Radius 12px. No horizontal scroll at 360px width.
E5. Week header above the grid: week selector, four record lines (model, price, rules, humans by person), compact scorecard link. Nothing else.
E6. Motion: ring fills over 400ms on mount; grade chip scales in over 200ms; nothing else animates.
E7. Accessibility: contrast at least 4.5:1 for all text on its surface; logos have alt text; tiles are keyboard focusable; probability also present as text for screen readers.
E8. Headlines never read STALE or MISSED. Those are chips only.

## F. States (each must render and be snapshot-tested)

F1. UPCOMING, no numbers, no rule, no price edge: three tiles at market, 50% coin flip labels on SPREAD and TOTAL, winner bar at market.
F2. UPCOMING with one human number entered.
F3. UPCOMING with both numbers, same side.
F4. UPCOMING with PASS_DISAGREE.
F5. UPCOMING with a fired rule on TOTAL.
F6. LOCKED.
F7. FINAL with all three grades and CLV.
F8. MISSED.
F9. FINAL with a Jarrett wager line.

## G. Tests and acceptance

G1. Engine unit tests for C1 to C7 precedence, including that a POST_LOCK number does not change a locked tile.
G2. Snapshot tests for F1 to F9 at 390px and 1280px, committed.
G3. Playwright screenshots of one UPCOMING and one FINAL card at both widths, paths in the report.
G4. Contrast check script passes for every token pair used.
G5. Existing tests continue to pass; no data path removed.
G6. Acceptance: open the Week 1 board; every game shows three stated picks with probabilities and sources; SEA and SF games show FINAL with grades; no headline reads STALE or MISSED.

Push both branches. Report both COMMIT lines, the plan file path, the screenshot paths, and one line stating which requirement you were least sure you met and what you changed because of it.