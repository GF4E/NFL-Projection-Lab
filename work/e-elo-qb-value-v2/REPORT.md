Premise: work/e-elo-hfa-release/deployed-oof-66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f.json; authoritative deployed lineage: yes; generated 2026-09-20T02:53:35.244810+00:00.

# E-ELO-QB: REJECTED

REVIEW REQUESTED — fixed conventions: common sixteen-week league prior; unknown selected starters retain inactive adjustment; released HFA is the current gate control alongside original c; scale uses the valid nonnegative Elo numerical domain; oracle holds rule-fitted scales fixed; incomplete CPOE windows make combined VALUE secondary/partial. Alternatives are listed in the hashed PLAN.md. No gate or numerical candidate was changed after results.

The specified QB VALUE does not reach the 1% team-MAE gate. Neither usable candidate clears it in any individual season, against the released HFA control. Coverage passes. HFA remains deployed; QB adjustment remains inactive.

## Accepted reconciliation

Full stated starter rule: 90.96% on the reproduced common sample. The user reconciles 90.87% on their four-season selection and reports that the injury override is correct 30/40 times; the former 89.4% omitted the override and counted declines as misses. Their 2,442 versus our 2,806 regression rows reflect their additional prior-season QB-history filter. Our 0.8% in-sample gain is descriptive, not an OOF gate. These differences are resolved, with original records preserved.

## Gate table

All 2,639 regular-season games, 2016–2025; 5,278 team outcomes. Positive gain means lower error. MAE uses every game; coverage uses 2,383 games in 2017–2025 with each candidate’s own earlier OOF residuals. 2016 has no earlier OOF calibration in this lineage and is explicitly unscored for coverage.

| Candidate | Team MAE | Gain vs released HFA | Gain vs original c | Paired 95% gain, points | Coverage | Decision |
|---|---:|---:|---:|---|---|---|
| c: original control (superseded) | 7.574348 | 0.017% | 0.000% | [-0.000173, 0.002450] | PASS | CONTROL |
| Released HFA control | 7.575629 | 0.000% | -0.017% | [0.000000, 0.000000] | PASS | CONTROL |
| a: QB EPA | 7.568094 | 0.099% | 0.083% | [-0.001626, 0.012596] | PASS | REJECTED |
| b: QB EPA + HFA | 7.568583 | 0.093% | 0.076% | [-0.001458, 0.012288] | PASS | REJECTED |
| Oracle a — unavailable identity | 7.558620 | 0.225% | 0.208% | [0.005596, 0.020056] | PASS | DIAGNOSTIC |
| EPA+CPOE — SECONDARY/PARTIAL | 7.567657 | 0.105% | 0.088% | [-0.002060, 0.013216] | PASS | DIAGNOSTIC |

Paired uncertainty uses 10,000 resamples of within-season three-week blocks, retaining both teams of every game. Oracle and CPOE secondary cannot promote. The original c comparison is retained for registration continuity; only released HFA is authoritative for the gate.

## Coverage

| Candidate | Margin 50 | Margin 80 | Total 50 | Total 80 |
|---|---:|---:|---:|---:|
| c: original control (superseded) | 51.03% | 79.90% | 51.95% | 82.00% |
| Released HFA control | 50.86% | 79.69% | 51.99% | 82.00% |
| a: QB EPA | 51.11% | 79.82% | 52.16% | 81.87% |
| b: QB EPA + HFA | 52.04% | 79.86% | 52.20% | 81.83% |
| Oracle a — unavailable identity | 51.36% | 80.11% | 52.25% | 81.87% |
| EPA+CPOE — SECONDARY/PARTIAL | 51.62% | 79.27% | 52.12% | 82.00% |

## Elo-component evidence

These probabilities are Elo’s own logistic forecasts. The site uses score-plus-residual probabilities; their independently recomputed Brier scores are recorded separately in gate-recomputation.json.

| Candidate | Elo margin MAE | Signed margin bias | Actual-on-projected slope | Elo win Brier |
|---|---:|---:|---:|---:|
| c: original control (superseded) | 10.244657 | +0.876156 | 0.986544 | 0.223019 |
| Released HFA control | 10.216512 | +0.020791 | 0.979370 | 0.221556 |
| a: QB EPA | 10.236439 | +0.863459 | 0.990902 | 0.222662 |
| b: QB EPA + HFA | 10.202556 | +0.005658 | 0.984343 | 0.221113 |
| Oracle a — unavailable identity | 10.210563 | +0.870869 | 1.013390 | 0.221837 |
| EPA+CPOE — SECONDARY/PARTIAL | 10.239254 | +0.866344 | 0.987657 | 0.222588 |

Win reliability by bin (predicted home probability / actual home win share; ties count half):

