# Week 2 statistical engine audit — 2026-09-21

**Decision: rebuild the production pipeline around a preserved, reproducible baseline. Do not discard the historical signal or ship a replacement fitted to one bad week.** Verified structural omissions, disconnected cadence, and inconsistent uncertainty/reporting provenance warrant the teardown. They do not establish that every Week 2 miss was avoidable or that a new model will outperform.

Premise: the control is the registry-authoritative HFA deployed-lineage series `work/e-elo-hfa-release/deployed-oof-66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f.json`, generated 2026-09-20T02:53:35.244810Z. Its content hash was verified. This is a diagnostic audit, not a registered candidate comparison or promotion.

## 1. What actually happened

Frozen source snapshot: `9b8ad491b78530b29475baae69e7ab3ca1b106c4`. Board published 2026-09-21T08:04:12.900526Z. **Week 2 is incomplete: 15 finals; NYG at LA pending.** All 15 forecasts are AS_ISSUED; none uses OURS. Fourteen use `projection-v2.hfa1.w2`; DET at BUF uses the previous `projection-v2.w2`. Report the 14-game current-lineage subset separately. No retrospective reconstruction is counted as an issued forecast.

Bias throughout is **projected minus actual**. Historical figures describe a reconstructed production algorithm on 2016–2025, not archived historical live forecasts.

| Metric | Historical HFA, 2,639 games | Week 2, all 15 | Week 2 HFA only, 14 |
| --- | --- | --- | --- |
| Team MAE | 7.576 | 8.856 | 8.791 |
| Margin MAE | 10.242 | 12.077 | 12.416 |
| Total MAE | 10.865 | 12.432 | 11.925 |
| Team signed bias | 0.189 | 2.825 | 3.724 |
| Projected team-score SD | 2.935 | 2.853 | 2.813 |
| Actual team-score SD | 9.967 | 10.391 | 9.765 |

“Worse than chance” depends on the quantity. Winner accuracy was **8/15 (53.3%)**, or **7/14** on the current HFA subset. Issued winner probabilities scored **0.2553 Brier**, slightly worse than 0.2500 from assigning every game 50%; the paired-game bootstrap interval for the difference is **[−0.0762, +0.0926]**, so this week does not establish inferior probability skill. A coin flip is not a meaningful baseline for expected team points.

For points, the predeclared baseline was last season's league-average score, available before issuance. It scored **8.770 MAE**, against the engine's **8.856**. Engine minus baseline is **+0.086 points per team**, paired 95% interval **[−1.097, +1.115]**. That is worse observed performance, not evidence of a persistent reversal. The 15-game MAE exceeds every historical Week 2 through the corresponding Monday 06:00 PT checkpoint; those historical samples contain 14–15 completed games. Across all 175 historical weeks, 18 had MAE at least this high. These are descriptive comparisons after noticing a bad week, not preregistered significance tests.

## 2. Does the foundation have signal?

| Pregame method | 2016–2025 team MAE | Week 2 team MAE |
| --- | --- | --- |
| Current engine lineage | 7.576 | 8.856 |
| Prior-season league mean | 7.977 | 8.770 |
| Prior-season league median | 7.980 | 8.767 |
| Prior-season home/away means | 7.940 | 9.045 |
| Prior-season team means | 8.119 | 8.751 |
| Prior four completed team games | 8.268 | 10.267 |

Historically the engine improves on the league-mean baseline by **5.03%**, about **0.401 points per team**, and beats it in **all ten seasons**. The paired-game interval is [−0.479, −0.323] for engine minus baseline. An equal-season block bootstrap, retaining arbitrary dependence within each season, gives **[−0.478, −0.326]**. The latter has a slightly different, equal-season estimand. Neither is an untouched future-season validation: these seasons have been reused for development. Exact annual rows and all five baselines are in `results.json`.

| Season | Engine team MAE | League-mean team MAE | Home-margin bias |
| --- | --- | --- | --- |
| 2016 | 7.153 | 7.527 | -2.755 |
| 2017 | 7.840 | 8.163 | -2.462 |
| 2018 | 7.877 | 8.242 | -2.228 |
| 2019 | 7.517 | 8.112 | +0.229 |
| 2020 | 7.573 | 8.053 | +0.005 |
| 2021 | 7.987 | 8.561 | -1.692 |
| 2022 | 7.245 | 7.449 | -2.089 |
| 2023 | 7.619 | 7.872 | -2.700 |
| 2024 | 7.379 | 7.873 | -1.803 |
| 2025 | 7.570 | 7.924 | -2.087 |

