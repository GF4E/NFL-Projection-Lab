# RF-02C coverage diagnosis

The failed 80% coverage gates reflect **coverage above the nominal 80%, not undercoverage**, for home, away and margin across all four full models. All observed rates still pass the separate 72–88% range gate. Total coverage uncertainty contains 80% for every model and block length. N0 shares the pattern; this is not unique to enhanced Elo.

Development: 2013–2024, 3,135 common games. Bounds are the frozen clustered 95% intervals; widths are mean integer upper-minus-lower points. Bias is predicted minus observed.

| Model / target | Coverage | Bounds: block 1 / 3 / 6 | Width | Bias | Mean-calibration slope |
|---|---:|---|---:|---:|---:|
| N0 home | 83.19% | 81.37–84.97 / 81.50–84.88 / 81.70–84.92% | 25.84 | +0.031 | 1.377 |
| N0 away | 83.70% | 82.00–85.33 / 82.08–85.37 / 82.25–85.55% | 25.29 | -0.157 | 1.374 |
| N0 margin | 84.37% | 82.24–86.45 / 82.42–86.55 / 82.53–86.66% | 37.15 | +0.188 | 1.636 |
| N0 total | 81.24% | 79.46–82.95 / 79.38–82.72 / 79.78–82.87% | 34.93 | -0.127 | 0.979 |
| S1 home | 82.87% | 81.09–84.64 / 81.13–84.49 / 81.26–84.42% | 25.88 | -0.024 | 1.069 |
| S1 away | 83.86% | 82.17–85.45 / 82.36–85.39 / 82.50–85.49% | 25.30 | -0.142 | 0.930 |
| S1 margin | 84.21% | 82.39–85.95 / 82.72–86.11 / 82.96–86.19% | 37.17 | +0.118 | 1.003 |
| S1 total | 79.84% | 78.04–81.56 / 78.12–81.42 / 78.35–81.79% | 34.98 | -0.165 | 0.267 |
| E1 home | 83.29% | 81.38–85.25 / 81.47–85.11 / 81.64–85.19% | 25.84 | -0.124 | 1.238 |
| E1 away | 84.08% | 82.37–85.75 / 82.52–85.70 / 82.62–85.81% | 25.32 | -0.042 | 1.069 |
| E1 margin | 84.18% | 81.96–86.31 / 82.11–86.35 / 82.09–86.32% | 37.15 | -0.082 | 1.158 |
| E1 total | 79.87% | 78.06–81.58 / 78.15–81.46 / 78.37–81.81% | 34.99 | -0.165 | 0.267 |
| E2 home | 83.51% | 81.73–85.25 / 81.80–85.17 / 81.83–85.18% | 25.87 | +0.037 | 0.968 |
| E2 away | 84.47% | 82.78–86.08 / 82.87–85.98 / 82.90–86.18% | 25.31 | -0.211 | 0.874 |
| E2 margin | 85.01% | 82.85–87.12 / 83.01–87.24 / 83.09–87.28% | 37.14 | +0.248 | 1.054 |
| E2 total | 80.99% | 79.20–82.74 / 79.33–82.68 / 79.48–82.78% | 34.87 | -0.174 | 0.671 |

## What the failure means

Inclusive integer equal-tailed intervals use L=Q(.1), U=Q(.9), and cover when L≤Y≤U. Their forecast probability is F(U)−F(L−1), generally greater than .8 because boundary scores have probability mass. Consequently, even a calibrated discrete distribution need not produce exactly 80% empirical coverage. The stored aggregate coverage and boundary-distance summaries do not identify the mean forecast probability of these particular intervals, so they cannot separate integer-boundary excess from genuine overdispersion. **Discreteness is a plausible explanation to test, not an established excuse or an authorized nominal correction.**

Randomized PIT accounts for integer outcomes. Near-uniform bins are compatible with aggregate distribution calibration, but do not establish conditional calibration. Margin PIT shows fewer observations in the outer bins and more in central bins, a pattern consistent with overly dispersed margin distributions; bias, heterogeneous forecasts and dependence errors can also matter. Frozen PIT bands adjust across ten bins within each series/target, not across every model/target examined in this diagnosis.

Mean biases are small (all within 0.248 points), but this does not imply useful conditional means. Calibration slopes summarize observed-on-predicted regression, not interval spread: E2 home/away/margin/total slopes are .968/.874/1.054/.671; N0 margin is1.636. These are descriptive estimates without reported slope uncertainty. Widths barely differ across full models; the common coverage failure cannot be attributed to an E2-only interval-width expansion.

## Next smallest useful action

Keep reject_all and every frozen gate. Before selecting new football features, define a bounded, separately recorded diagnostic of each archived interval’s forecast mass F(U)−F(L−1), and compare aggregate realized coverage with those forecast masses under the same clustered evaluation. Include the randomized PIT evidence and fixed interval widths; do not use the result to rewrite RF-02C acceptance. A future distribution/calibration or Elo enhancement needs a new frozen protocol, training-fold-only estimation, proper-score and mechanism tests, and independent prospective confirmation. Coverage diagnosis cannot rescue E2’s separate effect-size, paired-uncertainty or defense-mechanism failures, and says nothing about beating external models by5%.

Alignment: the previous turn produced a complete independently audited negative result. Diagnosing the shared distribution/coverage issue is a narrower and more informative next step than adding features indiscriminately. No model/distribution fit, scoring replay, tuning, threshold change or new corrective nominal level occurred here.

Archived PIT band exclusions (zero-based bins): E2 margin, block1: [9]; E2 margin, block3: [9]; E2 margin, block6: [9]. Other inspected bins include0.1.
