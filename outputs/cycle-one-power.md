# Cycle-one Step 1: power sensitivity

Status: COMPLETE. The smallest qualifying planning endpoint is **3 seasons**. This meets the Step 1 continuation rule only. Stop here before the paid pilot. [Experiment result](../work/cycle-one-power-v1/result.json)

The market baseline is absent from the saved scorecard. Status: `MARKET_BASELINE_PENDING_STEP_3`. The family is N0 across margin and total, with Bonferroni alpha 0.025 per target. Tier A remains backlogged. [Frozen registration](../work/cycle-one-power-v1/experiment.json)

## Endpoint calculation

The table reports joint power for both target lower bounds to exceed 5% when true gain is 7.5%. Each cell uses 1,000 outer trials; all block choices must reach 80%. Every value below is from the [experiment result](../work/cycle-one-power-v1/result.json).

| Seasons | 1-week blocks | 3-week blocks | 6-week blocks |
|---|---:|---:|---:|
| 1 | 23.7% | 26.6% | 27.8% |
| 2 | 66.9% | 66.0% | 71.1% |
| 3 | 85.7% | 84.1% | 87.8% |

## Interpretation and limits

The full result covers true gains 0%, 1%, 2.5%, 5%, 7.5% and 10%, and reports lower-bound diagnostics above 0%, 1% and 5%. The 1% diagnostic does not test the other development gates. A zero-gain simulation is not a parity test: market losses and a declared parity tolerance are still absent. [Result and limitations](../work/cycle-one-power-v1/result.json)

The simulation scales saved E3 losses as a dependence template against saved N0 losses. It does not refit, rescore, accept or reinterpret E3. Paired season and circular-week draws keep both targets and all games in each week together. An independent archive-calibration bank supplies basic-bound error quantiles. These are conditional planning estimates, not nested re-estimation of uncertainty in each hypothetical trial, and not a guarantee of prospective power. [Registered method](../work/cycle-one-power-v1/experiment.json)

The source population is the saved development slice. All original source hashes were verified before and after. Exact replay passed. No provider calls or model fits occurred. [Verification](../work/cycle-one-power-v1/verification.json)

## Commands

Run from the repository root. The replay requires the original read-only archive at the paths pinned in the experiment record and the pinned local Python/NumPy environment.

Verification:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p test_cycle_one_power.py
```

Replay the named immutable experiment without overwriting it:
```sh
/opt/anaconda3/bin/python3.12 -B scripts/cycle_one_power.py replay --experiment cycle-one-power-v1
```

## Next-step decisions

Before Step 2: select the sharp reference book, reconcile the pilot against the monthly allocation, and explicitly approve spending. No additional step or paid call is authorized by this result.
