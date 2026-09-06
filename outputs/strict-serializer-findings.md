# Serializer experiment findings

The proposed serializer **passed correctness checks but was slower**, so it will not enter the model pipeline.

All 28 tests passed, including exact saved bytes, error behavior, difficult numeric/string inputs, mutation detection and single-call conversion hooks. Independent review verified 171 observations and all 11 corpus inputs. The full experiment took 2.55 seconds / 257.73 MiB.

Across the one fixed comparison, original serialization took 46.92 ms and the candidate 89.98 ms. Its extra validation and formatting work failed the declared efficiency test. These are one-pass observations with order and system-noise limitations, not a universal performance ranking.

Keep the original serializer and the failed experiment's evidence. Next assess whether repeated intermediate comparison work can be simplified while keeping fresh validation and all saved outputs exact. No historical backtest was restarted, and no predictive improvement is claimed. The goal remains active; the public front-page Beta scope is unchanged.

See the [canonical result](/private/tmp/os01-gen15-rebuild.9ny71k/.planning/engine-os/research-first/RF-COMP-05-RESULT.v1.md) and [acceptance record](/private/tmp/os01-gen15-rebuild.9ny71k/.planning/engine-os/research-first/RF-COMP-05-ACCEPTANCE.v1.json).
