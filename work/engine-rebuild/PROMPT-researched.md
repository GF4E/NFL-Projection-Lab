# PROJECTION ENGINE REBUILD — researched implementation prompt

DRAFT FOR ADOPTION. Writing this document does not activate a goal, schedule, experiment, policy amendment, spending, or release. Research reviewed 2026-09-21 Pacific. This replaces the previous rebuild prompt when Gabe adopts it; historical specifications, experiments and issued records remain preserved.

## Goal

Deliver a football-only expected-team-score system that reliably issues and grades forecasts, detects and safely recovers from defined operational failures, and improves through one reproducible, reviewed experiment per week. Every production number must trace to its available inputs, cutoff, point model, calibration and release. Preserve the qualified model as the control until a successor earns promotion. Reliability and predictive improvement require separate evidence; neither is guaranteed by automation.

## 1. Scope, authority and first deliverable

Read the complete September 21 audit, rebuild plan, latest user instructions, AGENTS.md, governing protocol, release registry and current queue before implementing. Repository of record: GF4E/NFL-Projection-Lab. Verify the current checkout, remote and actual host state; do not assume the audit snapshot is still today's deployment.

Write PLAN.md, a requirement-to-file-and-test map, and STATUS.md before edits. STATUS.md carries completed work, remaining dependencies, exact next action and a handoff. Publish the tiered gap sweep; decide Tier 1/2 conventions and batch only Tier 3 questions. Treat missing data as unknown, not zero or evidence against a method.

Explicit proposed amendments adopted with this prompt: source timestamps follow verified provider semantics; expected team points target conditional means while team MAE remains the standard selection metric; E-CAL-LINEAGE below receives its narrow uncertainty-only gate; E-CAL-LINEAGE precedes E-VENUE-DIRECT, followed by the existing queue. These changes are prospective and must be logged before registration. No other gate or rejected experiment is reopened.

Continue within existing commit, deployment, provider-budget and reviewer permissions. No new spending, destructive retention policy or external reviewer message is authorized implicitly. Prepare concrete choices only for genuinely missing authority. A completed review is never inferred from silence or from the same agent rereading its own work.

## 2. Freeze and independently reproduce the foundation

Hash the deployed code, environment, settings, input manifest, fit, calibration, publication and authoritative rolling-origin series. Reproduce the audit against its original snapshot and reconcile the current deployment separately. Preserve partial-week denominators and model versions. Do not pool retrospective reconstructions with AS_ISSUED forecasts.

Use an independent numerical route for the ridge and principal metrics, not two wrappers around one helper. Independently verify representative feature calculations from source records, including baselines, Elo, drive denominators and cutoff eligibility. Reordering rows must not change forecasts. Keep training, calibration, issuance and evaluation identities distinct.

No candidate fitting begins without a verified authoritative-control premise line naming the file, hash, generation date and production lineage. Retain league-average, venue-average and persistence forecasts as descriptive accuracy baselines, calculated using the same eligible games and pregame information.

## 3. Establish three release lanes

A. Infrastructure and presentation corrections preserve the existing numerical forecast bundle. Require parity, fault tests and deployment verification; they do not need a 1% MAE gain.

B. Source or chronology corrections may legitimately change forecasts. Record the old/new evidence and all affected games, rebuild the corrected control, apply the same correction to every challenger and disclose the changes. Do not attribute their benefit to a model candidate. Promote control authority only after verifying the corrected issuing path. A discretionary change to the model's information horizon is not automatically a chronology correction; classify it in the gap sweep.

C. Statistical changes to features, rating/update rules, point forecasts or calibration require a registered experiment and its applicable gate. Do not ship a rejected state-space filter as an infrastructure repair. Weight-only refits remain a separate authorized operation with unchanged method settings.

## 4. Make failures recoverable without corrupting evidence

Implement a small explicit recovery state machine: HEALTHY, DEGRADED, RECOVERING, STALE and FAILED_CLOSED. Specify the evidence, allowed actions, retry limit, deadline, owner and exit check for each transition. Reuse existing tooling; avoid a new orchestration platform unless necessary.

