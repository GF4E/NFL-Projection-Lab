# Decision-surface research

Updated 2026-08-13. This is an internal product note; it is not rendered in the application.

## Patterns worth keeping

- Lead with executable contracts and line shopping. Unabated's game odds screen centers book comparison, a vig-free reference line, and direct comparison of differently priced contracts: https://unabated.com/videos/learn-about-the-game-odds-screen
- Put signals behind the selected market rather than in a separate research workflow. Action Network's Matchup PRO report toggles spread, total, and moneyline while showing the active signals for that market: https://actionnetworkhq.zendesk.com/hc/en-us/articles/14474947004173-Matchup-PRO-Report
- Show projected spreads/totals and line movement near the live market, but keep expert prose secondary: https://www.actionnetwork.com/general/action-pro-picks-tools-projections
- Pair efficiency with success rate and explosive-play rate. EPA alone can obscure whether an offense is consistently efficient or dependent on a few large plays: https://www.pff.com/news/nfl-explosive-plays-and-re-thinking-offensive-success
- Treat props as price-distribution problems, not player takes. Unabated describes converting projections into distributions and point-by-point fair prices: https://unabated.com/articles/your-next-steps-with-unabated
- Keep a prop's projection, cover probability, recent hit rate, matchup context, edge, and best available price on one scan surface. PFF's 2026 player-prop product uses those primitives and ranks by cover probability, edge, hit rate, or vig: https://www.pff.com/betting/player-props
- Keep exact-price value and the statistic that supports or challenges it in the same decision card. Unabated's odds screen elevates the best line, synthetic hold, fair line, and projected edge together; it also uses change highlighting to preserve movement context: https://www.unabated.com/articles/learn-about-the-game-odds-screen
- Label edge as a price comparison rather than a win prediction. PFF makes this distinction explicitly, and Action Network likewise places its model line, market line, grade, edge, and best odds in the same row: https://www.pff.com/news/pff-player-prop-tool-is-now-live-on-web-for-pff-subscribers and https://www.actionnetwork.com/projections/
- Expect prop market coverage to change as kickoff approaches. The Odds API documents that event market keys appear as books open markets; the app therefore reports the actual scan/gate state rather than showing an empty recommendation as a negative conclusion: https://the-odds-api.com/liveapi/guides/v4/

## Product translation

- The sportsbook grid remains the primary surface.
- `Analyze` is the only expansion point. It contains the best exact-price mainline contracts, teaser legs/pairs, confirmed +EV props, compact rolling matchup evidence, and material open-to-now movement.
- Each exact mainline recommendation carries up to two contract-relevant statistics and plain-language fragments directly beneath its probability and EV. Hover text is supplementary, not the only way to read the evidence.
- The best exact contract also shows the other execution book's raw point/price, its EV at that contract, and the equivalent-risk cent gap only after both prices have been translated to the same canonical point. This keeps line shopping visible without ever comparing mismatched raw points.
- Matchup evidence is capped at three signals and uses leakage-safe rolling 17-game ranks. It does not present unverified narrative conclusions.
- Evidence is capped only after the exact contract is selected. Side/moneyline decisions consider team-direction signals; total decisions consider pace and pass-environment signals. This prevents unrelated high-strength metrics from crowding a relevant statistic off the card.
- A teaser pair is surfaced only when two different games at the same book have non-negative empirical expected value at the displayed price. Betting against Seattle or Atlanta requires at least 5% expected value.
- The `WONG` label is reserved for the classic six-point +1.5 to +2.5 and -7.5 to -8.5 paths; other combinations must earn space from the decay-weighted margin distribution. The pair exposes both its screening price and maximum play-to price because the payout, not the label, determines whether the teaser retains value: https://unabated.com/articles/profitable-nfl-teaser-bets
- A prop is surfaced only when at least three other books quote the identical player, side, and point, its median no-vig consensus implies at least 2% EV, and the lower consensus bound remains positive.
- The prop card distinguishes four states: not scanned, prices stale, prices posted but availability pending, and fully eligible. It never labels an unscanned market as though no +EV prop exists.
- A teaser pair shows the screening price assumption, estimated EV at that price, maximum playable price, crossed key numbers, and uncertainty-backed units. A positive hypothetical pair is not represented as a live book offer.
- Book coverage is stated beside the active snapshot and beneath an incomplete market heading. A missing price therefore reads as “not posted by this book,” not “the model has no opinion.”
- A manually selected straight remains available for comparison, but its slip row states whether it clears the current 80% uncertainty and 0.5u Kelly gates. The shared-card action stays disabled when any straight is below the floor or lacks a supported model probability, matching the authoritative server approval boundary before the user clicks approve.
- A five-contract weekly scan queue sits above the sportsbook grid. It is only a ranked view of the existing exact-price engine: one best side and one best total thesis per game, clear uncertainty intervals first, and the existing Seattle/Atlanta exception rule unchanged. Selecting an item loads its exact book contract into the straight slip.
- The shared slip shows official weekly units used and the proposed post-approval total. It checks the entire proposed batch against the 10u week, 3u game, one-side, and one-total constraints before approval; settled picks remain part of the original week's allocation rather than reopening capacity after the result is known.
- `Paper` versus `Cash` is part of the immutable two-person revision. Paper approval first re-prices the same thesis at both execution books and, when a strictly higher-EV supported contract exists, refreshes the slip without approving it. The changed book, point, and price therefore receive a fresh human review. Cash approval requires the second teammate to confirm placement at the frozen contract; the application never places it.

## Deliberate exclusions

- No public-ticket or public-money percentages without a source whose sampling and timestamps can be audited.
- No trend-system badges based on arbitrary historical filters.
- No bankroll widget on the weekly screen.
- No separate research tab, permanent methodology panel, or prose-heavy handicap.
- No duplicate global week/matchup banner above the live board; the schedule-backed Week heading is the only source of truth.
