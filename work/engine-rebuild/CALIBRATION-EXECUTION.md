# Durable calibration execution and retained reporting

SYNTHETIC VERIFICATION ONLY. No real E-CAL registration, historical candidate fitting, gate decision, control promotion or model activation occurred. The adopted full rebuild remains ACTIVE.

The executor pins one immutable request per registration hash and retains numbered start, result intent, result and terminal receipt records. A nonblocking repository-local process lock protects all registrations. A durable result can be recovered after a lost response without fitting again. An abandoned start becomes INTERRUPTED after exclusive ownership is reacquired; it is never silently retried. Failures and out-of-scope point changes remain visible, and neither is presented as a statistical rejection. Reports remain readable after the experiment clock expires.

A result intent fixes the expected result bytes before publication. Recovery rejects even a self-rehashed edited result. Atomic-write uncertainty is resolved by retrying the identical payload and syncing its directory. A genuinely full filesystem can prevent a terminal receipt: the caller receives failure, never invented success. A crash before the start record commits does not invent an execution; unexpected artifacts without a start fail closed. A killed live process releases the kernel lock, as verified with an actual subprocess fixture.

CONVENTIONS: Tier 1 uses the existing immutable/fsync storage primitive and Linux resource tools. Tier 2 REVIEW REQUESTED: three explicit execution attempts, following the existing conservative retry cap; alternative is retries until the deadline. This operational cap is included in the future hashed registration. It adds no candidate, fitted parameter, metric or statistical gate. Registration code identity now includes executor, storage and CLI. No real registration is rewritten here.

## Reports and review packet

The report reads hash-verified saved evidence only. It includes attempt dispositions, pooled/season/week accuracy and CRPS, all six coverage and interval-score checks, paired uncertainty, PIT and winner reliability, calibration identities, unchanged point forecasts, distribution-mean offsets and negative-score mass. Legacy ridge centers remain labeled as such; no coherent conditional-mean migration is claimed. Optional reference diagnostics are separately hash-bound, reporting-only and two lines; missing evidence is named. No market data enters the numerical worker.

Derivative reports and draft reviewer packets are immutable. Each packet contains the four required review questions, exact evidence references and missing release prerequisites. DRAFT_NOT_SENT_NOT_APPROVED means precisely that; no reviewer communication, agreement or release decision is fabricated. The report adapter does not replace the governing queue clock or promotion decision.

## Verification

84 calibration tests pass (tests-calibration-execution-final.log), including 21 added lifecycle/CLI tests, independent saved-score arithmetic, report/table equality, duplicate execution, active lock, process death, uncertain writes, corruption, clock reversal, invalid admission, explicit retry limits and no report-time fitting. Earlier successful logs are retained.

On the actual Linux host, the first isolated canary exposed a missing production dependency: scoringrules 0.10.0. The original runtime was not changed. Installing that exact package into a disposable canary-only directory enabled a second run, which reached execution but failed on a fixture harness key lookup. That log is preserved. The corrected harness passed: 4 GiB hard address-space limit, one numerical-library thread, oversized allocation rejected, one-second test deadline killed an overlong worker, complete synthetic execution/report, and identical duplicate receipt with one attempt. Maximum observed resident memory was 60,372 KiB and elapsed time 15.65 seconds. This tiny fixture does not qualify the full historical workload or production scheduling.

Evidence: calibration-linux-canary.log, calibration-linux-canary-isolated.log and calibration-linux-canary-qualified.log. The successful synthetic records and harness are under calibration-synthetic-linux; they are expressly not authoritative NFL evidence. The canary ran as root in an isolated /mnt directory, not as the installed service workflow. Production timers and issuing fit were unchanged. The source archive and all disposable evidence were retained; no production files were removed.

## Remaining boundary and next action

Real fitting still requires corrected deployed-control authority, the hashed Tuesday registration, publicly verified closeout and recorded weekly refit. The installed research runtime lacks the pinned scoring dependency; qualify its complete environment before scheduling any real execution. Full historical resource qualification, current as-issued comparison, actual reviewer decisions, conditional-mean semantics, prospective evidence and the observed live cycle remain open. The report's numerical criteria are not release approval.

Next: qualify the research environment and resolve the documented control/publication dependencies without manufacturing evidence or rerunning a historical candidate prematurely. Approved storage migration is already verified; root currently has about 3.9 GiB available and the separate artifact volume about 16 GiB. Long-term growth and peak-write reserve still need measurement.

Least certain: whether the complete historical workload and its source availability satisfy real deployment constraints; the isolated fixture deliberately makes no such claim.

Confidence: medium in readiness for a real experiment, meaning the implementation follows the authoritative contracts but depends on consequential unresolved operational and lineage choices. Lower to low if independent historical recomputation or installed-workflow verification disagrees. Provider credits spent: zero; no additional paid resources beyond the previously approved volume.
