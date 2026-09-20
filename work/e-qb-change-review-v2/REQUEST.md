E-QB-CHANGE: COMPLETE THE EVIDENCE AUDIT BEFORE DRAWING A CONCLUSION

Your previous pass classified all 585 starter-change games as unknown without fully qualifying the available evidence. Correct that limitation. The objective is a conclusion that earns **high confidence**, not a predetermined diagnosis or an inflated rating.

## 1. Establish the premise

Before analysis, state the authoritative control’s exact path, hash, generation date, producing code commit and fit lineage. Verify its bytes against the series registry.

Reproduce the 585 changed-starter, 2,052 stable-starter and two unknown games and their MAE/bias. Preserve the existing results and record any correction.

No fitting, new candidates or production changes.

## 2. Inventory and qualify the evidence

Inspect the available sources in full, beginning with the timestamped 2025 depth charts, historical weekly charts, personnel records, archived forecasts and locks, injury/inactive reports, and source receipts.

For each source, record:

- Which seasons and games it covers.
- What its timestamps mean: publication, effective date, retrieval or later revision.
- Whether it establishes what was available before that game’s T-75.
- Whether it identifies a listed QB, an announced starter, the engine-selected QB or the eventual starter.

A depth-chart timestamp alone does not prove a starter announcement. A later retrieval does not automatically disqualify a verifiable contemporaneous publication. Do not infer unavailable evidence from a missing field in one artifact.

Where local evidence is insufficient, seek contemporaneous primary sources. Record URLs, timestamps and the exact factual support. Do not use retrospective accounts as proof of pre-lock knowledge.

## 3. Build a game-level evidence ledger

Keep all 585 changed-starter games in the ledger. Record both teams separately when both changed, but count each game once in game-level metrics.

For every changed starter, record:

- Previous and actual starter.
- T-75 in UTC.
- What identity was publicly established before lock, with evidence.
- First supported announcement time.
- Engine-selected starter at lock, if recorded.
- Backup, returning starter, offseason replacement or unresolved role.
- Available pregame quality measurements for both quarterbacks.
- Evidence status and unresolved questions.

Use separate knowledge categories:

1. Starter positively established before T-75.
2. Starter unresolved at T-75, supported by contemporaneous evidence.
3. Replacement decision first documented after T-75.
4. Insufficient evidence.

Do not turn “no announcement found” into “not knowable.”

Separate **as-issued engine identity** from **reconstructed identity**. If historical engine locks never existed, say so explicitly; a replay cannot establish what the engine actually selected then.

## 4. Exhaust the promising evidence before labeling unknown

Start with 2025, where timestamped charts exist, then proceed through the remaining seasons. Log each qualification decision and unresolved source gap.

Do not generalize a 2025 result to ten seasons. Report coverage and exclusions by season and category. Compare measurable and unmeasurable games so evidence availability does not silently select an easier sample.

If a requested partition remains impossible, demonstrate why using the completed inventory—not the absence of a previously prepared dataset.

## 5. Define the quality comparison before viewing its errors

Inventory existing quarterback-quality measures and their units, timestamps and historical coverage.

Choose only a measure demonstrably available before lock. Register its definition, treatment of inexperienced quarterbacks and any bands before comparing errors. Use an established repository convention where possible.

Do not fit a new QB model, substitute a market-derived value or infer a missing value. If no defensible pregame quality measure qualifies, report that dimension as unresolved and continue the other dimensions.

## 6. Separate identification from valuation

Report counts, team-points MAE and signed bias, and margin MAE and bias, against the stable-starter baseline for every supported cell.

Distinguish:

- Announced starter known before lock, but engine selected someone else.
- Engine selected the correct starter.
- Identity became established only after lock.
- Engine identity or pre-lock knowledge cannot be established.

Then split supported cases by backup/returning role and qualified quality gap.

Verify whether QB identity and value actually enter the deployed calculation. A displayed starter is not necessarily a model input. An inactive QB coefficient establishes absence of a retained adjustment; it does not prove that absence caused the error.

Name the supported conclusion: identification failure, value/representation failure, both, neither, or unresolved. Descriptive error differences alone are not causal proof. If distinguishing the causes requires an intervention, name that limitation and the next experiment question without registering candidates.

## 7. Test whether the conclusion survives reasonable alternatives

Before inspecting subgroup results, register these checks:

- All seasons versus each season separately.
- Full qualified sample versus strongest-provenance records only.
- Within-season starter changes versus changes including season openers.
- Backup versus returning-starter distinctions.
- Favorite-size, week-band and roof strata using existing definitions.
- Leave-one-season-out summaries.
- Sensitivity to disputed evidence classifications.

Keep both teams of a game together in uncertainty calculations. Show intervals separately from the confidence rating. Report small cells, contradictory seasons and multiple-comparison limitations. Do not search for favorable partitions or change definitions after viewing results without a disclosed amendment.

## 8. Independent recomputation and evidence review

Have an independent reviewer recompute the tables from the pinned ledger and authoritative forecast rows, without using the first implementation’s aggregate outputs.

The review must check:

- Game membership, joins and duplicates.
- Score and bias sign conventions.
- UTC conversion and strict pre-T-75 eligibility.
- Source-to-classification accuracy.
- No retrospective information in purported pregame values.
- Correct distinction between actual locks and reconstructions.

Review all disputed cases and a season-stratified sample of accepted cases. Record disagreements and their effect on the conclusion. If independent review is unavailable, do not claim it occurred.

## 9. Deliverables and confidence

Commit and push to GF4E/NFL-Projection-Lab, engine-v2:

- Updated diagnostic plan and evidence definitions.
- Source inventory and qualification decisions.
- Pinned game-level ledger.
- Coverage, cell metrics and sensitivity tables.
- Independent recomputation/review results.
- Corrected report and CHANGELOG entry.
- COMMIT lines.

End the report with the strongest rating the evidence warrants, its definition, and a specific downgrade condition.

**High means the central claim holds across seasons and survives the obvious alternative specifications.** Successful execution, one well-documented season or repeated use of the same unverified source does not earn high confidence.

If high confidence is not attainable, state exactly which part remains uncertain, what evidence would resolve it, and the narrower conclusion that is justified. Do not manufacture certainty to satisfy the target.