# Qualification implementation decisions

- The preregistered development gate is frozen in PLAN.md at Git commit d0c78b3. The fitted protocol hash records its exact bytes. No gate was adjusted after comparative results.
- The same actual game outcomes and paired team predictions are used for every comparison. Full subset ablations refit and retune, rather than merely zeroing a correlated coefficient.
- Calibration is an optional group, not an automatic intercept. With no admitted group, the output is exactly the raw football PPD-times-pace baseline with no additional decay.
- The displayed football explanation decomposes that baseline exactly into offensive production and defensive resistance at common expected pace. A qualified baseline calibration scales both pieces by the fitted slope. Their sum equals the original baseline-plus-calibration margin contribution within 1e-9. This changes explanatory arithmetic only, not fitted scores or qualification gates.
- The publisher preserves original v1 locked, final and retrospective cards. It never generates retrospective v2 predictions. If migration reaches a game after its deadline, only an already issued pre-deadline v1/v2 estimate can lock; otherwise it is MISSED.
- Source preparation is cached by the frozen fit, football manifest, stadium table and feature-code hashes. The cloud scheduler does not refit or repeatedly reconstruct unchanged features.
- Stored old forecast responses may be reused as input evidence if temporally qualified; this task makes no provider call. Rejected wind is zero-weight even if a forecast exists.
- Initial qualification reached the wind candidate and found its pinned source represents mph as text. The adapter now parses measured mph to float without substituting missing values. All qualification is rerun under the unchanged gates. No fitted artifact was published by the interrupted attempt.
- Fit hashes now bind the exact model matrix, baseline, outcomes and unique row IDs. Complete source/metadata hashes remain in the experiment. This removes repeated serialization of unused provenance metadata during each fit; it changes no prediction arithmetic.
