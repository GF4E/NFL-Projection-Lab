# Research questions and answer gates

**Research date:** 2026-08-24  
**Use:** Ask these questions of the data and experiments. Ask the owner only when an answer changes the human decision contract, cost/data rights, acceptable uncertainty, or release risk.

## A. Forecast contract

1. **What is the forecast horizon?** Opener, Tuesday, daily, minus 120, 90, 60, or 15 minutes are different prediction problems.  
   **Answer gate:** Every artifact has exactly one horizon and generation timestamp.

2. **What outcome is modeled?** Regulation plus overtime final scores, including ties and pushes, must be explicit.  
   **Answer gate:** All market probabilities reconcile to one normalized outcome distribution.

3. **What does “confidence” mean?** Calibration, sharpness, coverage, scenario stability, freshness, and support are separate.  
   **Answer gate:** No unexplained universal confidence number.

4. **Which forecast is the public headline?** Model-only, market-only, shrunk, and scenario-weighted probabilities answer different questions.  
   **Answer gate:** Labels and formulas are stable; the independent model view is not hidden by the blend.

5. **What is the exact market baseline?** Book, point, price, capture time, de-vig method, and translation must be fixed.  
   **Answer gate:** No cross-point comparison without discrete translation.

## B. Data validity

6. **Was every value available at the forecast timestamp?**  
   **Answer gate:** Automated maximum-source-time assertion passes.

7. **Can the raw source version be reconstructed?**  
   **Answer gate:** Snapshot/content hashes, source URL/release, and capture time resolve.

8. **What changed across source regimes?** Injury, depth, participation, and derived metrics do not have uniform historical coverage.  
   **Answer gate:** Coverage matrix and regime version exist before model use.

9. **How are players, teams, games, and franchises resolved through changes?**  
   **Answer gate:** Stable IDs and auditable aliases; unresolved identities abort the affected update.

10. **What happens when a source is missing or partial?**  
    **Answer gate:** Atomic abort, explicit stale/unconfirmed state, and last-good preservation.

11. **Is the historical weather value a forecast as issued or an observation?**  
    **Answer gate:** Training input matches the live forecast horizon.

12. **Who is authoritative for current injury, inactives, depth, and roof?**  
    **Answer gate:** Official source hierarchy and lower-confidence evidence are documented.

13. **May the data and derived artifacts be redistributed publicly?**  
    **Answer gate:** License inventory and release policy approved before ingestion.

## C. Baselines and model structure

14. **What is the simplest model this challenger must beat?**  
    **Answer gate:** Unconditional, SRS, QB-Elo, market, and market-anchored score baselines run on identical rows.

15. **Does the joint distribution improve decisions, or only make the system coherent?**  
    **Answer gate:** Joint and derived-market proper scores plus reconciliation tests.

16. **Does a possession mechanism earn its complexity?**  
    **Answer gate:** Preregistered ablation improves held-out score/probability metrics and operational reliability remains acceptable.

17. **How is early-season uncertainty handled?**  
    **Answer gate:** Preseason/team/player priors and their decay are validated only in offseason rolling-origin tests.

18. **How are opponent, teammate, scheme, and market effects kept from being counted twice?**  
    **Answer gate:** Nested baselines, grouped ablations, shrinkage, and residual diagnostics.

19. **Are effects stable across seasons and rule eras?**  
    **Answer gate:** Season/era coefficient and performance diagnostics; no hand-picked exclusions.

20. **Is an interpretation causal or associational?**  
    **Answer gate:** Display text uses causal language only with a causal design; otherwise it names a model counterfactual or association.

## D. Player and scenario state

21. **What is the probability each material player/role state occurs?**  
    **Answer gate:** Source-backed state, timestamp, confidence, and prospective calibration.

22. **Which state changes the distribution enough to deserve a branch?**  
    **Answer gate:** Frozen materiality rule based on probability/edge/interval change, not narrative interest.

23. **What if a material state lacks a defensible probability?**  
    **Answer gate:** `indeterminate`; no invented weight.

24. **Do player features add lift beyond team state and quarterback?**  
    **Answer gate:** Position-group ablation on personnel-change games and all-game diagnostics.

25. **What concrete fact or price would change the conclusion?**  
    **Answer gate:** Every fragile dossier names the state or threshold and can recompute it.

## E. Evaluation

26. **Are champion, challenger, and market scored on the same rows?**  
    **Answer gate:** Evaluation-row hash is identical.

