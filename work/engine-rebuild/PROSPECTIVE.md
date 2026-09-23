# Prospective paired comparison implementation

REVIEW REQUESTED — two Tier 2 choices: (1) freeze the reference fit and calibration at enrollment instead of separately refitting that reference method each week; (2) enroll the remaining regular-season game IDs and review after Tuesday closeouts instead of stopping at a fixed game count. The result describes the governed live policy versus a frozen-fit anchor, not the causal value of one feature or independent confirmation of superiority. Neither choice changes a registered gate. No comparison is enrolled yet.

The new path can retain a reference scorer, capture paired forecasts from identical available football inputs before T-75, select the pair matching the actual first lock, and report first-grade accuracy without rescoring or fitting. It cannot promote, reject, tune, reverse a release or call a provider. Existing forecasts and grades are untouched.

## Enrollment and evidence contract

Enrollment requires the active qualified SCHEDULED pipeline, the one hash-verified authoritative control in the series registry, and an exact registry association through `production_pipeline_ref` and `production_verified_at`. Those fields must come from the future actual production/control verification, never be populated merely to pass admission. The control generation date is retained. The current host fails at `Qualified scheduled issuing path required`; no enrollment, plan pointer or prospective evidence was fabricated.

A future enrollment retains the frozen fit/calibration bytes and references, all scorer Python source bytes and hashes, Python/NumPy/platform identity, pinned schedule reference, all eligible remaining regular-season game IDs, concrete Tuesday review dates, and the no-confirmatory-claim policy. The reference uses the same live input DTO, including the common prepared feature values; it is a frozen fitted scorer, not a separately reconstructed old feature pipeline. Registered production changes remain governed separately. Rescheduled games retain enrollment and use their own verified actual kickoff/deadline. Week labels do not exclude an enrolled rescheduled game.

The immutable enrollment pointer is written before its research-ledger event and physical-observation receipt. A lost response resumes the original plan. A production forecast must follow that receipt, not merely the timestamp inside an in-progress plan. The reference code can be restored into a separate directory and executed there after current source changes; differing existing files refuse overwrite. Runtime incompatibility refuses execution rather than silently changing dependencies. This code restoration uses the already-qualified runtime and does not establish a new native-runtime recovery proof.

Each pair binds the live immutable input bundle, exact shared input bytes, live calibration, frozen reference output/contributions, completion time and a post-write acknowledgment. Calculation crossing T-75 is refused. A write acknowledged after T-75 is explicitly LATE. An existing committed pair retries without rescoring; an unacknowledged pair cannot become on-time through a late retry. Reports select only the bundle in the actual lock, so an earlier more favorable forecast cannot replace it.

## Report meaning

Every enrolled game remains in the denominator. Missing locks, missing pairs, late/unqualified pairs and missing first grades are named shortfalls. These include future games awaiting their records and are not all operational failures. Paired graded games report team, margin and total MAE, RMSE, signed bias, projected/actual dispersion, CRPS, PIT counts, interval coverage/width/score at 50 and 80, winner Brier/reliability, pooled and by week. Both teams stay together in each game. Reports bind the first grade and read saved forecasts only. They record REPORT_GENERATED without claiming anyone viewed it.

There is no significance test, repeated-peeking promotion rule, fitted candidate, accuracy claim, market input or model-selection gate here. Historical development evidence is not relabeled prospective. A confirmatory design and any future statistical promotion still need their own preregistration and reviews. The legacy ridge-center meaning remains explicit until an independently qualified mean-based release.

## Verification

Sixteen new tests pass locally, including a real prepared-cutoff → publisher → paired scorer → lock → first grade → report fixture. That integration uses synthetic inputs/clocks and an intercepted display boundary; bundle, chronology, issuance receipt, reference worker, lock and grade verification run normally. Nineteen existing bundle and ten research-ledger checks also pass locally. Tests preserve failures: the new enrollment retry exposed and fixed a local variable shadowing the plan reader; an integration fixture initially used the wrong team identity and was corrected from its source schedule, without weakening validation.

Linux: 53 tests pass on 348 individually hashed staged Python files under service UID 1000, one numerical thread, private network and verified live 4 GiB/570-second limits. The actual frozen scorer reproduces all 16 captured upcoming production forecasts exactly. A separate direct coefficient/standardization calculation checks all 32 team scores within 1e-12. These are captured-input numerical checks, not prospective forecasts or outcome evidence. All 52 original locks/grades and active fit pointer remain unchanged. Application verification took 25.367 seconds; exact-invocation terminal-success journal spans 36.144 seconds.

The first Linux attempt exited 75 before its worker because the production dispatch lock was unavailable for 30 seconds. It is retained separately. Attempt 2 used a 420-second maximum wait inside the same 570-second total limit and finished successfully; no production owner was interrupted. No new provider requests or spending. All 46 issuing files remain unchanged, preserving the existing release recovery proof.

## Installed inactive source

Source commit 9c8f75868 is pushed to engine-v2. Actual host 68225099e167785ef50e4a5bf65ff5fe4c594331, under UID 1000, matches both new implementation hashes. At 2026-09-23T22:07:26Z admission still correctly refused the unqualified scheduled issuing path, with zero enrollments and unchanged fit 801ef079. The installed cutoff worker reports WAITING_FOR_CUTOFF, next 2026-09-25T13:00Z. See prospective/host-installed.json. Source arrival is not collector installation or live enrollment.

## Remaining work and operation

This implementation does not install a collector or claim unattended collection. After actual cutoff/issuance qualification and honest control-registry association, enroll the exact population before the first included forecast, restore the frozen scorer, and integrate collection under the existing dispatch owner before T-75. Retain per-attempt operational failure reasons and verify a real shadow/lock/grade/closeout cycle. Enrollment and scheduled collection must not be inferred from this canary. The future qualifying control and enrollment hash do not yet exist. The full rebuild remains active, with requirements 10b/10c PARTIAL.

CLI: `scripts/projection_prospective.py` exposes `enroll --schedule-ref JSON --season YEAR`, `restore --plan-ref JSON --destination PATH`, `pair --plan-ref JSON --card PATH --scorer-root PATH`, and `report --plan-ref JSON`. All accept `--root` before the subcommand. Run with the pinned Python under the resource/dispatch supervisor; do not run enrollment against a fabricated registry association. See prospective/linux-attempt2.json, linux-source-manifest.json, linux-harness.py and linux-attempt2-terminal.json.

Least certain: whether a fixed-fit anchor is the preferred reference rather than a separately refitted method. That difference changes the interpretation, so it is a visible review flag and not silently described as method superiority.

Confidence: medium — numerical equivalence holds on authoritative captured inputs, while the prospective design depends on the defensible frozen-fit choice and has not run live. Lower to low if independent recomputation disagrees or review requires a different reference update policy. No confidence rating on improved prediction accuracy is claimed.
