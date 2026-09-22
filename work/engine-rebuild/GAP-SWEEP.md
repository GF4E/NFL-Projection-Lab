# Initial full-specification gap sweep

This is the infrastructure/adoption sweep, before implementation. Each experiment additionally requires its full executable parameter/coverage sweep before any fitting. Unresolved experiment conventions cannot be silently filled during a run.

| Item | Tier | Decision / reason / remaining evidence |
| --- | --- | --- |
| Draft status versus new active goal | 1 | The new user goal adopts the attached full specification; log its explicit amendments prospectively. |
| Exact write payload format | 1 | Retain sorted compact JSON plus newline; parity with existing save. Use same-filesystem staging, file fsync, atomic namespace operation, parent directory fsync. |
| Concurrent immutable first write | 1 | Atomic create-if-absent with exact-byte retry comparison; never overwrite a different committed value. Mutable writes have atomic visibility; workflow ownership remains separate. |
| Success after rename but before receipt/fsync | 1 | Report failure/uncertainty, retry the same logical key, inspect committed bytes and complete durability; do not assume no effect. |
| Automatic deletion scope | 1 | Existing user authorization covers regenerable package caches only; all artifacts/locks/grades remain. New retention policy not implicit. |
| E-CAL gate routing | 1 | Only explicit E-CAL-LINEAGE policy can use the newly adopted CRPS exception; old/unknown experiments retain standard MAE rules. Pure gate validation never activates. |
| Existing timezone code | 1 | Shared schedule_kickoff already uses Eastern; add regression fixtures and integrate remaining duplicated callers later. Do not label unchanged conversions numerical corrections. |
| Source completion proxy | 1 | Kickoff+4h strict cutoff stays; live final-data availability required, historic vintage gaps disclosed. |
| Independent monitoring | 2 | Prefer existing host watchdog plus an outside observer on already authorized infrastructure; same-host-only monitoring cannot certify host-outage coverage. Deployment availability still to inspect. |
| Legacy point/distribution mismatch | 2 | Preserve and label legacy centers until a registered migration qualifies; never force higher-mean winner probability >50%. |
| Cadence implementation using current method | 2 | Preserve current Elo/PPD mathematical update formulas, time-filter their inputs under adopted cutoffs. Inventory direct and downstream effects. Do not activate rejected Kalman method. Any additional parameter is Tier 3. |
| Production versus gate compute | 1 | Production deadlines first; checkpoint/defer research; no second worker or deadline extension without authority. |
| Live-cycle evidence | 1 | Simulation can prove fixture behavior; actual scheduled completion remains pending until observed. |
| Durable capacity beyond existing disk | 3 authority | Root block device is 10 GiB with no useful unallocated expansion. Prepare measured storage plan and bounded-cost option before requesting spending. Independent code/testing continues. |
| Statistical warmup/calibration location/window | Pending experiment sweep | Pin actual issuing estimator/settings and prior forecasts; report all missing conventions together before registration, not during fitting. No candidate fit now. |
| Reviewer responses | External prerequisite | Prepare identical evidence packets; no invented approval or unauthorized messages. Does not stop infrastructure. |

Sources: adopted specification; engine/projection_experiments.py; scripts/projection_publish.py; engine/forecast_system/calendar.py; current host block/device inspection; primary retry/data-processing sources in RESEARCH-REVIEW.md. REVIEW REQUESTED Tier 2 choices will be repeated at the top of the corresponding release report.

## Exact-reference migration convention

REVIEW REQUESTED — Tier 2: old cards without artifact references may use the frozen adoption-time legacy registry only when all hash-verified matching envelopes identify exactly one fit body and one calibration. A recorded fit-body hash is mandatory where the version contains different bodies. If the original card lacks a body hash, the unique fit association is explicitly LEGACY_UNIQUE_FIT_RECONSTRUCTION; original reference remains NOT_RECORDED. Ambiguity fails closed. Alternative not taken: disable all legacy edit locks even where the component identity is uniquely recoverable. This changes no numbers, expands no model and does not rewrite any existing lock or first grade. New cards always bind an exact envelope and calibration reference; incomplete references cannot downgrade to legacy lookup. Sources: source artifact inventory and the specification's preservation/exact-lineage requirements.

## Closeout crash-recovery convention

Tier 1: persist one immutable hashed snapshot before writing its derivative files; retries resume that snapshot rather than recomputing time-sensitive report content. A new-format local publication receipt is not sufficient: require a separate acknowledgment written only after the existing publish callback has verified the receipt on the source remote. A crash after the remote write but before acknowledgment retries that same publication and does not refit or change the snapshot. Historical receipts remain labeled legacy; this acknowledgment establishes source-repository publication, not public-site rendering. An incomplete pre-migration snapshot without a checkpoint fails closed for reconciliation. Sources: existing callback's remote verification, adopted durable/idempotent commit requirements, primary reliable pipeline sources in RESEARCH-REVIEW.md. Full bounded retry policy/watchdog still requires separate implementation; this repair does not certify it.

## Public final-feed recovery policy (before implementation)

REVIEW REQUESTED — Tier 2: use three attempts within 120 seconds (two existing 60-second normal freshness periods), with deterministic 15-second-base exponential jitter aligned with the existing 15-second capture timer. After a transient outage exhausts that burst, preserve last-good data as STALE and allow one probe per 600 seconds (the existing full-slate operational budget). Alternative not taken: stop all automatic network probes after exhaustion, requiring a person even for a recovered public source. Missing initial data is FAILED_CLOSED; transient probes may recover it, but schema, credential, clock, configuration and ownership errors latch until reconciled. No new fitted parameter, statistical choice, paid request or retention policy changes.

Tier 1: acquire a local advisory lock and verify the persisted owner/policy before any work. The existing branch ownership check remains the cross-host fence. Record each attempt before its public GET; after uncertain completion reconcile the feed's operation ID and verified raw-source hash before any retry. No timeout steals a held lock. Durable state failures propagate rather than reporting success. Preserve received_at on failure. A successful later fetch is dated when retrieved, never backdated to the failed attempt. Hard errors cannot be cleared by a healthy-looking stale feed. Per-failure/recovery evidence is retained; normal successful polls do not create an extra history file every minute.

Scope: this policy controls only the free public final-feed reader. It does not authorize retries of paid or mutating provider calls, restart services, migrate storage, or claim outside-host monitoring. Operational targets: normal freshness remains 60 seconds; first verified-final availability and grade latency will be measured separately. Burst/probe timing is a recovery policy, not a statistical reliability guarantee. Source: existing capture timer/final-feed interval, adopted 10-minute full-slate budget and section 4 of the rebuild prompt.

Tier 1 HTTP convention: honor a valid Retry-After (delay seconds or HTTP date) as a minimum wait; it cannot be shortened by local jitter. A server delay beyond the burst deadline moves directly to the one-probe cooldown, with the later of the local cooldown and server wait. Source: RFC 9110 section 10.2.3, https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3. No provider body or credential is logged.
