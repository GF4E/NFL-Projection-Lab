# Next candidate: guarded exact-byte strict serialization

Design only, September 6, 2026. No serializer candidate, test or scientific operation was implemented or executed for this note. The completed profile retains one qualitative hypothesis; it does not establish a speedup, historical capacity or permission to resume a stopped run. All 79 accepted files remain frozen.

The completed profile's acceptance SHA-256 is `93553c563f064232a58215e8e5f96831a80f7573133d1116be4fe26a9322b6a6`; its scope remains exact synthetic evidence and qualitative attribution only.

## One falsifiable implementation hypothesis

The saved attribution identifies 557 clearly non-callback `strict` invocations taking 0.541970693 profiled seconds, 65.99% of the profiled remainder. Profiled/plain path time is 2.3426×, so that percentage is qualitative. Even a proportional extrapolation would require removing roughly 63.72% of this bucket to supply the conditional 42.05% reduction of historical C. Neither extrapolation nor that saving is established.

Implement at most one pure candidate, tentatively `research_score_strict_compute.py::strict(value)`: retain the exact original `research_score_conditional_replay.canonical(value)` call **once**, then accelerate only encoding of its resulting snapshot. The hypothesis is that a C-produced compact JSON token stream plus whitespace-only pretty formatting can beat the original recursive Python pretty renderer enough to offset the fresh domain scan and formatting work. It may fail; do not assume string scanning is faster.

This deliberately retains canonical conversion, including its NumPy handling and subclass hooks. A raw-input builtins-only shortcut would fall back on `_bank_state_digest`'s native arrays and could miss a major observed caller. Reimplementing NumPy conversion would add a separate hypothesis and is excluded.

## Exact contract and bounded fast domain

Original `strict` is `encoded(canonical(value))`. Original `encoded` is `(json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()`, including default `ensure_ascii=True`. Preserve all of these bytes: Unicode key sorting, two-space indentation, comma/newline layout, colon-space separators, empty containers, ASCII escape spelling, float/exponent representation, signed zero, UTF-8 encoding and exactly one trailing newline.

After canonical conversion, freshly inspect every node. Propose fixed guards of at most 32 container levels, 131,072 nodes and 4 MiB of total string characters; accept only exact built-in dict/list, exact string keys, exact str/bool/None/int/float leaves, finite floats and integers of at most 256 bits. Count repeated occurrences, not just unique object identities. Cycles, subclasses, other types, excessive depth/size, nonfinite numbers and unsupported keys take the original encoder route. These guard limits define eligibility only; they never truncate or reject a value that the original would encode.

Do not memoize by object identity, a prior digest, mutable-array address or previous success. The original canonical snapshot is freshly built on every call, every candidate-eligible node is freshly inspected, and every original caller still hashes/checks the resulting bytes. Before/after native-state checks remain separate complete calls.

For the guarded snapshot only:

1. Call pinned stdlib `json.dumps` with `sort_keys=True`, `ensure_ascii=True`, `allow_nan=False`, and compact separators `(',', ':')` so the C encoder produces all scalar/string tokens.
2. Pretty-format only punctuation **outside complete JSON string tokens**. One bounded scanner/tokenizer preserves entire escaped strings and numeric tokens verbatim, inserts the exact original whitespace, and handles empty containers without extra newlines. A regex/string-token implementation is plausible; do not use naive replacements of commas/braces inside strings or generate floats with custom formatting.
3. Append exactly one newline and encode to bytes. No parse/re-encode through another numeric library, third-party serializer, changed float precision or dependency installation.

The candidate's fallback must call original `encoded(snapshot)` directly from its `strict` entry point after the guard returns; do not rerun canonicalization or call original `strict(value)` a second time. This preserves one traversal of raw-input NumPy/subclass hooks and retains the original encoded boundary. Raw cyclic/deep inputs that fail during original canonicalization propagate that original failure before the candidate encoder is reached. Unsupported canonical values reach the original encoder unchanged. Unexpected compact-encoder/tokenizer exceptions propagate; do not catch them and silently retry another algorithm. No exception suppression, partial-result cache or successful-prefix reuse.

## Cheapest meaningful qualification

Freeze a new source, new focused tests and a workspace-local driver before a single bounded attempt. Pin the current 79-file map, seven runtime files, original canonical/encoded sources, Python JSON encoder/decoder/scanner and `_json` native extension, plus the chosen tokenizer implementation (`re` components if used). No historical data, law recovery, fitting, scoring, CDF, full inference fixture or bootstrap is needed.

