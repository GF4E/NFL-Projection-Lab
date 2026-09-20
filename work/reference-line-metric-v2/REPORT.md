# Standing reference-line metric — ACTIVE, reconciliation complete

Current HFA is the live figure. Pre-HFA remains authoritative for its historical lineage. The revised reproduction tolerance passes for both headlines and both specified buckets. No projection, gate or frozen forecast changed.

ATS measures **50.5 percent with a 95 percent interval reaching 52.5**, so break-even at **52.4** is not excluded by this evidence, while a large edge is. This measurement does not establish profitability or prove no edge.

| Current HFA metric | Correct / non-push games | Rate | Wilson 95% interval | Reference coverage |
|---|---:|---:|---:|---|
| CLOSE ATS | 1,301 / 2,574 | 50.54% | 48.61–52.47% | 2,639/2,639, 2016–2025 |
| CLOSE total | 1,285 / 2,618 | 49.08% | 47.17–51.00% | 2,639/2,639, 2016–2025 |
| OPEN ATS | 577 / 1,151 | 50.13% | 47.25–53.01% | 1,177/1,359, 2021–2025: 86.6% |
| OPEN total — INSUFFICIENT | 227 / 460 | 49.35% | 44.80–53.90% | 466/1,359, 2021–2025: 34.3% |

Current team MAE: 7.575629. No inference is drawn from OPEN totals, whose historical coverage is confined to 2024–2025. Spread and total coverage are never pooled. OPEN spread comparison proceeds, but its interval does not demonstrate an edge. Different populations prevent reading the OPEN/CLOSE headline difference as a paired improvement.

CLOSE: pinned nflverse schedule, spread_line and total_line. OPEN spread: nfelo output_data/historic_projected_spreads.csv, home_line_open, sign inverted to home margin. OPEN total: nfelo output_data/nfelo_games.csv, total_line_open. The 330 conflicting opening spreads between these files remain documented and unblended; no missing OPEN value is filled from CLOSE. Each figure's source, hash and retrieval date are in the appendix JSON and metrics.json.

## Reconciliation

| Metric | Historical pre-HFA | Current HFA | Difference | Permitted difference |
|---|---:|---:|---:|---:|
| CLOSE ATS | 50.5828% | 50.5439% | 0.0389 pp | 0.5 pp |
| CLOSE total | 49.0833% | 49.0833% | 0 pp | 0.5 pp |
| ATS [4,5) points | 44.1406% | 44.6565% | 0.5159 pp | 1.0 pp |
| ATS [5,6) points | 56.5789% | 55.6291% | 0.9498 pp | 1.0 pp |

Headlines allow 0.5 percentage points; buckets allow max(1.0 percentage points, one game's rate contribution). Computed checks are in reconciliation.json. The original preflight and stop remain dated historical records; they do not govern the current status. Full historical pre-HFA and live HFA season/bucket tables are in [REPORT-reference-lines.md](REPORT-reference-lines.md), with team MAE alongside each scope.

## Supporting power detail — against a 50 percent null

At 2,574 independent games, the standard error under 50% is 0.9855 percentage points. A two-sided 5% equal-tailed exact binomial test **against a 50 percent null** has 66.49% power at a true 52.38%, 85.43% at 53%, and 99.90% at 55%; 80% power starts at 52.790%. This is supporting statistical context, not the test of whether a wager clears break-even. The relevant economic statement is the measurement interval above. Detailed parameters and the separately labeled illustrative -110 null calculation remain preserved in work/reference-line-metric-v1/reproduction.json. Independent-game assumptions may overstate effective precision if dependence is material. Unadjusted bucket intervals do not validate a discovered betting strategy.

## Permanent integration

- Weekly: scripts/projection_learning.py writes reference-lines.json/.md and includes the same tables in trend.json/.md. Tables use original projections and first grades, separately by issuance version and AS_ISSUED versus RETROSPECTIVE. They show week, season, pooled and disagreement scopes. Human edits do not replace the projection.
- Tuesday: the closeout stores the audit payload beside team MAE in scorecard.json and trend.json. Published historical closeouts remain unchanged.
- Experiments: the shared report finalizer embeds the tables and saves matching JSON/Markdown appendices. Existing report producers call it. The commit guard rejects a report missing its appendices. New candidate rows are supplied explicitly or by a hash-pinned series manifest. A missing candidate series is reported as a named shortfall, never replaced by a control result.
- Archived reports: separate appendices and experiment-report-index.json attach audit evidence without rewriting originals. Existing source/fit hashes remain unchanged. Rejected and invalidated experiments retain their original labels.
- Sources: historical experiments use pinned references; weekly reports use a public daily refresh with date/hash receipts and last-good retention. Refresh failure is explicit and never substitutes CLOSE. Reports do not fetch or refit.
- Separation: no audit module or reference field enters the projection, state, fit, issuance or lock path. Metrics never participate in promotion decisions.

Least sure of: consistency between nfelo's two opening-spread files. The implementation retains the existing historic_projected_spreads source, exposes conflicts, and makes no claim that its OPEN line was executable at our T-75.

Confidence: near-total — the central measured rates and reconciliation are arithmetic on verified rows. Move down to high if an independent recomputation invalidates source identity, line signs, or game matching. The inference about possible economic edge remains bounded by the stated interval and assumptions.
