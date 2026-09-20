# Standing reference-line metric

Requested: CLOSE and OPEN direction accuracy, separately, with non-push counts, 95% intervals, season/pooled/one-point-disagreement tables alongside team MAE in every weekly and experiment report. Reporting only; never a gate or input to a projection.

REPRODUCTION PAUSED: the supplied counts and bucket figures match the superseded pre-HFA control6a0238fc. The authoritative released-HFA control66a3a60c gives1301/2574 ATS (50.5439%),117/262 in[4,5) (44.6565%),84/151 in[5,6) (55.6291%). Pre-HFA gives1302/2574 (50.5828%),113/256 (44.1406%),86/152 (56.5789%). The two bucket differences exceed the user's0.5percentage-point tolerance. Reconciliation requested before rollout; preserve both verified series. OPEN source qualification continues independently.

Conventions for review: same-sign projected/actual deviation from a line counts correct. NFLverse spread_line is a predicted home margin; nfelo home_line_open is the opposite sign (home handicap), so negate it before comparison. Totals use their own explicitly sourced opening total; home_line_open cannot supply a total. No CLOSE substitution when OPEN is missing. Exclude actual pushes; exact projection-on-line is a separate NO_LEAN exclusion. Buckets are absolute full-precision disagreement [k,k+1) points, k=floor(abs(projection-line)); no displayed rounding enters scoring. Report both missing-line coverage and no-lean/push counts.

Wilson95% intervals are descriptive binomial intervals, unadjusted for serial dependence or multiple subsets; do not treat one favorable bucket as a validated strategy. Coverage means reference rows divided by the same projection population, separately for spread and total. OPEN is an historical opening reference, not proof of availability at our exact T75 or an executable price. Distinguish50%direction accuracy from the illustrative52.38%win rate needed at-110; no assumed profit or price enters scoring.

No frozen report or graded forecast is rewritten. The requested historical wording must be attributed to its pre-HFA series, alongside the current series result, if the reconciliation is accepted.

Confidence: near-total — the reproduction discrepancy is arithmetic on verified rows. Move down to high if a row hash or line-sign convention proves incorrect.