Small prediction dispersion is **not by itself a defect**. The historical actual-on-projected slope is **1.011**, close to one, although projected SD is 2.935 and actual SD is much larger. Inflating point forecasts until their SD matches actual scores would confuse unpredictable game variation with forecastable variation. Keep MAE primary as governed; report RMSE too because the product describes expected scores. Absolute-error optimization targets a median and squared-error optimization a mean; those objectives need an explicit contract, not an undocumented switch. [Forecast accuracy and loss functions](https://otexts.com/fpp3/accuracy.html).

## 3. Verified findings, ordered by action

### A. Operational failure: the production disk filled again

Read-only host inspection at 159.89.185.88 found **zero available bytes** on an 8.7 GiB root filesystem and actual `No space left on device` / FAILED_CLOSED service failures. The repository occupied about 3.7 GiB: work 1.7 GiB, Git 1.1 GiB, outputs 894 MiB; the runtime occupied 851 MiB. This is a failure independent of statistical quality, not proof that the 15 saved scores were wrong.

Under the user's existing cache-cleanup authorization, removed **69 regenerable APT index files, 206,257,595 bytes**. Every path and size is in `cache-removal-inventory.json` and `cache-cleanup-receipt.json`. No source, fit, lock, grade, experiment, or other artifact of record was removed. Immediate available space was 205,996,032 bytes; subsequent `df` showed 152 MiB, 99% used. One subsequent capture service exit was successful; this does not prove every future capture is healthy. **Capacity is still urgent and not durably fixed.** No paid resizing, artifact purge, unscheduled capture, or Odds API call was performed.

Host checkout and local audit snapshot both matched `9b8ad491b78530b29475baae69e7ab3ca1b106c4`. Active fit artifact was `f7fc497ee581c3a948388891904b52669e345bae1a61c684281034505b5840e4`. SHA256s of the five issuing-path files matched; see `results.json.source_files`. Read commands used SSH BatchMode with the provisioned key, `df -h /`, `du` on named directories, service journal/status, and `runuser -u nflengine -- git -C <checkout> rev-parse HEAD`. No credentials appear in these records. `host-after-cleanup.txt` preserves the post-cleanup output.

### B. The score model omits a direct home-field term

The active ridge retains `calibration` and `elo` only. Its full-precision point formula, rounded here for readability, is:

`points = 6.892941 + 0.799318 × baseline + 0.009178 × (team Elo − 1505) + 0.010077 × (team Elo − opponent Elo)`.

`engine/projection/features.py` creates venue fields, but the fit does not retain them. Its Elo features contain the raw team rating and rating difference, without the current game's home-field addition. Changing venue while holding those retained features fixed changes the score by **zero**. The HFA release changed Elo's historical rating updates; it did not add a current-game venue effect to this score formula. Its registered standalone-Elo gate and team-score noninferiority check passed as specified; that is not equivalent to repairing point-score venue bias.

Historical home-margin bias is **−1.768 points**: home scores are underpredicted by 0.695 and away scores overpredicted by 1.073. Eight of ten seasons have negative home-margin bias even though pooled team bias is only +0.189. Aggregation concealed the directional error. This is a strong reason to test a direct venue term against the deployed baseline. It is **not** a claim that adding home field would have fixed Week 2, when several home favorites lost badly.

### C. Point forecasts, uncertainty, and report references have different lineages

The HFA fit still uses residual shapes in `work/projection-v3/residuals-1c4a9dbd064f55e01cc121231288947da7ebff9cdf6979e93c72bc7d28b5f3ba.json`. Their source hash resolves to the older v3 adaptive out-of-fold series, not the current authoritative HFA series. Its actual-minus-projection residual means are team **+1.052**, margin **+1.543**, total **+2.103**. The authoritative HFA residual means are respectively **−0.189**, **+1.768**, **−0.378**.

For a nominal 24–24 forecast, the current shape yields **54.51% home win probability** and a distribution-mean total of **50.10**, while the point total is 48. Nonzero residual location can be intentional calibration; it is not an independence defect. But inherited calibration must be qualified against the model that now issues, and the product must state whether the point number is a mean, median, or uncalibrated center. A single version label currently obscures these distinctions. Do not silently recenter saved intervals or rewrite their grades.

Separately, `work/in-season-learning-v1/reference.json` points to that older adaptive series, with historical team MAE **7.761**, rather than the current control's **7.576**. Both the learning report and `scripts/board_v7_publish.py` read this reference. The Season/trend comparison therefore does not describe the same model lineage. Preserve version-specific history but make current comparisons explicitly resolve the current control.

### D. The requested three-cutoff update system is not production

The shipping `engine/projection/features.py::build` groups by season/week and updates ratings and history after the entire slate. Production preparation uses this builder. The Friday/Monday/Tuesday calendar exists separately in `engine/forecast_system/cadence.py` and is not connected to issuing forecasts. The installed timer listing shows capture and daily jobs; Tuesday learning is reachable through scheduler/refit dispatch. Neither the issuing builder nor that dispatch runs the specified three state-assimilation updates. The cadence record also preserves unresolved scope around the rejected state-space candidate. This audit does not promote that candidate by treating wiring as permission.

The Tuesday closeout publisher **is** wired into `scripts/cloud_scheduler.py` before its weekly refit; older status prose saying otherwise is stale. Repair the chronology contract and operational schedule with exact production replay, and distinguish calendar availability changes from a new fitted filter. Prior replay calendar repairs must remain intact; this audit does not allege fresh leakage in the 15 locked games.

### E. Available context is not necessarily an active predictor

QB, wind, rest, and kicking have no direct retained coefficient in this fit. A sensitivity test changing direct venue/QB/wind/rest fields leaves points unchanged. Team efficiency and Elo can capture some of those effects indirectly. Inactive features are not automatically coding bugs: qualification and earlier rejections matter. The defect would be representing these measurements as reasons that moved a forecast when they did not. Each explanation must be generated from retained contribution terms and label inactive context separately. E-QB-DIRECT remains a proposed test of incremental direct QB value; this audit supplies no promotion for it.

## 4. What reproduced correctly

- All 15 saved projections equal their lock and first-grade projections, and all finals equal both the pinned final feed and its raw CSV. All saved grades recompute exactly.
- All 15 scores reconstruct from their **exact fit-body hash**, feature snapshot, and contributions to numerical tolerance. Version text alone is insufficient because same-version draft fits exist.
- The active fit reconstructs exactly from **5,822 training rows**, including the HFA-adjusted **32 Week 1 team rows**. The previously questioned input-cache mismatch is resolved for this reconstruction.
- An independent augmented least-squares solve matches the production normal-equation coefficients within **7.4 × 10⁻¹⁵**. No ridge arithmetic bug was found.
- Target actual points are absent from the saved learning feature snapshots. Issuance/freeze order checks pass. This proves the checked fields, not every historical provider's publication time.
- The earlier E-UNC finding of paired margin residuals is not contradicted; there is no newly demonstrated independence defect.

## 5. Uncertainty and largest misses

| Target | 50% hits | 80% hits | 50% mean width / interval score | 80% mean width / interval score |
| --- | --- | --- | --- | --- |
| team | 15/30 | 23/30 | 13.0 / 27.80 | 25.0 / 40.00 |
| margin | 5/15 | 12/15 | 16.0 / 38.13 | 34.0 / 50.00 |
| total | 8/15 | 12/15 | 19.0 / 40.87 | 35.0 / 61.67 |

CRPS: team **6.283**, margin **8.498**, total **9.377**. These score issued distributions, not retrospectively repaired ones. Paired-game bootstrap intervals for coverage and probability reliability counts are in `results.json`; 15 games are too few for a stable recalibration decision.

| Team | Projection | Actual | Projection − actual |
| --- | --- | --- | --- |
| CHI | 24.28 | 3.0 | +21.28 |
| ATL | 24.20 | 3.0 | +21.20 |
| HOU | 26.48 | 6.0 | +20.48 |
| PIT | 22.52 | 3.0 | +19.52 |
| MIN | 25.24 | 9.0 | +16.24 |

Every contribution table for the ten largest team misses is saved in `results.json.largest_misses`. Several low-scoring outcomes dominate this week's error. That does not license tuning a special low-score adjustment after seeing them.

## 6. Rebuild order and boundaries

See [REBUILD.md](REBUILD.md) for concrete deliverables and acceptance checks. First secure storage and make failed freshness visible. Then unify exact fit, residual, reference, and cutoff provenance behind one immutable forecast bundle. Preserve the active numerical model as a benchmark and demand byte-identical reproduction for pure infrastructure changes. Repair report provenance and forecast semantics before comparing new statistical methods. The next recommended accuracy experiment is a minimal direct venue correction; a new state-space model, ensemble, or extra QB input must earn its own gate.

Use only information available before each historical forecast, including tuning and calibration; replay the same code used to publish. That is the rolling-origin evaluation standard, not a special accommodation for this audit. [Rolling-origin evaluation](https://otexts.com/fpp3/tscv.html). Reused historical results are development evidence; future untouched as-issued games are the next independent check. Retain the one-method-per-week and standard accuracy gate; no queue item or gate was changed here.

## 7. Verification and limits

Run `/opt/anaconda3/bin/python3.12 -B work/engine-audit-2026-09-21/audit.py` from the repository. It pins mutable inputs using `git show` at the frozen snapshot, verifies content-addressed inputs, reproduces the fit, saves all rows and calculations, and never writes production forecasts. Run against the recorded source hashes; newer algorithm code requires a separate audit version. Bootstrap seed 20260921, 10,000 draws; both teams remain together. Season-block sensitivity addresses within-season dependence, but ten seasons still give limited generalization.

Existing verification: **58 projection tests, 4 HFA release tests, and 218 Week 1 tests passed (280 total)**. Logs accompany this report. Passing these tests does not validate missing integration or forecast skill. No new method was fitted, released, or claimed superior. No frozen lock, grade, interval, gate, or website artifact changed. Provider credits spent: **0**.

Least sure: whether the first two weeks indicate a new scoring environment rather than ordinary variability; this uncertainty is why no point or interval correction was trained on these 15 games.


<!-- standing-reference-lines-v1 -->

<details><summary>DIAGNOSTIC ONLY — CLOSE — current HFA: ATS 1301/2574 (50.54%; 95% 48.61–52.47%); total 1285/2618 (49.08%; 95% 47.17–51.00%)</summary>By season: current HFA 2016: ATS 123/251 (49.00%; 95% 42.88–55.16%); total 123/255 (48.24%; 95% 42.17–54.35%); spread coverage 256/256 | current HFA 2017: ATS 112/248 (45.16%; 95% 39.09–51.38%); total 127/256 (49.61%; 95% 43.54–55.69%); spread coverage 256/256 | current HFA 2018: ATS 127/247 (51.42%; 95% 45.21–57.58%); total 116/253 (45.85%; 95% 39.82–52.01%); spread coverage 256/256 | current HFA 2019: ATS 143/246 (58.13%; 95% 51.89–64.12%); total 135/255 (52.94%; 95% 46.82–58.98%); spread coverage 256/256 | current HFA 2020: ATS 144/256 (56.25%; 95% 50.13–62.19%); total 120/251 (47.81%; 95% 41.71–53.97%); spread coverage 256/256 | current HFA 2021: ATS 141/268 (52.61%; 95% 46.64–58.51%); total 139/269 (51.67%; 95% 45.72–57.58%); spread coverage 272/272 | current HFA 2022: ATS 133/261 (50.96%; 95% 44.92–56.96%); total 127/268 (47.39%; 95% 41.49–53.36%); spread coverage 271/271 | current HFA 2023: ATS 111/258 (43.02%; 95% 37.13–49.12%); total 136/270 (50.37%; 95% 44.44–56.29%); spread coverage 272/272 | current HFA 2024: ATS 138/268 (51.49%; 95% 45.53–57.41%); total 137/269 (50.93%; 95% 44.98–56.85%); spread coverage 272/272 | current HFA 2025: ATS 129/271 (47.60%; 95% 41.73–53.54%); total 125/272 (45.96%; 95% 40.13–51.89%); spread coverage 272/272. Source: nflverse spread_line / total_line. Counts exclude actual pushes and exact forecast-on-line cases. Never a target, gate, ranking, selection criterion or justification for a model change.</details>
<details><summary>DIAGNOSTIC ONLY — OPEN — current HFA: ATS 577/1151 (50.13%; 95% 47.25–53.01%); spread coverage 1177/1359; totals INSUFFICIENT (34.3% historical coverage)</summary>By season: current HFA 2016: ATS 0 scored; insufficient data; spread coverage 0/256 | current HFA 2017: ATS 0 scored; insufficient data; spread coverage 0/256 | current HFA 2018: ATS 0 scored; insufficient data; spread coverage 0/256 | current HFA 2019: ATS 0 scored; insufficient data; spread coverage 0/256 | current HFA 2020: ATS 0 scored; insufficient data; spread coverage 0/256 | current HFA 2021: ATS 113/222 (50.90%; 95% 44.37–57.41%); spread coverage 224/272 | current HFA 2022: ATS 116/230 (50.43%; 95% 44.02–56.84%); spread coverage 238/271 | current HFA 2023: ATS 117/236 (49.58%; 95% 43.26–55.91%); spread coverage 238/272 | current HFA 2024: ATS 116/230 (50.43%; 95% 44.02–56.84%); spread coverage 239/272 | current HFA 2025: ATS 115/233 (49.36%; 95% 43.00–55.73%); spread coverage 238/272. Source: nfelo historic_projected_spreads.csv home_line_open; totals source nfelo_games.csv total_line_open, unblended. Counts exclude actual pushes and exact forecast-on-line cases. Never a target, gate, ranking, selection criterion or justification for a model change.</details>

<!-- /standing-reference-lines-v1 -->

Confidence: **high** that a controlled production-pipeline rebuild is warranted: the verified omissions and provenance failures reproduce, and the retained baseline's historical skill survives season-level and alternative-baseline checks. High means the central claim holds across seasons and survives obvious alternative specifications. Reduce to **medium** if an independent reconstruction finds the live score path already includes venue or the alleged old residual/reference sources actually resolve to the current control. Whether the rebuilt model improves future MAE remains unproved.
