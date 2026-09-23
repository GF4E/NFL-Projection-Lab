NON-AUTHORITATIVE LEGACY DONOR — provenance audit only, not a release control, accuracy comparison or gate.

# Legacy calibration donor reconstruction

All 2,639 original adaptive-donor forecasts reproduce exactly from the feature cache whose logical hash matches the original experiment. Ten annual fits use only earlier seasons and the originally recorded groups/settings. Independent augmented least squares agrees within 1.08e-14; reversing training rows preserves every fit. Both target scores match the pinned schedule finals. Recorded qualification eligible seasons are checked, but the qualification search itself was not rerun.

The common three-cutoff builder, using the donor’s own pinned source and fixed-65 Elo method, changes the baseline input on 2,053 of 2,639 games (4,106 team fields). No other selected input changes above 1e-10. This establishes input incompatibility; it does not quantify forecast changes, accuracy improvement or isolate each source of the baseline difference. The largest input difference is 0.6102 points.

| Season | Games | Games with baseline difference |
| --- | ---: | ---: |
| 2016 | 256 | 207 |
| 2017 | 256 | 195 |
| 2018 | 256 | 193 |
| 2019 | 256 | 193 |
| 2020 | 256 | 173 |
| 2021 | 272 | 209 |
| 2022 | 271 | 221 |
| 2023 | 272 | 222 |
| 2024 | 272 | 220 |
| 2025 | 272 | 220 |

The original donor is reproducible but CORRECTED_CALENDAR_NOT_QUALIFIED. Preserve it as historical evidence. Before an E-CAL comparison, reconstruct the donor’s chronological qualification procedure on corrected inputs, retaining the disclosed cold-start decisions; do not copy these old residuals into the corrected evaluator and call them qualified. This audit does not start an experiment clock, alter authority or activate a model.

Run: `OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B work/engine-rebuild/check_legacy_donor.py`. The run took 35.31 seconds, peak RSS 1,322,680,320 bytes, one worker. The independent artifact check recounts every changed game and verifies all bound code, plan, donor, cache and authoritative-control hashes. See legacy-donor-verification.json and legacy-donor-independent-check.json.

The user’s supervised training/validation/test requirement remains explicit in PROMPT-reviewed-2026-09-22.md section 10 and TRAIN-TEST.md. This provenance audit contributes to calibration leakage qualification; it does not complete the full test requirement. Historical provider availability remains unknown, and the point replay remains non-authoritative. No host, website, authoritative series, gate or spending changed.

Least certain: whether the original adaptive qualification selects the same groups under corrected calendar inputs; that search remains to be reconstructed.

Confidence: near-total in the saved-row reproduction and difference counts, meaning arithmetic on verified rows; lower to high if independent recomputation differs. This is not a confidence rating on future predictive improvement.
