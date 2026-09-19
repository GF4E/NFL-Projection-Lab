# Cadence v2 pre-implementation sweep

## Tier 3 batch — pending user response
B01: E1's first valid gate rejected state-space; deployed production uses linear. New E.1 explicitly asks for section A state-space, while all other governance including promotion gates stands. Recommendation: three-cutoff shadow filter until qualified; do not silently promote rejected state-space.
B02: New observation order and covariance updates can legitimately propagate into subsequent forecasts. Exact historical equality except for immediately earlier-access forecasts is not a mathematical invariant. Recommendation: report direct and downstream numerical effects separately, require exact equality only where complete update histories and dependencies are identical.

## Decided below Tier 3
C01 Tier 1: Strict availability (< cutoff) prevails over ambiguous 'at least four hours', because binding chronology forbids at-or-after availability. A game exactly at the four-hour boundary waits to the next cutoff.
C02 Tier 1: Preserve old calendar default and historical registrations; use explicit versioned three-cutoff policy for new replay. Pacific DST through zoneinfo, actual played schedule. Existing nflverse gametime convention is Eastern in this repository; retain it, not stadium-local reinterpretation.
C03 Tier 1: No duplicate observations; every scheduled cutoff has lineage, including empty updates, with forecast assignments and incorporated IDs.
C04 Tier 1: Weekly q has weekly units. Do not inject a whole week's noise three times. Any new filter must account for elapsed time with q * elapsed_days/7 in season, preserving offseason transition separately. Do not silently alter the original frozen E1 replay.
C05 Tier 2 REVIEW REQUESTED: Missing grades or data block closeout and all downstream Tuesday steps; retry after data arrive with the original scheduled cutoff and availability restriction. Alternative: partial closeout, inconsistent with 'every game graded'.
C06 Tier 2 REVIEW REQUESTED: Existing E-SCORE Friday hash is preserved as a pre-Tuesday draft; activate via separately hashed Tuesday addendum only after closeout publication, with no comparative fitting before then. Alternative: retroactively date or rewrite registration (rejected).
C07 Tier 1: Packet preparation can be automated; sending to external reviewers requires identified destinations and explicit authorization. No destinations are specified here; preserve established local review packet behavior.
