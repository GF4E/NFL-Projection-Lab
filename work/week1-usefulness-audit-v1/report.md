# Week 1 usefulness audit — September 12, 2026

**Orientation: useful with limits. Price comparison: useful at the recorded time, with an exact-line check. Actual bet execution: not sufficiently verified from these inputs.**

Numerical source: [experiment.json](experiment.json), with [verification](verification.json). This is an audit of saved evidence, not a fresh odds capture. No bets were placed or sent. No production artifacts, locks, gates, or historical decisions were changed.

## What this engine adds

The engine translates market prices into an empirical distribution, estimates push probability, compares offered lines and prices, and preserves a pick for later grading. It is a market-based pricing and logging system. It does not currently supply a promoted independent football forecast. Main selections do not use Elo, QB, or weather adjustments. The separate wind paper rule remains a research hypothesis.

For each complete bookmaker pair, it power-devigs the prices and inversely finds an integer distribution location. The reference is half the retail median and half Pinnacle when both exist. Each execution book is excluded from its own reference. Every qualifying offer receives a conditional non-push probability and push-aware EV; the maximum-EV offer wins, even when its EV is negative. The strict PLAY filter is then applied.

`price` can mean better line geometry, not positive expected return. `tiebreak` can label a unique maximum-EV selection with no favorable price or line; it does not always mean a literal random draw. Only equal-EV choices use the recorded deterministic seed. The audit distinguishes those cases.

TEASE requires qualifying leg geometry and a dated qualifying ticket-price reference. It does not establish positive ticket EV. A near-miss teaser notice can name the opposite leg from the selected straight pick. Neither a straight selection nor a teaser candidate is automatically a recommended wager.

## Trace and freshness

The website returned CURRENT and all 16 Week 1 game records match the saved board exactly. All 28 remaining live selections reproduce from the captured bookmaker responses. The 14 frozen runtime file hashes match. [Website check](website-check.json), [selection trace](live-trace.csv).

Friday quotes were received September 11 at 11:33:08 PT (18:33:08 UTC). They are not current executable prices. The saved capture contains BetMGM, DraftKings, FanDuel, and Pinnacle; it contains no Caesars quote pairs. The screenshots are treated as Caesars from user context, but their bookmaker label, date, and timezone are not visible. Their status-bar times do not establish capture dates. Every screenshot price requires a current Caesars check.

The one-time weather repair happened after the Friday price capture. Forecast issuance, request time, source hashes and kickoff validity are preserved in [weather.csv](weather.csv). These forecasts are pregame evidence, but were not available at that original odds capture. No observed weather is used to justify a lean. Inactives remain unknown.

Of the 28 saved selections, 2 have positive modeled EV, 0 pass the PLAY filter, 18 have a tiebreak label, and 5 involved an actual seeded tie. These are descriptive model outputs, not validated advantages.

## Arithmetic and limitations

37 independent audit checks passed: hand-solvable two-/three-way devig, odds conversion, gate boundaries, total probability, monotone CDF, integer and half-point pushes, mirrored spread settlement, totals, teaser movement, and agreement of CDF and expectation CRPS formulas within 1e-9. Full repository test results are in [verification.json](verification.json). No arithmetic defect required a frozen-code edit.

EV is win_probability × net_decimal_payout − loss_probability; pushes contribute zero. Fair probability and American fair price are conditional on no push. Neither a better headline price nor a probability over one half is sufficient to cover the bookmaker margin. Neutral venues do not receive an extra home adjustment in this market-only location path; settlement is home-score minus away-score, including overtime, as in the existing grade tests.

The empirical artifact was fit on 2015–2025 regular-season residuals, with 2,895 observations per target. Both residuals and the consensus location are rounded onto integer support. That preserves a discrete distribution, but does not establish accurate key-number probabilities conditional on each spread. It can erase small price changes and produce jumps when a consensus center crosses a rounding boundary. The all-offers CSV includes +/-0.5-center sensitivity; these are robustness probes, not new models or recommended alternate picks.

## Predictive evidence

