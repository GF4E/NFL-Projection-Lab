# E-ELO-HFA released

Promoted by explicit user instruction after its registered gate passed. Host activation and publication verified; all 22 locked/graded files stayed byte-identical.

Version: **projection-v2.hfa1.w2**. Fit: `f7fc497ee581c3a948388891904b52669e345bae1a61c684281034505b5840e4`. Release record: `f4947d2db614deb0ed41ef98e9e2aefc39517dff54e5442d88376c786feef999`.

COMMIT 379cd7ca61f3838c240467e4d1cef76fec542390
Host source commit at activation: `dc043ddf6a35cf1d6ea117af7c53399cd12835ce`; includes the release commit. Verified at 2026-09-20T02:51:15.240466+00:00.

| Registered measure | Original deployed control | HFA |
|---|---:|---:|
| Elo margin MAE | 10.244657 | 10.216512 |
| Elo signed margin bias | +0.876156 | +0.020791 |
| Win reliability, squared 0.3–0.8 bins | 0.002424 | 0.000570 |
| Deployed team MAE | 7.574348 | 7.575629 |

The team MAE increase is 0.0169%, inside the registered 0.1% noninferiority allowance. This was a bias correction, not a claim of a 1% accuracy gain. Site probabilities still come from projected scores and the existing residual distribution.

2026 home field: 55.131414 Elo (2.205257 margin points), estimated from 799 completed nonneutral regular-season games in 2023–2025. Neutral games receive zero. K, reversion, divisor, ridge groups/penalty and intervals are unchanged. Parent training inputs recovered from its committed source manifest reproduce retained coefficients within 5e-15; 5,822 training team rows. Draft fits in this directory were never activated; only release-ref.json identifies the release.

Tests: 218 standing checks plus 15 focused checks passed. The first check exposed an old immutable Elo code hash requirement; the release uses a separate adapter and preserves engine/elo.py byte-for-byte. The host's active feature receipt matches the promoted HFA method, and the publisher refuses a method mismatch. Future weight-only refits retain the pinned HFA historical history and version prefix.

Host disk: 152 MiB before, 273 MiB after apt cache cleaning and 13.5 MiB archived-journal rotation. No source or artifact of record removed. At activation 271876096 bytes remained. Disk capacity is still tight.

Confidence: medium — the correction holds on authoritative data but depends on a reliability convention that could reasonably differ. Move down to low if an independent reconstruction fails the registered reliability or noninferiority check.
