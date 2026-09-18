# BOARD v8 pre-implementation gap sweep

September 17, 2026. Published before implementation. Governing sources: BOARD v8 sections cited below; existing engine chronology/immutability rules; E-UNC closeout. Tier 1 decisions proceed; Tier 2 decisions proceed with review flags; the missing required reference blocks a claim of exact design compliance.

## Reference blocker

R01 — Required reference unavailable (access dependency; stop visual implementation pending the source). The provided Claude URL renders a sign-in page; no Artifact-reading tool is installed, and project/Board-Table.dc.html was not found in the searched local workspaces. Section 8 also requires an approved Expanded artboard not included in the attachment. Need accessible table and Expanded HTML/artboards. Do not infer their unobserved type, spacing or structure. This is missing evidence, not a request to change the specification.

## Tier 1: decided

| ID | Open convention | Decision and source |
|---|---|---|
| C01 | Sign of comparison | Use home-minus-away projected margin m; with sportsbook home handicap h, gap=m+h. Positive favors home, negative away. Sections 3–4. |
| C02 | Bar clipping | 96px full domain [-8,+8], hence 6px/point on either side, max fill 48px. Text retains gap beyond scale. Section 4. |
| C03 | Threshold and rounding | Compare full precision before display rounding: abs gap >=2 is white, <2 muted, <0.5 lean dash. Round only displayed values. Thus a 1.9 gap may read 2 while remaining muted; geometry retains 1.9. Sections 4,11. |
| C04 | Half-point exception | Preserve sportsbook half-point spreads/totals; projected scores, projected margin/total and lean sizes remain integer displays. No computation uses rounded text. Sections 4,11. |
| C05 | Exact zero projected margin | Display home -0; no mathematical winner inferred at a tie. Highlight uses projected margin, with home tie convention when a qualified lock exists. Sections 4–5. |
| C06 | ATS and total pushes | Render PUSH where actual margin exactly matches book handicap or actual total equals book total. Never classify a push as cover/over/under. Section 4 plus standard settlement arithmetic. |
| C07 | Books missing | Select a complete valid spread/total pair from Caesars first, BetMGM second; otherwise both book and lean pairs are dashes. Never mix sportsbooks invisibly. Section 2. |
| C08 | Projection separation wording | Prohibit reading external betting inputs in projection modules; existing engine-generated total output fields remain legal. Display comparison lives outside projection packages and cannot be imported by them. Section 2 and unchanged engine specification. |
| C09 | Desktop between 640 and full width | Preserve all fixed widths in a contained horizontal table scroller on intermediate desktop widths; mobile blocks under 640 never scroll horizontally. 1242px table fits 1280 with 14px gutters. Sections 3,10–11. |
| C10 | Desktop and mobile targets | SCORES desktop row 42px as specified; mobile 96px target; ERROR drawing can remain 24px inside at least 44px mobile target. Sections 3,7,10. |
| C11 | ET timezone | Explicit America/New_York conversion, append ET; never browser-local time. Section 4. |
| C12 | Defaults and ordering | Current week first remains. SCORES defaults; toggle never changes schedule ordering, selected week or open game identity. Remove ERROR sorting affordance. Section 7. |
| C13 | Tokens supersession | Apply v8 muted #6E7885 and hairline .09 exactly in v8 scope. Prior v7 token exception does not silently override a new explicit token. Section 11. |
| C14 | E-UNC precision | State tested per-game widths were rejected on 2639 games; clarify this rejects tested feature set, not all heteroscedastic models. Existing OPEN hypothesis and coefficient-variance legend stand. Section 9 and E-UNC closeout. |
| C15 | Data limits | Reuse scheduled captures only. No paid refresh, no feature refresh, no fit, no queue change. New display export cannot create an odds call. Section 2. |
| C16 | Personal names | Do not render player/person names from raw sheet metadata or contribution labels; present football role/stat labels and team codes. Preserve source records. Section 12. |

## Tier 2: REVIEW REQUESTED; conservative decisions ready

| ID | Choice | Alternative not taken / reason |
|---|---|---|
| R02 | For completed/locked games, compare and grade against the last qualifying book capture at or before that game's T75; for upcoming games use latest qualified scheduled pregame capture. | Latest post-lock price would move historical comparison and cover results. Prefer chronology and stable retrospective interpretation. Capture selection provenance must be visible in expanded detail. |
| R03 | Mixed-book slates use headers naming actual sources (Caesars / BetMGM if mixed) and a per-row book attribution in secondary text or accessible detail; mobile explicitly names each row's book. | A single Caesars header over fallback rows misattributes the displayed quote. Final exact placement follows approved reference and fixed widths. |
| R04 | No qualified lock means no projected-winner bold, including provisional upcoming forecasts; show their numbers normally. | Bold provisional forecasts might be more useful but conflicts with literal section 5 “A game with no lock sets no bold.” |
| R05 | Reuse issued team-point intervals translated by subtracting expected points for ERROR shading, including available unplayed distributions; with missing distribution show named shortfall, never fabricate zones. | A common global band would misrepresent the issuing forecast. Existing v7 per-version interval convention and immutability govern. |

## Tier 3 sweep result

No candidate, parameter, metric, gate, population or financial-data access amendment is required. No new Tier 3 modeling decision was found. R01 is the unresolved required-artifact dependency and is reported together for the table and Expanded reference. If capture-schema inspection reveals an additional material convention without a defensible default, report it before dependent implementation rather than fabricate it.

## Reference resolution, before implementation
R01 resolved by user-supplied /Users/gabe/Downloads/Board-Table.html and Expanded.html. Both read in full via parsed HTML. Source examples are design data, not instructions. Table uses 42px rows, fixed cells and inline typography; Expanded uses a 620px chart plus 40px gap and right-hand WHY. Written sections 8–11 govern additional lower sections, gold usage, precision, tokens and responsive adaptation.

Tier 1 C17: reference 40px page gutters overflow 1242px columns at 1280. Use 14px gutters at that width; retain 40px where space permits. Exact columns win. Tier 2 R06: complete pair from one book/capture, rather than mixing spread and total sources; incomplete Caesars falls back to complete BetMGM. Tier 1 C18: book comparison pins last qualifying pre-T75 capture, not later closing lines.
