# ADR-0004: Preserve scenario disagreement instead of averaging it away

**Status:** Accepted as a decision-surface hypothesis; implementation and prospective validation are pending  
**Date:** 2026-08-24  
**Deciders:** Owner

## Context

A forecast can show positive average edge while depending on an unresolved condition. For example, the conclusion may be positive if a quarterback plays and negative if he sits, or it may disappear at a different wind band or one half-point of market movement. A weighted average is mathematically useful, but presented alone it conceals fragility and creates false decisiveness.

The engine exists to enhance human judgment. It must preserve the distinction between outcome uncertainty—which every game has—and state uncertainty that can materially change the decision before kickoff.

## Decision

The decision dossier keeps the scenario-weighted numerical forecast visible and adds one of three decision-support states:

- **Robust:** every material, supported scenario preserves positive edge and the applicable `0.5u` sizing floor.
- **Fragile:** the weighted mean is favorable, but at least one material, supported scenario reverses the edge or drops below the floor.
- **Indeterminate:** a material state or scenario weight lacks defensible forecast-time support, or the aggregate 80% edge interval spans zero.

A “reasonable scenario” is not an arbitrary what-if. It must pass versioned inclusion and materiality rules using forecast-time evidence. Scenario definitions, weights, source timestamps, and branch outputs are stored with the forecast hash.

The label does not erase the number, silently change an approved pick, or create a new automatic approval rule. The existing uncertainty, Kelly, and approval gates remain authoritative. The dossier must state the concrete condition—player status, lineup, roof, weather band, or exact price—that changes the conclusion.

## Options considered

| Option | Benefit | Principal risk |
|---|---|---|
| Publish only the weighted mean | Clean and compact | Hides meaningful disagreement and encourages false confidence |
| Publish mean plus robust/fragile/indeterminate state (selected) | Preserves math and exposes judgment-relevant uncertainty | Requires disciplined scenario definitions and additional calibration |
| Use the worst plausible scenario as the forecast | Conservative | Discards probabilities and can systematically understate valid opportunities |
| Withhold every forecast with unresolved state | Avoids false precision | Removes useful conditional information precisely when judgment matters most |

## Trade-off analysis

The selected approach retains the best single summary while preventing it from masquerading as consensus among possible futures. Its value depends on preventing scenario proliferation and calibrating weights prospectively. That burden is preferable to a simple number whose assumptions remain hidden.

## Consequences

- Each material unresolved input becomes an explicit, source-backed scenario variable.
- Branch-level distributions and contract evaluations precede aggregation.
- Fragility and indeterminacy are distinct from ordinary game variance.
- The interface must show the condition that changes the view without expanding into methodology prose.
- Scenario weights and status rules are structural configuration and cannot retune from in-season selections.

## Action items

1. [ ] Define versioned scenario inclusion and materiality contracts.
2. [ ] Add branch-level forecast, edge, interval, and sizing outputs.
3. [ ] Implement deterministic robust, fragile, and indeterminate classification.
4. [ ] Add replay tests for late QB, inactive, roof, weather, and line changes.
5. [ ] Prospectively evaluate scenario-weight and interval calibration.