For low storage, check bytes, inodes and write capability. Measure daily growth, largest bounded job writes and retention obligations. Publish a durable headroom requirement and approved-cost plan. Deduplicate exact content by hash and separate disposable caches from records of authority. Cache cleanup cannot be the permanent capacity strategy. Do not remove historical evidence or change its retention without authority. Verify backup restoration from approved storage; a backup's existence is insufficient.

Use staging, validation, durable atomic commit and a final publication pointer. Hash and fsync semantics must survive a crash at each boundary. Protect the pipeline with exclusive ownership/fencing and durable work identifiers. Execution may repeat; its committed effects must be idempotent. Reuse an idempotency key for the same operation; changed payloads under that key must fail. Reconcile receipts before retrying an uncertain paid request; a local key does not make a provider API idempotent.

Allow only enumerated recoveries: bounded backoff with jitter, regeneration of allowlisted caches, checkpoint resume, safe service restart and compatible release rollback. Configuration/schema/credential errors do not get endless retries. Missing required evidence cannot be fabricated. A stale source timestamp cannot be refreshed by rewriting publication metadata.

Missed cutoffs can be replayed using data demonstrably available at those cutoffs. Later-arriving data cannot be backdated. If historical availability is unknown, label a reconstruction rather than issuing it retrospectively. Never rewrite a locked forecast or its first grade. Source corrections become linked amendments with separate corrected summaries.

An independent watchdog compares expected deadlines with durable receipts and the user-visible publication. It must detect both a dead scheduler and failure of its own heartbeat. Report whether the watchdog shares the host's failure domain; do not claim host-outage protection without an outside observer. Alert only on actionable failures, exhausted recovery or material recovery.

Define operational SLOs before testing: on-time valid issuance divided by eligible scheduled games; grade latency from first verified final availability; publication completeness/freshness; and recovery time. Show missed games in the denominator. Record hard integrity invariants separately: zero rewritten locks, early results, duplicate committed effects and false-success publications. Derive latency/headroom targets from actual deadlines and measurements, not invented reliability percentages.

## 5. One immutable forecast contract

Bind game identity, kickoff, issuance, state cutoff, input event times, source publication/first-seen times, retrieval times, data revisions, hashes, code/environment, settings, training population, fit, calibration, seeds where applicable, forecast outputs, contribution tables, evidence status and release parent in one immutable bundle.

Use typed allowlisted football inputs. The forecast worker must not read final labels or market fields. Baselines, scaling, imputation, ratings, tuning and calibration must respect the same pregame boundary; protecting only the final regression is insufficient.

Resolve by exact hashes, not a version string. Validate compatibility before publication. Board, grader, closeout and Season page must read this bundle or a declared derivative. Current references follow the current authoritative lineage; historical reports keep their own labeled reference. Reports never trigger fitting.

A release manifest binds code, fit, calibration, schema and required data together. Rollback switches a compatible manifest for future work; it does not combine an old executable with new incompatible state or relabel locked forecasts. Existing locked games continue to grade from their original bundles.

## 6. One time model and production/replay entry point

Parse source times according to the source's verified data dictionary. nflverse/Lee Sharpe schedule gametime is Eastern time, not stadium-local time. Use America/New_York with daylight-saving rules, then UTC; Pacific schedules use America/Los_Angeles. Fixture-test west-coast, international, DST, rescheduled and boundary-equality cases. Never reinterpret a UTC timestamp twice.

A game is eligible for assimilation only when actual played kickoff plus four hours is strictly before the cutoff. Keep this as the governing eligibility proxy; do not describe it as an observed completion timestamp or a universal guarantee that every game ends within four hours. Production also requires qualified final data actually available at the cutoff. Historical provider-vintage gaps remain disclosed assumptions and cannot establish historical live availability.

A forecast uses the most recent scheduled cutoff strictly before its own T-75 issuance. No game is incorporated twice. Games inside the same assimilation interval use the same state. Week numbers label schedules, never order data availability.

Install and verify Friday, Monday and Tuesday 06:00 PT assimilation using the approved production method; Friday 12:00 and Sunday 07:00 refreshes; T-80 pull/inactives attempt; T-75 lock; daily grading; Sunday 20:00 next-week PARTIAL sheet. Preserve offseason/Week 9 post-processor cadence unless a specific adopted registration permits otherwise. Conditional components such as an unpromoted ensemble must be labeled inactive, not reported as running.

