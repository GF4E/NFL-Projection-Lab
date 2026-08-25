# ADR-0002: Probability quality governs challenger promotion

**Status:** Accepted as a design hypothesis; metric implementation verification is pending  
**Date:** 2026-08-24  
**Deciders:** Owner

## Context

The engine forecasts a distribution rather than a single score. A challenger can look attractive under one measure while being harmful under another: score error can improve while win probabilities become overconfident, Brier score can mute the cost of extreme errors, and a short CLV or result history can be dominated by noise. The promotion rule must reward useful probability estimates, remain comparable across model versions, and resist metric shopping.

## Decision

Pooled mean log loss over non-push moneyline, spread, and total Bernoulli outcomes is the primary champion/challenger promotion metric. Champion, challenger, and power-de-vigged market baseline must be scored on identical rolling-origin rows. Each eligible game-market contributes one outcome; pushes are excluded from the pooled Bernoulli score and reported separately.

A challenger is eligible for atomic promotion only when all frozen gates pass:

1. challenger pooled mean log loss is lower than champion log loss;
2. the lower bound of the paired season-week block-bootstrap 90% interval for champion-minus-challenger log loss is above zero;
3. no individual market's log loss is worse than champion by more than `0.002`; and
4. challenger calibration slope is within `[0.8, 1.2]`.

Brier score, joint score likelihood, team-score error, calibration plots, pooled and market-level sample sizes, uncertainty intervals, and CLV are required diagnostics. They explain the decision but cannot override a failed hard gate. Model-run hashes and the promotion or rejection result remain immutable.

## Options considered

### Option A: Pooled log loss with a calibration gate (selected)

| Dimension | Assessment |
|---|---|
| Probability sensitivity | High; confidently wrong estimates are strongly penalized |
| Calibration protection | High when paired with the hard slope gate |
| Market coverage | One comparable score across three mainline markets, with required breakouts |
| Interpretation | Medium; needs plain-language diagnostics for people using the engine |

**Pros:** proper probability score; discourages false certainty; supports a deterministic promotion rule.  
**Cons:** sensitive to extreme estimates and pooling choices, so probability bounds, row rules, and market weights must be frozen in advance.

### Option B: Brier score as the primary metric

| Dimension | Assessment |
|---|---|
| Probability sensitivity | Medium |
| Calibration protection | Medium |
| Market coverage | High |
| Interpretation | High |

**Pros:** intuitive squared probability error; less dominated by a few extreme misses.  
**Cons:** penalizes confident mistakes less sharply and can rank models differently in the tails that matter to decision support.

### Option C: Team-score error as the primary metric

| Dimension | Assessment |
|---|---|
| Probability sensitivity | Low |
| Football interpretability | High |
| Mainline pricing relevance | Indirect |
| Tail and push behavior | Weak unless the full distribution is separately scored |

**Pros:** easy to explain; directly measures the central score forecast.  
**Cons:** a good average score can coexist with poor uncertainty, cover, total, or win probabilities.

### Option D: CLV or realized results as the primary metric

| Dimension | Assessment |
|---|---|
| Decision relevance | High |
| Sample stability | Low at hobby-project volume |
| Source dependence | High; closing-book coverage and translation must be reliable |
| Training safety | Low if used as an optimization target |

**Pros:** measures relationship to later market prices and observed outcomes.  
**Cons:** noisy, provider-dependent, vulnerable to overfitting, and inappropriate as the sole forecast-quality test.

## Trade-off analysis

Option A best matches the objective of improving human judgment because it evaluates the quality of the probabilities people will actually see and sharply exposes unjustified certainty. Calibration remains an independent veto. The other measures stay visible so the team can detect *how* a challenger differs without changing the promotion rule after seeing results.

## Consequences

- Evaluation-row membership, outcome encoding, probability bounds, push handling, and market weighting must be versioned and frozen before comparison.
- Pooled results must always be accompanied by moneyline, spread, and total breakouts and sample sizes.
- A lower team-score error, better CLV, or favorable win record cannot rescue a challenger that fails log-loss or calibration gates.
- The `0.002` protected-market tolerance, paired interval rule, season-week resampling unit, and `[0.8, 1.2]` slope range are structural configuration and may change only during offseason validation.
- Personal selections and their outcomes remain outside model training.

## Action items

1. [ ] Define the immutable evaluation-row and push contracts.
2. [ ] Implement the shared metric scorer for champion, challenger, and market baseline.
3. [ ] Add uncertainty estimates and per-market diagnostic breakouts.
4. [ ] Prove that a deliberately overconfident or degraded challenger is rejected and logged.
5. [ ] Reproduce the same decision from the same data, code, feature, configuration, and model hashes.
