# NFL engine: timing-study findings

Private research update, September 6, 2026.

The bounded study completed in **3.04 seconds / 293 MiB**. Both runs reproduced all **92 saved rows and 62 resolved distributions** exactly. Independent review confirmed all 88 callbacks per run and all 208 extra interval-mass checks.

Repeated JSON formatting is the strongest lead for the next optimization. The profiler identified 557 calls outside the model callbacks, accounting for about 66% of its measured remaining time. However, profiling increased the whole path time by 2.34×, so that percentage is a clue—not an achievable savings estimate.

Next, test a narrowly supported serializer that produces exactly the original bytes and falls back to the original behavior elsewhere. Preserve fresh validation, source authentication, state comparisons and every saved-output check. No serializer candidate or historical rerun is accepted yet.

The two-target fixture excludes annual selection, full source admission and large histories. It does not establish that the complete backtest fits the two-hour limit or that predictions improved. The enhanced-Elo, external 5% and prospective targets remain unmet. See the [updated goal](updated-goal.md) and [preceding cost-stop findings](controller-integration-findings.md).