Keep rating-state updates, weekly ridge refitting and calibration refitting distinct. If a qualified state-space filter is used, elapsed-time propagation must preserve weekly q units; three executions must not triple weekly process variance. Resolve information-horizon changes explicitly rather than silently converting the current weekly model to an unregistered update rule.

Replay every 2016–2025 eligible game through the same issuing function. Trace direct and downstream differences by season. No live release until cutoff, availability, duplicate and immutable-lock tests pass.

## 7. Forecast meaning and uncertainty

Expected team points target conditional means. Team MAE remains the governed primary point-accuracy metric; RMSE is supporting evidence because absolute and squared loss target different functionals. Do not silently convert existing legacy centers into means or change to median forecasts to optimize a label. Preserve and label the legacy convention until a qualified release makes the new contract true.

For a coherent mean-based release, mean total equals the sum of team means and mean home margin equals home minus away mean. Median totals need not equal sums of team medians; do not enforce a false identity. Predictive intervals describe single-game outcomes, not coefficient confidence intervals. More training data need not materially narrow them.

Document tie handling and probability events. Do not require the team with the higher mean score to have probability above 50%; skewed distributions can disagree. Validate probabilities, interval nesting, score support and quantile conventions. Use a qualified dependence representation; do not assume independent team errors or demand a new joint ensemble without evidence.

Contribution tables must sum to the point forecast, include any point calibration term and distinguish inactive contextual facts from causes that moved the score. Never inflate point dispersion to match actual-score dispersion.

## 8. Unblock calibration correctly: E-CAL-LINEAGE

This is a new lineage-migration question, not a rerun of E-UNC's rejected hypotheses. Register one challenger using the existing qualified calibration family/settings on the issuing point model's own earlier out-of-fold errors, against the current issued calibration. No point feature, point coefficient or point forecast may change. Specify fitting windows, location/mean treatment, residual dependence, ties and discrete scoring before hashing; any extra calibration family requires separate registration.

Proposed narrow gate, effective only when this prompt is adopted: at least 1% improvement in out-of-fold mean team-points CRPS; team, margin and total coverage within three percentage points of nominal at both 50% and 80%; no worsening of the Winkler interval score at either level for any of those targets. Point forecasts must match the control within a preregistered numerical tolerance on every eligible game. Report identical team MAE; report margin/total CRPS and winner Brier/reliability as supporting evidence. Failure of point invariance is out of scope, not a scored result.

This explicit exception prevents an uncertainty-only repair from facing an impossible point-MAE gate. It does not change future point-method gates or reopen E-UNC. Log the one-time prospective calibration release separately from routine offseason/Week 9 refits. If rejected or blocked, retain the legacy distribution with honest provenance and continue independent infrastructure work; do not claim distribution migration complete.

## 9. Next accuracy experiment: E-VENUE-DIRECT

After calibration disposition, register the smallest defensible direct venue feature in the point model. Use the authoritative control current at registration. Historical home-margin bias motivates the question; it does not establish the answer or justify a hand-added generic advantage.

Freeze the candidate count, neutral-site treatment, parameterization, tuning bounds, training windows and tie-break before fitting. No simultaneous QB, state-space, weather or baseline redesign. If another method is needed, queue it separately.

Standard gate: at least 1% out-of-fold team-MAE improvement; margin and total coverage within three percentage points of nominal at 50% and 80%; all existing applicable registered requirements. Report home/away signed errors by season, supporting metrics and parameter stability. Prefer the simpler candidate under the preregistered tie rule. Failure retains the control. E-QB-DIRECT and other existing items remain queued afterward; settled rejections stay preserved.

## 10. Learning without repeatedly overfitting the backtest

Every Tuesday: publish completed-week closeout and Season refresh; perform the authorized weight-only ridge refit; then run the week's registered experiment; produce the reviewer packet and decision. Prove ordering with durable receipts and timestamps. Missing finals produce a named incomplete closeout and block dependent work; clock expiry still advances the queue.

Preregister no more than three challenger settings, the control, exact population, folds, all preprocessing/tuning/calibration, selection rule and disproving condition before comparative results. Use nested chronological evaluation; train only on the past. Both teams stay together in every split and resample. Report paired-game uncertainty plus season/block sensitivity with the estimand and limited number of seasons explained.

