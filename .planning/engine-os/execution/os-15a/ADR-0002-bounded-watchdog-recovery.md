# ADR-0002: bounded watchdog recovery amendment

Status: frozen before final qualification replay

The first adversarial audit invalidated the v1 watchdog recovery assumption. A two-slot scan covers a normal two-minute cadence, but an unbounded scan after an extended outage can exceed a Worker lease and repeat forever.

Contract `interim-scheduler-contract.2026.2` supersedes v1 for OS-15A qualification. Each watchdog invocation processes at most 30 dispatcher slots and then appends a deterministic `watchdog_recovery_checkpoint` event. A later watchdog resumes after the greatest audited checkpoint. A crash before the checkpoint may repeat reads, but per-slot event and alert identities prevent duplicate evidence. The origin reconciliation pass remains independent of this operational backlog and never reclassifies an elapsed origin as prospective.

The amendment also freezes database-statement persistence receipts separately from application persistence requests. It does not authorize capture, provider dispatch, model execution, forecast publication, or replay of missed origins.
