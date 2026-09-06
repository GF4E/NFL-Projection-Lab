# RF-02C Elo mechanism diagnosis and E3 scoping

2026-09-05. **Post-result analysis only. No fitting, tuning, source changes, new performance criteria, preregistration acceptance, or execution authorization.** Sources are the final RF-02C artifacts authenticated against index `ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab`; exact extracted values and source hashes are in `rf02c-elo-mechanism-evidence.json` (SHA-256 `95ff7a6fdf2de9703b91fc404542c69a6c699ac2f06c88f4e9f868632b79bc63`).

**The result.** E2 has a favorable point estimate, but neither its improvement over N0 nor its incremental defense contribution meets the frozen uncertainty gates. Removing defense did not win. Implementation correctness and predictive adequacy are different questions: the independent full temporal audit reproduced every available E1/E2 variant's delayed state transitions, while the statistical experiment still ended `reject_all`.

Development contains 3,135 games, 2013–2024; 2025 contains 272 exposed diagnostic games. All listed series have zero native failures.

| Series | Development mean energy ↓ | Gain versus N0 | 2025 mean energy ↓ |
|---|---:|---:|---:|
| N0 | 8.478405 | reference | 8.374187 |
| Classical E1 | 8.551366 | −0.8605% | 8.415606 |
| E1, K=0 | 8.824336 | −4.0801% | 8.810268 |
| Full E2 | 8.428534 | +0.5882% | 8.290020 |
| E2, defense removed | 8.517549 | −0.4617% | 8.500908 |
| E2, offense removed | 8.745156 | −3.1462% | 8.594683 |

E2 improves on N0 in 10 of 12 development seasons, but its gain is below 1%; simultaneous 95% intervals include zero for all block lengths. The length-6 interval is [−0.4143%, +1.5907%]. E2's gain versus E1 is +1.4364%, with length-6 interval [−0.1008%, +2.9736%]. E1's useful learned ratings are supported against its K=0 control, even though E1 fails against N0.

For ablations, the registered sign is **(full loss − removal loss)/full loss**. Removing defense yields −1.0561%; its simultaneous intervals for lengths 1/3/6 are [−2.3560%, +0.2438%], [−2.4106%, +0.2983%], [−2.4260%, +0.3138%]. Full E2 beats this removal in 9/12 development seasons. Removing offense yields −3.7565%; all intervals exclude zero, including length-6 [−5.5060%, −2.0071%], and full E2 wins all 12 seasons. The frozen positive-mechanism rule requires each removal's upper bound below zero at every block length. It passes for offense and fails for defense because the defense contrast is insufficiently precise—not because defense is estimated to hurt.

**Exact algorithms.** Let `u` be 1 for a nonneutral home team and 0 otherwise; let `b_t,H_t` denote eligible-history league points/home effect. Default observation weights are `2^(-(season−season_i)/2.5)`, multiplied by 0.5 for 2020. There are no player, QB, possession, market, or human-selection inputs.

E1 starts all ratings at 1500. At the original forecast origin it saves `x_g=(R_h−R_a+c*u)/400` and `e_g=1/(1+10^(−x_g))`. On first eligible delivery, it stages `ΔR_h=K*m_i*(y_g−e_g)`, `ΔR_a=−ΔR_h`, with win/tie/loss `y_g=1/.5/0` and `m_2020=.5`. It batches all arriving results before applying updates. At a season boundary it delivers previous-season results first, then multiplies deviations from 1500 by retention, then delivers any current-season results. Its fold-only score slope is

`a_t=max(0, sum_i w_i*x_i*(H_i−A_i)/(sum_i w_i*x_i²+16))`,

using stored original-origin `x_i`. Forecasts are `μ_h=b_t+a_t*x_g/2`, `μ_a=b_t−a_t*x_g/2`. Thus **every same-origin E1 game has the same predicted total `2b_t`**, regardless of its teams. Elo's logistic win expectation updates ratings; final win/tie/loss probabilities come from the score distribution. Grids are K={10,20,40}, retention={.5,.75,1}, home points={0,40,80}; 27 settings. Settings are selected annually using the preceding two seasons' chronological energy losses.

