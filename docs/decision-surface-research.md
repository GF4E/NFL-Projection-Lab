# Decision-surface research

Updated 2026-08-12. This is an internal product note; it is not rendered in the application.

## Patterns worth keeping

- Lead with executable contracts and line shopping. Unabated's game odds screen centers book comparison, a vig-free reference line, and direct comparison of differently priced contracts: https://unabated.com/videos/learn-about-the-game-odds-screen
- Put signals behind the selected market rather than in a separate research workflow. Action Network's Matchup PRO report toggles spread, total, and moneyline while showing the active signals for that market: https://actionnetworkhq.zendesk.com/hc/en-us/articles/14474947004173-Matchup-PRO-Report
- Show projected spreads/totals and line movement near the live market, but keep expert prose secondary: https://www.actionnetwork.com/general/action-pro-picks-tools-projections
- Pair efficiency with success rate and explosive-play rate. EPA alone can obscure whether an offense is consistently efficient or dependent on a few large plays: https://www.pff.com/news/nfl-explosive-plays-and-re-thinking-offensive-success
- Treat props as price-distribution problems, not player takes. Unabated describes converting projections into distributions and point-by-point fair prices: https://unabated.com/articles/your-next-steps-with-unabated

## Product translation

- The sportsbook grid remains the primary surface.
- `Picks` is the only expansion point. It contains the best side signal, teaser legs/pairs, confirmed +EV props, compact rolling matchup evidence, and open-to-now spread movement.
- Matchup evidence is capped at three signals and uses leakage-safe rolling 17-game ranks. It does not present unverified narrative conclusions.
- A teaser pair is surfaced only when two different games at the same book have non-negative empirical expected value at the displayed price. Betting against Seattle or Atlanta requires at least 5% expected value.
- A prop is surfaced only when at least three other books quote the identical player, side, and point, its median no-vig consensus implies at least 2% EV, and the lower consensus bound remains positive.

## Deliberate exclusions

- No public-ticket or public-money percentages without a source whose sampling and timestamps can be audited.
- No trend-system badges based on arbitrary historical filters.
- No bankroll widget on the weekly screen.
- No separate research tab, permanent methodology panel, or prose-heavy handicap.
