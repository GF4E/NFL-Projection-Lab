# Live board integrity restored

Website source main 81a8faab71b58c065aa620a56e7c14d9338e4624 is deployed through build-only mirror 19f0704a591422c18a5c39b6b3713afa7b4c296a, Sites version 209. The public audience is unchanged. GF4E/NFL-Projection-Lab remains the source repository of record; the mirror contains only validated generated output. Native deployment succeeded and independent host HTTP verification matched the source build provenance.

The board API now serves original JSON text rather than a parsed-and-reserialized copy. Cache row 2 preserves it with lossless gzip, byte length and SHA-256; legacy row 1 remains untouched for rollback and the existing UI fallback. The byte-verifying route cannot return a legacy cache as original evidence. Response/decompression size, invalid cache, redirect, frozen-record change and failed-write behavior are bounded and tested. A slow earlier request cannot overwrite a later cache commit.

The 6,566,184-byte source exceeds D1's 2,000,000-byte row limit; lossless storage measured 720,672 bytes. The limit is documented at https://developers.cloudflare.com/d1/platform/limits/. Original numerical lexemes, including 13.0, and Unicode text survive the source/cache/response round trip. No point model, fit, interval, grade or layout was changed.

Verification: 373 website tests passed with one existing skip; the final 11-test focused suite also passed after adding the concurrent-request test. Typecheck, changed-file lint and build passed. Exact source/cache/response parity was verified in actual workerd with isolated D1, including preserved legacy cache. Initial timezone snapshot failures and the too-large legacy integration fixture are retained under main:work/board-integrity; neither was hidden by updating snapshots or relaxing a limit. macOS metadata caused the first archive to fail the existing build-only guard before publication; packaging without filesystem metadata passed, with no guard change.

At 2026-09-23T18:00:52Z the actual droplet, anonymously, obtained two byte-identical board responses matching the source and its internal content hash: 48 games, source/response SHA-256 e4b184076026200754f786e6b5eb566bef7fee32025a4103ba87cbe504ad6726. Served build provenance matched the pushed main commit. See board-bytes-live-verification.json and board-bytes-sites-release.json.

At 18:01:14Z the installed Mac observer retried its previously cached failure and recorded VERIFIED, recovering PUBLIC_SCHEMA_UNQUALIFIED. The only active finding was STORAGE_HEADROOM_UNQUALIFIED. This is not a claim that long-term capacity is qualified: growth, peak writes and a durable reserve still need measurements. See board-bytes-monitor-verification.json. The notification recovery latch remains in force; it was not bypassed or reset.

Full rebuild remains ACTIVE. Next: measure storage growth/peak reserve, qualify the installed research runtime, then complete corrected-control/issuing-path authority and the required cadence prerequisites. No historical calibration candidate, real registration or method promotion happened in this increment. Conditional-mean migration, actual reviewer decisions, prospective evidence and an observed full live cycle remain required.

Least certain: durable capacity under the remaining historical research workload; storage expansion alone does not prove its reserve.

Confidence: high in the byte-preservation repair, meaning real runtime, cache/failure alternatives and independent live source comparisons agree. Lower to medium if another host cannot reproduce the source/served hashes. Prediction accuracy improvement remains unproved. Provider credits and additional spending: zero.
