# RF-02F forecast assembly interface

2026-09-05. Design/wiring note only; no historical admission, fit, score or bootstrap executed.
Repository: `/private/tmp/os01-gen15-rebuild.9ny71k`.
Protocol SHA `d7b921cb2e9a8376b912363a5fff9f27168a2467411c45e144927c7a5d506d16`;
config SHA `0fe90bbc966e8eb92e6d345b145fc297547b1f4b922d095a0eabbf5e97c60519`.
Accepted archive source SHA `91c9e15d674e0d192cb4ef5ddc34a05167693593f20f6d3c9dea7be382398423`;
bank SHA `44411d6f12ac978344cb618d549aeaefff8880d6c5b19df384f922eb549da547`.

## One narrow assembly function

Propose `assemble_forecasts(view, bank, outputs, choice, *, local_mapper_pointers, parent_binding, accounting)`.
This is a new function in a separate additive controller module; preserve the accepted research_score_split_run.py building blocks unchanged.
`view` is the current result of `research_score_split_archive.forecast_inputs(context, origin, envelope.check)`.
`outputs` is exactly the result of `bank.advance(Y,W,view['bank_prepared'],view['diagonal_outputs'])`.
`choice` is `None` before2013; otherwise the frozen `StrictSelectionFeed.select(Y,context.expected_by_season)['E3']` decision.
`local_mapper_pointers` is `{12:{name,sha256},24:{name,sha256}}`, empty for state-only2010 work.
`parent_binding` supplies the authenticated RF-02C manifest/index identity; the view supplies current file pointers.
`accounting` supplies the current origin's accepted `OriginAccounting.callback` (runtime acceptance SHA `0720c240a36c3ed32a72d1113560997417b05a12c8cec8b06a3c4c8a5b0e1ca9`).
Return only:

```python
{
 'full_setting_forecasts': [full_row],  # targetGameIds -> setting0..26
 'outer_selected_forecasts': [outer_row],  # E3 variants -> targets; six references -> targets
 'grading_plan': {'inner': [plan_row], 'outer': [plan_row]},
 'resolved_laws': {('inner', setting, game_id): law, ('outer', variant, game_id): law},
}
# full_row = {family:'E3',setting:int,game_id,native_failure,distribution:descriptor}
# outer_row adds variant; raw references retain original family/setting/reason/descriptor.
# plan_row = {key,mode,source:None|source_ref}; no labels, loss values or intervals.
# source_ref = {parent_manifest_sha256,parent_index_sha256,file:{name,sha256,bytes},
#               source_key:[family,setting,variant,game_id],origin:[Y,W],delay_hours}
```

The private plan modes are `source_inner`, `source_outer`, `new_score`, `raw_reference`.
They determine exactly which saved score row may be opened after publication; they never select a model.
Keep resolved laws only for the current origin. No source-data/grader handle is passed into a mean, fit or selection call.

## Controller order and source access

Inside one complete `accounting.origin(original_origin)` scope, load `forecast_inputs` and freeze a new year's choice before its first advance.
The view has `prepared_receipts[12/24]`, but pass the bank only `bank_prepared[12/24]` with `history` and `targets`.
The bank validates81 cached outputs and advances216 own engines once; failure after partial delivery aborts permanently.
Persist the new engine state arrays/native forecasts/events plus297 output identities, linking the81 borrowed outputs to the original state pointer.
Prior native expectation publications provide history provenance; do not create a resume/splice path or duplicate every stored history in every snapshot.
For years>=2011, persist each exact admitted mapper payload using `research_score_split_run.put_object(store,payload)`.
Require the local pointer equals `view['mapper_sources'][delay]['pointer']`; identical payloads deduplicate through Store authentication.
This makes the original `rf.joint-distribution.v2` descriptors self-contained in the new archive without changing their bytes or inventing a recipe type.
`view['mappers'][delay]` is already the accepted successor `JointBase`; do not call legacy `common_mapper` or refit the empirical mapper.
The current source dictionaries are `source_laws['full'][(family,setting,game)]` and `source_laws['outer'][(family,variant,game)]`.
Full sources contain N0/E2 only; outer sources contain all N0/E2 original variants plus E1full/S1full.
Full rows identify variant `full` in source_ref even though their original row schema has no variant field.

## Exact law branches

2010: advance all states and persist a complete origin with both forecast arrays empty; no new law resolution, score or selector feed.
The five original2010W1–W5 exceptions lack original forecast/mapper/ancestry sources; later2010 origins still require their admitted original closures.
2011–2024: emit27 E3 full rows per target in original target order.
For setting0..8, copy the matching `('E2',setting,game)` source descriptor/reason, mode `source_inner`; no recovery is needed merely to publish/reuse its saved inner score.
For setting9..26, use `outputs[('E3',setting,'full')]` and the12-hour mapper to resolve that candidate's own law; mode `new_score`.
This yields exactly32823 reused diagonal and65646 new off-diagonal inner scores on a valid complete run.
2025: do not build/resolve the27 unused full candidates or emit full rows. Resolve only the chosen outer series; all own states still advance.

