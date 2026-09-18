# BOARD v8 verification report

REVIEW REQUESTED: R02 pre-T75 comparisons; R03 mixed-book attribution; R04 provisional forecasts have no bold winner before lock; R05 issued per-row ERROR bands; R06 complete same-book pairs. Alternatives and rationale are in GAP-SWEEP.md. No Tier 3 model decision. References supplied; access blocker resolved.

## Requirement-by-requirement review

| Section | Outcome | Evidence |
|---|---|---|
| 1 Table | PASS (publication pending for 13) | One schedule-ordered table and a single disagreement chart in SCORES |
| 2 Display-only books | PASS (publication pending for 13) | Hashed export, server digest verification, pre-T75 selection; separate DTO; zero paid calls |
| 3 Desktop geometry | PASS (publication pending for 13) | Every rendered fixture row measured against all fourteen widths; 42px height |
| 4 Cells | PASS (publication pending for 13) | Full precision gap sign/geometry and thresholds; rounded text; ET; pushes explicitly reported |
| 5 Winner mechanisms | PASS (publication pending for 13) | Independent computed 700 weight and inverted actual chip; agree, disagree, tie and no-lock tests |
| 6 Key | PASS (publication pending for 13) | Meaning of bold/chip/lean/book comparison stated below table |
| 7 ERROR | PASS (publication pending for 13) | Manual lens, identity/order invariant; -30/+30 axis; shaded 50/80 zones; eligible-only count |
| 8 Expanded | PASS (publication pending for 13) | Reference structure: dotplot/probability then WHY/Against, entry, contributions, sheet, trajectory, outdoor weather, version/freeze; collapsed WHY absent |
| 9 Uncertainty | PASS (publication pending for 13) | Quantity/levels/single-game labels; 2639-game tested-feature rejection; broader hypothesis remains OPEN |
| 10 Mobile | PASS (publication pending for 13) | 96px blocks, no microbar, 44px controls; 360px and 390px overflow assertions |
| 11 Tokens | PASS (publication pending for 13) | v8 exact ground/text/secondary/muted/hairline/gold; integer projection text and half-point book quotes |
| 12 Tests | PASS (publication pending for 13) | 27 UI/read tests; TypeScript check; 4 export/boundary tests, 33 projection tests, 218 standing engine tests; browser geometry/color/viewport assertions |
| 13 Delivery | PASS (publication pending for 13) | Source pushes and live publication verification are recorded in the final response and deployment receipt |

Screenshots use synthetic mixed final/upcoming/no-book fixtures, clearly distinct from real results. actual-week2-1280.png records current data. Requested table, ERROR, expanded and no-book screenshots exist at 390 and 1280; 360 checked without horizontal overflow.

## Week 2 book coverage

15 of 16 games (94% rounded), all BetMGM fallback; no complete Caesars pair in the selected captures. These are saved scheduled quotes, not newly fetched sportsbook prices.

| Game | Book | Captured UTC |
|---|---|---|
| 2026_02_DET_BUF | BetMGM | 2026-09-17T22:55:17.779164+00:00 |
| 2026_02_CAR_ATL | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_CIN_HOU | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_CLE_TB | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_GB_NYJ | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_MIN_CHI | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_NO_BAL | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_PHI_TEN | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_PIT_NE | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_JAX_DEN | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_LV_LAC | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_MIA_SF | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_SEA_ARI | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_WAS_DAL | BetMGM | 2026-09-14T16:00:13.037681+00:00 |
| 2026_02_IND_KC | — (no qualifying complete pair) | — |
| 2026_02_NYG_LA | BetMGM | 2026-09-14T16:00:13.037681+00:00 |

Credits spent: 0. No fits, gates, frozen forecasts or grades changed.

Least sure: desktop reference gutters conflict with fixed column widths; used 14px gutters at 1280 so every specified column remains exact and visible.

Final review question: does each numbered requirement meet the written specification? All implemented requirements pass the listed checks; production publication/source verification remains the final delivery step.