E2 starts all offense and defense states at zero. It saves original-origin means

`μ_h=b_t+H_t*u/2+O_h−D_a`, `μ_a=b_t−H_t*u/2+O_a−D_h`.

For delivered errors `e_h=H_g−μ_h,g` and `e_a=A_g−μ_a,g`, it stages

`ΔO_h=K*m_i*e_h/2`, `ΔD_a=−K*m_i*e_h/2`,
`ΔO_a=K*m_i*e_a/2`, `ΔD_h=−K*m_i*e_a/2`.

O and D are centered separately over 32 teams after each delivery batch. The same offseason ordering applies, with O,D multiplied by retention. A game forecast with no eligible prior scores remains initialization-only even if delivered much later; its result must never receive an invented residual. Finite raw means drive learning even if a distribution later fails. Nonfinite dynamic state/mean is absorbing. No scoring occurs before 64 eligible games, but trajectories and stored expectations exist during warmup. E2 uses K={.05,.1,.2}, retention={.5,.75,1}, giving nine settings.

All models feed their requested means into the same exponential tilt of `.95*Q_t + .05*Pois(b_t)×Pois(b_t)`, where `Q_t` is symmetrized eligible raw-score atoms. This preserves empirical score features but does not establish that unconditional raw-score dispersion/dependence equals conditional forecast-error dispersion/dependence. Mean matching satisfies two moment constraints; it does not prove calibration.

**Why offense/defense labels do not identify the mechanism.** Set strength `S_i=O_i+D_i` and total component `P_i=O_i−D_i`. These are invertible coordinates, with O=(S+P)/2 and D=(S−P)/2. Then

`M̂_g=H_t*u+S_h−S_a`, `T̂_g=2b_t+P_h+P_a`,
`ΔS_h=K*m_i*(e_h−e_a)/2`, `ΔS_a=−ΔS_h`,
`ΔP_h=ΔP_a=K*m_i*(e_h+e_a)/2`.

The current algorithm forces the same adaptation rate for margin and total errors. Removing D imposes S=P; removing O imposes S=−P. These ablations test constrained updating recipes, not causal attribution to NFL offense/defense. One game cannot determine which team deserves each share of a residual. Repeated opponents can help estimate additive effects under stable assumptions; equal residual splitting, fixed gains, common retention, sparse weekly evidence and changing league baselines still influence noise and identification. The total component is a score-level effect, not measured possession tempo.

**Priority relative to shared distribution evidence.** E1's total CRPS is 1.6957% worse than N0, consistent with its team-invariant total limitation. E2 improves margin CRPS but total CRPS is still 0.3809% worse than N0. Descriptive E2 calibration slopes are 1.05425 for margin and 0.67144 for total. These motivate separate adaptation hypotheses but do not identify gains or establish a fix.

Existing independent-marginal outputs provide a cheaper, sharper check on the shared distribution concern. E2's mean predicted covariance is −6.42494 points² versus mean observed residual product +2.92028; N0 has −6.03054 versus +1.12189. The residual product is uncentered and can include mean misspecification, so it is not a clean conditional-covariance estimator. Holding E2 marginals fixed and setting covariance to zero narrows margin width 37.1448→35.9662 and lowers raw margin coverage 85.008%→83.477%, while total width rises 34.8711→36.0625 and coverage 80.989%→82.169%. This follows `Var(M)=Var(H)+Var(A)−2Cov` and `Var(T)=Var(H)+Var(A)+2Cov`. Its energy change is tiny: removal gain −0.00947%, length-6 simultaneous interval [−0.09517%, +0.07624%]. Nominal coverage alone does not resolve discrete interval mass. These archive-only facts support finishing the independent exact-mass/conditional-dependence diagnosis before authorizing another model fit. They do not justify blanket dispersion shrinkage or changing the mapper in place.

