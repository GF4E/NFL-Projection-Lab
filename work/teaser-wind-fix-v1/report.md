# Teaser prices and wind repair — September 11, 2026

All counts, forecasts, prices and validation results below are recorded in [experiment.json](experiment.json).

Friday failed before requesting forecast values: component feeds advertised different completed run times. The repair requests an exact common archived run and labels a conservative availability upper bound; it retains the replication delay. See [Open-Meteo updates](https://open-meteo.com/en/docs/model-updates) and [Single Runs](https://open-meteo.com/en/docs/single-runs-api).

Eight upcoming outdoor forecasts succeeded. Seven Sunday games are outside the wind band; Monday DEN/KC is currently inside it. These are forecasts, not observed outcomes or newly locked paper bets. Dome and unknown-roof games remain ineligible. Saturday noon PT (September 12, 19:00 UTC) dispatch and stored-forecast evaluation passed the offline check; that future execution is not yet observed. Only T75 locks enter scoring.

| Sunday game | Kickoff-hour wind mph | WIND RULE |
|---|---:|---|
| ATL at PIT | 6.5 | No |
| CHI at CAR | 2.7 | No |
| CLE at JAX | 3.2 | No |
| DAL at NYG | 3.1 | No |
| NYJ at TEN | 2.3 | No |
| TB at CIN | 4.8 | No |
| WAS at PHI | 6.5 | No |

Forecasts requested September 11 at 21:01 UTC, from the 12 UTC GFS initialization. Per-game hashes and timestamps are in [wind-table.csv](wind-table.csv).

| Posted six-point reference | Two legs | Three legs | Qualification |
|---|---:|---:|---|
| [betmgm](https://sports.betmgm.com/en/blog/nfl-betting-predictions-my-5-favorite-week-1-teaser-legs/) | -130 | 160 | BetMGM operator article, published September 2023; still posted; account ticket may differ |
| [williamhill_us](https://www.caesars.com/content/dam/uin/house-rules/uin-winners-circle-house-rules.pdf) | -120 | 160 | Indiana rules dated 2022-04-29, currently posted; jurisdiction-specific reference, not a verified Tennessee account price |
| [fanduel](https://www.fanduel.com/fanduel-sportsbook-house-rules-in) | Unknown | Unknown | Rules state fixed payout chart; no numeric six-point chart posted here |
| [draftkings](https://support.draftkings.com/dk/en-us/what-is-a-teaser?id=kb_article_view&sysparm_article=KB0010765) | -135 | 140 | Current official football six-point chart; account ticket may differ |

These are dated posted references, not verified account ticket prices. FanDuel is blank. BetMGM and Caesars sources predate this season and have explicit scope warnings. The board shows near misses; TEASE requires a qualifying leg at the book and two-leg odds at least -110. Config content/hash is retained with future locks.

Validation: 151 engine tests passed; 255 reader tests passed, one skipped; both production builds and main typecheck passed. All 14 frozen source hashes and existing picks are unchanged. Odds API credits spent: zero; 56 remain in Week 1.
