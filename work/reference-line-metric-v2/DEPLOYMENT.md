# Standing metric deployment verification

Implementation commit: `7ec103b4` on engine-v2, GF4E/NFL-Projection-Lab. The host ran descendant `4e0e8f3836bc423b8eafbece374c52df56f3f497` and published audit artifacts at `63cdb071af23dfe3867358e1360a58e5e0ed298b` on 2026-09-20 15:00 UTC. Full readback is host-verification.json.

The droplet generated the reference-lines-v1 weekly audit, refreshed public OPEN references successfully, and published via the existing scheduler publisher. Direct recomputation from the same board agrees with the embedded report. All 33 protected lock/grade/active-fit artifacts were byte-identical before and after. Fit f7fc497e, projection-v2.hfa1.w2, remains active. Capture and daily timers are both active. Free space at verification: 629 MiB (93% used), following authorized cache/log cleanup and Git's packing. Storage headroom is still limited.

250 tests passed: 218 standing, 18 reference audit/reproduction, 8 learning, 3 closeout, 3 cadence. Original reports remained byte-identical; 35 report documents have indexed appendices, including the new metric report. A separate implementation compares raw OPEN CSV bytes with NumPy signs and SciPy Wilson intervals and reproduces 577/1151 spread and 227/460 total. OPEN total remains INSUFFICIENT.

Least sure of: semantic consistency between nfelo's conflicting opening-spread files. They remain unblended, and no executable issuance price is inferred.

Confidence: near-total — deployed audit presence, unchanged artifacts and measured rates are arithmetic on verified files. Move down to high if an independent source/sign/lineage check invalidates those identities. This does not rate the engine's ability to clear betting break-even.
