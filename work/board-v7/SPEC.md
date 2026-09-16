BOARD v7. Single, final display specification. Supersedes BOARD v4, v5, v6, GAME CARD v3, and every prior tile, winner-bar, card, WHY-placement and after-action instruction. Engine specifications (PROJECTION ENGINE v1 and v2, ADDENDUM 1 and its supplements, governance and the experiment queue), chronology, immutability, and the no-market rule are unchanged and govern what the display receives. Write work/board-v7/PLAN.md mapping each numbered requirement to its file before implementing. Before the DONE report, ask whether each requirement is met exactly as written; if not, fix and ask again.

## 1. Purpose and scope
The site shows two things: our projection of each team's points before the game, and how far off we were after it. It does not help us choose bets. We do that ourselves.

Absent from every state and from the DOM: bet slips, offers, book selectors, prices, odds, EV, break-even, key-number math, filters, verdicts labeled PLAY, PASS or TEASE, wager rows, market or consensus lines, verdict tile trios, winner bars, and personal names. Every displayed number is an integer. The string "coin flip" never appears.

## 2. One board, one week, two lenses
There is one board per week. Every game in that week is one row, in schedule order, whatever its status. A row changes as its game does: UPCOMING, LOCKED, FINAL, or MISSED. Games do not move to another page when they finish.

A toggle at the top switches the whole board between two lenses over the same rows, same order, same colors, same widths:
- POINTS: each team on a 0 to 45 points axis. This is the default in every state, all week.
- ERROR: each team's observed minus expected on a -30 to +30 axis.
The toggle is manual only. The lens never changes on its own. Toggling never reorders rows or changes what a color means. In ERROR, a game not yet played renders as an empty lane with a muted "not played" label at centre; a game with no lock renders as an empty lane with a muted "no lock" label. Neither ever renders as zero or as an error of any size.

## 3. Tokens and type
Ground #0B0F14; text #F2F4F7; secondary #A7B0BE; muted #6B7483; hairline rgba(242,244,247,0.12); accent gold #D4AF37 for focus and affordances only; team colors from the existing asset set, used only for dots and interval bands, never for reading text. Display face for team codes and projected integers; mono with tabular figures for every other number; quiet sans for prose. Spacing scale, the only permitted values: 4, 8, 12, 16, 24, 40, 64. Radius 4 on bands and chips, none on rows. No shadows, gradients, or card backgrounds.

## 4. Row anatomy, POINTS lens
Shared axis 0 to 45 for every row on the board, gridlines at 10, 20, 30, 40, numeric labels once at the top. Axis column pixel width identical in every row. A value above 45 pins at the edge with its number shown.

Columns: team block 200px, axis flexible, readout 140px. Height 64px desktop.
Team block: away over home, 20px logo and code each; beneath, kickoff local time for UPCOMING, freeze time for LOCKED, "FINAL 27-7" for FINAL, or a small grey "no lock" chip for MISSED.
Axis: two lanes, away at the top. Each team gets a 50% interval band in team color at 35% opacity, a 6px dot at projected points, and the projected integer immediately right of the dot, never above or below. For FINAL rows, add an open 5px ring at actual points and a neutral hairline connector from dot to ring, solid when the observed landed inside the 80% interval, dashed when outside, with the signed error in mono beside the ring.
Readout, right aligned, mono: projected margin as "BAL by 5"; projected total; winner probability as an integer percent. For FINAL rows the readout replaces winner probability with "in 50%", "in 80%", or "outside 80%".

## 5. Row anatomy, ERROR lens
Shared axis -30 to +30, zero at centre with a vertical rule, gridlines at -20, -10, +10, +20, labels once at the top. Behind every row, two fixed shaded bands drawn from the engine's current interval widths: the 50% and the 80%, so calibration is a spatial fact.
Row height 24px, sixteen games on one screen. Team block collapses to the matchup on one line. Two dots per row in team colors at each team's signed error; left of centre means we projected too high. No connectors, rings, or per-dot labels in this lens.
Board footer states the slate's inside-80% count, for example "26 of 32 inside 80%". Unplayed and no-lock games are excluded from that count.

## 6. Sorting
One sort control, applying to both lenses: by kickoff, by absolute error descending, by absolute error ascending. Error sorts place unplayed and no-lock games last in both directions, in kickoff order among themselves. The control is disabled until at least one game in the week is FINAL.

