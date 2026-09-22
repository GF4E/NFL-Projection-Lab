# Forecast contract evidence, 2026-09-22

DIAGNOSTIC ONLY. The authoritative HFA point series is the control; the adaptive v3 series discussed below is SUPERSEDED and is not a gate control. No candidate was fitted, scored, promoted or rejected in this audit. No issued forecast or distribution changed.

The contract audit is independently implemented in audit_forecast_contract.py using Python's standard library, Decimal rounding and explicit empirical counts. It imports no production forecast, probability, contribution or metric helper. It verifies all captured-file hashes, the registry, fit and residual references, then calculates from the actual selected rows. Re-run with:

```sh
/opt/anaconda3/bin/python3.12 -B work/engine-rebuild/audit_forecast_contract.py --output work/engine-rebuild/forecast-contract-audit.json
```

## Authoritative point evidence

Premise: work/e-elo-hfa-release/deployed-oof-66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f.json; authoritative deployed HFA lineage: yes; registered generation date 2026-09-20 UTC. The current weekly fit differs by its authorized refit; the series represents the method's historical replay, not 2026 as-issued forecasts. Source and calendar qualification remain separately open.

| Independently recomputed quantity | Result |
| --- | ---: |
| Games / team observations | 2,639 / 5,278 |
| Team MAE | 7.575628833271497 |
| Bias, projected minus actual | +0.188862609355690 |
| Projected population SD | 2.934554179081856 |
| Actual population SD | 9.966996619631557 |
| Actual-on-projected slope | 1.011109366410697 |
| Rows containing probability or interval forecasts | 0 |

Annual arithmetic is in forecast-contract-audit.json. The file contains point predictions only: it cannot independently establish historical coverage, CRPS, interval scores or probabilities. Those require their own chronological calibration reconstruction.

## Issuing semantics: verified, with limitations

Captured host evidence is dated 2026-09-22T18:15:51Z, checkout 874561b1beed183fd89b1fa4998aee906443c703. Its active fit is 801ef07927ea59bc112fc955ad86249b981d5e60a0f4a9636f39b2eb23be623f / projection-v2.hfa1.w3. Subsequent prepared-state deployment preserved these numerical inputs and outputs; its separate receipt is host-prepared-verification.json. This audit is not a fresh host deployment claim.

All 48 captured cards reproduce: maximum probability difference 1.11e-16; maximum contribution-sum difference zero. Saved margin/total 50/80 intervals reproduce exactly and nest correctly. Team intervals are derivatives reconstructed from the issuing team residual table; they are not stored in the original projection's interval field. The population is 30 graded AS_ISSUED games, two separately labeled retrospective Week 1 games and 16 upcoming Week 3 games. None are pooled as new prospective evidence.

Current numerical definitions:

- Point forecasts are legacy ridge centers. Point total equals home plus away; point home margin equals home minus away. The release manifest already labels the centers LEGACY_RIDGE_CENTER.
- The empirical distribution shifts integer residual counts by the point center rounded half away from zero. Quantiles use the left inverse of the discrete CDF; interval endpoints are inclusive. There is no smoothing or truncation.
- The field home_win_probability actually equals P(home margin > 0) plus half P(tie). It is a tie-split score, not the strict probability of a home win. Exact strict probabilities and tie masses are retained in the audit. Existing fields and frozen records are unchanged.
- Team errors are pooled for team intervals; margin and total errors are computed from the two teams of each game. No independent-team convolution is present. The three marginal tables do not establish a coherent joint score distribution.

The active calibration is residuals-1c4a9dbd064f55e01cc121231288947da7ebff9cdf6979e93c72bc7d28b5f3ba.json. Its recorded source hash c7f3d226… is the canonical JSON hash of SUPERSEDED adaptive-oof-b7229199…. Independently reconstructed team, paired-margin and paired-total counts match every count exactly. This is verified lineage mismatch, not evidence of its accuracy cost.

| Current residual table | Mean residual, actual minus projection |
| --- | ---: |
| Team points | +1.051535 |
| Home margin | +1.543009 |
| Total | +2.103448 |

For the captured Week 3 slate, team-distribution means exceed the displayed full-precision centers by 0.576–1.545 points; rounding contributes to the range. Twenty-eight of 32 team distributions put positive mass below zero; the maximum is 2.236% for a team. These are invalid score outcomes, preserved as an observed limitation rather than silently clamped. The margin distribution's mean is not the difference of the two team-distribution means. Therefore these marginals cannot currently be claimed to be one coherent joint mean-based forecast. Three of 16 games have a point-score leader differing from the tie-split probability leader. Direction disagreement alone is not proof of error: skewed distributions can produce it legitimately.

Mean and median targets must stay distinct: absolute-error optimization targets a median, squared-error optimization a mean. Keep governed team MAE primary and report RMSE as supporting evidence; neither permits relabeling a legacy center. [Forecast accuracy](https://otexts.com/fpp3/accuracy.html). Probability and interval quality need proper scores, not an assertion that the implementation ran. [Gneiting and Raftery](https://sites.stat.washington.edu/raftery/Research/PDF/Gneiting2007jasa.pdf).

## Public Season verification

Read-only in-app-browser navigation reached https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/season and completed loading. Accessibility inspection and a rendered screenshot showed two convergence points, 30 graded games, 60 PIT scores, Week 2 margin coverage 5/16 and 13/16, total coverage 8/16 and 13/16, closest/furthest five, and the five historical seasons with 90 weekly points. Zero eligible edits have a named shortfall. The initial loading state was not mistaken for an empty publication.

These counts match the September 22 closeout's saved Season artifact. The convergence reference is 7.76127289296137 from the SUPERSEDED adaptive series, rather than the authoritative HFA value 7.575628833271497; both display as 8. The five-season overlay uses that same older source. The floor is null with an explicit rendered message that drive-level simulation is needed. No floor value or third numerical reference line was invented. Live rendering is now observed, but exact public-payload hashing, current-reference migration and complete closeout-before-experiment acceptance remain open. No display edits were made.

## Disposition

Needs revision before claiming a coherent forecast system. Preserve legacy forecasts, retain the captured evidence, complete the time-qualified control reconstruction and E-CAL preflight, then evaluate the one permitted lineage challenger. Replacing the residual source alone does not guarantee nonnegative support, consistent marginal means or predictive improvement. Any additional centering, support correction or dependence redesign is a separate registered method change unless explicitly authorized; it cannot hide inside E-CAL-LINEAGE.

Least certain: whether lineage-only calibration migration materially improves proper scores. That requires the registered chronological evaluation and cannot be inferred from the offsets above.

Confidence: near-total in the captured arithmetic and residual ancestry, meaning arithmetic on verified rows. Lower to high if an independent reconstruction changes a count, reference identity or saved probability. This rating does not cover predictive improvement or full operational readiness.