Use every JSON artifact in the **fixed plain-route** `work/rf-origin-profile/profile-685708ac9c57a623/plain/origin-store/`, in sorted filename order, authenticated against its retained index. This includes real tiny native state, forecast descriptors, ancestry, publication binding, saved losses and grading/origin provenance. Before timing, require original `strict(json.loads(saved_bytes)) == saved_bytes`; unsupported/noncanonical saved files must be reported explicitly and remain in equality coverage. Do not silently choose a favorable subset. Also construct one fixed in-memory state-shaped input from the saved arrays using exact NumPy arrays, exercising unchanged canonical conversion; its observed values remain synthetic, and constructing arrays is not model fitting.

For all corpus inputs and adversarial cases, compare original/candidate byte type and exact bytes, or the same exception type and message. Preserve input snapshots, both actual outputs/errors and guard eligibility; parsed-value equality is insufficient. The adversarial suite must include:

- Scalars and nested/empty dicts/lists/tuples; different insertion orders; string keys with numeric-looking spellings; non-string and mixed-type keys.
- Quotes, backslashes, every JSON control escape, literal delimiter characters inside strings, long escape runs, Unicode BMP/non-BMP characters and lone surrogates; verify ASCII escape spelling and key ordering.
- Positive/negative zero, subnormal floats, finite extremes, exponent-format boundaries, integers around the fast guard and Python's decimal-conversion limit, bool/int distinctions, and NaN/±Inf at every nesting position.
- Exact NumPy scalar/array conversion through the original canonical function, noncontiguous/read-only arrays, object arrays, ndarray/dict/list/string/numeric subclasses and opaque unsupported objects. Count side-effecting subclass hooks to prove canonical conversion is not repeated.
- Self-cycles, mutual cycles, shared acyclic children, exact guard-depth boundaries and substantially deeper input. Delegate rather than invent a new recursion error. Do not alter process recursion or integer-conversion limits to help the candidate.
- Mutations between consecutive calls: nested element, dictionary insertion/deletion/order, array element, signed-zero bit and same-shape replacement. The second result must reflect the current complete value. Failure followed by valid input must not reveal retained state.

After equality checks, perform **one fixed unprofiled comparison**: original corpus pass once, then candidate corpus pass once, with every corpus input processed exactly once in both. Include canonical conversion, guarding, compact encoding, formatting and byte creation inside each timed call. Persist outputs outside the per-call intervals but inside the command cap. Report all per-artifact observations and aggregate totals, eligibility/fallback coverage, setup and persistence costs. No warmup, repeated median, best-pass selection, candidate variants, cProfile or retry for a better number. Fixed order/cache/OS effects remain a limitation.

Proposed envelope: 60 seconds / 1,024 MiB total, including imports, snapshots, exactness tests, corpus construction, both fixed passes, output retention and after-pins; reuse the accepted external observer and five-second internal evidence reserve. A failure is retained and diagnosed before any separately scoped correction. No unchanged repeat. A passing byte suite plus a slower/equal aggregate removes this candidate from immediate integration; even a faster observation is only a reason to consider the explicit integration below. Compare all bytes before considering timing. Do not substitute serializer-only seconds into historical C.

## Explicit insertion is a separate gate

Replacing an exported `strict` name does not affect frozen functions that already hold their own module-global binding. In particular, original Store.write, `_bank_state_digest`, `_validate_published_state`, `publish_origin`, `validate_publication_binding` and the accepted composed grader would continue using the old serializer. A standalone candidate cannot claim the 557-call bucket or complete-path benefit.

If the single candidate merits continuation, the minimum useful new-identity composition needs literal, reviewed copies of the affected publication/state helpers and grader method with a fixed candidate import, a new Store write implementation, and new controller/preflight ownership glue. Preserve all other helper dependencies and every original check; enumerate actual replaced and unreplaced call sites with AST evidence. A Store subclass must not pass preencoded bytes back through inherited `Store.write`, which would encode them again; its copied checked write boundary must invoke the unchanged raw-byte `ImmutableRun.write` directly while retaining uncommitted-artifact tracking and failure behavior. Immutable completion can remain inherited if its serialization is deliberately outside the optimized scope.

No mutable-global patch, imported-function globals reassignment, runtime AST/source cloning or edits to the 79 frozen files are allowed. Do not copy the whole system to claim broader coverage. Any later explicit composition requires its own exact scientific/saved-artifact parity and one complete declared-origin comparison under a new frozen source identity, preserving all checks and fsyncs. Full prior-selector/admission/history effects remain excluded until separately investigated. Only independent complete integration review could precede a separately accepted fresh historical invocation; neither this design nor a fast standalone serializer supplies that authority.
