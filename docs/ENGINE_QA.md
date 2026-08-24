# Engine Q&A and decision ledger

The engine is built through one auditable decision at a time. The authoritative workstreams, questions, defaults, dependencies, evidence requirements, and acceptance gates live in [`config/engine-framework.config.json`](../config/engine-framework.config.json). Accepted answers live in the machine-validated [`config/engine-decisions.json`](../config/engine-decisions.json) ledger. This document defines how those questions become code.

## The loop

1. Ask the next unanswered question in sequence.
2. Record the answer, rationale, author, timestamp, and evidence. A preference without evidence may set a research direction, but it cannot promote a model.
3. Convert the answer into a falsifiable implementation hypothesis.
4. Freeze the comparison rows, market baseline, metrics, and leakage boundary before fitting.
5. Implement the smallest challenger that can test the hypothesis.
6. Run rolling-origin validation and required failure tests.
7. Accept, reject, or defer the challenger. Record the result even when it fails.
8. During the season, only weekly state and gated coefficients may update. Structural answers wait for the offseason review.

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

## Current question

Q01 is recorded. The next open question is Q02: which metric decides whether a challenger is genuinely better? The recommended default is pooled non-push log loss as the promotion metric, with calibration as a hard gate and Brier score, score error, market-level results, and CLV as mandatory diagnostics.
