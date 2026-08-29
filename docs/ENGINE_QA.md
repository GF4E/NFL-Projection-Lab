# Engine Q&A and decision ledger

The engine is built through auditable decisions without asking the owner to rubber-stamp commodity practice. The authoritative workstreams, questions, defaults, dependencies, evidence requirements, and acceptance gates live in [`config/engine-framework.config.json`](../config/engine-framework.config.json). Accepted answers live in the machine-validated [`config/engine-decisions.json`](../config/engine-decisions.json) ledger. The differentiation standard lives in the [`Novelty Charter`](NOVELTY_CHARTER.md).

## The loop

1. Classify the choice as established foundation or consequential product/research trade-off.
2. Apply an established default provisionally, document it, and test it without interrupting the owner.
3. Ask the owner only when the choice changes the human decision contract, cost or data rights, acceptable uncertainty, release risk, or another difficult-to-reverse boundary.
4. Record the answer, rationale, author, timestamp, and evidence. A preference may set a research direction, but it cannot promote a model.
5. Convert the answer into a falsifiable implementation hypothesis and freeze comparison rows, baselines, metrics, and leakage boundaries.
6. Implement the smallest challenger that can test the hypothesis, then run rolling-origin validation and required failure tests.
7. Accept, reject, or defer the challenger. Record the result even when it fails.
8. During the season, only weekly state and gated coefficients may update. Structural changes wait for offseason review.

The application UI remains compact. This ledger, experiment artifacts, hashes, and tests carry the complexity in the background.

## Required answer record

```json
{
  "questionId": "Q01",
  "answer": "...",
  "rationale": "...",
  "evidence": ["artifact, paper, source, or experiment reference"],
  "author": "...",
  "answeredAt": "2026-08-24T00:00:00.000Z"
}
```

An answer is not permission to skip validation. It defines what to test and what “done” means.

## Recorded decisions

| Question | Status | Decision | Architecture record |
|---|---|---|---|
| Q01 | Accepted design hypothesis; validation pending | Produce one joint home/away score distribution and derive all mainline probabilities from it. Use the result to facilitate human judgment by showing uncertainty, market disagreement, freshness, and material evidence. | [ADR-0001](decisions/ADR-0001-joint-score-decision-support.md) |
| Q02 | Accepted design hypothesis; implementation verification pending | Use pooled non-push log loss as the promotion metric, with calibration as a hard gate and Brier, score, market-level, uncertainty, and CLV diagnostics. | [ADR-0002](decisions/ADR-0002-challenger-promotion-metric.md) |
| Q03 | Accepted design hypothesis; bake-off pending | Compare a market-anchored discrete baseline, correlated negative-binomial model, and possession simulation under the same gates. Treat this machinery as foundation, not differentiation. | [ADR-0003](decisions/ADR-0003-score-model-bakeoff.md) |
| Q19 | Accepted decision-surface hypothesis; validation pending | Preserve the weighted estimate but label it fragile when material supported scenarios cross the edge or sizing boundary, and indeterminate when material state support is unreliable. | [ADR-0004](decisions/ADR-0004-scenario-fragility-status.md) |

## The ten workstreams

| Order | Workstream | Concrete result |
|---:|---|---|
| 1 | Champion baseline and objective | Reproducible target, baseline, metrics, and promotion scorecard |
| 2 | Coherent team-score distribution | One joint outcome distribution for scores and every mainline market |
| 3 | Live-line reliability | Per-game atomic, quota-aware, explicitly fresh snapshots |
| 4 | Automation control plane | Background-only writes and read-only public health observation |
| 5 | Current roster and depth state | Forecast-time player, role, participation, and starter state |
| 6 | Player-level contribution model | Validated player effects without double-counting team strength |
| 7 | Public-versus-sharp evidence | Honest separation of sentiment and reference-market movement |
| 8 | Historical market archive | Immutable opener, forecast-time, and closing contracts |
| 9 | Shadow season and failure testing | Prospective forecasts and rehearsed failure behavior |
| 10 | Public release and operations governance | Reproducible, sanitized, reversible releases |

## Promotion record

Every completed experiment records:

- question and answer IDs;
- code, data, configuration, feature-schema, and artifact hashes;
- training and evaluation as-of boundaries;
- champion, challenger, and market-baseline metrics on identical rows;
- calibration and uncertainty diagnostics;
- failure-test results;
- decision (`promote`, `reject`, or `defer`) and rationale.

No result from the site's temporary analysis slip or any personal selection is a training input.

## Current direction

Q01 through Q03 and the first distinctive decision-surface rule, Q19, are recorded. Remaining established defaults advance provisionally without owner ceremony. The next owner prompt must concern the distinctive decision dossier or another consequential boundary—not an ordinary modeling checklist item.