Maintain an experiment ledger of every tried configuration, failed/invalidated run, data correction and viewed evaluation. Ten reused historical seasons remain development evidence regardless of the number of nested replays. Do not call another bootstrap or a new random split an independent replication.

Maintain a predeclared prospective comparison between a frozen reference method and the live method, both issuing shadow forecasts from the same available inputs before lock. Freeze update policies, eligible games and review dates; weekly tables are descriptive. No repeatedly inspected significance threshold triggers promotion or reversal. A new confirmatory statistical claim needs a preregistered fixed-horizon or valid sequential design; that changes neither the current release gate nor prior records silently.

Weekly diagnostics include team/margin/total MAE, bias, dispersion, proper scores, interval coverage/width, home/away errors, qualified input buckets, persistent team misses and pre-lock edits. Preserve counts, paired uncertainty and first-grade provenance. Bucket/drift alerts nominate investigations; they never change weights, retire a model or prove causation. Aggregate distribution shift does not by itself prove performance degradation.

Keep each registered experiment clock Tuesday-to-Tuesday. If closeout prevents registration entirely, record a missed slot in the operational ledger; do not invent a preregistration timestamp or write a fitted experiment artifact. Production preconditions still bind every queued item. For a registered experiment, record INCONCLUSIVE with the blocker at expiry; do not let one experiment block the queue twice. Preserve the required Claude and Dr. M reviews, resolve leak/double-count objections and publish the signed release decision. Automated method activation can occur only after those requirements and existing authority are satisfied. Review unavailability is a named human dependency, not an excuse to invent approval.

Market-relative metrics remain exactly the existing two DIAGNOSTIC ONLY report lines, never model inputs, gates, targets, rankings or a reason to change the engine.

## 11. Resource protection, deployment and proof

Keep one worker, 4 GiB, the 45-minute phase-gate limit and 10-minute full-slate update limit. Production deadlines take precedence over research. Cache/checkpoint research and defer it when it cannot finish safely before issuance. Shadow work uses captured inputs and isolated outputs, not extra paid pulls or duplicate publication. Any capacity exception needs approval.

Test candidate code on production-equivalent captured inputs without production writes. Then perform a bounded operational canary and verify the actual host's manifest and public output. Canary latency, schema and integrity checks establish deployment safety, not better football predictions. Switch the release pointer atomically. Preserve a verified rollback manifest and test restoration with immutable records intact.

Fault-inject: disk/inode exhaustion, crash before/after durable commit, duplicate dispatch, lost response, stuck ownership, clock/timezone errors, provider late revision, missing calibration, stale publication, schema mismatch, watcher failure and restart during assimilation. Verify the recovery outcome, not just detection. Some failures require human intervention; unsupported auto-recovery must fail closed and explain why.

## 12. Acceptance and delivery

Build a coverage matrix linking every numbered requirement to implementation, a test or measured evidence, and an unresolved dependency. No single green test count certifies the system. Major paths require an end-to-end run from available input through issuance, lock, final grading, closeout, refit, experiment decision and verified publication. Use simulated time for calendar boundaries and safe host checks; label simulation separately from observed production cycles.

Completion requires verified infrastructure migration, restored evidence/lineage controls, installed cadence within the approved method, tested recovery/rollback, and an honestly reported disposition for each statistical migration. A rejected candidate can complete the experiment but cannot complete an unshipped statistical objective. Report reliability readiness and accuracy improvement separately. A future completed live cycle remains pending until it happens.

Deliver code, manifests, replay tables, recovery receipts, source/parameter lineage, operational targets, runbook, independent review packet and concise release history. Status must state which actions are automatic and which still require a person. Report DONE, TESTS, ARTIFACTS, BLOCKED, COMMIT, host/deploy hash, provider spending, the least-certain requirement, and a worded confidence rating with a downgrade condition.

Do not claim automatic recovery from every possible failure or guaranteed week-over-week predictive improvement. The deliverable is a system that detects defined failures, recovers when safe, preserves truth when it cannot, and changes its statistical method only when reproducible evidence supports the change.