27. **Is the primary metric frozen before fitting?**  
    **Answer gate:** Registry timestamp predates result artifacts.

28. **How good is the full distribution, not just its mean?**  
    **Answer gate:** Joint log score/CRPS, PIT/rank, covariance, key-score, tail, tie, and push diagnostics.

29. **Are probabilities calibrated in level and slope?**  
    **Answer gate:** Calibration intercept/slope with uncertainty and reliability bins with counts.

30. **Do stated intervals cover prospectively?**  
    **Answer gate:** Sequential coverage and width by horizon/regime; no evaluation only on selected edges.

31. **How uncertain is the measured model improvement?**  
    **Answer gate:** Game/week/season-blocked intervals and unique-game counts.

32. **How many related features/specifications were tested?**  
    **Answer gate:** Experiment-family count and multiplicity-aware decision.

33. **Does improvement survive different seasons, eras, horizons, and market bands?**  
    **Answer gate:** Stability report; subgroup results with small-sample warnings.

34. **Can the same hashes reproduce the same result?**  
    **Answer gate:** Deterministic replay succeeds before promotion.

## F. Market value

35. **What exact book contract is being compared?**  
    **Answer gate:** Book, side, point, price, and timestamp are frozen.

36. **What counts as the close?**  
    **Answer gate:** Last complete two-sided named-book quote strictly before kickoff; consensus stored separately.

37. **Was closing value translated back to the entry point correctly?**  
    **Answer gate:** De-vig, discrete move, reapply hold, continuous cents, and directional points are all reproducible.

38. **Did the forecast contain information beyond the current price?**  
    **Answer gate:** Market-residual and market-only comparisons on all eligible forecasts.

39. **Are apparent sharp/public signals actually latency or vendor artifacts?**  
    **Answer gate:** Source methodology, sample size, timestamps, and next-reference-quote test.

40. **Did selection hide losing or missing forecasts?**  
    **Answer gate:** All-game probability scorecard plus selected-opportunity CLV scorecard; coverage reported.

## G. Operations and governance

41. **Can a browser visit spend quota or mutate provider state?**  
    **Answer gate:** Read-only public path and idempotent scheduled/recovery leases.

42. **What is served when an import or model run fails?**  
    **Answer gate:** Last-good forecast, stale provenance, alert, no partial mutation.

43. **What changed: data state, coefficients, or structure?**  
    **Answer gate:** Separate versions and cadence permissions are visible in every run.

44. **Can an unlogged model forecast?**  
    **Answer gate:** Registry resolution is required by the forecast path.

45. **Can production roll back safely?**  
    **Answer gate:** Exact prior champion/config/data snapshot remains deployable.

46. **Does the public release contain secrets, personal records, or restricted data?**  
    **Answer gate:** Secret/license/public-clone checks pass.

## H. Human judgment and learning

47. **Can a knowledgeable user understand the model-market disagreement in 30 seconds?**  
    **Answer gate:** Prospective usability test identifies direction, uncertainty, and falsifier without methodology prose.

48. **Can the person disagree explicitly without changing the original forecast?**  
    **Answer gate:** Immutable model-only forecast plus separate timestamped scenario/adjustment.

49. **Did human judgment improve the probability forecast?**  
    **Answer gate:** Model-only and human-adjusted distributions scored prospectively with the same proper rules.

50. **Is a repeated human insight a training label or a research hypothesis?**  
    **Answer gate:** It enters the experiment registry, never direct fitting.

51. **What did the model miss versus what was simply game variance?**  
    **Answer gate:** Review compares pregame distribution and source state; a surprising result alone is not a misspecification.

52. **What evidence would cause us to abandon the current approach?**  
    **Answer gate:** Each major model/dossier hypothesis has a written falsifier and rejected results remain visible.

## Answer template

```json
{
  "questionId": "RQ-###",
  "hypothesis": "...",
  "decisionImpact": "human contract | data/cost | structure | coefficient | diagnostic",
  "asOfContract": "...",
  "baseline": "...",
  "evaluationRowsHash": "...",
  "primaryMetric": "...",
  "calibrationAndCoverageGates": ["..."],
  "falsifier": "...",
  "evidence": ["source or experiment artifact"],
  "decision": "promote | reject | defer | continue_shadow",
  "author": "...",
  "recordedAt": "..."
}
```

The answer to a question can define an experiment or product boundary. It cannot waive leakage checks, proper scoring, calibration, uncertainty, licensing, or immutable provenance.

