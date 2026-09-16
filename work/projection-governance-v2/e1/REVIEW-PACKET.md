# E1 review packet

Status: awaiting completed numerical report and two independent reviewer responses. No reviewer answers or approvals have been invented.

Evidence: registration.json, current-season-protocol.json, CONVENTIONS.md, report.md, verification.json, verified-games.json, current-season.json, state-fit-*.json, staff-coverage.json and test logs. Bind responses to the final evidence-receipt hash before release.

Both reviewers answer:
1. Is there a leak in feature construction, state/noise fitting, calibration, historical replay, or the current-season counterfactual?
2. Is a football mechanism missing or counted twice, including the retained Elo and ridge calibration?
3. What evidence would disprove the chosen updating rule?
4. Do the actual tables justify release, given uncertainty, complexity, and the staff-source limitation?

Specific points to inspect:
- No PFR coaching rows could be retrieved. The 448 unknown transitions intentionally remain false under A.3; the HC-change variance mechanism is not empirically exercised by this seed.
- Rho is a plug-in estimate from a fixed training-only pilot, distinct from the three optimized q/r/lambda quantities. Count its estimation cost.
- The symmetric league-opponent Riccati reference and PSD team-specific injection are explicitly defined before comparisons; verify that these match the intended reference interpretation.
- The early calibration-only folds cannot identify lambda from a preseason transition where none exists in their training record. Their reported optimizer coordinates should not be described as three independently identified quantities. Scored folds have actual prior-season transitions.
- The unchanged ridge calibration and Elo remain outside the latent strength filter. They are refit on each candidate's own past baseline; inactive QB/weather/kicking/venue groups are not silently activated.
- The current-season experiment scores newly computed counterfactuals against original AS_ISSUED games, not newly invented originally-issued forecasts. The two retrospective games stay excluded.
- Historical results were already used for development; no untouched-holdout claim. MAE confidence intervals are descriptive, not multiplicity-adjusted confirmation.

An unresolved reviewer objection naming a leak or double count blocks promotion. Passing the numerical gate alone is not an activation instruction. If no challenger meets the numerical gate, retain linear and log rejection without manufacturing reviewer agreement.
