PREGAME STARTER HISTORY IS QUALIFIED. Codex has twice reported it unavailable. It is available, and I have built and validated the rule. Reproduce the validation before using it. Then run the two registered experiments below.

## 1. Sources, all nflverse, all pregame
Weekly player stats for starter identification and QB value: releases/download/player_stats/player_stats_<year>.csv through 2024, and releases/download/stats_player/stats_player_week_<year>.csv for 2025 and 2026. The release name changes at 2025; handle both. Both carry passing_epa and attempts.
Weekly injury reports: releases/download/injuries/injuries_<year>.csv, carrying report_status with values Out, Doubtful, Questionable, and date_modified.
Weekly depth charts: releases/download/depth_charts/depth_charts_<year>.csv, 2001 forward. QB1 coverage for 2016 to 2024 is 5,287 of 5,310 team-weeks, 99.6 percent. The schema changes in 2025; handle both.

## 2. The rule, validated
Primary: the pregame starter is the quarterback with the most attempts in that team's previous regular-season game, overridden when that quarterback appears on that week's injury report as Out or Doubtful, in which case the depth chart's highest non-excluded QB is used. Ties in attempts resolve to the quarterback with more attempts across the prior two games, then to the depth chart.

Week 1 has no prior game and uses the depth chart alone. That is about 32 team-games a season.

Depth charts are used only for Week 1 and for the injury-override fallback. Every depth-chart-sourced row is flagged UNTIMESTAMPED, because the pre-2025 schema carries no revision timestamp and we cannot prove a row was not revised after kickoff. The injury file does carry date_modified: across 5,433 rows in 2022, one postdates kickoff and zero QB Out or Doubtful rows do. Verify that property yourself across all seasons in scope and report it.

Measured accuracy against the actual starter, defined as most attempts in that game, on 2016, 2019, 2022 and 2024: 90.4, 90.8, 87.6, 88.7 percent, pooled 89.4 percent on 1,982 games. Depth-chart QB1 alone scores 85.6 percent. The depth-chart-first combination scores 89.1 percent, which is why depth charts are not the primary source. Reproduce all three figures and confirm within 1 percentage point before proceeding. Starter ambiguity is small: in 2022, 108 team-games had two or more passers and only 5 had the top two within five attempts.

## 3. Supporting evidence for the mechanism, reproduce it
Regressing team points on prior four-game scoring alone gives MAE 7.761 on 2,442 team-games across 2018 to 2024. Adding the starter's own prior EPA per attempt gives 7.642, a 1.53 percent gain, with the team-scoring coefficient falling from 0.411 to 0.257 as the QB term takes weight. This is in-sample and therefore an upper bound, but it establishes that quarterback value is not already absorbed by team efficiency, which was the main risk to this experiment.

## 4. E-ELO-QB, registered as a full test
Premise line first: the control is the authoritative deployed lineage 6a0238fc, generated 2026-09-19.

Build the pregame starter table for 2016 to 2025 with the rule in section 2, hash it, and report coverage by season together with the count of UNTIMESTAMPED rows. Activate elo_qb_adjustment with QB VALUE from that starter's rolling EPA per dropback and CPOE over the prior sixteen games, team VALUE as the team's own rolling QB EPA over the same window, using the existing 3.3 coefficient in engine/elo.py.

Candidates: (a) QB adjustment active; (b) (a) plus whatever E-ELO-HFA promotes; (c) control. Standard gate on deployed team-points MAE, with Elo margin MAE, bias, calibration slope, win Brier and bin reliability reported alongside.

Because the rule is 89 percent accurate rather than perfect, also run (a) using the actual in-game starter as an oracle. That is not a usable forecast; it bounds what perfect identification would buy. The gap between the rule and the oracle separates valuation failure from identification failure, which is the question left open by the benchmark decomposition. Report both.

## 5. E-ELO-HFA, registered as a bias correction
Not an accuracy experiment. I measured the rolling-origin HFA refit on Elo's own margin: n 2,244, MAE 10.2748 to 10.2524, a 0.22 percent gain, 8 of 9 seasons improved, bias +0.999 to +0.221. Reproduce that first; a difference beyond 0.01 MAE stops the run for reconciliation. The gain is a fifth of the accuracy gate and will be smaller again on team points, where Elo is one input among many, so it is registered with its own criterion: Elo margin bias moves toward zero, win-probability reliability improves in the 0.3 to 0.8 bins, and neither Elo margin MAE nor deployed team-points MAE worsens by more than 0.1 percent.

Candidates: (a) HFA refit per outer season from the prior three seasons' mean home margin, rolling-origin, prior seasons only; (b) control. This has no dependency on section 2 and runs to a decision regardless of anything above.

## 6. Underlying Elo findings, for the record
Independently recomputed by running engine/elo.py over nflverse results, 2,778 games 2016 to 2025. Near-total confidence, arithmetic on verified rows. Log in the series registry and HARVEST.md.
The divisor of 25 is near-optimal; implied best 25.5. No change warranted.
HFA of 65 Elo equals 2.60 points against a 1.92-point decade average. Home margin by season 2016 to 2025: 2.99, 2.58, 2.14, 0.04, 0.17, 1.93, 2.09, 2.92, 2.28, 2.03. This produces Elo's entire +0.78 margin bias.
Win probabilities overstate the favorite by 4 to 5 percentage points in every bin from 0.3 to 0.8, covering 2,338 of 2,778 games. Same cause. These probabilities feed the site's win column.
elo_qb_adjustment is an inactive slot, so production passes zero QB adjustment for both teams. The component 538 found most valuable is absent from every forecast the engine has issued.

## 7. Reporting
Each report carries a worded confidence rating on its central claim, low, medium, high or near-total, with what would move it down a level. Report the reproduction tables from sections 2, 3 and 5 before any fitting, then the gate tables, both COMMIT lines, and one line naming what you were least sure of.