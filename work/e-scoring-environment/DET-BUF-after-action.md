# DET at BUF after-action

Frozen projection-v2.w2; 2026-09-17T23:00:00+00:00. Source lock SHA256: 30fa21e828a365f4bd6e949d76a21f706521ef0991cd12ecebdc549334e8737f.

Final BUF 41, DET 31, confirmed by official Bills recap. No lock/grade overwritten. Team intervals are reconstructed exactly with the locked version’s pinned distribution, not a new fit. Error means actual minus projection.

| Team | Locked | Actual | Error | 50% interval / inside | 80% interval / inside |
|---|---:|---:|---:|---|---|
| DET | 24.8980 | 31 | +6.1020 | [19, 32] / True | [14, 39] / True |
| BUF | 27.5727 | 41 | +13.4273 | [22, 35] / False | [17, 42] / True |

Total: 52.4708 projected; 72 actual; +19.5292 error. BUF margin 2.6747 projected; 10 actual; +7.3253 error.

## Buffalo complete contribution table

Additive fitted contributions, not independent causal effects. Zero/inactive rows retained below.

| Input | Football label | Points | Status |
|---|---|---:|---|
| football_baseline | BUF scoring efficiency against DET, at expected pace | +23.751925 | ACTIVE |
| baseline | BUF scoring efficiency against DET, at expected pace | -0.774332 | ACTIVE |
| elo | BUF pregame Elo | +1.108889 | ACTIVE |
| elo_difference | BUF Elo advantage over DET | +0.588221 | ACTIVE |
| calibration_intercept | Scoring calibration | +2.898027 | ACTIVE |
| career_fg_long | Pregame kicker career FG 50+ yards | +0.000000 | INACTIVE |
| career_fg_medium | Pregame kicker career FG 40-49 yards | +0.000000 | INACTIVE |
| career_fg_short | Pregame kicker career FG below 40 yards | +0.000000 | INACTIVE |
| close_win_rate | BUF close win rate | +0.000000 | INACTIVE |
| continuity | Staff history unseeded | +0.000000 | INACTIVE |
| def_cpoe | DET defense completion over expectation, rank 10 | +0.000000 | INACTIVE |
| def_explosive | DET defense explosive play rate, rank 20 | +0.000000 | INACTIVE |
| def_off_ppd | DET defense points per drive, rank 15 | +0.000000 | INACTIVE |
| def_off_ypp | DET defense yards per play, rank 18 | +0.000000 | INACTIVE |
| def_pass_epa | DET defense pass efficiency, rank 11 | +0.000000 | INACTIVE |
| def_rush_epa | DET defense run efficiency, rank 19 | +0.000000 | INACTIVE |
| def_rush_success | DET defense run success, rank 8 | +0.000000 | INACTIVE |
| divisional | BUF division matchup | +0.000000 | INACTIVE |
| drives | BUF offensive drives per game | +0.000000 | INACTIVE |
| elo_qb_adjustment | ANY/A values exist but historical pregame starter availability is unqualified | +0.000000 | INACTIVE |
| fg_share | BUF fg share | +0.000000 | INACTIVE |
| fumble_recovery | BUF fumble recovery | +0.000000 | INACTIVE |
| home_divisional | BUF divisional home field | +0.000000 | INACTIVE |
| home_nondivisional | BUF non-divisional home field | +0.000000 | INACTIVE |
| luck_index | BUF fumble and close-game luck | +0.000000 | INACTIVE |
| momentum | BUF last-four-game momentum | +0.000000 | INACTIVE |
| neutral | Neutral venue | +0.000000 | INACTIVE |
| off_cpoe | BUF offense completion over expectation, rank 6 | +0.000000 | INACTIVE |
| off_explosive | BUF offense explosive play rate, rank 1 | +0.000000 | INACTIVE |
| off_off_ppd | BUF offense points per drive, rank 2 | +0.000000 | INACTIVE |
| off_off_ypp | BUF offense yards per play, rank 2 | +0.000000 | INACTIVE |
| off_pass_epa | BUF offense pass efficiency, rank 2 | +0.000000 | INACTIVE |
| off_rush_epa | BUF offense run efficiency, rank 6 | +0.000000 | INACTIVE |
| off_rush_success | BUF offense run success, rank 5 | +0.000000 | INACTIVE |
| opponent_drives | DET offensive drives per game | +0.000000 | INACTIVE |
| plays_per_drive | BUF plays per drive | +0.000000 | INACTIVE |
| pressure_allowed | Offense PRESSURE_PROXY allowed | +0.000000 | INACTIVE |
| pressure_generated | Defense PRESSURE_PROXY generated | +0.000000 | INACTIVE |
| pythagorean | BUF points-based expected win rate | +0.000000 | INACTIVE |
| qb_backup | Pregame QB backup flag | +0.000000 | INACTIVE |
| qb_career_starts | Pregame QB career start proxy | +0.000000 | INACTIVE |
| qb_cpoe | Pregame QB completion over expectation | +0.000000 | INACTIVE |
| qb_epa | Pregame QB EPA per dropback | +0.000000 | INACTIVE |
| rb_share | BUF rb share | +0.000000 | INACTIVE |
| redzone_td | BUF redzone td | +0.000000 | INACTIVE |
| referee | Week 5 positive study absent | +0.000000 | INACTIVE |
| rest_days | BUF rest days since last game | +0.000000 | INACTIVE |
| return_points | BUF return points | +0.000000 | INACTIVE |
| schedule_strength | BUF opponent-adjusted schedule strength | +0.000000 | INACTIVE |
| season_fg_long | BUF long-distance field goals | +0.000000 | INACTIVE |
| season_fg_medium | BUF medium-distance field goals | +0.000000 | INACTIVE |
| season_fg_short | BUF short-distance field goals | +0.000000 | INACTIVE |
| te_share | BUF te share | +0.000000 | INACTIVE |
| travel_miles | BUF travel from home stadium | +0.000000 | INACTIVE |
| turnover_margin | BUF turnover margin | +0.000000 | INACTIVE |
| wind | Separate PARTIAL_HISTORY correction | +0.000000 | INACTIVE |
| **Sum** | | **27.572730** | |
