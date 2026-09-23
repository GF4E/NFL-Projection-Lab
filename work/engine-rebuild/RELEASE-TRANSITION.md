# Compatible preparation release transition — implementation plan

REVIEW REQUESTED — Tier 2: same-fit preparation-mode rollback is a bounded compatibility choice; general rollback and weekly-refit handoff remain unqualified.

This is an infrastructure increment of the full adopted rebuild, not completion
or authorization to activate scheduled issuance. The existing scorer restoration
does not restore its preparer or state selection. Add a checked release boundary
to the actual preparer, publisher, refitter and scheduler before activation.

Conventions decided before implementation:

- Tier 1: retain exact code, environment, fit, calibration, prepared checkpoint
  and scheduled-state configuration in an immutable manifest. Validate recorded
  cutoff preparations by reconstruction. Hashes alone do not prove compatibility.
- Tier 1: all preparation-mode transitions and publication share the preparation
  writer lock and the scheduler ownership fence. Record intent before mutable
  writes. A partial transition prevents ordinary work; explicitly retry the same
  operation after correcting its cause, with unchanged payload and owner. Never
  restore an old ownership token or rewrite a frozen forecast or grade.
- Tier 1: a rollback to an earlier preparation mode retains all subsequent state
  and issuance evidence. The checkpoint is not a retroactively issued forecast.
  Future preparation still obeys the mode's original chronology and lock rules.
- Tier 2, REVIEW REQUESTED: initially allow only same-fit, same-calibration
  transitions on the exact verified installed code. This is the smallest useful
  rollback boundary for the chronology migration. An alternative is to switch
  code, fit, configuration and every reader in one operation. That broader path
  remains required before claiming general pipeline rollback; it is not silently
  approximated by this implementation. Weekly refit handoff after activation must
  also be qualified before this boundary is activated in production.

The manifest records the issuing version/platform runtime identity. It does not archive or independently re-fingerprint the interpreter/native libraries on every invocation; that remains a separate executable/runtime qualification.

Tests: exact legacy/scheduled checkpoint validation, missing calibration/source,
changed code/fit/configuration, wrong owner, concurrent publisher, interruption
at each mutable write, lost completion response, changed payload under one
operation ID, reusing a completed old operation, preserved frozen records and
actual preparer/publisher dispatch under the selected mode. Exercise a rollback
through the captured-source publisher canary and retain the production activation
status separately.

Research basis: the existing durable writer and adopted sections 4–6, plus
[Google SRE's pipeline guidance](https://sre.google/workbook/data-processing/)
on correctness, freshness and end-to-end checks. The journal and same-fit limit
are engineering choices in this repository, not claims made by that source.

## Verified result

Final local suite: 529 passing tests, comprising 301 projection, 218 standing
Week 1 and 10 closeout checks. Final Linux: 62 targeted fixtures and the actual
publisher canary pass in 300.424571 seconds; peak RSS 270,016,512 bytes under a
hard 4 GiB address-space cap, one worker and the unchanged 570-second harness
bound. The source and consumer hashes match the final implementation exactly.

The captured-input canary issues 15 forecasts, locks 14 final-eligible Sunday
games, rolls back to the compatible legacy preparation checkpoint, and grades
those original 14 bundles using deliberately synthetic finals. Their original
preparation-release references survive the rollback. Repeated grades are
idempotent; all 52 original source locks/grades remain byte-identical. Exact
initial point/probability/interval parity is checked against the separately
rerun legacy builder on the same captured inputs. The Monday preview remains a
future forecast; it is not falsely counted as a final-eligible Sunday lock.

Evidence: host-release-qualified-canary.json, tests-release-qualified.log and
release-transition-first-failure.json. The earlier local and 61-fixture Linux
receipts precede the final explicit release binding; they remain labeled
intermediate evidence rather than being relabeled as final. The first failed
slate-subset fixture and source are preserved. Root free bytes at the final host
canary were 134,414,336; this does not resolve durable capacity.

No active manifest, live selector, statistical candidate, provider request or
paid capacity is introduced by this verification. Next: qualify the weight-only
refit handoff and remaining executable/runtime compatibility before activation.
The full requirement map remains PARTIAL. Public payload equality, a real
scheduled cycle and statistical improvements are not claims of this result.

Source follow-through verified at 2026-09-23T00:15:36.749072+00:00: host checkout `12123cbd5ac6dc9f357a88cb9978aa4143a4da5c` contains the exact final candidate and consumer source, with no differences. Implementation commit `dc50019b8e6d343cf093c9d89f463502d40d1939` is pushed to engine-v2. All 16 current forecasts reproduce exactly; all 52 original locks/grades retain their hashes. Fit remains `801ef07927ea59bc112fc955ad86249b981d5e60a0f4a9636f39b2eb23be623f` (projection-v2.hfa1.w3). Prepared cutoff mode is null and no active pipeline manifest exists. The observed issuing source is still `527ce6e2247582687b260db7491a8447fb9d42c2`, release `7b9c66ee59137dde6dc08f7fd9843c8bcc136eaba99571f4f77d6cb51e2101ec`; source installation is not new-release issuance or public-site proof. Root free bytes: 133816320. No provider requests or spending. See host-release-transition-followthrough.json.

Confidence: medium — authoritative captured inputs support the bounded release
claims, but operational readiness still depends on the restricted compatibility
choice and an unobserved live cycle. Lower to low if a real consumer admits a
pending/mismatched release, hides a visible game or changes a frozen record.
