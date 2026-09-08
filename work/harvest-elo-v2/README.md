# Harvest v2: executable Elo and rolling-ANY/A comparisons

[Experiment](run-2/experiment.json) · [paired losses](run-2/paired-losses.csv) · [protocol](protocol.json) · [QB history](qb/qb-history.csv) · [QB hashes](qb/receipt.json).

All reported numerical results below come from the linked experiment. Lower CRPS is better. Samples cover regular-season games from 2016 through 2025, with explicit paired populations.

| Comparison | paired_n | Candidate CRPS | Reference CRPS |
|---|---:|---:|---:|
| plain_margin vs market_margin | 2639 | 7.355387 | 7.095248 |
| plain_margin vs nfelo_margin | 946 | 7.218105 | 7.012362 |
| anya_margin vs market_margin | 2639 | 7.321725 | 7.095248 |
| anya_margin vs nfelo_margin | 946 | 7.167691 | 7.012362 |
| companion_total vs market_total | 2639 | 7.789375 | 7.391504 |

Both Elo candidates fail the user-updated rule: margin must improve and total must not worsen against the empirical market comparator. Live artifacts are unchanged. The single totals companion is shared by both candidates; it is not a native Elo totals forecast.

The plain port uses published K=20, HFA=65, and one-third seasonal reversion. Historical MIT Elo scores initialize the pre-2015 state; nflverse results drive updates from 2015 onward. Forecasts for a whole week precede that week's updates. CRPS residual shapes are fixed before each evaluation season using 2015 through the previous season; the live all-years artifact is never evaluated in-sample.

QB identification uses the passer with the most official attempts per team-game from nflverse PBP. Sacks are excluded from attempts but included in ANY/A; nullified plays and two-point attempts are excluded. Ties break by player ID and are flagged. There were no missing passer-ID plays in this capture, and all replay games have QB rows; see the QB receipt and experiment for counts.

Rolling ANY/A pools numerator and denominator across the previous ten player appearances. The team baseline pools the previous ten team-games. The entire target week is excluded. A new passer gets a flagged prior-league pooled estimate from the preceding 256 team-games. The conversion is fixed before comparison: 25 Elo points per ANY/A unit above the team baseline, applied home-minus-away. It is a local untuned proxy, not the full 538 QB estimator.

[ANY/A](https://www.pro-football-reference.com/about/glossary.htm) and [538 VALUE](https://fivethirtyeight.com/methodology/how-our-nfl-predictions-work/) are different constructions. ANY/A uses adjusted net passing yards per dropback; VALUE includes completions, attempts, rushing and other weighted terms. No result here is called a reproduction of 538 VALUE. The user-requested most-attempts starter identity is reconstructed using the target game; only the numerical strength estimate is lagged. This does not establish that the starter was knowable at T60.

Totals use the prior-season empirical market-total residual shape centered on the previous 256 completed regular-season games' league mean, excluding the current week. The same companion is scored for both Elo candidates. nfelo has no total series; only its margin is compared, using its own prior-season residual wrapper. Duplicate nfelo game IDs are excluded, and its 2021 start delays shape calibration. Every nfelo comparison is `DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST`.

## Offline replay

```sh
/opt/anaconda3/bin/python3.12 -B -m engine.qb_history --manifest work/harvest-elo-v2/sources/manifest.json --output work/harvest-elo-v2/qb
/opt/anaconda3/bin/python3.12 -B -m engine.harvest --harvest elo-anya-v2 --output work/harvest-elo-v2/run-2
```

Both commands reproduce existing immutable artifacts or reject differing bytes. Raw PBP, the derived table and source receipts are hash-pinned. No Odds API calls are made. The separate capture script was used once to download the free nflverse releases; replay does not run it.

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```
