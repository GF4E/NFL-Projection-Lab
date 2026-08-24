# Contributing

NFL Projection Lab is a hobby analytics project. Contributions should improve
reproducibility, calibration, data quality, or the clarity of uncertainty—not
promote guaranteed outcomes.

## Workflow

1. Open an issue describing the statistical hypothesis or defect.
2. Create a feature branch.
3. Add leakage-safe tests and document data provenance.
4. Run `pnpm verify`.
5. Open a pull request with the validation evidence.

## Model-change evidence

A model or feature change must state:

- The source, license, grain, and timestamp of every new input.
- The exact forecast cutoff and why the feature is available at that time.
- The champion baseline and the same rolling-origin evaluation rows.
- Log loss, Brier score, calibration slope, score/margin error, and coverage of
  any prediction interval.
- An ablation showing the change adds value beyond the market baseline.
- Whether the change is structural and therefore offseason-only.

Do not select features or tune hyperparameters on current-season outcomes.
Never train on the project's displayed opportunities or user decisions.

## External projects

External code may be incorporated only when its license permits it and its
behavior is covered by local tests. A public repository without an explicit
license is reference material, not copyable source. Record every candidate in
`docs/RESEARCH_REGISTRY.md`.

## Style

- Keep public HTTP behavior read-only.
- Fail closed on stale, partial, or schema-invalid data.
- Use plain labels such as `market pressure` unless the underlying source
  actually reports bet count and handle. Never infer a `sharp` identity from
  line movement alone.
- Keep educational-use and uncertainty language intact.
