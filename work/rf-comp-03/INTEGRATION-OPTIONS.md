**RF-COMP-03 composition map — design only, 2026-09-06**

Recommend one explicit computational successor with three new production modules and focused integration tests. Preserve the 66 RF-02F source/test files and every qualified RF-COMP source/test file byte for byte. RF-COMP-03's independent synthetic review is complete under [RF-COMP-03-ACCEPTANCE.v1.json](/private/tmp/os01-gen15-rebuild.9ny71k/.planning/engine-os/research-first/RF-COMP-03-ACCEPTANCE.v1.json), SHA-256 `f2c0688a721bc1e9ce6845001e0df69ad6606d2c04edeac7d1ce1ea54aac846f`. This note neither approves implementation nor authorizes a historical invocation.

The root-reported RF-COMP-03 synthetic callback result is promising but not a historical capacity result: the unchanged Skellam mode also crossed the absolute target in this later run. The broader reported memo stress remains above that target. Freeze the actual implementation and gate any future run with the unchanged complete cost pilot; do not select a favorable timing run or treat the stopped RF-02F prefix as restartable.

**Existing seams and the smallest explicit additions**

| Boundary | Existing behavior | Recommended addition |
| --- | --- | --- |
| Public forecast construction | `research_score_split_forecast.py:376` constructs `_Assembly` directly. The useful class seam is inherited `build()` at line 332, which calls `self.resolve`. | A new same-signature `assemble_forecasts` function returning qualified `EncodingAssembly(...).build()`. No copied model, fit solver, source cache, or `build()` body. |
| New-score grading | `research_score_split_grade.py:118` closes over module-global `score_forecast` at line 205. Constructor has no scorer argument. | A new subclass of `PublishedOriginGrader` with a literal, reviewed copy of `grade`, changing only the imported scorer dependency to qualified `research_score_skellam_compute.score_forecast`. Inherit constructor and attempt-state properties. Reuse the original validation helpers explicitly. |
| Chronological controller | `research_score_split_controller.py:369` imports the original wrapper/grader locally. These imports cannot be changed by a caller argument or subclass. | A new literal copy of `_chronological_origins`, with those two imports directed to the fixed new composition module. Retain its selection, advance, publication, grading, feed and pilot ordering and every count check. |
| Worker and launcher | `research_score_split_controller.py:501` imports old preflight locally; `_launch` at line 27 fixes old observer identity and script path. | A new worker/launcher using the new fixed preflight, copied chronological loop and a newly frozen model/observer identity. Retain lean-parent-before-scientific-import ordering and all stop/finalization logic. |
| Pre-fit receipt | `research_score_split_preflight.py` fixes RF-02F receipt versions, source membership, stages and identity. `_validate` is expressly a private synthetic seam. | New versioned preflight validation and manifest construction. Reuse byte/pointer/parser/runtime helpers where their fixed roots and semantics still apply. Do not call the old private synthetic seam as a production bypass or mutate its constants. |

Proposed file organization, names to freeze with the successor scope:

- `scripts/research_score_split_compute_integration.py`: the small public assembler wrapper and copied grader override with fixed imports. Keep dependencies fixed in source; no arbitrary callable selector in production.
- `scripts/research_score_split_compute_preflight.py`: new receipt/qualification/review validation and immutable manifest construction. The old scientific configuration remains a distinct bound input.
- `scripts/research_score_split_compute_controller.py`: lean launcher, worker `run`, copied `_chronological_origins`, and small entry-point glue. Import unchanged owner helpers rather than copying them.
- Focused new integration, preflight and controller tests plus a bounded qualification driver. Freeze their exact membership with the source set; no provisional numeric file-count assertion before that set exists.

The unavoidable copies are the grader's method and the controller's orchestration/launch functions, plus version-dependent preflight validators. Their globals make delegation insufficient. An explicit, checked source copy is preferable here to introducing a general dependency-injected runner. Never rebind imported module globals, modify function `__globals__`, use `FunctionType`, AST execution, dynamic source cloning or `sys.modules` substitution. Static AST comparison is suitable evidence of the authorized differences, not a runtime mechanism.

**Reuse with no scientific change**

Reuse `ControllerEnvelope`, `_bank_state_digest`, `_admission_evidence`, `publish_origin`, `validate_publication_binding`, `_saved_inference_inputs`, `COUNT_KEYS` and `run_smoke` from the accepted controller. Reuse the original archive admission/forecast/grade/selector boundary, bank, statistical evaluator, `OriginAccounting`, pilot function, `Store`, and public watchdog `supervise`.

The underlying wire versions such as `rf02f.origin-publication.v1`, state, origin evidence and grading provenance may remain unchanged schema identifiers. These artifacts already bind the owning **new manifest hash**, and publication lineage hashes the complete manifest source map (`research_score_conditional_admission.py:157`). Retaining these schemas avoids copying the many exact validators. Separately version the successor implementation receipt, manifest and terminal identity; document inherited wire schemas explicitly so they are not mistaken for reuse of the old run identity.

Keep the original scientific config and protocol hashes under their existing fields. Add separately named computational-protocol, predecessor-implementation/terminal, and current-qualification/review bindings to the new manifest. Do not replace `bound_hashes.config` with a compute-only registry: the original publication and lineage validators require the unchanged scientific config.

`EncodingAssembly` still returns exact `JointDistribution` objects. This matters because the original grader `_bound_law` at line 83 requires that exact type. The Skellam scorer creates its private readonly wrapper only inside each new score call. Do not place `SkellamDistribution` instances into the published/resolved-law cache.

