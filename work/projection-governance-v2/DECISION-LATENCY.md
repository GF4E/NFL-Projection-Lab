# Governance amendment: decision latency

Binding user instruction, effective 2026-09-16. Applies to every registered experiment and supersedes blanket requests to stop for an undefined convention.

## Severity tiers

- **Tier 1 — decide and proceed:** an unambiguous standard answer in cited literature or existing repository practice, adding no fitted parameter and changing no registered candidate, gate or metric. Choose, implement, log under CHANGELOG CONVENTIONS with reason/source, and report. Do not stop.
- **Tier 2 — decide, proceed and flag:** two defensible answers where the choice could change a result. Choose the simpler, more conservative one, implement/log it, and put REVIEW REQUESTED with the unchosen alternative at the top of the report. Work continues; resolve in the review packet and rerun if wrong.
- **Tier 3 — stop the dependent work:** any added fitted parameter, changed registered candidate/gate/metric/population, leak, or convention with no defensible default. Batch every concurrently visible Tier 3 issue in one message with a recommendation for each. Never serialize questions that were already visible together.

## Standing defaults

Chronology beats convenience. Prefer fewer parameters and existing repo conventions. Unknown data stays unknown and is reported, never inferred or scraped around. Estimate nuisance quantities on the training fold; never search them. Constrain identified subspaces rather than approximate them. Label diagnostics as diagnostics. A correction applying equally to control and challengers is a correction, not a method change.

## Required pre-implementation sweep

Read the full specification, list all open conventions with tiers, decide all Tier 1/2 items and publish the list in the hashed preregistration or linked addendum before implementing the registered experiment. Only Tier 3 items need escalation. Preserve existing preregistration and prior results; do not backdate a new sweep. The E1 application is in e1-calendar-corrected/PREREGISTRATION-ADDENDUM.md and preregistration-addendum.json.
