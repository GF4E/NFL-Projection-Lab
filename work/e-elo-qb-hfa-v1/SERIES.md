# Series registry: registered Elo experiments

Non-authoritative experimental/component series. Sole control remains deployed lineage6a0238fc, generated2026-09-19. No production release occurred.

Producer: scripts/elo_hfa_deployed_gate.py; source numerical commit538ce1f4; settings from8bd58561. Candidate HFA is the registered prior-three-season REG nonneutral mean; original control reproduces exactly. Date:2026-09-19local.

| File/component | Target | n | MAE | Bias | Slope actual on projected | Projected SD |
|---|---|---:|---:|---:|---:|---:|
| hfa-deployed-oof.json/control | team points | 2639 games | 7.574348 | +0.188875 | 1.009111 | 2.942963 |
| hfa-deployed-oof.json/hfa | team points | 2639 games | 7.575629 | +0.188863 | 1.011109 | 2.934554 |
| hfa-own-margin-control.json | home margin | 2639 games | 10.244657 | +0.876156 | 0.986544 | 5.396266 |
| hfa-own-margin-hfa.json | home margin | 2639 games | 10.216512 | +0.020791 | 0.979370 | 5.395327 |

hfa-reproduction-rows.json is REG2016–2025chronological component reproduction, not production. hfa-population-reconciliation.json contains warmup1999and2015diagnostic runs including postseason and2026, not a gate control; never pool these as independent forecasts. Exact provenance and hashes are in the manifest.

starter-table is pregame identity reconstruction, not a score forecast; current-game attempt leader columns are oracle labels only. supporting regression is in-sample explanatory evidence, not an OOFseries.

Confidence: near-total for these pooled arithmetic summaries on verified rows. Downgrade to high if an independent recomputation finds a file or population mismatch.
