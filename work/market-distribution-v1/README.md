# Empirical market distribution v1

The [experiment](experiment.json) pins the nflverse source, both target sample sizes and histograms, code hashes, board result and verification. No Odds API calls were made. The schedule field sign convention follows [nflverse documentation](https://raw.githubusercontent.com/nflverse/nfldata/master/DATASETS.md).

Half-point residuals are retained exactly in `exact_residual_counts`. The integer PMFs use nearest-integer bins, halves away from zero, without smoothing. Consensus centers are rounded by the same rule before translation; impossible negative totals accumulate at zero. This explicitly introduces quantization, so the PMFs are not exact unrounded residual distributions. No historical performance or superiority claim is made.

```python
from engine.market_distribution import forecast
model = forecast(consensus_spread=-3, consensus_total=45)
model.margin.cdf(3)
model.total.cdf(45)
model.spread(-2.5)       # win, push, loss, conditional_win
model.spread(3, home=False)
model.totals(45.5, over=False)
model.moneyline()       # tie is push for two-way moneyline
model.teaser(-8, home=True)
```

`model_fair_probability` is conditional on no push for two-way markets; `model_win_probability` and `model_push_probability` retain unconditional mass. `filter_source` identifies which probability-and-edge pair qualified. Props are explicitly unsupported by the model. Wong flags mark eligible offered handicaps, not a recommendation or a ticket joint probability.

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```

Offline replay of the named immutable capture set, using this commit and pinned model:
```sh
/opt/anaconda3/bin/python3.12 -B scripts/week1_pricing.py --manifest work/week1-followups-v1/combined-manifest.json
```

Grade after final results are available (replace the example paths):
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.market_distribution --grade \
  --t60 outputs/week1-t60/GROUP/T60-pricing.csv \
  --results results.csv --picks outputs/week1-pricing/pick_log.csv \
  --closing closing-pricing.csv --output outputs/grades/UNIQUE_RUN
```

Results CSV requires `event_id,home_score,away_score,status` with `status=final`. Closing CSV uses pricing columns including quote ID, event ID, book, market, player, side, line, book fair probability, quote update and kickoff timestamps. Omit `--closing` to report unavailable CLV explicitly. No provider is called. Supply the paper log in a separate grading run; record classes are preserved. Picks must reference the supplied frozen T60 quote and exact price/line/book. Closing cents compare the actual entry price against devigged closing fair price at the same line; no points-CLV proxy is invented. The close must follow approval and fall within ten minutes before kickoff.

Outputs are immutable `pick_clv.csv`, event/target `interval_coverage.csv`, and a hashed-input receipt with aggregate central equal-tail coverage. Intervals use discrete quantiles at 50%, 80%, 95%; ties and overtime are retained in final scores. Conflicting event forecasts, late T60 data, altered model artifacts/code, and training-season grades fail closed. Current CLI evidence is synthetic only; no Week 1 grade has been fabricated.