**PREDICTIVE VALUE UNVERIFIED for the exact live selection process.** Its historical paired sample is zero. The saved historical schedules provide reconstructed closing lines, not the timestamped, simultaneous bookmaker pairs required by the live inverse-devig/leave-one-out process. The frozen live shape contains all 2015–2025 results; scoring it on those games would be circular. Therefore no exact-live CRPS or superiority interval is asserted.

The existing prior-season residual baseline can be reproduced honestly: fit only earlier seasons, then score the next season against its reconstructed nflverse market line. Its per-game losses reproduce the saved harvest baseline within numerical tolerance and its coverage reproduces the saved rolling calibration. This is historical market-baseline context, not replacement evidence for the live selections. The live engine and this baseline belong to the same market-only family, so no independent model-versus-itself superiority claim is manufactured.

| Historical baseline target | Games | CRPS, 95% interval | 50% interval coverage | 80% coverage | 95% coverage |
|---|---:|---|---:|---:|---:|
| margin | 2,639 | 7.095 [6.865, 7.312] | 54.23% | 81.77% | 95.60% |
| total | 2,639 | 7.392 [7.230, 7.562] | 53.39% | 82.80% | 95.87% |

Intervals resample whole seasons, preserving dependence within each season: 10,000 replicates over ten evaluation seasons. They are descriptive and do not establish a betting edge. Inclusive discrete intervals can over-cover; both aggregate 50% coverages exceed nominal by more than three percentage points. Seasonal flags and coverage uncertainty intervals are recorded in the experiment; [seasonal table](historical-baseline.csv). Existing rejected harvest decisions and E3 are unchanged.

## Remaining games: exact Caesars screenshot diagnostics

**No informed betting lean / INSUFFICIENT DATA applies to every row below.** Each entry is the less unfavorable of its two screenshot sides under the saved reference, not a recommendation. Every one has negative modeled EV. Direction is market-price-driven; none supplies independent model evidence. Fair probability is conditional on no push. Source is the screenshot image number; quote date/time/timezone are UNKNOWN for all rows. Reference time is Friday 11:33:08 PT.

The strongest reason for each listed side is its higher estimated return than the opposite screenshot side. The counterargument for every row is negative modeled return plus an unmatched screenshot timestamp, absent captured Caesars quotes, and unknown inactives. These per-row reasons and source details are also explicit in [game-table.csv](game-table.csv). All sides, including the less favorable ones, are in [caesars-all-offers.csv](caesars-all-offers.csv).

