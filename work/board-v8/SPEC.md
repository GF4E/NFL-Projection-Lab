BOARD v8. Single, final display specification. Supersedes BOARD v4, v5, v6, v7, GAME CARD v3, and every prior card, tile, lane, winner-bar and after-action instruction. Engine specifications (PROJECTION ENGINE v1 and v2, ADDENDUM 1 and supplements, governance and the experiment queue), chronology, immutability, and the E-UNC findings are unchanged. Write work/board-v8/PLAN.md mapping each numbered requirement to its file before implementing. Run the Tier 1 and Tier 2 gap sweep and publish it; batch Tier 3 items in one message. Before the DONE report, ask whether each requirement is met exactly as written; if not, fix and ask again.

Reference design: the approved artboard "Week board — table" at https://claude.ai/artifact/SdNcayRszVDKsibJ196wjQ, file project/Board-Table.dc.html. Read it with the Artifact tool and match its structure, spacing and type. Where this document and the artboard disagree, this document governs.

## 1. What changed and why
The board becomes a table. Few's test for a table over a chart is that the reader looks up individual values, needs precise numbers, and is working in more than one unit of measure. Points, spread and total are three units. Two lanes of graded error bars per game was a chart doing a table's job. One chart survives, the disagreement bar, because a gap between our number and the book's is better seen than read.

## 2. Market data returns to the display only
The published spread and total from a sportsbook appear on the board for comparison. They never enter the projection, the fit, the assimilation, the ensemble, or any engine artifact. The separation test from PROJECTION ENGINE v1 extends unchanged to every new module: a test fails if anything under the projection package reads a spread, total, consensus, price, odds or Odds API field. Book values live in a display-only table joined to the board at render time and are hashed and versioned like any other source.

Source: the existing Odds API capture, Caesars first, BetMGM as fallback, labeled with the book actually shown. Capture at the existing cadence inside the existing 60-credit weekly cap. When no qualifying book value exists for a game, the two book columns and both lean columns read an em dash and the row still renders.

## 3. Layout, desktop
One table, one row per game, in schedule order, 42px per row, a single hairline between rows, no vertical rules, no card, no fill. Column widths in pixels, left to right, with fixed spacers:

MATCHUP 152 left · OUR SCORE 86 right · spacer 26 · OUR SPREAD 86 right · BOOK 86 right · spacer 14 · DISAGREEMENT 96 centered · LEAN 72 right · spacer 26 · TOTAL 52 right · BOOK 56 right · LEAN 96 right · spacer 24 · RESULT 270 left.

Header row: 9px mono, 0.09em letter-spacing, muted, one hairline beneath at 20% opacity. The two book columns carry the book's name, not the word "book".

## 4. Cell contents
MATCHUP: away code, the word "at" in 11px muted mono, home code. Codes are 14px sans.
OUR SCORE: our projected away and home points as integers separated by an en dash.
OUR SPREAD: our projected margin expressed on the favorite, for example "SEA -1". Home favored when the projected margin is zero.
BOOK: the published spread expressed the same way, in secondary color so ours reads first.
DISAGREEMENT: a centered micro bar, 96px wide, zero at centre, scale ±8 points, filling left when we favor the away side relative to the book and right when we favor the home side. The bar is white at full opacity when the gap is 2 points or more and muted at 55% below that. No color coding.
LEAN: the team we lean toward and the size of the gap, white at 2 points or more, muted below, em dash under 0.5.
TOTAL: our projected total as an integer. BOOK: the published total. LEAN: the word OVER or UNDER and the size of the gap, same emphasis rule, em dash under 0.5.
RESULT: before the game, the kickoff time with its zone stated as ET. After the game, the final score in 13px mono followed in muted 11px by which side covered the published spread and whether the total went OVER or UNDER with the actual total.

## 5. Winner highlighting, two mechanisms
Projected winner: that team's code in 700 weight, white. The other code in 500 weight, muted.
Actual winner: that team's code set in an inverted chip, white background, ground-colored text, 4px radius, 2px by 7px padding.
The two mechanisms are different on purpose, so a game where they agree reads as a hit at a glance and a game where they differ is unmistakable. A tie sets no chip. A game with no lock sets no bold.

## 6. Key line
Below the table, one line: bold means projected winner, chip means actual winner, lean is shown in white at two points or more, and book numbers are for comparison only and never enter the projection.

## 7. Second lens
The lens toggle keeps two states, SCORES and ERROR, manual only, never switching on its own, and never reordering rows. ERROR renders the error-centered slate already specified: one row per game, observed minus expected for both teams on a shared -30 to +30 axis, zero at centre, 50% and 80% shaded zones behind every row, unplayed games showing "not played" and no-lock games showing "no lock", both excluded from the footer count.

## 8. Expanded row
Clicking a row expands it in place, one at a time, and the expanded view is unchanged from the approved Expanded artboard: a ten-dot quantile dotplot per team with the observed marked as a ring, the win probability stated as a number from the joint margin distribution with the note that it is not read from the dots, then the football WHY with its Against line, our number entry, the contribution table, the sheet blocks, the trajectory sparklines, the weather block for outdoor games, and version and freeze time in muted mono. Collapsed rows carry no WHY text in the DOM.

## 9. Uncertainty language, carried forward from E-UNC
Any interval shown anywhere is labeled with its quantity and level: predictive intervals for a single game at 50% and 80%. Where widths are constant across games, the page says so and says that per-game widths were tested on 2,639 games and rejected. Nothing on the site invites reading a winner from the overlap of two intervals.

## 10. Mobile, under 640px
The table collapses to one block per game, 96px tall. Line one: matchup with both highlight mechanisms intact and the kickoff or final score right-aligned. Line two: our score, our spread, our total, in mono. Line three: the book's spread and total in secondary color with the lean words. Line four when final: covered side and total outcome. No horizontal scroll at 360px. Touch targets at least 44px. The disagreement bar is omitted on mobile; the lean words carry it.

## 11. Tokens
Ground #0B0F14, text #F2F4F7, secondary #A7B0BE, muted #6E7885, hairline rgba(242,244,247,0.09), header rule rgba(242,244,247,0.20), accent gold #D4AF37 for the active toggle and links only. All numbers in mono with tabular figures. All codes in sans. Every displayed number is an integer except spreads and totals, which carry a half point where the book does. Spacing scale 4, 8, 12, 14, 24, 26, 40.

## 12. Tests
The disagreement bar's pixel length equals the value-to-pixel mapping on a fixture of known gaps, and its fill side matches the sign.
The bar and both lean cells are white at a gap of exactly 2.0 and muted at 1.9.
A game with no book value renders em dashes and still renders every other cell.
The projected winner is bold and the actual winner is chipped, verified separately, including the case where they differ and the case of a tie.
Column widths match section 3 exactly in every row, asserted on the rendered DOM.
No projection module reads any spread, total, consensus, price or odds field.
No rendered text contains a personal name or the string "coin flip"; kickoff times always carry ET.
Toggling lenses preserves row order and identity.
Only one row is expanded at a time; collapsed rows contain no WHY text.
Snapshots at 390 and 1280 for: table with finals and upcoming mixed, ERROR slate, expanded row, and a row with no book value.

## 13. Report
Both COMMIT lines, the plan path, the gap sweep, screenshots of the table and the expanded row at 390 and 1280, the book coverage rate for Week 2 by game, credits spent, and one line naming the requirement you were least sure of and what you changed because of it.