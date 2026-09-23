# Bounded full-lifecycle storage profile

The goal remains ACTIVE. This is operational verification with captured data and simulated availability, issuance clocks and final scores, not a statistical experiment or live activation. No provider requests, new spending, altered model settings or weakened deadline.

The previous profile's complete evidence was lost when its 570-second limit killed it. The observer now measures allocated blocks with one stat per entry, counts hardlinks once, excludes symlinks, and persists partial evidence at atomic boundaries and lifecycle phases. It reports its own cost and never qualifies capacity automatically. Five local observer tests, four Linux observer tests and 17 existing storage tests pass. Kill injection proves durable partial measurements survive process death; sparse-file coverage distinguishes allocation from logical length.

The first revised launch (attempt2) failed before computation because the service account could not create the new directory. Its original stdout/error and failure receipt are retained. The owned-container correction precedes attempt3; neither workload nor resource limit changed.

Attempt3 is INCOMPLETE_DEADLINE (exit 137), not a passing full lifecycle. It completed the real recorded refit/release and all sixteen isolated locks, then reached the same 570-second bound before rollback/grading finished. Zero synthetic grades were present. Separate host checks confirm all 52 original lock/grade hashes and the active fit remain unchanged. The fixture and checkpoint are retained rather than deleted.

| Completed boundary | Elapsed seconds |
|---|---:|
| Captured state ready | 15.654 |
| Simulated public closeout verified | 104.149 |
| Full recorded refit and release | 328.592 |
| Sixteen forecasts locked | 563.414 |

At the last durable observation, the isolated tree reached at least 34,099,200 allocated bytes (32.52 MiB), versus 33,488,443 logical bytes; largest staged file 1,522,643 bytes, peak 283 files. These are observed lower bounds, excluding filesystem metadata, between-boundary transients and the unfinished stages. They cannot justify a complete reserve.

Across 298 samples, scanning cost 3.431 seconds and checkpoint writes 0.892 seconds, together 4.324 seconds out of 563.430 observed seconds. Process CPU was 266.956 seconds; peak parent RSS 215,416,832 bytes. Child CPU is reported separately. Do not attribute the difference between CPU and wall time to any one cause without more evidence. The observer is too small a measured share to explain the deadline failure by itself.

Evidence: storage-profile-attempt3-verification.json, original storage-profile-attempt3.stdout/log, attempt2 failure records and test logs. Earlier successful tmpfs lifecycle results stay valid for their original environment; they do not replace this real-volume failure. Do not repeat the unchanged composite or enlarge its deadline on this evidence. A measured code correction requires fresh bounded qualification. Next performance work must isolate actual reconstruction/publication stages and preserve their timings before another full qualification. Complete executable/runtime recovery remains separately planned in EXECUTABLE-RUNTIME-PLAN.md.

## Measured bottleneck and corrected duplicate work

A separate read-only cProfile of one retained forecast took 22.773 seconds; 30 full-state identity computations accounted for 15.895 seconds. The renderer attached the same history hash independently to every produced team row. Row annotation never mutates the rendered state. Tier 1 correction: compute it once per season/week rendering context, retaining the input-state hash check and recomputing on every independent call. No cross-call cache, changed numerical input or reduced corruption check.

The candidate function was exercised in memory on the actual Linux service runtime, against all 16 retained forecasts across three preparation/fit contexts. Every reconstructed preparation byte and forecast value matched its pre-change record; isolated locks remain unchanged. The same focused profiled check now takes 11.147 seconds and invokes state identity three times, spending 1.850 seconds in it. The full-slate unprofiled verification took 13.266 seconds. Timings are individual observations, not a general throughput promise. See forecast-verification-profile.json and render-identity-host-parity.json; check_render_identity.py preserves the candidate parity procedure.

The full 490-test local projection suite passes, including 29 pipeline tests. Tests verify context separation, unchanged original state and fresh identity after a later state mutation, alongside the existing chronology, corruption and lock assertions. Full lifecycle qualification on this changed code remains the next bounded run; earlier failures are never relabeled as passes. No deadline extension.

Daily storage observations have not spanned a full day; their normalized rates are extrapolations and include setup/canary activity. The headroom alert remains. Git repack, backup/restore and full historical experiment writes need separate reserve evidence.

Least certain: where the remaining execution time is spent and how a complete real-volume cycle behaves; no complete-peak or deployment-readiness claim is made.

Confidence: medium in operational readiness—authoritative captured inputs support completed stages, but readiness depends on unresolved runtime and timing choices. Lower to low if independent execution breaks an immutable record or chronology boundary. The stored byte counts are direct measurements, not a claim of sustained capacity.