## 7. Expanded row, identical in both lenses
Clicking a row expands it in place; one row open at a time. The expanded area always renders on the POINTS axis regardless of the active lens, so the detail view has one form: expected dot, interval band, observed ring and connector when final, integers, signed error, and interval status. Below it, an asymmetric two-column layout, 60% and 40%, gap 24:
Left: the football WHY, three lines naming the inputs that moved the projection most, in points, in football language, then one line marked "Against:" for the largest input pulling the other way; then our number entry; then the contribution table.
Right: the sheet blocks in engine order; the six-week team trajectory sparklines; the weather block in football language when the game is outdoors; version, freeze time and distribution hash in mono 11 muted.
Collapsed rows contain no WHY text in the DOM.

## 8. Confidence, defined once
Confidence on this site means calibration, never edge. It appears in exactly two places: the winner probability integer in the POINTS readout, which is the engine's probability for that game, and the week header's trust line, which is the engine's interval hit rate this season at the 80% level with its count, for example "80% band: 27 of 34". Nothing else on the site is called confidence.

## 9. Week header
One line: week selector; the trust line from section 8; the lens toggle; the sort control; a link to the Season page. Below it, once, the axis labels for the active lens. Nothing else above the rows.

## 10. Season page
Same tokens, same type, same axis language. Four blocks:
10.1 Convergence: team-points mean absolute error by week this season, with three labeled reference lines, the 2016 to 2025 out-of-fold mean, the climatology baseline, and the predictability floor from the drive-level simulation. The floor line renders even when uncomputed, as a labeled gap.
10.2 Calibration: observed coverage against nominal at 50 and 80 for margin and total, by week and cumulative, with counts, beside a PIT histogram.
10.3 What we got right and what we got wrong, equal space: the five closest team projections and the five furthest, each with its contribution table; for the close ones, name which inputs carried it. A near-hit is studied as hard as a miss.
10.4 Early-season effect: the convergence chart for the prior five seasons overlaid, current season bold.

## 11. Our numbers
One shared edit of the two projected team totals, with confidence 1 to 5 and reason tags. No per-person fields, no names. Edits after the T-75 lock are stored post-lock and change nothing on the locked row. On the Season page our edits are graded on the same suite as the engine and shown beside it: MAE, interval coverage where supplied, and which tags accompanied the best and worst edits. No wager grading, no CLV, no market comparison anywhere on the site.

## 12. Mobile, under 640px
Single column. POINTS rows: team block on one line, axis full width beneath, readout one line under the axis, height 88px. ERROR rows keep 24px and fit sixteen within one scroll. Touch targets at least 44px. No horizontal scroll at 360px.

## 13. Motion and accessibility
Interval bands scale in from the dot over 300ms on first paint, staggered 30ms per row; the lens toggle cross-fades over 200ms without reordering; expansion animates height over 200ms; nothing else moves; respect prefers-reduced-motion. Contrast at least 4.5:1 for all text on its surface. Logos carry alt text. Rows are keyboard focusable with a visible gold focus ring and an aria-label stating the projection in words. Every probability, interval and error exists as text for screen readers.

## 14. Tests
Every marker renders at its actual value on the axis, asserted by comparing pixel position to the value-to-pixel mapping on a fixture of known values; a prior mockup misplaced its markers and this test exists for that reason.
A dot whose error falls outside the 80% band renders outside the shaded region, always.
The lens never changes without a click.
Toggling lenses preserves row order, row identity, and team-color meaning.
An unplayed game and a no-lock game each render their own labeled empty state in ERROR, are excluded from the footer count, and sort last under both error sorts.
The sort control is disabled until at least one game is FINAL.
Sixteen games render without vertical scrolling at 1280 in ERROR and within one scroll at 390.
The footer inside-80% count equals the number of dots inside the outer band.
No element removed in section 1 appears in the DOM in any state; no rendered text contains a book name, price, odds, EV, personal name, or "coin flip"; no rendered number contains a decimal point.
The trust line and every hit-or-miss status derive from the 80% interval and from completed games under the version that issued them, and from nothing else.
Only one row is expanded at a time; the expanded view renders on the POINTS axis in both lenses.
The best-and-worst block renders five each or states how many exist.
Snapshots at 390 and 1280 for: POINTS row upcoming, POINTS row final, ERROR slate, expanded row, Season page.

## 15. Report
Both COMMIT lines, the plan path, screenshots of the POINTS board, the ERROR board, an expanded row and the Season page at 390 and 1280, and one line naming the requirement you were least sure of and what you changed because of it.