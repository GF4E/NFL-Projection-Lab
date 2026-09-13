PROJECTION ENGINE v1, FINAL. Supersedes every earlier instruction on projections, team totals, tiles, sources, confidence, the your-number entry, and the WHY. Read all of it. Write `work/projection-v1/PLAN.md` mapping each numbered requirement to the file that satisfies it before implementing. Before the DONE report, ask whether every requirement is met exactly as written; if not, fix and ask again.

## 1. Definition

A raw prediction engine. For every game it projects each team's points from football inputs only, fit to actual scores. No sportsbook line, consensus, price, odds, or Odds API artifact enters the projection, the card, or the projection's grading. We compare the projection to the market ourselves, off the site.

## 2. Inputs, per team, in our handicapping order

Sources: nflverse play-by-play, schedules, rosters, depth charts, injuries, officials, NGS; Open-Meteo for wind; `config/staff_history.json` and `config/stadiums.json` in the repo. Season-to-date blended with last season on a linear decay through Week 5; this season only from Week 6. Every input carries the hash of the file it came from. Garbage time excluded: fourth-quarter plays with win probability outside 5% to 95%; the filter is written into the experiment record.

1. Venue: home or away; home field advantage estimated from our own data, split divisional and non-divisional.
2. Divisional flag.
3. Head-to-head continuity: last ten meetings, each weighted by the share of head coach, OC, DC, QB1, GM, and roster still in place. Zero weight until `staff_history.json` is seeded; the slot exists now.
4. Efficiency: opponent-adjusted offensive points per drive and yards per play; opponent-adjusted defensive points allowed per drive and yards allowed per play; pace as drives per game and plays per drive. Adjustment by ridge on the team-game incidence matrix.
5. Kicking: FG% by distance band, season and career.
6. Matchups: rush EPA and success rate offense vs opponent rush defense; pass EPA and CPOE vs opponent pass defense; pressure rate generated vs allowed; explosive play rate offense vs defense.
7. Quarterback: starter EPA per dropback, CPOE, career starts, backup flag; TE and RB target shares.
8. Referee crew: slot exists, zero weight until the Week 5 study logs positive.
9. Momentum: roll index, last four games z-scores of yards per play, points scored, and points allowed against the team's own blended baseline.
10. Scoring composition: red zone TD rate, points from defense and special teams, FG share of points, turnover margin, fumble recovery rate, close-game record; combined luck index.
11. Elo: 538 Elo with the ANY/A QB adjustment from `engine/elo.py`, pre-game rating for each team and the rating difference, preseason reversion one third toward 1505.
12. Strength of schedule to date, opponent-adjusted.
13. Pythagorean expected win rate from points for and against, exponent 2.37.
14. Rest days since last game and travel distance from `stadiums.json`.
15. Wind at kickoff hour from the stored forecast, outdoor venues only.

## 3. Method

1. Baseline for each offense: adjusted points per drive against the opposing adjusted defensive points per drive, times expected drives from both teams' pace.
2. Ridge regression on 2016 to 2025, 2015 as warmup, rolling-origin by season, target = actual team points, features = the baseline plus every input in section 2 as points-scale terms. Momentum, luck, Elo, and all other weights are fit, never assumed. Penalty and decay selected on earlier out-of-fold seasons only; frozen after selection; recorded with hashes.
3. Outputs per game: projected away points, projected home points, projected margin, projected total, and the contribution of every input to each team's number in points, ranked by absolute size.
4. Version string `projection-v1-<feature_hash>-<fit_hash>`. Any change to inputs, method, or settings creates v2. Picks and grades stay under the version that issued them.

## 4. Uncertainty

1. Out-of-fold residuals for team points, margin, and total, 2016 to 2025, kept as empirical integer distributions with mass at every integer, pinned by hash. These are the only source of any probability or interval.
2. Winner probability = P(projected margin distribution > 0), pushes at zero split evenly.
3. Intervals at 50% and 80% for margin and total from the same distributions.
4. Coverage at 50 and 80 by season is computed and reported. A season outside ±3 points of nominal is flagged.

## 5. Our edit

The your-number entry is an edit of the two projected team totals. When edited, margin, total, winner probability, and intervals recompute from our numbers using the same residual distributions, and the source reads OURS. Confidence 1 to 5 and reason tags stay. Edits after the T-75 lock are stored post-lock and change nothing on the locked tile. One shared entry, no names.

## 6. Card

1. Header: logos, codes, kickoff local, status chip UPCOMING / LOCKED / FINAL with score / MISSED as a small grey chip. Never STALE or MISSED as a headline.
2. Winner bar: split at winner probability in team colors, 28px numerals.
3. Line under the bar: "Projected: BAL 24.1 · IND 21.9". When edited: "Ours: BAL 27 · IND 21" as a second line, Projected retained.
4. Three tiles: WINNER (team, ring at winner probability); MARGIN (projected margin, "likely 4 to 10" from the 80% interval, "most likely 5 to 8" from the 50%); TOTAL (projected total with the same two intervals). Source label PROJECTION or OURS. No other ring.
5. WHY: three lines, the inputs that moved the projection most, in points, in football language ("BAL run game 4th vs IND run defense 18th: +2.1"), then one "Against:" line for the largest input pulling the other way. Never a price, book, line, odds, EV, break-even, or movement. Never a personal name.
6. After the final: score, actual margin and total beside projected, error in points, and whether the actual fell inside the 50% and 80% intervals.
7. Tokens, grid, motion, accessibility from GAME CARD v3 FINAL unchanged.

## 7. Grading

PROJECTION and OURS are graded on accuracy only: mean absolute error for team points, margin, and total; residual sigma; interval coverage at 50 and 80; by week and by season; separately for PROJECTION and OURS. Week header shows both. Our ingested wagers keep their existing line-based grading, untouched, separate, and off the card.

## 8. Tests

1. Hand-solvable case: two teams with known per-drive numbers and pace reproduce the baseline to three decimals.
2. Contributions sum to the projection for every game.
3. Separation test: a test fails if any file under `engine/projection/` or any card component imports or reads a field named `spread_line`, `total_line`, `consensus`, `market`, `odds`, `price`, or any Odds API artifact.
4. Residual distributions sum to one and carry integer mass.
5. A season with coverage outside ±3 is flagged in the report.
6. Post-lock edit changes nothing on the locked tile.
7. Reordering training rows and re-running produce identical projections.
8. Snapshot tests: projection only, with our edit, FINAL with errors and interval hits.
9. Acceptance: every Week 2 game shows projected team totals, the three tiles sourced PROJECTION, and a football WHY with an Against line; both Week 1 finals show actual beside projected with errors; the per-season residual, sigma, and coverage tables are in the report.

## 9. Report

Both COMMIT lines, the plan path, the per-season MAE, sigma, and coverage tables, the BAL at IND card screenshot at 390px and 1280px, and one line naming the requirement you were least sure of and what you changed because of it.