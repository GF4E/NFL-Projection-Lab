# RF-COMP-06 integration assessment

Decision: **defer a new controller solely for bank snapshots**. Keep the candidate and its evidence available for a future independently justified controller version. This assessment is read-only; it neither implements a hook nor authorizes another historical invocation.

The sole qualification reportedly completed session 87991, exit 0: 29 tests, 135 observations, ten complete-bank parity pairs. The fixed original pass took 0.4744956649665255 seconds and candidate 0.349627083982341 (ratio 0.73683936). Eight pairs were faster; last-origin and Unicode pairs were slower (2.7188× and 1.02346×). Root authenticated 393 files / 272421859 bytes and operational limits; the independent numerical audit was still pending at dispatch. These are isolated synthetic comparison results, not a full-origin or historical capacity result.

## The actual hook is absent

In frozen `scripts/research_score_split_compute_controller.py`:

- Line 59 imports `_bank_state_digest` as a fixed module binding.
- Lines 92 and 98 call that binding around `assemble_forecasts`; the digest is used only for the local invariant.
- `_chronological_origins` at line 66 has no capture/equality dependency argument.
- `run` at line 162 calls its own module's `_chronological_origins` at line 190; it has no loop dependency argument either.
- The launcher, manifest/preflight, observer prefix and terminal version are tied to RF-COMP-04. The preflight requires exact code membership and creates its own versioned identity; its old acceptance cannot admit a new helper.

The original helper at `research_score_split_controller.py:352` remains the exact payload oracle. `publish_origin`, `validate_publication_binding`, saved inference assembly, Store and finalization can remain unchanged. The before/after digest itself is absent from persisted origin evidence.

A wrapper inside the assembler cannot remove the two surrounding original digest calls. Importing the old `run` into a new module also does not redirect its global lookup. Intercepting arbitrary envelope calls or disguising a snapshot as a digest equality object would make this invariant less explicit. Global replacement, runtime cloning and a new copy of the whole controller are outside the proposed route.

## Smallest maintainable future change

When a new controller version is independently warranted, put the two operations at an explicit source-level boundary in its chronological loop. The substantive replacement is:

1. `before = envelope.call(capture, bank, outputs)`;
2. execute the existing complete assembly call unchanged;
3. `after = envelope.call(capture, bank, outputs)`;
4. `require(envelope.call(same, before, after), 'native_state_changed_during_law_assembly')`;
5. release both snapshots before publication.

Both captures and comparison belong to the existing origin clock and shared deadline, never a fit/score callback or free preparation stage. Original persistence, lineage, grading and failure reasons remain unchanged. Releasing the owned trees avoids retaining two full bank images through publication and subsequent origins.

A newly versioned owning worker must select that loop explicitly through a fixed source binding or a narrowly named loop parameter; a frozen imported worker cannot do so today. If the next necessary version introduces a reusable boundary, make capture/comparison and the owning loop explicit dependencies, bound by source and acceptance rather than user-configurable algorithm choices. This is a small future seam specification, not a reason to build a new controller framework now. The current frozen files are not edited.

A future acceptance must bind the candidate and its completed numerical review, new source/tests/protocol, preserved 79-file and runtime closure, new manifest/observer/run identity and unchanged budgets/pilot/no-restart rules. Reuse applicable existing evidence with exact source/AST correspondence; do not rerun the inherited bootstrap fixture merely to demonstrate two changed local calls.

## Real integration boundary test, if that version is built

Use the genuine accepted tiny-origin assembly/publication/grading fixture and actual Store, envelope and bank. Exercise the new loop's real capture → assembly → capture → comparison → publication sequence. Compare all deterministic scientific and persisted payloads with the retained accepted witness, treating only the documented new identity and timestamp closure separately. Verify no snapshot or replacement digest appears in stored evidence and neither original bank digest is still performed by this boundary.

Add one last-leaf mutation by the assembly seam and one capture/deadline failure. Both must stop before publication, grader access or selector feed; retain the original invariant reason where applicable and the existing invalid-prefix/finalization behavior. Charge comparison and fallback work inside the live origin envelope, test snapshot release/no input mutation, and reauthenticate all unchanged dependencies. Reuse the 29 focused tests for leaf/fallback semantics and previous unchanged chronology/Store/watchdog evidence rather than rebuilding those fixtures. New launch/preflight and terminal ownership still need their small actual integration checks.

## Capacity implication and next useful action

The saved profile assigned the two digest calls 0.158821792 seconds, about 19.34% of its 0.821280537-second remainder. Even deleting that entire bucket could not alone meet the current 42.05% conditional remainder reduction under proportional extrapolation. Actual elimination is not possible, the candidate has nonzero cost, two fixed cases regressed, and profiling overhead was 2.3426× with unequal stage effects. Do not combine its isolated timing ratio with historical seconds or claim a 12.39% fit/score improvement. That callback term is untouched.

The next smallest useful action is a **read-only attribution check of the unchanged `energy_score` caller**, using already saved records and source. The current composed-origin profile records 62 calls to `research_score_distribution.py:262 energy_score`, 0.120851958 cumulative seconds, against profiled fit+score callbacks totaling 0.226771171 seconds. Its own exclusive time is 0.039262915 seconds; this is contained within, not additional to, the cumulative time. Unlike old pre-COMP-02 Skellam-wrapper or pre-COMP-03 encoding shares, this is an unaddressed cost in the current composed path and a sufficiently large parent bucket to investigate the 12.39% callback alternative.

The precise unresolved question is how much of that caller is unavoidable probability-dependent FFT/reduction versus repeatable shape-only coordinate/lag-distance construction. The source constructs `np.indices`, FFT padding shape, lag arrays and a distance matrix on each call, but different base/doubled grids and probabilities cannot share their FFT or score merely because dimensions look similar. First inspect the retained direct FFT/array caller edges and exact base/double-grid call contract; identify the nonoverlapping reachable portion and whether identical required geometry is actually reused. Saved aggregate NumPy time may not resolve individual expressions. If it cannot establish a concrete removable dependency of useful scale while preserving operation/error order, record that limitation and defer another candidate. No new profile, retiming, cache implementation or algorithm change follows automatically from this parent bucket.

Future distinct tests should reference unique lossless fixtures by authenticated hash where equivalent, instead of duplicating the same complete banks hundreds of times. Preserve the current 272-MB evidence unchanged. Any compact representation must reconstruct and check exactly the same logical cases; it cannot omit input bodies, mutations, failure evidence or cost from the command envelope.

Read-only sources: frozen compute controller and original controller helper; compute preflight's fixed acceptance/identity contract; `work/rf-origin-profile/actual-attribution-review.md`; its saved `profiled/pstats-records.json` (SHA 6151b41734cff6c0a120cd684212f65a52992a7e98b732e3253b9f62a188a021); unchanged `research_score_distribution.py` energy score and `research_score_metrics.py` base/double-grid scoring call sites. Historical profiles before later optimizations were treated as older context, not current removable-cost evidence. No scientific source was imported, no callback/test/profile was run and no source or existing evidence was changed.
