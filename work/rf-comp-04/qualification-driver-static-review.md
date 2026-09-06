# First driver static review

Status: hold before execution for resource/cleanup corrections. No tests or scientific work executed.

The scientific scope is appropriate: new three suites, genuine retained tiny numerical observations, explicit controller routing evidence, current invalid-receipt/reentry CLI probes and authenticated unchanged full inference evidence. Retaining witnesses in finally before failure assertions is useful; unchanged large inference work is not repeated.

Concrete execution gaps in the inspected first driver:

1. The 600-second/2048-MiB total applies to preparation, authentication, execution and finalization. Parent authenticate/snapshot loops and post-child authentication have no shared deadline checks, parent memory is absent from sampled child/descendant RSS, and the last elapsed check precedes qualification serialization/write. An explicit report limitation does not satisfy the registered total. Add checks around streaming/copy/finalization, account for parent plus descendant memory, and check before success commit.
2. subprocess.run(timeout=20) kills/waits the direct CLI launcher only. Its separately sessioned worker can survive or reparent on timeout. Cleanup must account for actual owned descendants and preserve ownership/reaping guarantees.
3. The parent finally signals every numeric PID in its last sampled owned set. A descendant may already have exited and been reaped since that snapshot; this set is not durable signal authority. Reuse a qualified ownership/stop boundary or qualify the narrow replacement semantics rather than introducing stale-PID kills.

Expected failed_process status for the missing-receipt case matches the actual watchdog API. Normal successful tests alone would not exercise the above timeout/ownership gaps. Final acceptance remains pending corrected source and explicit bounded execution evidence.
