# Next efficiency design: one ephemeral bank-state comparison

Status: design only. RF-COMP-05 passed 28 tests, 171 observations and all 11 corpus items, but its single timing pass was slower: 0.089984456 versus 0.046922543 seconds (1.917723×). Preserve that rejection. No serializer integration, retiming or formatter variant is proposed.

## Decision

One small, standalone test of **fresh bank-state snapshots** is justified as a partial-cost hypothesis. Target only the two `_bank_state_digest` calls surrounding assembly. Keep the original serializer and every persisted byte, digest, source authentication, state validation and publication check unchanged. Do not yet expand to other equality sites or integrate a controller.

This cannot establish sufficient historical capacity by itself. In the accepted tiny-origin profile, those two calls account for 0.158821792 seconds, about 19.34% of the 0.821280537-second profiled remainder. Even eliminating that entire bucket would fall short of the required 42.05% remainder reduction under a proportional extrapolation. It does not reduce the fit/score callback term, whose alternative target is 12.39%. Moreover, the profile inflated whole-origin time by 2.3426× and its stage overhead varied; these fractions locate work and are not speedup predictions.

## Reachable boundary

The frozen `_bank_state_digest` builds a payload from all sorted current outputs and all sorted owned engines, including each engine's last origin, ratings, offense and defense. It serializes and hashes that payload before assembly, then repeats the complete operation afterward. The two results are used only for a local equality check; neither value is stored in origin evidence. A different private comparison representation can therefore preserve persisted formats.

Other callers are deliberately outside the first candidate:

| Profile caller | Profiled strict time | Relevant distinction |
| --- | ---: | --- |
| `_validate_published_state` | 0.025781616 s | Borrowed-state output comparisons are ephemeral, but the surrounding validation is mandatory. |
| `publish_origin` | 0.097365286 s | Mixes ephemeral borrowed-output comparisons with state normalization, manifest/code hashes and publication bytes. The whole caller total is not removable. |
| `validate_publication_binding` | 0.029413834 s | Three paired plan/forecast comparisons follow actual owning-Store reads; source, lineage and pointer authentication must remain. |
| Composed grader `grade` | 0.095562165 s | Mixes equality checks with source bytes, persisted metric digests and the strict JSON conversion that prevents NumPy values crossing the inference boundary. |

The 0.541970693-second non-callback strict total, and the still broader strict cumulative total, are not eligible-cost estimates for this proposal. A later expansion would need callsite-specific attribution and separate justification.

## Smallest candidate semantics

Keep the original payload construction and its access/sort order. At each capture, call the original `canonical` exactly once, then examine the entire resulting snapshot afresh. For a narrowly guarded tree of exact builtin JSON types, retain a private owned, typed representation and compare content without pretty JSON or SHA-256. No identity cache, shared array views, skipped nodes or reuse of the earlier capture is permitted.

The first candidate should retain original NumPy conversion through `canonical`. Bulk raw-array capture is deferred: dtype, shape and raw bytes can distinguish arrays or lists that the original canonical JSON treats as equal. Avoid introducing a second canonicalizer before this simpler hypothesis is measured.

Required equality and error behavior:

- Sequence order matters; dictionary insertion order does not, matching sorted JSON keys. Key membership and all values must be checked.
- Distinguish bool, int and float; preserve signed floating zero. Finite float content must not use ordinary numeric equality alone.
- Use an explicitly bounded, exact-type domain with ASCII strings and keys initially. Raw Unicode equality is insufficient universally: an astral character and a literal surrogate pair can have the same `ensure_ascii` JSON spelling. Unsupported Unicode goes through the original encoder.
- Finish the complete original canonical traversal before eligibility decisions. Unsupported, cyclic, deep, subclass, nonfinite or otherwise unproved cases use the original `encoded(snapshot)` behavior at capture time. Do not call `strict` again and duplicate canonical hooks. Canonical failures propagate unchanged.
- Capturing before assembly must finish, including any fallback failure, before assembly starts. Capture afterward must finish before equality is decided. An early mismatch must not skip errors or reads in the second capture.
- If one capture requires encoded fallback and the other is supported, compare original encoded bytes of their owned snapshots. Never reread the original pre-assembly objects to obtain fallback bytes. Unexpected candidate failures propagate; there is no catch-and-retry fast path.

A private owned snapshot is sufficient; a general serialization format, persistent cache, decoder or mutation framework is unnecessary. The candidate must not expose mutable retained content to assembly.

## One bounded next action

Preregister one standalone candidate and qualification, with a 60-second / 1024-MiB setup-inclusive external envelope. Use the accepted saved synthetic native state to reconstruct the complete bank-shaped comparison inputs: 297 outputs and 216 owned-engine fields. Bind the exact source state, original helper/canonical/encoder sources, candidate, test and runtime hashes. This requires no admission, model fit, law recovery, scoring, bootstrap or full-origin rerun.

First compare the original digest-equality decision and original exception behavior against the candidate on an unchanged before/after pair and a fixed adversarial panel: last-element mutation, output or last-origin mutation, sequence reorder, dictionary insertion reorder, signed zero, bool/int/float changes, equivalent canonical array/list forms, aliases, mutation after capture, Unicode fallback, subclasses with conversion hooks, nonfinite values, cycles and unsupported/deep inputs. Check left-to-right exception order and that a failed before capture prevents the assembly sentinel. Verify fresh complete reads and no mutation of source objects. Any mismatch stops qualification before timing.

Then perform exactly one unprofiled original pass followed by one candidate pass over the same fixed complete bank-shaped pair panel. Include payload construction, canonical conversion, eligibility, copying and comparison in both totals; retain every result and error. No warmup, repetitions, timing selection or alternative implementation. A slower or inexact candidate is removed from the immediate path. A faster candidate supports only this isolated comparison cost; one timing pass does not establish a robust speedup or historical capacity.

## Integration boundary and remaining uncertainty

The current compute controller imports the original digest helper. A later accepted integration could bind a new explicit helper in a new controller identity while preserving all frozen files and original persistence helpers. It cannot replace the old module's globals, clone functions dynamically or silently affect its publication/grader helpers. This assessment authorizes neither that integration nor a historical retry.

The useful unknown is whether removing JSON rendering and hashing outweighs fresh typed traversal/copy costs on this complete state. If it does not, stop this branch. If it does, retain it as a measured partial improvement and reassess the remaining capacity gap before selecting another change; do not claim this isolated target can close the current pilot failure.

Evidence: `work/rf-origin-profile/actual-attribution-review.md`; frozen `research_score_split_controller.py` (`_bank_state_digest`, `_validate_published_state`, `publish_origin`, `validate_publication_binding`); `research_score_split_compute_integration.py` (`PublishedOriginGrader.grade`); original `canonical`, `strict` and `encoded`. This document records a read-only design assessment; no candidate, test or experiment was run for it.
