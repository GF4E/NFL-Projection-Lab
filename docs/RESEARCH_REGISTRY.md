# Research registry

Every external project begins as a hypothesis source. Nothing is adopted
because its README reports a high win rate or ROI.

| Source | Confidence | Permitted use | Candidate lesson | Current decision |
|---|---|---|---|---|
| [nflverse](https://github.com/nflverse) | High | Data/API use under source terms | Canonical IDs, play-by-play, player and schedule pipelines | Adopt as data backbone |
| [nflfastR](https://github.com/nflverse/nflfastR) | High | MIT code; attributed data | EP/WP baselines, drive state, clock-aware features | Benchmark and selectively port with tests |
| [fastrmodels](https://github.com/nflverse/fastrmodels) | High | MIT | Calibrated EP/WP/CP/xYAC/xPass reference models | Benchmark before local replacements |
| [nfl4th](https://github.com/nflverse/nfl4th) | High | MIT | Fourth-down outcome trees and win-probability decisions | Adopt as validation oracle first |
| [FiveThirtyEight NFL Elo](https://github.com/fivethirtyeight/nfl-elo-game) | High for baseline, low for current data | MIT code; archived data terms | Transparent Elo and forecast scoring baseline | Retain as frozen benchmark |
| [Glickman–Stern state-space model](https://www.glicko.net/research/nfl.pdf) | High | Methodology citation | Dynamic team strength, home field, shrinkage over time | Adapt concept, validate on modern data |
| [nflWAR paper](https://arxiv.org/abs/1802.00998) | High | Methodology citation | Multilevel player effects and drive-level resampling | Adapt methodology; do not copy unlicensed repo code |
| [nfelo](https://github.com/greerreNFL/nfelo) | Medium | Reference only; no explicit license found | NFL-specific Elo adjustments and transparent outputs | Study behavior; do not copy code |
| [NFL Algorithm](https://github.com/mattleonard16/nflalgorithm) | Low/medium | MIT | Pipeline gates, player-prop workflow, operational checks | Feature/audit reference, not statistical authority |
| [BetIQ](https://github.com/joseportilloj17/BetIQ) | Low for modeling, medium for workflow | MIT | Line shopping, CLV, drift UI, review workflow | Borrow workflow ideas only; reject training on personal picks |

## Adoption checklist

For each candidate:

1. Record license and exact source revision.
2. State one falsifiable hypothesis.
3. Reproduce the source baseline where possible.
4. Add a local leakage test.
5. Compare against champion and market on identical rolling-origin rows.
6. Run an ablation and calibration audit.
7. Document failure modes and compute cost.
8. Promote only under the model lifecycle rules.