| Game | Market | Diagnostic side / line | Caesars price | Fair p | Push p | EV | Image |
|---|---|---|---:|---:|---:|---:|---|
| ARI at LAC | spreads | LAC -9.5 | -108 | 50.09% | 0.00% | -3.54% | 1509 |
| ARI at LAC | totals | Under 47.5 | -112 | 50.67% | 0.00% | -4.08% | 1509 |
| ATL at PIT | spreads | ATL +6 | -112 | 51.20% | 2.52% | -3.00% | 1508 |
| ATL at PIT | totals | Over 41 | -112 | 50.78% | 2.87% | -3.77% | 1508 |
| BAL at IND | spreads | IND +3 | -102 | 48.80% | 2.52% | -3.28% | 1508 |
| BAL at IND | totals | Over 47.5 | -117 | 52.19% | 0.00% | -3.20% | 1508 |
| BUF at HOU | spreads | BUF -1.5 | -107 | 49.91% | 0.00% | -3.44% | 1507 |
| BUF at HOU | totals | Over 44.5 | -117 | 52.19% | 0.00% | -3.20% | 1507 |
| CHI at CAR | spreads | CHI -3 | -114 | 51.20% | 2.52% | -3.78% | 1508 |
| CHI at CAR | totals | Over 47 | -113 | 50.78% | 2.87% | -4.15% | 1508 |
| CLE at JAX | spreads | JAX -8.5 | -108 | 50.09% | 0.00% | -3.54% | 1507 |
| CLE at JAX | totals | Over 40 | -120 | 50.78% | 2.87% | -6.70% | 1507 |
| DAL at NYG | spreads | DAL -3 | -107 | 51.20% | 2.52% | -0.92% | 1510 |
| DAL at NYG | totals | Over 48 | -112 | 50.78% | 2.87% | -3.77% | 1510 |
| DEN at KC | spreads | DEN +2.5 | -103 | 49.91% | 0.00% | -1.63% | 1510 |
| DEN at KC | totals | Under 43.5 | -108 | 50.67% | 0.00% | -2.41% | 1510 |
| GB at MIN | spreads | MIN -1.5 | -109 | 50.09% | 0.00% | -3.96% | 1509 |
| GB at MIN | totals | Over 46.5 | -107 | 49.33% | 0.00% | -4.57% | 1509 |
| MIA at LV | spreads | LV -3 | -110 | 52.25% | 4.15% | -0.24% | 1509/1510 |
| MIA at LV | totals | Over 40 | -113 | 50.78% | 2.87% | -4.15% | 1509/1510 |
| NO at DET | spreads | NO +7 | -113 | 51.20% | 2.52% | -3.39% | 1507 |
| NO at DET | totals | Over 49.5 | -117 | 52.19% | 0.00% | -3.20% | 1507 |
| NYJ at TEN | spreads | TEN -1.5 | -109 | 50.09% | 0.00% | -3.96% | 1507 |
| NYJ at TEN | totals | Under 38.5 | -108 | 50.67% | 0.00% | -2.41% | 1507 |
| TB at CIN | spreads | TB +3.5 | -110 | 49.91% | 0.00% | -4.71% | 1508 |
| TB at CIN | totals | Over 50.5 | -106 | 49.33% | 0.00% | -4.14% | 1508 |
| WAS at PHI | spreads | WAS +5.5 | -108 | 49.91% | 0.00% | -3.87% | 1509/1510 |
| WAS at PHI | totals | Under 44 | -107 | 51.13% | 0.90% | -1.07% | 1509/1510 |

## Separate completed-game record

The two graded model picks are SF +3.5 WIN and Over 47.5 LOSS, with descriptive mean nflverse-reference CLV −5.95 cents. These are two markets from one game, not independent evidence of predictive skill. Seattle remains MISSED for the model. Jarrett’s separate executed record is one loss and one push. Neither these results nor the final scores were used to rank the remaining games.

## Jarrett-ready watchlist

**Qualified plays: none from the available Caesars evidence. Tentative betting leans: none sufficiently supported.**

Price checks worth discussing, without treating them as bets:

- **IND +3.5 at DraftKings −115** had estimated EV +1.39% in the Friday capture but did not pass the registered probability band. Your Caesars **IND +3 at −102** loses the half point through three and has estimated EV −3.28%. The earlier DraftKings offer cannot justify the different Caesars wager.
- **LV −3 at Caesars −110** is closest to empirical fair among the screenshots: estimated EV −0.24%, fair price about −109.4. That is near break-even, not a verified edge or a PLAY.
- **DAL −3 at Caesars −107** has estimated EV −0.92%; fair price about −104.9. Again, not a PLAY.
- **DEN/KC under: paper-rule watch only.** Stored kickoff wind is 14.4 mph and passes the stored-forecast checks. That can support the registered paper hypothesis if it remains qualified at lock, not live-money promotion. The screenshot Under 43.5 at −108 has ordinary market-model EV −2.41%. Recheck the forecast, exact consensus total and offered price at the scheduled capture.

All quoted prices above are historical observations. Do not send them as currently available offers. No stakes are inferred.

## Verification and review

```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
/opt/anaconda3/bin/python3.12 -B scripts/week1_usefulness_audit.py --verify
```

The named immutable audit replay is week1-usefulness-audit-v1. It rebuilds the audit outputs offline, reproduces the saved baseline context, and checks byte-for-byte agreement without touching production files. There is no valid replay command for the unavailable exact-live historical comparison.

Least sure: whether a small modeled advantage would survive exact-line and timing checks. I repriced both sides at the screenshot lines, excluded Caesars from the reference, checked half-point center sensitivity, and withheld a betting shortlist after all screenshot returns remained negative. I also separated true seeded ties from the broader tiebreak label.
