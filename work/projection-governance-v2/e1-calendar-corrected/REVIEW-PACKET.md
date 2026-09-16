# E1 corrected-run review packet

**REVIEW REQUESTED — four convention flags, nonblocking.**

- C06: Retain the corrected implementation: elapsed scheduled assimilation cutoffs from the first forecast cutoff of a season advance the existing linear decay; freeze that weight inside an interval. **Alternative not taken:** Use the forecast game NFL-week label for decay even when two games share one interval. This could change control predictions and conflicts with the frozen-state interpretation.
- C11: Retain registered symmetric 32 virtual team-versus-league games and posterior P0; diagonal KH gains and offense/defense half-lives remain diagnostics. **Alternative not taken:** A rotating 16-real-matchup reference schedule. Not evaluated; would require an explicit protocol correction if reviewers establish the retained construction is wrong.
- C12: Retain registered C[D P0 D]C congruence with sqrt(2) on flagged components, then the registered lambda transition. **Alternative not taken:** Add flagged diagonal variance alone before projection. Not tested; it changes cross-covariances and could change forecasts.
- C25: Resolved by binding user instruction: played kickoff plus four hours is assimilation availability; no actual completion clock is used. **Alternative not taken:** The previous exact-completion requirement was superseded; no estimated physical completion time is asserted.

## First valid E1 result — September 16, 2026

The corrected replay and independent audit passed on all 2,639 registered 2016–2025 games. No challenger clears the unchanged 1% team-MAE improvement gate. All challengers pass the four coverage limits. Retain linear; E2 remains Week 3 against linear. No live fit, frozen projection, grade, or Phase A artifact changed. The prior week-label rejection remains withdrawn and preserved as an invalidated run, not an earlier valid E1 result.

| Method | Team MAE | Improvement vs linear | Margin 50 / 80 | Total 50 / 80 | Decision |
|---|---:|---:|---|---|---|
| linear | 7.5716 | control | 50.25% / 79.54% | 50.66% / 80.07% | RETAIN |
| k4 | 7.5860 | -0.1905% | 50.28% / 79.35% | 50.59% / 79.77% | REJECT |
| k8 | 7.6010 | -0.3883% | 50.44% / 79.61% | 50.28% / 79.54% | REJECT |
| state-space | 7.5724 | -0.0105% | 50.36% / 79.58% | 50.17% / 80.07% | REJECT |

The identical calendar correction applies to control and all three challengers; none gains an information-timing advantage. Changed available-history sets affect 47 forecasts in 2020 and 18 in 2021, zero in the other eight seasons. No registered game was dropped. The full historical test checks every included result's kickoff-plus-four-hours mark is strictly before the state's cutoff. nflverse times are Eastern, converted to UTC; four hours is the authorized availability convention, not an observed completion timestamp or universal duration bound.

Evidence: work/projection-governance-v2/e1-calendar-corrected/report.md, audit.json (PASS), validity.json (FIRST_VALID_E1_RESULT), verification.json, calendar-audit.json and compressed per-game lineage. 312 tests passed. Historical fit 644.6 seconds; current-season fit 94.2 seconds; peak historical process RSS 908.1 MiB; one worker. Paid provider credits: 0.

Review [the full report](report.md), [preregistration addendum](PREREGISTRATION-ADDENDUM.md), and frozen availability-convention.json. C25/B01 is resolved by the binding user rule. The original registration and pre-comparison correction receipt remain unchanged. No alternative was tried after viewing results. If review establishes a convention is wrong, preserve this result and rerun a corrected experiment.

Each reviewer answers:

1. What information leaks?
2. What football mechanism is missing or counted twice?
3. What result would disprove the proposed improvement?
4. Does the evidence justify the release decision?

Claude: NOT RECEIVED. Dr. M: NOT RECEIVED. No external message sent; no reviewer approval or new-model release claimed. This packet supports retaining the existing method.
