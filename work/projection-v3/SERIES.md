# Historical series identity

Metrics recomputed on available 2016–2025 team-point rows. Bias = projected minus actual; slope = actual on projected; SD = population SD. File-addition dates and archive commits identify repository provenance, not an invented original fit time. A multi-fold series has multiple fits; producer/manifests are listed below.

| File / component | Status | Games | MAE | Bias | Slope | SD |
|---|---|---:|---:|---:|---:|---:|
| adaptive-oof-b722919998a17d42f927684c90053ca99097acaa182be6428dcafef5c2f361f2.json / series/point | SUPERSEDED | 2639 | 7.7613 | -1.0482 | 0.7971 | 3.0279 |
| baseline-oof-bb7a7f0a18c5b7e83b3d4c3df7a35c82858e4eb645e8df2cc27d8b5fd3096a46.json / series/point | SUPERSEDED | 2639 | 8.0034 | -2.8396 | 1.4424 | 1.6875 |

**adaptive-oof-b722919998a17d42f927684c90053ca99097acaa182be6428dcafef5c2f361f2.json / series/point**
Date added: 2026-09-13T21:09:13+02:00; archive commit: 77c755905585818368b3489e13efb250d3b7b4f2; SHA256: b722919998a17d42f927684c90053ca99097acaa182be6428dcafef5c2f361f2.
engine/projection_v3/qualify.py (v1: train.py); companion experiment/fit references. Per-season fitted lineage, not today's active fit..
Non-authoritative: never use as current production gate control.

**baseline-oof-bb7a7f0a18c5b7e83b3d4c3df7a35c82858e4eb645e8df2cc27d8b5fd3096a46.json / series/point**
Date added: 2026-09-13T21:09:13+02:00; archive commit: 77c755905585818368b3489e13efb250d3b7b4f2; SHA256: bb7a7f0a18c5b7e83b3d4c3df7a35c82858e4eb645e8df2cc27d8b5fd3096a46.
engine/projection_v3/qualify.py (v1: train.py); companion experiment/fit references. Per-season fitted lineage, not today's active fit..
Non-authoritative: never use as current production gate control. Stale uncalibrated baseline: its bias and slope are artifacts of the superseded fit, not production. No deployed fit issued this OOF file as current control.
