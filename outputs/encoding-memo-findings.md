# NFL engine: encoding reuse findings

Private research update, September 6, 2026.

The per-fit encoding cache passed **21 focused tests**, including deliberately corrupted reconstructions, and all **168 saved observations** matched accepted original forecasts and scores. Independent numerical review and the root check are complete; acceptance is limited to exactness and a pilot-like synthetic lead.

| Mode | Pilot-like fit + score maxima | Reduction from same-run original |
|---|---:|---:|
| Original | 10.270125 ms | 0.00% |
| Probability shortcuts | 6.769291 ms | 34.09% |
| Probability shortcuts + scoped encoding reuse | 6.385751 ms | 37.82% |

The composed candidate is **1.075741 ms below** the fixed **7.461492 ms** synthetic comparison target. The incremental improvement over the probability shortcuts is **5.67%** in the sum of maxima; fitting maxima fall **23.98%**. The broader stress sum is **11.904209 ms**, still above that target.

The unchanged probability-only control also falls below the absolute target in this process, although it missed in the previous experiment. That demonstrates timing variation: the crossing cannot be attributed entirely to the new cache. The combined 37.82% same-run reduction is also a different comparison from the historical 52.47% requirement. These findings are a limited computational lead, not proof that a complete historical run fits the budget.

The cache reuses original JSON bytes only after comparing every bit of freshly reconstructed float values. All three hash computations, independent parameter reconstruction, six moment computations and the complete descriptor roundtrip remain. Tests verified changed alpha, signed zero, corrupted hashes/rates/moments, unsupported inputs, exceptions, source isolation and real callback/fallback behavior. The cache is created inside each timed fit and does not change shared globals.

The whole qualification completed in **3.90 seconds / 144.25 MiB**. Original scientific files and prior candidates remain unchanged. Prior probability suites were reused; one independent evidence review supplements the root check, removing a redundant test-author audit.

Next: assess and qualify explicit integration into a separately versioned complete controller. The old historical run stays closed. The enhanced Elo accuracy goal, external **5% predictive improvement**, prospective confirmation and useful tested product remain unmet. Public updates remain limited to the Beta front page. See the [updated goal](updated-goal.md) and [prior experiment](skellam-candidate-findings.md).