Preserve these deliberate limits:

- The new memo is created inside each actual fit callback and discarded afterward. Original source-law recovery outside that callback and `_bound_law` descriptor checks remain original.
- Copied diagonal/selected/raw score rows retain their original metrics and are never rescored merely to exercise the candidate.
- Inner new scores keep first-per-season/setting double-grid behavior and diagnostics false. New outer scores retain both flags true, including native-failure fallback rows.
- The grader's eight additional interval-mass CDF calls per E3 outer row (`research_score_split_grade.py:228`) remain calls on the original law, outside the score timer and inside the complete origin timer. The qualification does not justify changing these or adding marginal caches.
- Source forecast pointers, later loss pointers, native reasons, selected settings, strict JSON reload and directory fsync remain unchanged. Memo reuse must not suppress component recovery, hashing, moments or descriptor roundtrip authentication.

The reused `run_smoke` exercises the unchanged full public evaluator and accepted selection/bank boundaries; it does **not** prove that the new assembler/grader dependencies were selected. Pre-fit composition tests must prove those calls. The new run's first retained cost pilot then measures the actual selected production route.

**Focused qualification obligations**

1. Prove explicit routing through the new public assembler and grader. Use the existing genuine tiny `test_grade_unit.Case` setup and real Store, archive handoff, bank, accounting and publication validator, with a new explicit test adapter for its hardcoded publication method. Compare scientific descriptor/law/metric bytes with the original route. The run-manifest/provenance identity is intentionally different and must bind the new source map.
2. Exercise selected original diagonal, different diagonal, off-diagonal, both zero controls, independent/24h variants and no-eligible/numerical fallback. Count actual memo construction inside fit callbacks and candidate score calls. Ensure inherited copies and raw rows avoid new scoring, and source/mapper arrays and globals remain unchanged.
3. Verify durable publication before labels, exact first-inner-double-grid state across origins/seasons, original native reasons and source/loss pointers, full 104-field scoring plus four unchanged mass fields, strict saved JSON type validation, and immutable saved score bytes before selector/inference use. A scorer spy must wrap the actual candidate; routing-only sentinels cannot count as numerical evidence.
4. Run the new copied chronological loop on the complete synthetic 277-origin plan with explicitly declared scientific seams where necessary. Verify 53 retained pilot origins/224 suffix, 2010 state-only, 2025 no unused inner work, 98,469 inner/64,733 outer dispatch rows, annual choice before current labels, no feed after 2024, exact order, pilot stop and no post-stop work. Reuse prior numerical qualification only for unchanged dependencies, with exact source/AST applicability evidence.
5. Exercise actual new CLI/worker preflight with nonexistent synthetic receipt and duplicate observer identity; altered/missing runtime/library/source/acceptance pins must fail before Store/admission. Then qualify a genuine synthetic accepted controller path through Store completion. Retain missing/tampered publication, scorer failure, poisoned grader, partial writes/fsync, stop and post-rename failure cases on the changed route.
6. Authenticate and reuse the accepted full 19-by-3,407 inference fixture and unchanged evaluator evidence; do not regenerate large scored fixtures simply because the controller identity changes. Still verify that durable current-origin score assembly produces the exact required evaluator input order and 2025 development exclusion. A full public evaluator check in the registered controller qualification/smoke remains distinct from small-route numerical equivalence.

Before approving any historical command, the complete successor must have its own frozen computational scope, exact source/runtime closure, bounded actual synthetic integration result, distinct numerical and temporal reviews of that result, and a final one-invocation acceptance. Unit acceptances and inherited RF-02F permission are prerequisites only. This mapping is not that acceptance.

**Source/runtime and sole-run closure**

The new exact source map must contain all 66 original files, qualified COMP-01/02/03 module and test files used by the composition, every new production/test/qualification source, and any imported new helper. Bind the accepted COMP receipts and their actual retained results/reviews by exact pointers, including the completed synthetic-only RF-COMP-03 acceptance above. Reauthenticate the map before execution and after scientific completion.

Keep pinned isolated Python 3.12.2, NumPy 1.26.4 and SciPy 1.13.1/Darwin. The Skellam shortcut relies on private backend behavior: preserve the COMP-02 pins for `_distn_infrastructure.py`, `_discrete_distns.py`, `_boost/__init__.py` and `ncx2_ufunc.cpython-312-darwin.so` in the new runtime closure, not just package version strings.

Use unchanged `OUTPUT_PARENT` from `research_score_run.py:30`, and a new frozen manifest-derived namespace. `Store` uses exclusive identity allocation; it cannot resume an existing directory. A new observer prefix plus current acceptance hash must also be exclusive. No time-dependent identity, retry flag, configurable weaker budget, or same-receipt second attempt. Reference the stopped RF-02F terminal as preserved negative evidence; start any authorized new run from the same original RF-02C parent with fresh trajectories, never from the RF-02F pilot state.

Retain 7,200 seconds/4,096 MiB, setup-inclusive inherited parent timing, the separate complete 120-second smoke limit, the unchanged pilot formula and its measured successful callback requirements. Reuse the same 30-second invalid-metadata-only grace and zero external-worker grace. Preserve exact partial ordinary/staging bytes and one authoritative atomic `completion/{terminal.json,artifact-index.json}` pair. The inherited watcher/phase schemas may remain wire-compatible under the new observer directory; do not invoke the watchdog's private shortened-limit test seam in production.

No implementation, scientific function, source admission, historical archive or controller was executed for this note. No existing source or receipt was edited.