| Candidate | Bin lower | Games | Predicted | Actual |
|---|---:|---:|---:|---:|
| c: original control (superseded) | 0.1 | 32 | 0.1686 | 0.2656 |
| c: original control (superseded) | 0.2 | 131 | 0.2620 | 0.3359 |
| c: original control (superseded) | 0.3 | 249 | 0.3563 | 0.3213 |
| c: original control (superseded) | 0.4 | 423 | 0.4543 | 0.4102 |
| c: original control (superseded) | 0.5 | 531 | 0.5538 | 0.4840 |
| c: original control (superseded) | 0.6 | 557 | 0.6495 | 0.6158 |
| c: original control (superseded) | 0.7 | 459 | 0.7477 | 0.7004 |
| c: original control (superseded) | 0.8 | 230 | 0.8413 | 0.8283 |
| c: original control (superseded) | 0.9 | 27 | 0.9160 | 0.8889 |
| Released HFA control | 0.1 | 41 | 0.1617 | 0.2561 |
| Released HFA control | 0.2 | 172 | 0.2570 | 0.3372 |
| Released HFA control | 0.3 | 306 | 0.3556 | 0.3219 |
| Released HFA control | 0.4 | 456 | 0.4516 | 0.4298 |
| Released HFA control | 0.5 | 536 | 0.5491 | 0.5243 |
| Released HFA control | 0.6 | 540 | 0.6461 | 0.6426 |
| Released HFA control | 0.7 | 388 | 0.7460 | 0.7152 |
| Released HFA control | 0.8 | 185 | 0.8404 | 0.8676 |
| Released HFA control | 0.9 | 15 | 0.9151 | 0.8667 |
| a: QB EPA | 0.1 | 30 | 0.1630 | 0.2667 |
| a: QB EPA | 0.2 | 138 | 0.2605 | 0.3080 |
| a: QB EPA | 0.3 | 234 | 0.3559 | 0.3184 |
| a: QB EPA | 0.4 | 412 | 0.4531 | 0.4248 |
| a: QB EPA | 0.5 | 555 | 0.5522 | 0.4757 |
| a: QB EPA | 0.6 | 547 | 0.6484 | 0.6051 |
| a: QB EPA | 0.7 | 486 | 0.7479 | 0.7171 |
| a: QB EPA | 0.8 | 207 | 0.8421 | 0.8382 |
| a: QB EPA | 0.9 | 30 | 0.9169 | 0.8333 |
| b: QB EPA + HFA | 0.0 | 1 | 0.0901 | 1.0000 |
| b: QB EPA + HFA | 0.1 | 46 | 0.1639 | 0.2174 |
| b: QB EPA + HFA | 0.2 | 163 | 0.2562 | 0.3344 |
| b: QB EPA + HFA | 0.3 | 305 | 0.3549 | 0.3377 |
| b: QB EPA + HFA | 0.4 | 464 | 0.4550 | 0.4181 |
| b: QB EPA + HFA | 0.5 | 547 | 0.5494 | 0.5366 |
| b: QB EPA + HFA | 0.6 | 526 | 0.6472 | 0.6378 |
| b: QB EPA + HFA | 0.7 | 398 | 0.7448 | 0.7261 |
| b: QB EPA + HFA | 0.8 | 172 | 0.8418 | 0.8576 |
| b: QB EPA + HFA | 0.9 | 17 | 0.9174 | 0.8235 |
| Oracle a — unavailable identity | 0.1 | 32 | 0.1673 | 0.2500 |
| Oracle a — unavailable identity | 0.2 | 131 | 0.2610 | 0.3168 |
| Oracle a — unavailable identity | 0.3 | 240 | 0.3549 | 0.3146 |
| Oracle a — unavailable identity | 0.4 | 405 | 0.4538 | 0.4173 |
| Oracle a — unavailable identity | 0.5 | 562 | 0.5522 | 0.4786 |
| Oracle a — unavailable identity | 0.6 | 552 | 0.6494 | 0.6069 |
| Oracle a — unavailable identity | 0.7 | 479 | 0.7479 | 0.7150 |
| Oracle a — unavailable identity | 0.8 | 209 | 0.8419 | 0.8445 |
| Oracle a — unavailable identity | 0.9 | 29 | 0.9163 | 0.8621 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.1 | 33 | 0.1673 | 0.2424 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.2 | 135 | 0.2611 | 0.3000 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.3 | 242 | 0.3574 | 0.3347 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.4 | 413 | 0.4537 | 0.4262 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.5 | 536 | 0.5527 | 0.4748 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.6 | 562 | 0.6482 | 0.6014 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.7 | 480 | 0.7492 | 0.7240 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.8 | 207 | 0.8413 | 0.8237 |
| EPA+CPOE — SECONDARY/PARTIAL | 0.9 | 31 | 0.9173 | 0.8387 |

## Seasonal team MAE and scale

