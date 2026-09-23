# Board artifact integrity repair

Infrastructure-only correction. Raw JSON text is retained through the upstream read, lossless compressed cache and API response; point forecasts and page layout are unchanged. Existing row 1 is preserved for rollback/UI fallback. Raw response row 2 has bounded decompression and a byte checksum. A legacy cache alone cannot claim exact-byte publication; that route returns 503 when fresh source is unavailable. Fresh validated scores remain visible if a cache write fails. Frozen-game and publication progression checks remain in force, redirects are rejected and the earlier request timestamp prevents a slow request overwriting a later cache commit.

373 existing/new website tests passed with one prior skip; the final focused run adds the concurrent-request case. Typecheck and changed-file lint pass. The first snapshot run differed only due to local timezone; no snapshots were altered. The first Worker integration fixture exceeded the real D1 row limit; its failure is retained. Corrected real workerd/D1 verification passed on the published 48-game artifact: 6,566,184 bytes restored exactly from a 720,672-byte cache entry, matching source/served SHA-256 e4b184076026200754f786e6b5eb566bef7fee32025a4103ba87cbe504ad6726. Warm cache exactness and preserved legacy row were checked. The build passed. Live verification follows publication; no deployment claim is made by these local checks alone.

The 2 MB D1 row limit is documented at https://developers.cloudflare.com/d1/platform/limits/. No statistical gate, fit, forecast or historical record changed. No provider credits or added infrastructure spending.

Least certain: live cache behavior under a platform outage; bounded source failure, corrupt-cache and failed-write cases are tested, but not every outage can be recreated safely.

Confidence: high in the byte-preservation correction, meaning independent source comparisons and the real hosting runtime agree across fresh, cached and failure cases. Lower to medium if the deployed response cannot reproduce the source hash. This is no claim of improved prediction accuracy.