For each outer origin2013–2025, traverse `SPLIT_VARIANTS` exactly, then targets in `targetGameIds` order.
Choose native output through `bank.selected_output(outputs,'E3',chosen,variant)`; select its forecast by game ID, not native sorted-row position.
Same original selected diagonal: chosen is an exact integer0..8 equal to `view['original_selection']['E2']['setting']`.
For its original11 variants, reuse only the exact admitted E2 selected row after matching source setting/variant/game/origin/delay/reasons/flags; mode `source_outer`.
This interprets “ordinary” in the RF-02F reuse clause as the original11 variants, excluding the two new zero controls; do not import RF-02D's different ORDINARY registry.
Recover its law once when needed for the four new actual-mass fields; preserve all original outer metrics after grading and never rescore those metrics.
Different diagonal: `full` may recover that setting's saved full law, but mode is `new_score` with full outer diagnostics.
Its other variant laws are missing from the archive and must resolve from that setting's own cached native output; never borrow another setting's selected metrics.
Off-diagonal or either new zero control: resolve from the corresponding own-history output and compute a complete outer score.
When selected off-diagonal `full` was already resolved for this origin's inner row, reuse that same own law/reason object; still compute its distinct complete outer score.
Independence/noise retain `selected_output` plus unchanged `resolve_distribution` behavior for missing laws; noise never mutates the learning output.
A bounded pure probe confirmed JSON-list diagonal means become an isolated NumPy noise result without changing the source output.
Append the six raw rows from the exact `RAW_REFERENCES` registry; copy descriptors/reasons and use `raw_reference` metrics unchanged after publication.
Do not require recovery of six unchanged reference laws merely to copy their authenticated score rows.

## Lazy fallback without a second solver attempt

The existing `research_score_replay.resolve_distribution(mapper,forecast,'E3',variant,n0_distribution)` has no callback parameter.
Pass a private non-None sentinel as `n0_distribution`; it is returned untouched only on a native/solver/grid failure.
If the returned law is the sentinel, require the exact nonempty failure reason and recover the authorized N0 law once; never call resolve_distribution again.
If chosen is None, call with forecast=None and preserve `no_eligible_setting` for every E3 outer row.
Use source full `('N0',0,game)` for inner fallback and source outer `('N0',fallback_variant,game)` for outer fallback.
Fallback variant is `full` for full/no_offense/no_defense/zero_strength_update/zero_scoring_level_update; all shared variants use the same original N0 variant.
Availability24h always uses its24-hour map and N0availability24h. Independence fallback uses the admitted independent N0 law.
Missing/failed/wrong-delay N0 is protocol-invalid, not a new model failure label or permission to fit another baseline.
Cache lazy source recovery by exact mapper pointer+descriptor bytes within this origin; record source recovery versus new-fit counts separately.

## Timers, descriptors and the durable boundary

Use `research_score_split_archive.recover_source_law` for strict saved recovery, and unchanged `research_score_run.distribution_descriptor` for a newly resolved law.
For a new resolution, one `accounting.callback('fit',...,operation='fit',stage='inner'|'outer',...)` encloses native resolution, any required lazy fallback recovery, descriptor creation and immediate descriptor recovery/consistency check.
For a separately needed saved-law recovery, use one fit-class callback with `operation='recovery'`; cache hits do not create fictitious fit callbacks.
Return `CallbackResult(value, native_failure=reason, used_fallback=(reason is not None))`, including saved fallback laws; preserve exceptions and failed timings.
No nested callback, retry, second solver attempt or post-stop callback is allowed. A recovery or cached law cannot satisfy the successful off-diagonal full-fit pilot sample.
Persist the per-row provenance/plan separately from the exact publication schema; link each row to the proper current original file and source key.
Construct the complete publication envelope first and compute its SHA from `strict(envelope)`.
Before publishing it, durably write state and both lineage closures using unchanged `research_score_run.lineage`, with forecast-body SHA/delay and separately bound state/source pointers in the controller's exact provenance record.
Persist that provenance record before the complete envelope; the owner must verify all these exact pointers, not infer lineage from a state filename.
Then `Store.write(publication_name,envelope)` and authenticate exact bytes via `read_publication(store,store.pointer(publication_name))`.
Only now call `grade_inputs(...,read_publication=partial(read_publication,store),expected_manifest_sha256=manifest_sha256)`.
Grading may use the already validated law objects only after the reloaded publication descriptors match them; no target-derived parameter may enter the assembly.
New inner scores use unchanged `research_score_compute_distribution.score_forecast` with diagnostics=False and the original first-game-per-inner-season/setting double-grid rule.
All new outer scores use diagnostics=True,double_grid=True, including selected diagonal-full rows whose saved inner metrics lack these fields.
Each actual score call is one disjoint score callback; record native failure/fallback metadata in its CallbackResult as well.
Derive four E3 interval_mass_80 fields as CDF(upper)-CDF(lower-1) from that same law and saved/new intervals outside the score callback; count/time them in the origin remainder.
Copy raw/source metrics rather than editing them in place. Durable JSON reload precedes StrictSelectionFeed.add and the public inference input.
After grading, join all27 inner rows in exact target/setting order and pass the bound grading receipt to StrictSelectionFeed.add; no2025 feed.

## Concrete remaining implementation checks

No required frozen API needs modification. The additive assembler and its exact state/provenance record validator are still missing; this note is not their acceptance.
Freeze/tests must include same-selected reuse, different-selected diagonal, off-diagonal full inner/outer reuse, both zero controls, no-eligible/failing-grid lazy fallback, 24h separation and 2025 selected-only work.
Verify the sentinel never escapes into descriptors/scorers, source descriptor flags/native reasons survive unchanged, publication failure prevents grade, and all callbacks including failed resolution have disjoint real timings.
The combined origin clock must include selection, cache/source reads, state work, mapper loading, descriptors, lineage, publication, grading, CDF derivations and persistence; the31-slot projection remains unchanged.
Original retrospective provenance and accepted units do not authorize a historical invocation; full integration/controller/runtime acceptance and the current gate remain required.