| Season | HFA control MAE | a gain | b gain | Oracle gain | a fitted s | b fitted s | CPOE secondary s | Training games per s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2016 | 7.153133 | +0.009% | +0.034% | +0.013% | 4.474734 | 14.326864 | 45.509188 | 512 |
| 2017 | 7.840017 | +0.301% | +0.291% | +0.488% | 54.748759 | 53.293438 | 65.425442 | 768 |
| 2018 | 7.877440 | +0.124% | +0.113% | +0.450% | 77.403482 | 69.253910 | 65.425443 | 1024 |
| 2019 | 7.516767 | -0.173% | -0.161% | +0.199% | 68.472459 | 64.936402 | 62.211027 | 1280 |
| 2020 | 7.573173 | +0.037% | +0.018% | +0.331% | 54.748760 | 60.506823 | 52.514795 | 1536 |
| 2021 | 7.986725 | +0.214% | +0.250% | +0.212% | 40.727087 | 52.216157 | 38.866865 | 1792 |
| 2022 | 7.244516 | -0.103% | -0.086% | -0.157% | 49.190121 | 52.216158 | 43.528101 | 2064 |
| 2023 | 7.618743 | +0.157% | +0.022% | +0.146% | 40.727085 | 39.384740 | 37.679018 | 2335 |
| 2024 | 7.379090 | +0.294% | +0.303% | +0.449% | 35.690955 | 38.145925 | 33.936025 | 2607 |
| 2025 | 7.570312 | +0.096% | +0.112% | +0.096% | 35.690956 | 38.553799 | 30.359087 | 2879 |

Exactly one fitted quantity per candidate/outer season: s. CPOE’s 1.0 weight is fixed, not fitted. EPA primary rawVALUE=attempt-weighted EPA/attempt. Secondary rawVALUE=EPA/attempt+1.0×CPOE/100. Both starter/team values are multiplied by s before the unchanged 3.3 difference multiplier. Ridge coefficients are the existing production refits, not additional QB parameters. Full brackets, losses, domain exclusions and fit lineage are in gate.json and ridge-lineage.json.

The scale is unstable across seasons: a ranges 4.47–77.40; b ranges 14.33–69.25. This is a finding, not a license to select a favorable scale. No outer-season outcomes select these values.

## Availability

| Season | Team games | EPA VALUE available | Combined VALUE available | UNTIMESTAMPED identity | ROOKIE_PRIOR |
|---|---:|---:|---:|---:|---:|
| 2016 | 512 | 512 | 490 | 44 | 4 |
| 2017 | 512 | 510 | 463 | 32 | 1 |
| 2018 | 512 | 512 | 512 | 38 | 2 |
| 2019 | 512 | 512 | 512 | 37 | 1 |
| 2020 | 512 | 507 | 449 | 44 | 4 |
| 2021 | 544 | 544 | 489 | 41 | 3 |
| 2022 | 542 | 542 | 465 | 48 | 1 |
| 2023 | 544 | 544 | 441 | 44 | 3 |
| 2024 | 544 | 544 | 506 | 40 | 3 |
| 2025 | 544 | 544 | 529 | 32 | 2 |

Primary EPA values are available for 5,271/5,278 team games; seven missing starters retain explicitly inactive adjustment, without dropping games. Combined windows are unavailable for 422 team games. Independent recomputation checked 49,857 means and every qualifying 16-game selection; maximum arithmetic difference 2.22e-16. No window reaches the 2000 history boundary.

Perfect retrospective identification lowers team MAE by a further 0.009474points versus the rule (about0.125%). It still falls well below 1%. Under this specific VALUE formula, identification errors alone do not explain the failure to promote. That does not reject other valuation models, a different mapping into points, or the broader usefulness of QB evidence. Actual attempt leader is itself an oracle definition, not proof of the announced pregame starter.

## Current season and execution

No graded 2026 game was issued by the newly released HFA lineage: it was released after the Thursday game. The existing as-issued sample is 8 games from projection-v2-172f3e04-a39aa883, 6 from projection-v3-b7a84dbe-2b5d9d0f, and 1 from projection-v2.w2. Two other Week 1 records are retrospective. These are not pooled as new-lineage validation and are not rewritten. Prospective evidence requires games locked and graded under projection-v2.hfa1.

The numerical gate took 127.7seconds on one worker, below 45 minutes. The original and released controls reproduce within 1e-10 on every eligible game. An independent implementation reproduces all team MAEs and every coverage count. No fitting occurs when rendering this report. No paid API credits used.

Preregistration SHA256: `b6b8c58e15cfa757423c432cca41b2ea1fe4e09ad264746dc59e97b6859b7a13`. Released HFA fit: `f7fc497ee581c3a948388891904b52669e345bae1a61c684281034505b5840e4`.

COMMIT c861e82504505ee5707bce369028a2b00f59618f (pushed registration and numerical evaluation code).

Tests: 251 passed — 218 standing checks and 33 focused checks, including frozen Elo separation, chronology, exact prior-window selection, scale-fit future exclusion, updated authority rejection, and HFA lineage retention across a weekly refit.

Least sure of: how much a fully observed CPOE window would change the conditional valuation result; this run does not fill missing CPOE.

Confidence: high — rejection of this specified QB adjustment holds across seasons and survives the obvious comparisons: original versus released control, HFA combination, retrospective oracle, and the disclosed partial CPOE alternative. Move down to medium if an independent authoritative replay exposes a material window or scale-fitting discrepancy. This confidence does not extend to rejecting QB value in general.
