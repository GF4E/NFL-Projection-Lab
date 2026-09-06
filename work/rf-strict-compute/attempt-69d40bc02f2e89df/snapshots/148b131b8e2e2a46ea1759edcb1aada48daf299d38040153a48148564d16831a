# Actual saved origin attribution review

Outcome: retain one **qualitative serialization-equivalence hypothesis for subsequent design**, conditional on the separate root integrity/resource and numerical exactness reviews. This review does not approve an implementation, timing gain, historical capacity, or new historical invocation.

Read the frozen design and canonical RF-COMP-04-ORIGIN-PROFILE-SCOPE.v1.md; inspected only saved stage, callback, function and caller records plus relevant existing function definitions. No harness import, fit, recovery, scorer, CDF, bootstrap, test or reprofile occurred. The six inspected record files authenticate against their retained artifact index (root owns complete identity/resource closure).

## Accounting

Independently summed all 88 ordered nonoverlapping callback intervals per route: 48 fit/recovery and 40 score callbacks, with no recorded errors. Plain B=0.447394833, F=0.035194875, S=0.151166000, remainder=0.261033958 seconds. Profiled B=1.048051708, F=0.062260334, S=0.164510837, remainder=0.821280537 seconds. Stage sums leave explicit unallocated 0.000057957 and 0.000135124 seconds respectively; origin accounting includes a slightly wider surrounding interval than B and is not substituted for it.

Profiled/plain B is 2.342565516. Six stage ratios range from 1.84646 to 3.94296. Both registered instrumentation thresholds fail (25% whole path / 50% stage), making attribution qualitative only. Fixed plain-first order also confounds cache/OS effects. Setup is separately 0.142551542 / 0.144191125 seconds and eight source scorer calls per route; it is excluded from B, not treated as free command work.

## One identifiable hotspot

`/private/tmp/os01-gen15-rebuild.9ny71k/scripts/research_score_conditional_run.py:53 strict` calls canonical conversion followed by the original pretty JSON encoder. Total 2,312 calls take 0.623516458 cumulative profiled seconds, a mixed-context total that must not all be assigned to remainder. The following direct edges are outside callbacks and nonoverlapping invocations of strict. Ancestor functions are shown to identify context, but their entire cumulative times are NOT added:

| Direct caller | strict calls | strict cumulative seconds |
|---|---:|---:|
| `/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-origin-profile/profile_origin.py:236 origin_evidence` | 2 | 0.008394166 |
| `/private/tmp/os01-gen15-rebuild.9ny71k/scripts/research_score_conditional_run.py:99 write` | 9 | 0.126631834 |
| `/private/tmp/os01-gen15-rebuild.9ny71k/scripts/research_score_split_compute_integration.py:36 grade` | 48 | 0.095562165 |
| `/private/tmp/os01-gen15-rebuild.9ny71k/scripts/research_score_split_controller.py:216 _validate_published_state` | 324 | 0.025781616 |
| `/private/tmp/os01-gen15-rebuild.9ny71k/scripts/research_score_split_controller.py:248 publish_origin` | 166 | 0.097365286 |
| `/private/tmp/os01-gen15-rebuild.9ny71k/scripts/research_score_split_controller.py:320 validate_publication_binding` | 6 | 0.029413834 |
| `/private/tmp/os01-gen15-rebuild.9ny71k/scripts/research_score_split_controller.py:352 _bank_state_digest` | 2 | 0.158821792 |

These sum to **557 calls / 0.541970693 seconds**, or **65.9909%** of the profiled non-callback remainder. Store.write callers in the saved graph are evidence persistence, grade, publish and mapper publication; none are numerical callbacks. Callback/recovery strict edges are excluded. No sum adds parent publish/grade/write duration to child strict time, and no nested canonical/encoded/JSON duration is added again.

The cost mechanism is repeated canonical tree conversion and sorted, indent=2 JSON rendering to exact UTF-8 bytes plus trailing newline. `research_score_conditional_replay.py:28 canonical` has 237,519 total recursive calls; `research_score_contract.py:22 encoded` has 2,656 calls; JSON encoder.py:183 encode has 2,730. These mixed-context counts corroborate the mechanism only. Their cumulative times overlap strict and each other. The two `_bank_state_digest` calls alone contain 0.158821792 seconds of strict work: they establish a before/after invariant and cannot simply be removed or reuse a hash by object identity.

The single next hypothesis is an **equivalent strict serializer for a narrowly guarded canonical input domain**, retaining the exact original bytes and rejection behavior, falling back unchanged outside that domain. It may reduce repeated Python rendering overhead without omitting fresh content reads, before/after state checks, hashing, source validation or durable publication. This profile proves neither an achievable algorithm nor that repeated calls received identical immutable values; broad cache reuse is not established. Any concrete implementation must independently qualify signed zero, strings/escaping, key ordering, nesting/indentation/newline, numeric types/nonfinite inputs, mutation and failure boundaries, then measure the complete declared path.

The 65.99% bucket exceeds the fixed 10% primary-target screen and the roughly 42.05% conditional-C requirement as an impossible remove-entire-bucket ceiling. Even under a hypothetical proportional extrapolation, saving 42.05% of remainder would require removing about 63.72% of this bucket; neither extrapolation nor such savings is demonstrated. No tiny seconds or percentage may be inserted into historical C. The separate callback 12.39% conditional target is unchanged.

For comparison only, `_bound_law` (research_score_split_grade.py:83) totals 128 calls / 0.026337952 seconds (3.21% of profiled remainder even before any overlap exclusions), and posix.fsync totals 12 calls / 0.000884541 seconds. Neither supplies a primary target in this tiny study. Their large-history significance remains untested; these observations do not justify deleting authentication or fsync.

## Limits

All timing shares are instrumentation/order-sensitive. Saved caller attribution does not measure removable work, a speedup, causal historical savings or full capacity. The declared tiny origin excludes annual selection, StrictSelectionFeed.add, full admission, large history/index effects, capacity smoke, bootstrap and a full controller terminal. They are unmeasured, not zero. Root and the other reviewer own resource/identity and scientific exactness acceptance respectively. Preserve failed historical identities, all 79 frozen sources, every scientific gate and the external 5%/prospective/product requirements. No rerun or optimization implementation authorized by this review.

## Inspected saved record hashes

- `child-result.json`: `d4645182eb6c9f6fd56ca06e78f468b915d5deeca1358d7aaf470bd538197267`
- `plain/stages.json`: `4f4c79e7df1e784dcc05da845c8d98c8315e0a659a122b5e629a04e112201e3a`
- `plain/accounting.json`: `218804d6b758c9618209fb7e65e0c41b8a20c09decb814680fc8813b0d23ff38`
- `profiled/stages.json`: `139a44db1276c6d42cfb3b7a0026be37c145c0074ce179f7475f7220374b3a53`
- `profiled/accounting.json`: `1eb7c06ab05ee1f35fd98f45ffdc8d68db038be65020f7afc9ace1eec0b99ae0`
- `profiled/pstats-records.json`: `6151b41734cff6c0a120cd684212f65a52992a7e98b732e3253b9f62a188a021`
