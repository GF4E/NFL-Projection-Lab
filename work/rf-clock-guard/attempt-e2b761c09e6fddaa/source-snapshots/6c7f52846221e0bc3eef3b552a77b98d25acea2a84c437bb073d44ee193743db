# Clock-check reentrancy diagnosis

The sole isolated diagnostic completed successfully: four cases, 0.0866 seconds, 24.140625 MiB peak child RSS. The parent imposed a 30-second / 1,024-MiB diagnostic bound. This used exact extracted AST bodies for the old/current `RuntimeEnvelope.check` and the inherited `_watchdog`, with explicitly synthetic clock/RSS/stop dependencies. No repository module or scientific callback was imported; frozen source hashes were authenticated before and after.

Both source versions falsely stop under this deterministic interleaving:

1. Outer check acquires `now = 100`.
2. One nested watchdog check acquires `101`, validates it and commits `_last = 101`.
3. Outer check resumes with its previously acquired `100` and rejects `100 < 101`.

The sample-acquisition sequence is increasing. Returning the outer sample after the nested call models the interruption; it is not a decreasing real-clock observation. Both versions also reject the separate, genuinely decreasing sequential control `[100, 99]`.

The actual RF-COMP-08 terminal SHA `1922fb7be8173333f937dc1f1022c20db5071be099493a6c61c21204d107b4ec` matches its retained index pointer (124,341 bytes). It records 113 completed origins, failure during 2016 week 12, `RuntimeStop: invalid_monotonic_clock`, scientific stop at 508.0557114169933 seconds and 1,031.203125 MiB. The last native inner-fit callback returned successfully; its following boundary check latched the stop. This is consistent with the reproduced mechanism. The terminal does not preserve the disputed `now`/`_last` values or signal interleaving, so exact historical causation remains inferred.

## Smallest corrective guard to qualify separately

Serialize the **entire outermost check**, including complete-smoke precedence, clock sample/validation/update, RSS sample/high-water update and all deadlines. Initialize an active flag and a pending-request flag before constructor checks. If `_watchdog → check` reenters while active, set pending and return **without acquiring a clock sample or changing any checked state**. The outer check clears active in `finally`; after a successful check it honors a pending request with another fresh, complete check. Use a loop so repeated signals do not accumulate recursive stack frames.

The active flag must be cleared before testing pending: a signal arriving afterward either performs a complete check itself or sets pending during the next active iteration. Failures still escape through the original `RuntimeStop`; no follow-up science is permitted after a stop. Preserve the original metadata-phase watchdog dispatch, which directly enforces its separate finalization deadline.

This removes the shared-state reentrancy rather than weakening comparison. Do not add epsilon, clamp `now` to `_last`, swallow clock failures, or merely reread until a favorable value appears. Blocking SIGALRM only on the main thread is not sufficient evidence by itself when process signals can be delivered to another unmasked native thread.

Before any successor: deterministically inject at the sample/compare/update and guard-release boundaries, demonstrate pending-request handling, and retain genuine backward-clock/nonfinite failures, earlier complete-smoke and total-deadline precedence, RSS high-water behavior, exceptions/interrupts, and metadata-only closure. A shortened actual signal test should complement the deterministic probe. This diagnostic implements no guard and authorizes no retry or reopening of the closed RF-COMP-08 identity.