**One explicit successor hypothesis, E3: split margin and total gains.** This remains proposed, not accepted. Preserve b,H, the 2020 multiplier, common retention, original mapper, chronology, cold starts, all failure rules and score/selection criteria. Store each original-origin M̂,T̂. On delayed delivery set `r_M=(H_g−A_g)−M̂_g` and `r_T=(H_g+A_g)−T̂_g`; update

`ΔS_h=(K_S*m_i/2)*r_M`, `ΔS_a=−ΔS_h`,
`ΔP_h=ΔP_a=(K_P*m_i/2)*r_T`.

Center S,P after each batch, with the same previous-season-delivery→retention→current-season-delivery ordering. Recover `μ_h=(T̂+M̂)/2`, `μ_a=(T̂−M̂)/2`. The mechanism hypothesis is that relaxing E2's equal-rate restriction improves forecasts; it does not assert that either gain should be larger.

The smallest finite extension using existing prespecified numerical values is `{.05,.1,.2}×{.05,.1,.2}×{.5,.75,1}` for `(K_S,K_P,retention)`: 27 settings, including nine tied settings and only 18 new off-diagonal settings. A proposed deterministic order is K_S, then K_P, then retention in those existing orders. No grid value or preferred direction has been chosen from exposed performance. Annual selection would still use only S−2/S−1 energy losses and the same failure/tie rule. This finite nested design is preferable for the first test to continuous gain fitting, which would additionally require an optimizer, regularization, derivative/termination protocol and extra fitting capacity.

**Smallest distinguishing test and reuse.** First prove `K_S=K_P=K` reduces to E2 at all origins, selected settings and variants. Algebraic equality does not imply floating-point identity because centering and summation order change. The clean implementation can retain O,D storage and delegate tied gains to the unchanged E2 operations; off-diagonal updates are `ΔO_h=m_i*(K_S*r_M+K_P*r_T)/4`, `ΔD_h=m_i*(K_S*r_M−K_P*r_T)/4`, with the corresponding away signs. The reduction proof must disclose any remaining mean/state/score differences, rather than silently relabel approximate values as exact old controls.

Authenticate and reuse original N0/S1/E1/E2 outer forecasts/losses, per-origin mappers and eligible-input hashes. Reuse tied E2 full-setting inner losses only after exact reduction is demonstrated; otherwise qualify differences under a separately frozen rule before fitting. No unchanged control needs another football replay. Compute only genuinely new off-diagonal trajectories and selected E3 variants; retain all historical exposure labels.

For completeness the away-coordinate updates are `ΔO_a=m_i*(-K_S*r_M+K_P*r_T)/4`, `ΔD_a=m_i*(-K_S*r_M−K_P*r_T)/4`; thus the tied-gain diagonal reduces algebraically to all four original E2 updates.

The essential new contrast is selected E3 versus independently selected tied E2; E3 must also retain the existing N0 and simpler-model comparisons and thresholds. Add selected-setting, nonretuned K_S=0 and K_P=0 removals to test strength and total-state utility; preserve six common variants and the two frozen negative controls. Four old-full-model contrasts + six common variants + two mode removals + two controls give 14 new comparisons. If all prior comparisons are retained, preregister a 56-comparison simultaneous family with the same 10,000 paired season/week-block resamples and lengths 1/3/6. Recompute the successor multiplicity adjustment from reused per-game losses; do not reuse the old 42-way bounds as if they covered new comparisons, and never overwrite the RF-02C result.

Tied reduction, zero-mode behavior, original-expectation delivery, initialization, centering/retention, swap/renaming/order, future-label/market isolation, 24-hour sensitivity and noise-without-learning-change are required falsifiers. The proposed mean update does not itself resolve shared distribution calibration. Any later preregistration must settle scope and unchanged promotion requirements explicitly before implementation or fitting. No prospective evidence or 1% improvement is established.
