# Season error trend

actual minus projected. 2016–2025 adaptive OOF; coverage excludes 2016 (no prior residuals).

## AS_ISSUED
14 graded games; 16 pending.

| week | scope | games | team_points_mae | margin_mae | total_mae | team_points_sigma | margin_sigma | total_sigma | margin_coverage_50 | margin_coverage_80 | total_coverage_50 | total_coverage_80 | home_bias | total_bias | projected_team_points_sd | actual_team_points_sd | favorite_bias_[-inf,3) | favorite_bias_[3,7) | favorite_bias_[7,14) | favorite_bias_[14,inf) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | week | 14 | 8.427663604561916 | 11.602647455761675 | 12.106675023932477 | 10.444043572793632 | 13.596230067716101 | 16.330911440921003 | 0.42857142857142855 | 0.7857142857142857 | 0.42857142857142855 | 0.9285714285714286 | 4.051335273532272 | 6.9079002454371485 | 1.9770869360742034 | 10.837623431022738 | -0.34965503170772794 | 13.234228182639809 | 7.657875544377649 | — |
| 1 | cumulative | 14 | 8.427663604561916 | 11.602647455761675 | 12.106675023932477 | 10.444043572793632 | 13.596230067716101 | 16.330911440921003 | 0.42857142857142855 | 0.7857142857142857 | 0.42857142857142855 | 0.9285714285714286 | 4.051335273532272 | 6.9079002454371485 | 1.9770869360742034 | 10.837623431022738 | -0.34965503170772794 | 13.234228182639809 | 7.657875544377649 | — |
| 2 | week | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 2 | cumulative | 14 | 8.427663604561916 | 11.602647455761675 | 12.106675023932477 | 10.444043572793632 | 13.596230067716101 | 16.330911440921003 | 0.42857142857142855 | 0.7857142857142857 | 0.42857142857142855 | 0.9285714285714286 | 4.051335273532272 | 6.9079002454371485 | 1.9770869360742034 | 10.837623431022738 | -0.34965503170772794 | 13.234228182639809 | 7.657875544377649 | — |

### Diagnostic buckets
| Input | Band | Count | Mean error | Standard error | Flag |
|---|---|---|---|---|---|
| divisional | false | 20 | 4.105014621850325 | 2.4934772184170786 | False |
| divisional | true | 8 | 1.8262888748891983 | 3.1419182453568637 | False |
| dome | false | 4 | -1.6388499395970806 | 4.62986715732538 | False |
| dome | unavailable | 24 | 4.302750133104517 | 2.156403374064396 | False |
| elo_difference | [-100,0) | 8 | 1.9052050447659536 | 3.238037551675984 | False |
| elo_difference | [-inf,-100) | 6 | 3.799416792567312 | 2.800682368115013 | False |
| elo_difference | [0,100) | 8 | 9.652394904795926 | 4.546065309491242 | True |
| elo_difference | [100,inf) | 6 | -3.091116152629804 | 3.563729751523758 | False |
| luck_index | [-0.5,0.5) | 26 | 3.5107877994975203 | 2.1279112472271278 | False |
| luck_index | [-inf,-0.5) | 2 | 2.7150603245922795 | 0.6030160799344806 | True |
| momentum | [-0.5,0.5) | 22 | 2.9217467244711885 | 2.481812144712854 | False |
| momentum | [-inf,-0.5) | 4 | 3.795385518193064 | 1.765710689044775 | True |
| momentum | [0.5,inf) | 2 | 8.625316712490841 | 0.9674411681131917 | True |
| projected_margin | [-inf,3) | 20 | 1.5152075164079806 | 2.0245222803627954 | False |
| projected_margin | [3,7) | 6 | 11.298710360856898 | 5.064006879190349 | True |
| projected_margin | [7,14) | 2 | -0.6929045285904589 | 8.350780072968108 | False |
| rest_days | [14,inf) | 28 | 3.4539501227185743 | 1.9737387125381758 | False |
| team | ARI | 1 | 4.332145300409742 | None | False |
| team | ATL | 1 | -8.276114664172372 | None | False |
| team | BAL | 1 | 16.827890122312628 | None | False |
| team | BUF | 1 | 11.286842230796417 | None | False |
| team | CAR | 1 | 16.384775491960134 | None | False |
| team | CHI | 1 | 33.80953006652543 | None | False |
| team | CIN | 1 | 9.160116611946982 | None | False |
| team | CLE | 1 | -9.043684601558567 | None | False |
| team | DAL | 1 | -4.861097519119923 | None | False |
| team | DEN | 1 | -13.012603678869556 | None | False |
| team | DET | 1 | 5.171273211670435 | None | False |
| team | GB | 1 | 0.8437928494486577 | None | False |
| team | HOU | 1 | 6.60940238575883 | None | False |
| team | IND | 1 | -0.05959314485352962 | None | False |
| team | JAX | 1 | 7.657875544377649 | None | False |
| team | KC | 1 | 8.000225035074397 | None | False |
| team | LAC | 1 | -10.242572396069836 | None | False |
| team | LV | 1 | 7.803012896216469 | None | False |
| team | MIA | 1 | -8.842550866611074 | None | False |
| team | MIN | 1 | 17.487992393671895 | None | False |
| team | NO | 1 | 9.592757880604033 | None | False |
| team | NYG | 1 | 3.31807640452676 | None | False |
| team | NYJ | 1 | 2.0696369708809534 | None | False |
| team | PHI | 1 | 0.721881269723557 | None | False |
| team | PIT | 1 | -3.884311793609392 | None | False |
| team | TB | 1 | 3.153321271364103 | None | False |
| team | TEN | 1 | -11.40946008094254 | None | False |
| team | WAS | 1 | 2.112044244657799 | None | False |
| wind | [-inf,10) | 2 | -0.7715105572965815 | 4.089586961823342 | False |
| wind | [10,20) | 2 | -2.5061893218975797 | 10.506414356971977 | False |
| wind | unavailable | 24 | 4.302750133104517 | 2.156403374064396 | False |

### Ten largest game errors

2026_01_CHI_CAR · projection-v2-172f3e04-a39aa883 · team MAE 25.097152779242784
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 21.422328362450724 | 21.422328362450724 |
| away | baseline | 21.422328362450724 | -0.29344101001358186 |
| away | elo | 26.64366384461937 | 0.2442389206320148 |
| away | elo_difference | 94.13563130853572 | 0.9289891206664003 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | close_win_rate | 0.6363636363636364 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | 1.1235706845929365 | 0.0 |
| away | def_explosive | 0.09427600404164262 | 0.0 |
| away | def_off_ppd | 2.320256720808699 | 0.0 |
| away | def_off_ypp | 5.579428562288466 | 0.0 |
| away | def_pass_epa | 0.09270162089174724 | 0.0 |
| away | def_rush_epa | 0.0032222093784958043 | 0.0 |
| away | def_rush_success | 0.4153471173369627 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 9.705882352941176 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.232306723372609 | 0.0 |
| away | fumble_recovery | 0.6666666666666667 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | 0.3030303030303031 | 0.0 |
| away | momentum | 0.312254688155528 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | -1.4174680736414578 | 0.0 |
| away | off_explosive | 0.10654212790424795 | 0.0 |
| away | off_off_ppd | 2.3337954473914584 | 0.0 |
| away | off_off_ypp | 5.645230450211956 | 0.0 |
| away | off_pass_epa | 0.08546423531145457 | 0.0 |
| away | off_rush_epa | 0.03417837987192093 | 0.0 |
| away | off_rush_success | 0.45811114380477214 | 0.0 |
| away | opponent_drives | 8.705882352941176 | 0.0 |
| away | plays_per_drive | 6.268213649096002 | 0.0 |
| away | pressure_allowed | None | 0.0 |
| away | pressure_generated | None | 0.0 |
| away | pythagorean | 0.5359419651848623 | 0.0 |
| away | qb_backup | None | 0.0 |
| away | qb_career_starts | None | 0.0 |
| away | qb_cpoe | None | 0.0 |
| away | qb_epa | None | 0.0 |
| away | rb_share | 0.14836521268140018 | 0.0 |
| away | redzone_td | 0.6803921568627451 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 0.7058823529411764 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.6666666666666667 | 0.0 |
| away | season_fg_medium | 0.7857142857142857 | 0.0 |
| away | season_fg_short | 0.9411764705882353 | 0.0 |
| away | te_share | 0.25465496539235405 | 0.0 |
| away | travel_miles | 585.9912734978803 | 0.0 |
| away | turnover_margin | 0.9411764705882353 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 19.12243394952401 | 19.12243394952401 |
| home | baseline | 19.12243394952401 | 0.15126588210067038 |
| home | elo | -67.49196746391635 | -0.6178407426574221 |
| home | elo_difference | -94.13563130853572 | -0.9289891206664003 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | None | 0.0 |
| home | career_fg_medium | None | 0.0 |
| home | career_fg_short | None | 0.0 |
| home | close_win_rate | 0.7 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 1.502455333930245 | 0.0 |
| home | def_explosive | 0.10708965676576299 | 0.0 |
| home | def_off_ppd | 2.216171642344912 | 0.0 |
| home | def_off_ypp | 5.705491939530368 | 0.0 |
| home | def_pass_epa | 0.0355579724444586 | 0.0 |
| home | def_rush_epa | -0.01417891598998781 | 0.0 |
| home | def_rush_success | 0.43353140909561344 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 8.705882352941176 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.21993177155298557 | 0.0 |
| home | fumble_recovery | 0.36888888888888893 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | 0.06888888888888889 | 0.0 |
| home | momentum | -0.10773410766492242 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | -0.1898319806880603 | 0.0 |
| home | off_explosive | 0.09039213609976733 | 0.0 |
| home | off_off_ppd | 1.938222953717812 | 0.0 |
| home | off_off_ypp | 5.132893184504864 | 0.0 |
| home | off_pass_epa | -0.035956894404895766 | 0.0 |
| home | off_rush_epa | -0.030045253363690988 | 0.0 |
| home | off_rush_success | 0.4249143195934732 | 0.0 |
| home | opponent_drives | 9.705882352941176 | 0.0 |
| home | plays_per_drive | 6.1262498938969525 | 0.0 |
| home | pressure_allowed | None | 0.0 |
| home | pressure_generated | None | 0.0 |
| home | pythagorean | 0.3834579249404108 | 0.0 |
| home | qb_backup | None | 0.0 |
| home | qb_career_starts | None | 0.0 |
| home | qb_cpoe | None | 0.0 |
| home | qb_epa | None | 0.0 |
| home | rb_share | 0.19299643462584898 | 0.0 |
| home | redzone_td | 0.5320728291316527 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 253 | 0.0 |
| home | return_points | 0.7058823529411764 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.5 | 0.0 |
| home | season_fg_medium | 0.875 | 0.0 |
| home | season_fg_short | 0.9333333333333333 | 0.0 |
| home | te_share | 0.19978628990685057 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | -0.1764705882352941 | 0.0 |
| home | wind | None | 0.0 |

2026_01_DEN_KC · projection-v3-b7a84dbe-2b5d9d0f · team MAE 10.506414356971977
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 20.057850931215192 | 20.057850931215192 |
| away | baseline | 20.057850931215192 | 0.06639820791535683 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | 0.5740740740740741 | 0.0 |
| away | career_fg_medium | 0.8210526315789474 | 0.0 |
| away | career_fg_short | 0.9523809523809523 | 0.0 |
| away | close_win_rate | 0.8181818181818181 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | 1.8598179526680398 | 0.0 |
| away | def_explosive | 0.09330911996752252 | 0.0 |
| away | def_off_ppd | 2.107403089393538 | 0.0 |
| away | def_off_ypp | 5.340369340156961 | 0.0 |
| away | def_pass_epa | 0.028220566299285245 | 0.0 |
| away | def_rush_epa | -0.030107356379296422 | 0.0 |
| away | def_rush_success | 0.41951637996727337 | 0.0 |
| away | divisional | 1.0 | 0.0 |
| away | drives | 9.823529411764707 | 0.0 |
| away | elo | 109.82799754872576 | 0.0 |
| away | elo_difference | 125.58279431548772 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.22357264338688487 | 0.0 |
| away | fumble_recovery | 0.2692307692307692 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | 0.08741258741258734 | 0.0 |
| away | momentum | -0.0630098598059239 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | -0.5747163017504708 | 0.0 |
| away | off_explosive | 0.09527614999603905 | 0.0 |
| away | off_off_ppd | 2.168251654564559 | 0.0 |
| away | off_off_ypp | 5.448081433327987 | 0.0 |
| away | off_pass_epa | 0.06411037574481826 | 0.0 |
| away | off_rush_epa | -0.0023969271176283533 | 0.0 |
| away | off_rush_success | 0.4365122238647192 | 0.0 |
| away | opponent_drives | 8.941176470588236 | 0.0 |
| away | plays_per_drive | 6.0014911559029205 | 0.0 |
| away | pressure_allowed | 0.13458755426917512 | 0.0 |
| away | pressure_generated | 0.30985915492957744 | 0.0 |
| away | pythagorean | 0.6462004822139267 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 36.0 | 0.0 |
| away | qb_cpoe | -1.5051469786007077 | 0.0 |
| away | qb_epa | 0.11132763478228494 | 0.0 |
| away | rb_share | 0.20024022049337362 | 0.0 |
| away | redzone_td | 0.6333333333333333 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 253 | 0.0 |
| away | return_points | 0.7058823529411764 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.6666666666666667 | 0.0 |
| away | season_fg_medium | 0.6 | 0.0 |
| away | season_fg_short | 1.0 | 0.0 |
| away | te_share | 0.19515687703730727 | 0.0 |
| away | travel_miles | 564.2823971943556 | 0.0 |
| away | turnover_margin | -0.058823529411764705 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 20.048902656908876 | 20.048902656908876 |
| home | baseline | 20.048902656908876 | 0.0625177682777192 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | 0.6833333333333333 | 0.0 |
| home | career_fg_medium | 0.8589743589743589 | 0.0 |
| home | career_fg_short | 0.9623655913978495 | 0.0 |
| home | close_win_rate | 0.09999999999999999 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | -1.1160146402327646 | 0.0 |
| home | def_explosive | 0.07951054982949465 | 0.0 |
| home | def_off_ppd | 1.9526690306412442 | 0.0 |
| home | def_off_ypp | 4.950287989919789 | 0.0 |
| home | def_pass_epa | -0.026564455096884647 | 0.0 |
| home | def_rush_epa | -0.03003646682941989 | 0.0 |
| home | def_rush_success | 0.4075078665956182 | 0.0 |
| home | divisional | 1.0 | 0.0 |
| home | drives | 8.941176470588236 | 0.0 |
| home | elo | -15.754796766761956 | 0.0 |
| home | elo_difference | -125.58279431548772 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.3429944093063623 | 0.0 |
| home | fumble_recovery | 0.5488888888888889 | 0.0 |
| home | home_divisional | 1.0 | 0.0 |
| home | home_nondivisional | 0.0 | 0.0 |
| home | luck_index | -0.35111111111111115 | 0.0 |
| home | momentum | -0.7961845500738362 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | -0.5162217366581109 | 0.0 |
| home | off_explosive | 0.09342441785470028 | 0.0 |
| home | off_off_ppd | 2.321078244185726 | 0.0 |
| home | off_off_ypp | 5.316218797816584 | 0.0 |
| home | off_pass_epa | 0.04081127794815368 | 0.0 |
| home | off_rush_epa | 0.03057312232873071 | 0.0 |
| home | off_rush_success | 0.4501561358005208 | 0.0 |
| home | opponent_drives | 9.823529411764707 | 0.0 |
| home | plays_per_drive | 6.624448264154147 | 0.0 |
| home | pressure_allowed | 0.23511450381679388 | 0.0 |
| home | pressure_generated | 0.23105360443622922 | 0.0 |
| home | pythagorean | 0.5581739822040682 | 0.0 |
| home | qb_backup | 0.0 | 0.0 |
| home | qb_career_starts | 147.0 | 0.0 |
| home | qb_cpoe | -0.3584940385605609 | 0.0 |
| home | qb_epa | 0.13037664128306511 | 0.0 |
| home | rb_share | 0.16631259886125146 | 0.0 |
| home | redzone_td | 0.5372549019607843 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 253 | 0.0 |
| home | return_points | 0.0 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.625 | 0.0 |
| home | season_fg_medium | 0.8181818181818183 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.27799670310671043 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | -0.1764705882352941 | 0.0 |
| home | wind | None | 0.0 |

2026_01_GB_MIN · projection-v3-b7a84dbe-2b5d9d0f · team MAE 9.165892621560277
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 18.76297870713589 | 18.76297870713589 |
| away | baseline | 18.76297870713589 | -0.4951260963235572 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | close_win_rate | 0.4444444444444444 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -2.558525959884955 | 0.0 |
| away | def_explosive | 0.08803084280980034 | 0.0 |
| away | def_off_ppd | 1.90329476020334 | 0.0 |
| away | def_off_ypp | 5.031818620584431 | 0.0 |
| away | def_pass_epa | -0.0727866027154205 | 0.0 |
| away | def_rush_epa | -0.026412185033574155 | 0.0 |
| away | def_rush_success | 0.4347643371679186 | 0.0 |
| away | divisional | 1.0 | 0.0 |
| away | drives | 8.470588235294118 | 0.0 |
| away | elo | 35.925182333118755 | 0.0 |
| away | elo_difference | -16.74312462983562 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.17492801396460336 | 0.0 |
| away | fumble_recovery | 0.49404761904761907 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.06150793650793651 | 0.0 |
| away | momentum | -0.49136222625363596 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 3.398002985183295 | 0.0 |
| away | off_explosive | 0.10919224030266013 | 0.0 |
| away | off_off_ppd | 2.3496470800807945 | 0.0 |
| away | off_off_ypp | 5.672002977428068 | 0.0 |
| away | off_pass_epa | 0.15229224467737057 | 0.0 |
| away | off_rush_epa | -0.014994088644635428 | 0.0 |
| away | off_rush_success | 0.44352102455535436 | 0.0 |
| away | opponent_drives | 9.176470588235293 | 0.0 |
| away | plays_per_drive | 6.426037687802394 | 0.0 |
| away | pressure_allowed | 0.18213660245183888 | 0.0 |
| away | pressure_generated | 0.21052631578947367 | 0.0 |
| away | pythagorean | 0.5487868728149037 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 52.0 | 0.0 |
| away | qb_cpoe | 5.903959281158887 | 0.0 |
| away | qb_epa | 0.2963670307826325 | 0.0 |
| away | rb_share | 0.1592352383337038 | 0.0 |
| away | redzone_td | 0.69375 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 0.0 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.6 | 0.0 |
| away | season_fg_medium | 0.42857142857142855 | 0.0 |
| away | season_fg_short | 1.0 | 0.0 |
| away | te_share | 0.20793404024222437 | 0.0 |
| away | travel_miles | 257.01644416149185 | 0.0 |
| away | turnover_margin | -0.3529411764705882 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 19.011156356938688 | 19.011156356938688 |
| home | baseline | 19.011156356938688 | -0.3875032903495907 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | 0.7916666666666666 | 0.0 |
| home | career_fg_medium | 0.8571428571428571 | 0.0 |
| home | career_fg_short | 0.9642857142857143 | 0.0 |
| home | close_win_rate | 0.5714285714285714 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 1.9467262092827513 | 0.0 |
| home | def_explosive | 0.08683960025555434 | 0.0 |
| home | def_off_ppd | 2.2394934321135596 | 0.0 |
| home | def_off_ypp | 5.222115434315115 | 0.0 |
| home | def_pass_epa | 0.07822833874456356 | 0.0 |
| home | def_rush_epa | -0.029959447826093485 | 0.0 |
| home | def_rush_success | 0.4409338339448836 | 0.0 |
| home | divisional | 1.0 | 0.0 |
| home | drives | 9.176470588235293 | 0.0 |
| home | elo | 52.668306962954375 | 0.0 |
| home | elo_difference | 16.74312462983562 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.3570385016737401 | 0.0 |
| home | fumble_recovery | 0.5444444444444444 | 0.0 |
| home | home_divisional | 1.0 | 0.0 |
| home | home_nondivisional | 0.0 | 0.0 |
| home | luck_index | 0.1158730158730158 | 0.0 |
| home | momentum | 0.36266200303731155 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | -0.973734407935382 | 0.0 |
| home | off_explosive | 0.09148038946528554 | 0.0 |
| home | off_off_ppd | 2.069702008792543 | 0.0 |
| home | off_off_ypp | 5.0961409842503285 | 0.0 |
| home | off_pass_epa | -0.059181946885883026 | 0.0 |
| home | off_rush_epa | -0.03422241059445503 | 0.0 |
| home | off_rush_success | 0.4234993298946832 | 0.0 |
| home | opponent_drives | 8.470588235294118 | 0.0 |
| home | plays_per_drive | 5.368544037661684 | 0.0 |
| home | pressure_allowed | 0.3205645161290323 | 0.0 |
| home | pressure_generated | 0.2698744769874477 | 0.0 |
| home | pythagorean | 0.5192462426849498 | 0.0 |
| home | qb_backup | 1.0 | 0.0 |
| home | qb_career_starts | 88.0 | 0.0 |
| home | qb_cpoe | -1.3076318880996187 | 0.0 |
| home | qb_epa | 0.07313057699745332 | 0.0 |
| home | rb_share | 0.1698810773750596 | 0.0 |
| home | redzone_td | 0.5215686274509804 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 252 | 0.0 |
| home | return_points | 0.7058823529411764 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.8333333333333335 | 0.0 |
| home | season_fg_medium | 1.0 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.21071400172216329 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | -0.058823529411764705 | 0.0 |
| home | wind | None | 0.0 |

2026_01_BUF_HOU · projection-v2-172f3e04-a39aa883 · team MAE 8.948122308277624
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 21.16175372936251 | 21.16175372936251 |
| away | baseline | 21.16175372936251 | -0.243056377313418 |
| away | elo | 99.82335256725037 | 0.9144072781040189 |
| away | elo_difference | -0.8411913306367751 | -0.008301400688536078 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | close_win_rate | 0.625 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -1.732939254375399 | 0.0 |
| away | def_explosive | 0.09001940582123759 | 0.0 |
| away | def_off_ppd | 1.8880115891801583 | 0.0 |
| away | def_off_ypp | 5.1292094006107645 | 0.0 |
| away | def_pass_epa | -0.025454555383395215 | 0.0 |
| away | def_rush_epa | -0.0417320545570116 | 0.0 |
| away | def_rush_success | 0.40856107896342436 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 9.0 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.09860152717084517 | 0.0 |
| away | fumble_recovery | 0.3392857142857143 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.0357142857142857 | 0.0 |
| away | momentum | -0.1268969371455659 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 1.4901400744407298 | 0.0 |
| away | off_explosive | 0.10961731082184516 | 0.0 |
| away | off_off_ppd | 2.4991812571510934 | 0.0 |
| away | off_off_ypp | 5.7814967337956205 | 0.0 |
| away | off_pass_epa | 0.10663741823920264 | 0.0 |
| away | off_rush_epa | 0.05287026271409665 | 0.0 |
| away | off_rush_success | 0.463412788593069 | 0.0 |
| away | opponent_drives | 10.294117647058822 | 0.0 |
| away | plays_per_drive | 6.380262711145064 | 0.0 |
| away | pressure_allowed | None | 0.0 |
| away | pressure_generated | None | 0.0 |
| away | pythagorean | 0.6579222475956522 | 0.0 |
| away | qb_backup | None | 0.0 |
| away | qb_career_starts | None | 0.0 |
| away | qb_cpoe | None | 0.0 |
| away | qb_epa | None | 0.0 |
| away | rb_share | 0.18441889010722767 | 0.0 |
| away | redzone_td | 0.6778711484593838 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 1.0588235294117645 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 1.0 | 0.0 |
| away | season_fg_medium | 1.0 | 0.0 |
| away | season_fg_short | 0.9 | 0.0 |
| away | te_share | 0.2611642400708552 | 0.0 |
| away | travel_miles | 1290.1326932161214 | 0.0 |
| away | turnover_margin | 0.058823529411764705 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 20.731739933699902 | 20.731739933699902 |
| home | baseline | 20.731739933699902 | -0.15990903908756335 |
| home | elo | 100.66454389788714 | 0.922110779201287 |
| home | elo_difference | 0.8411913306367751 | 0.008301400688536078 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | None | 0.0 |
| home | career_fg_medium | None | 0.0 |
| home | career_fg_short | None | 0.0 |
| home | close_win_rate | 0.6 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | -2.256924864102496 | 0.0 |
| home | def_explosive | 0.10243969035482588 | 0.0 |
| home | def_off_ppd | 2.149643026891133 | 0.0 |
| home | def_off_ypp | 5.3114707394104475 | 0.0 |
| home | def_pass_epa | -0.044398942124255346 | 0.0 |
| home | def_rush_epa | 0.031780141172193396 | 0.0 |
| home | def_rush_success | 0.44224364246833664 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 10.294117647058822 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.3904339126795043 | 0.0 |
| home | fumble_recovery | 0.511904761904762 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | 0.11190476190476195 | 0.0 |
| home | momentum | 0.2144102808310647 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | -0.3000114073985306 | 0.0 |
| home | off_explosive | 0.0898707876765435 | 0.0 |
| home | off_off_ppd | 2.14840061790031 | 0.0 |
| home | off_off_ypp | 5.351035599828878 | 0.0 |
| home | off_pass_epa | 0.05330396150998522 | 0.0 |
| home | off_rush_epa | -0.047415532742593455 | 0.0 |
| home | off_rush_success | 0.4068575957424523 | 0.0 |
| home | opponent_drives | 9.0 | 0.0 |
| home | plays_per_drive | 5.820397086573557 | 0.0 |
| home | pressure_allowed | None | 0.0 |
| home | pressure_generated | None | 0.0 |
| home | pythagorean | 0.6781366339630288 | 0.0 |
| home | qb_backup | None | 0.0 |
| home | qb_career_starts | None | 0.0 |
| home | qb_cpoe | None | 0.0 |
| home | qb_epa | None | 0.0 |
| home | rb_share | 0.13528680662594458 | 0.0 |
| home | redzone_td | 0.503921568627451 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 252 | 0.0 |
| home | return_points | 1.4117647058823528 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.6923076923076924 | 0.0 |
| home | season_fg_medium | 1.0 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.24889803690728918 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.588235294117647 | 0.0 |
| home | wind | None | 0.0 |

2026_01_BAL_IND · projection-v2-172f3e04-a39aa883 · team MAE 8.443741633583079
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 20.173996359955897 | 20.173996359955897 |
| away | baseline | 20.173996359955897 | -0.0520639093797343 |
| away | elo | 43.11737427300841 | 0.3951026322980732 |
| away | elo_difference | 77.69272388967283 | 0.7667202550741281 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | close_win_rate | 0.19999999999999998 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -0.027057797863784705 | 0.0 |
| away | def_explosive | 0.09700544706485781 | 0.0 |
| away | def_off_ppd | 2.207811895327029 | 0.0 |
| away | def_off_ypp | 5.533204792284101 | 0.0 |
| away | def_pass_epa | 0.04295588194445706 | 0.0 |
| away | def_rush_epa | -0.020076288698825842 | 0.0 |
| away | def_rush_success | 0.4402369232983523 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 8.882352941176471 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.2543171878475353 | 0.0 |
| away | fumble_recovery | 0.4785714285714286 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.32142857142857145 | 0.0 |
| away | momentum | 0.43373258655388613 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 2.325494215837219 | 0.0 |
| away | off_explosive | 0.11012420012296895 | 0.0 |
| away | off_off_ppd | 2.3497686776862627 | 0.0 |
| away | off_off_ypp | 5.7939902760149105 | 0.0 |
| away | off_pass_epa | 0.06713018919038519 | 0.0 |
| away | off_rush_epa | 0.03848131396098339 | 0.0 |
| away | off_rush_success | 0.43113042783535716 | 0.0 |
| away | opponent_drives | 8.823529411764707 | 0.0 |
| away | plays_per_drive | 5.665421016891605 | 0.0 |
| away | pressure_allowed | None | 0.0 |
| away | pressure_generated | None | 0.0 |
| away | pythagorean | 0.5374241366046332 | 0.0 |
| away | qb_backup | None | 0.0 |
| away | qb_career_starts | None | 0.0 |
| away | qb_cpoe | None | 0.0 |
| away | qb_epa | None | 0.0 |
| away | rb_share | 0.18127144301785808 | 0.0 |
| away | redzone_td | 0.5764705882352941 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 0.0 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.25 | 0.0 |
| away | season_fg_medium | 0.8888888888888888 | 0.0 |
| away | season_fg_short | 1.0 | 0.0 |
| away | te_share | 0.303740027337119 | 0.0 |
| away | travel_miles | 509.3885124212152 | 0.0 |
| away | turnover_margin | -0.17647058823529413 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 21.57787094593191 | 21.57787094593191 |
| home | baseline | 21.57787094593191 | -0.32351667718445726 |
| home | elo | -34.575349616664425 | -0.3163954085588027 |
| home | elo_difference | -77.69272388967283 | -0.7667202550741281 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | None | 0.0 |
| home | career_fg_medium | None | 0.0 |
| home | career_fg_short | None | 0.0 |
| home | close_win_rate | 0.3333333333333333 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 1.62012388474877 | 0.0 |
| home | def_explosive | 0.10314606057957526 | 0.0 |
| home | def_off_ppd | 2.2815396859980086 | 0.0 |
| home | def_off_ypp | 5.6153705604209305 | 0.0 |
| home | def_pass_epa | 0.082455060349539 | 0.0 |
| home | def_rush_epa | -0.01829118010023118 | 0.0 |
| home | def_rush_success | 0.42490917802047423 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 8.823529411764707 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.2205299833577203 | 0.0 |
| home | fumble_recovery | 0.5974358974358974 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | -0.06923076923076926 | 0.0 |
| home | momentum | -0.7406602504835936 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | 0.8958526608211997 | 0.0 |
| home | off_explosive | 0.09519255144580162 | 0.0 |
| home | off_off_ppd | 2.59319527853146 | 0.0 |
| home | off_off_ypp | 5.734399855873505 | 0.0 |
| home | off_pass_epa | 0.08345623147315327 | 0.0 |
| home | off_rush_epa | 0.06181004990993128 | 0.0 |
| home | off_rush_success | 0.4533925383880768 | 0.0 |
| home | opponent_drives | 8.882352941176471 | 0.0 |
| home | plays_per_drive | 6.266802478567184 | 0.0 |
| home | pressure_allowed | None | 0.0 |
| home | pressure_generated | None | 0.0 |
| home | pythagorean | 0.5724599026334206 | 0.0 |
| home | qb_backup | None | 0.0 |
| home | qb_career_starts | None | 0.0 |
| home | qb_cpoe | None | 0.0 |
| home | qb_epa | None | 0.0 |
| home | rb_share | 0.1488280385809503 | 0.0 |
| home | redzone_td | 0.6943977591036414 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 252 | 0.0 |
| home | return_points | 0.3529411764705882 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.7142857142857143 | 0.0 |
| home | season_fg_medium | 1.0 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.2680199791986581 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.058823529411764705 | 0.0 |
| home | wind | None | 0.0 |

2026_01_CLE_JAX · projection-v2-172f3e04-a39aa883 · team MAE 8.350780072968108
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 17.980323000719395 | 17.980323000719395 |
| away | baseline | 17.980323000719395 | 0.37210411173323393 |
| away | elo | -75.98237934444296 | -0.6955946315240422 |
| away | elo_difference | -152.14912100663742 | -1.5015024191090267 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | close_win_rate | 0.3333333333333333 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -0.26376757817782914 | 0.0 |
| away | def_explosive | 0.08818544370492455 | 0.0 |
| away | def_off_ppd | 1.9566990464865308 | 0.0 |
| away | def_off_ypp | 5.235716482334698 | 0.0 |
| away | def_pass_epa | -0.024505560329521288 | 0.0 |
| away | def_rush_epa | -0.036434459340479584 | 0.0 |
| away | def_rush_success | 0.4043373737716248 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 10.0 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.29811219033086084 | 0.0 |
| away | fumble_recovery | 0.42142857142857143 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.24523809523809526 | 0.0 |
| away | momentum | -0.06375192308111365 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | -3.3396402043156908 | 0.0 |
| away | off_explosive | 0.08513019600478175 | 0.0 |
| away | off_off_ppd | 1.7039655165341843 | 0.0 |
| away | off_off_ypp | 4.868764863387963 | 0.0 |
| away | off_pass_epa | -0.10190539248615299 | 0.0 |
| away | off_rush_epa | -0.04856247627847256 | 0.0 |
| away | off_rush_success | 0.3812548435195524 | 0.0 |
| away | opponent_drives | 9.647058823529411 | 0.0 |
| away | plays_per_drive | 5.251642475171887 | 0.0 |
| away | pressure_allowed | None | 0.0 |
| away | pressure_generated | None | 0.0 |
| away | pythagorean | 0.3260755558298099 | 0.0 |
| away | qb_backup | None | 0.0 |
| away | qb_career_starts | None | 0.0 |
| away | qb_cpoe | None | 0.0 |
| away | qb_epa | None | 0.0 |
| away | rb_share | 0.21024878756543416 | 0.0 |
| away | redzone_td | 0.5083333333333333 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 1.4117647058823528 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.8333333333333335 | 0.0 |
| away | season_fg_medium | 0.8333333333333335 | 0.0 |
| away | season_fg_short | 0.923076923076923 | 0.0 |
| away | te_share | 0.3344237076684045 | 0.0 |
| away | travel_miles | 772.6262887083127 | 0.0 |
| away | turnover_margin | -0.47058823529411764 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 21.578056359058216 | 21.578056359058216 |
| home | baseline | 21.578056359058216 | -0.3235525286108069 |
| home | elo | 76.16674166219445 | 0.6977636663269061 |
| home | elo_difference | 152.14912100663742 | 1.5015024191090267 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | None | 0.0 |
| home | career_fg_medium | None | 0.0 |
| home | career_fg_short | None | 0.0 |
| home | close_win_rate | 0.7499999999999999 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | -0.13371065570280638 | 0.0 |
| home | def_explosive | 0.096307103113713 | 0.0 |
| home | def_off_ppd | 2.050800686092745 | 0.0 |
| home | def_off_ypp | 5.205928161267974 | 0.0 |
| home | def_pass_epa | -0.040596782494719895 | 0.0 |
| home | def_rush_epa | -0.022134721224620305 | 0.0 |
| home | def_rush_success | 0.4103737860525463 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 9.647058823529411 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.15649727180653897 | 0.0 |
| home | fumble_recovery | 0.5611111111111111 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | 0.311111111111111 | 0.0 |
| home | momentum | 0.6751079016865669 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | -0.23029867090320977 | 0.0 |
| home | off_explosive | 0.09721882927443169 | 0.0 |
| home | off_off_ppd | 2.342336536709526 | 0.0 |
| home | off_off_ypp | 5.497991676830287 | 0.0 |
| home | off_pass_epa | 0.0651957261395543 | 0.0 |
| home | off_rush_epa | 0.011333420321484435 | 0.0 |
| home | off_rush_success | 0.4328078883368736 | 0.0 |
| home | opponent_drives | 10.0 | 0.0 |
| home | plays_per_drive | 5.928967111320053 | 0.0 |
| home | pressure_allowed | None | 0.0 |
| home | pressure_generated | None | 0.0 |
| home | pythagorean | 0.6932819615438436 | 0.0 |
| home | qb_backup | None | 0.0 |
| home | qb_career_starts | None | 0.0 |
| home | qb_cpoe | None | 0.0 |
| home | qb_epa | None | 0.0 |
| home | rb_share | 0.1454869148147171 | 0.0 |
| home | redzone_td | 0.6851540616246499 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 252 | 0.0 |
| home | return_points | 1.4117647058823528 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.7999999999999999 | 0.0 |
| home | season_fg_medium | 0.7777777777777777 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.19796587508643806 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.4117647058823529 | 0.0 |
| home | wind | None | 0.0 |

2026_01_MIA_LV · projection-v3-b7a84dbe-2b5d9d0f · team MAE 8.322781881413771
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 19.241716627908804 | 19.241716627908804 |
| away | baseline | 19.241716627908804 | -0.28752030103673853 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | 0.5384615384615384 | 0.0 |
| away | career_fg_medium | 0.8787878787878788 | 0.0 |
| away | career_fg_short | 0.95 | 0.0 |
| away | close_win_rate | 0.5714285714285714 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | 1.4762921517283618 | 0.0 |
| away | def_explosive | 0.0951267920428205 | 0.0 |
| away | def_off_ppd | 2.411559677550916 | 0.0 |
| away | def_off_ypp | 5.4067459334036005 | 0.0 |
| away | def_pass_epa | 0.06884989635284626 | 0.0 |
| away | def_rush_epa | -0.013225401929180439 | 0.0 |
| away | def_rush_success | 0.4336583395826274 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 8.470588235294118 | 0.0 |
| away | elo | -42.47288750457233 | 0.0 |
| away | elo_difference | 111.75726923303773 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.2877032185423189 | 0.0 |
| away | fumble_recovery | 0.5635416666666667 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | 0.13497023809523812 | 0.0 |
| away | momentum | -0.48363325208131114 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 0.7590879087601508 | 0.0 |
| away | off_explosive | 0.09833654647385555 | 0.0 |
| away | off_off_ppd | 1.9939512002194504 | 0.0 |
| away | off_off_ypp | 5.340417370956712 | 0.0 |
| away | off_pass_epa | -0.012308009541410578 | 0.0 |
| away | off_rush_epa | -0.026646617372822534 | 0.0 |
| away | off_rush_success | 0.41119555852047845 | 0.0 |
| away | opponent_drives | 9.0 | 0.0 |
| away | plays_per_drive | 5.440898480604363 | 0.0 |
| away | pressure_allowed | 0.19406392694063926 | 0.0 |
| away | pressure_generated | 0.18737672583826429 | 0.0 |
| away | pythagorean | 0.38344092820642345 | 0.0 |
| away | qb_backup | 1.0 | 0.0 |
| away | qb_career_starts | 6.0 | 0.0 |
| away | qb_cpoe | 22.093667352900784 | 0.0 |
| away | qb_epa | 0.714740083603801 | 0.0 |
| away | rb_share | 0.2507502486312492 | 0.0 |
| away | redzone_td | 0.6188888888888888 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 0.3529411764705882 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.6666666666666667 | 0.0 |
| away | season_fg_medium | 1.0 | 0.0 |
| away | season_fg_short | 0.9166666666666666 | 0.0 |
| away | te_share | 0.2187665548152695 | 0.0 |
| away | travel_miles | 2170.6339482637413 | 0.0 |
| away | turnover_margin | -0.1764705882352941 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 17.396385104573348 | 17.396385104573348 |
| home | baseline | 17.396385104573348 | -1.087752540528824 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | 0.5818181818181818 | 0.0 |
| home | career_fg_medium | 0.8688524590163934 | 0.0 |
| home | career_fg_short | 0.956140350877193 | 0.0 |
| home | close_win_rate | 0.2857142857142857 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 3.333298868259144 | 0.0 |
| home | def_explosive | 0.10049293078316476 | 0.0 |
| home | def_off_ppd | 2.2599970182152815 | 0.0 |
| home | def_off_ypp | 5.651513691466816 | 0.0 |
| home | def_pass_epa | 0.11189231251830828 | 0.0 |
| home | def_rush_epa | -0.0031147866015270777 | 0.0 |
| home | def_rush_success | 0.44377105162512853 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 9.0 | 0.0 |
| home | elo | -154.23015673761006 | 0.0 |
| home | elo_difference | -111.75726923303773 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.28820607553366173 | 0.0 |
| home | fumble_recovery | 0.49523809523809526 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | -0.21904761904761905 | 0.0 |
| home | momentum | -0.18803739577939124 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | -1.1362931794004518 | 0.0 |
| home | off_explosive | 0.0842947570368417 | 0.0 |
| home | off_off_ppd | 1.7230137127981449 | 0.0 |
| home | off_off_ypp | 4.832721612016714 | 0.0 |
| home | off_pass_epa | -0.09573661027353653 | 0.0 |
| home | off_rush_epa | -0.11557717090450582 | 0.0 |
| home | off_rush_success | 0.38040507503414317 | 0.0 |
| home | opponent_drives | 8.470588235294118 | 0.0 |
| home | plays_per_drive | 5.272552447552448 | 0.0 |
| home | pressure_allowed | 0.30040322580645157 | 0.0 |
| home | pressure_generated | 0.19611650485436893 | 0.0 |
| home | pythagorean | 0.20049557155754788 | 0.0 |
| home | qb_backup | 1.0 | 0.0 |
| home | qb_career_starts | 171.0 | 0.0 |
| home | qb_cpoe | -2.2182178938335366 | 0.0 |
| home | qb_epa | 0.027845794553675904 | 0.0 |
| home | rb_share | 0.19878850452379865 | 0.0 |
| home | redzone_td | 0.5511904761904762 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 252 | 0.0 |
| home | return_points | 0.0 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.625 | 0.0 |
| home | season_fg_medium | 0.7142857142857143 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.2964413255589726 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | -0.2941176470588235 | 0.0 |
| home | wind | None | 0.0 |

2026_01_NO_DET · projection-v2-172f3e04-a39aa883 · team MAE 7.382015546137234
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 19.193247348759126 | 19.193247348759126 |
| away | baseline | 19.193247348759126 | 0.1375734245178804 |
| away | elo | -64.07580033729369 | -0.5865560084359364 |
| away | elo_difference | -124.16900516083183 | -1.225377185184112 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | close_win_rate | 0.2857142857142857 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -0.246293334219592 | 0.0 |
| away | def_explosive | 0.09932113229678838 | 0.0 |
| away | def_off_ppd | 2.1970897614806995 | 0.0 |
| away | def_off_ypp | 5.405466767943396 | 0.0 |
| away | def_pass_epa | 0.009607450984471674 | 0.0 |
| away | def_rush_epa | -0.009614242902079363 | 0.0 |
| away | def_rush_success | 0.4243279888298358 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 9.117647058823529 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.30858176654636693 | 0.0 |
| away | fumble_recovery | 0.37500000000000006 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.33928571428571425 | 0.0 |
| away | momentum | 0.7941342544010545 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 1.1059087660415545 | 0.0 |
| away | off_explosive | 0.08001530334099193 | 0.0 |
| away | off_off_ppd | 1.9200737076537495 | 0.0 |
| away | off_off_ypp | 5.2437228986078415 | 0.0 |
| away | off_pass_epa | -0.002478556109298008 | 0.0 |
| away | off_rush_epa | -0.08200000898294871 | 0.0 |
| away | off_rush_success | 0.40320560753766105 | 0.0 |
| away | opponent_drives | 9.529411764705882 | 0.0 |
| away | plays_per_drive | 6.086242678889738 | 0.0 |
| away | pressure_allowed | None | 0.0 |
| away | pressure_generated | None | 0.0 |
| away | pythagorean | 0.37006307465320376 | 0.0 |
| away | qb_backup | None | 0.0 |
| away | qb_career_starts | None | 0.0 |
| away | qb_cpoe | None | 0.0 |
| away | qb_epa | None | 0.0 |
| away | rb_share | 0.15770267898557214 | 0.0 |
| away | redzone_td | 0.5333333333333333 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 1.0588235294117645 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.5833333333333334 | 0.0 |
| away | season_fg_medium | 0.5555555555555556 | 0.0 |
| away | season_fg_short | 0.8888888888888888 | 0.0 |
| away | te_share | 0.21649879704715203 | 0.0 |
| away | travel_miles | 940.8509079797012 | 0.0 |
| away | turnover_margin | -0.058823529411764705 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 21.46639140760594 | 21.46639140760594 |
| home | baseline | 21.46639140760594 | -0.30196102717520906 |
| home | elo | 60.093204823538144 | 0.550564682975713 |
| home | elo_difference | 124.16900516083183 | 1.225377185184112 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | None | 0.0 |
| home | career_fg_medium | None | 0.0 |
| home | career_fg_short | None | 0.0 |
| home | close_win_rate | 0.2857142857142857 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 1.0758262108644518 | 0.0 |
| home | def_explosive | 0.09675789656314873 | 0.0 |
| home | def_off_ppd | 2.2518203200855518 | 0.0 |
| home | def_off_ypp | 5.328726258186728 | 0.0 |
| home | def_pass_epa | 0.04342926518924631 | 0.0 |
| home | def_rush_epa | -0.028351995020000437 | 0.0 |
| home | def_rush_success | 0.4199588959658218 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 9.529411764705882 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.17362050169826532 | 0.0 |
| home | fumble_recovery | 0.24444444444444446 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | -0.46984126984126984 | 0.0 |
| home | momentum | -0.507347697571931 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | 1.9719168497777249 | 0.0 |
| home | off_explosive | 0.10061426841137382 | 0.0 |
| home | off_off_ppd | 2.3529576474766056 | 0.0 |
| home | off_off_ypp | 5.764490128742961 | 0.0 |
| home | off_pass_epa | 0.11506806532325875 | 0.0 |
| home | off_rush_epa | -0.03321406479537128 | 0.0 |
| home | off_rush_success | 0.4146015889786124 | 0.0 |
| home | opponent_drives | 9.117647058823529 | 0.0 |
| home | plays_per_drive | 5.995484254307784 | 0.0 |
| home | pressure_allowed | None | 0.0 |
| home | pressure_generated | None | 0.0 |
| home | pythagorean | 0.5893392714465169 | 0.0 |
| home | qb_backup | None | 0.0 |
| home | qb_career_starts | None | 0.0 |
| home | qb_cpoe | None | 0.0 |
| home | qb_epa | None | 0.0 |
| home | rb_share | 0.22494344212007353 | 0.0 |
| home | redzone_td | 0.642016806722689 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 252 | 0.0 |
| home | return_points | 0.3529411764705882 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.37499999999999994 | 0.0 |
| home | season_fg_medium | 0.7999999999999999 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.16970895565817848 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.11764705882352944 | 0.0 |
| home | wind | None | 0.0 |

2026_01_ARI_LAC · projection-v3-b7a84dbe-2b5d9d0f · team MAE 7.287358848239789
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 19.119862696985273 | 19.119862696985273 |
| away | baseline | 19.119862696985273 | -0.3403625371340219 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | 0.6666666666666666 | 0.0 |
| away | career_fg_medium | 0.6129032258064516 | 0.0 |
| away | career_fg_short | 0.926829268292683 | 0.0 |
| away | close_win_rate | 0.19999999999999998 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -2.038944818110922 | 0.0 |
| away | def_explosive | 0.0971944005252651 | 0.0 |
| away | def_off_ppd | 2.062215746502887 | 0.0 |
| away | def_off_ypp | 5.30384529016268 | 0.0 |
| away | def_pass_epa | -0.003877017976331977 | 0.0 |
| away | def_rush_epa | -0.02865248911596561 | 0.0 |
| away | def_rush_success | 0.41839825160570765 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 9.117647058823529 | 0.0 |
| away | elo | -110.38138433047607 | 0.0 |
| away | elo_difference | -150.51020492526777 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.21199145733502348 | 0.0 |
| away | fumble_recovery | 0.5194444444444445 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.28055555555555556 | 0.0 |
| away | momentum | -0.4481235724142582 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | -0.018461768348758956 | 0.0 |
| away | off_explosive | 0.08975563642828338 | 0.0 |
| away | off_off_ppd | 2.118333010394214 | 0.0 |
| away | off_off_ypp | 5.236404992881963 | 0.0 |
| away | off_pass_epa | 0.033827689723249885 | 0.0 |
| away | off_rush_epa | -0.050459876699336485 | 0.0 |
| away | off_rush_success | 0.4087250855223007 | 0.0 |
| away | opponent_drives | 9.176470588235293 | 0.0 |
| away | plays_per_drive | 6.066259230965113 | 0.0 |
| away | pressure_allowed | 0.2640625 | 0.0 |
| away | pressure_generated | 0.15742397137745975 | 0.0 |
| away | pythagorean | 0.319922420039512 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 65.0 | 0.0 |
| away | qb_cpoe | 0.6701238691172702 | 0.0 |
| away | qb_epa | -0.008751567153115234 | 0.0 |
| away | rb_share | 0.19291908856591433 | 0.0 |
| away | redzone_td | 0.5872549019607843 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 0.7058823529411764 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.6 | 0.0 |
| away | season_fg_medium | 0.7777777777777777 | 0.0 |
| away | season_fg_short | 0.923076923076923 | 0.0 |
| away | te_share | 0.3820959596090777 | 0.0 |
| away | travel_miles | 350.3120198678239 | 0.0 |
| away | turnover_margin | 1.3877787807814457e-17 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 20.915777728693065 | 20.915777728693065 |
| home | baseline | 20.915777728693065 | 0.4384401276377607 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | 0.7857142857142857 | 0.0 |
| home | career_fg_medium | 0.9285714285714286 | 0.0 |
| home | career_fg_short | 0.9866666666666667 | 0.0 |
| home | close_win_rate | 0.7499999999999999 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 0.8776658834909226 | 0.0 |
| home | def_explosive | 0.10355547726203644 | 0.0 |
| home | def_off_ppd | 2.4005781120604515 | 0.0 |
| home | def_off_ypp | 5.610974641238177 | 0.0 |
| home | def_pass_epa | 0.0912778522133621 | 0.0 |
| home | def_rush_epa | -0.0035960387283295253 | 0.0 |
| home | def_rush_success | 0.43449158209322486 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 9.176470588235293 | 0.0 |
| home | elo | 40.128820594791705 | 0.0 |
| home | elo_difference | 150.51020492526777 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.36317804055188824 | 0.0 |
| home | fumble_recovery | 0.3125 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | 0.06249999999999989 | 0.0 |
| home | momentum | -0.14458707309051747 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | 0.9244131901067676 | 0.0 |
| home | off_explosive | 0.0927656758646188 | 0.0 |
| home | off_off_ppd | 2.172646600322599 | 0.0 |
| home | off_off_ypp | 5.438049638196116 | 0.0 |
| home | off_pass_epa | 0.035184784443888006 | 0.0 |
| home | off_rush_epa | 0.008408417482246052 | 0.0 |
| home | off_rush_success | 0.43032393648928124 | 0.0 |
| home | opponent_drives | 9.117647058823529 | 0.0 |
| home | plays_per_drive | 6.243400063988299 | 0.0 |
| home | pressure_allowed | 0.2951334379905809 | 0.0 |
| home | pressure_generated | 0.22495606326889278 | 0.0 |
| home | pythagorean | 0.5467518932526231 | 0.0 |
| home | qb_backup | 0.0 | 0.0 |
| home | qb_career_starts | 98.0 | 0.0 |
| home | qb_cpoe | 1.7138915783154496 | 0.0 |
| home | qb_epa | 0.037077384250901735 | 0.0 |
| home | rb_share | 0.1261211097532335 | 0.0 |
| home | redzone_td | 0.4687675070028011 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 252 | 0.0 |
| home | return_points | 0.0 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.7999999999999999 | 0.0 |
| home | season_fg_medium | 0.9090909090909091 | 0.0 |
| home | season_fg_short | 0.9523809523809523 | 0.0 |
| home | te_share | 0.17409259873752742 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.05882352941176468 | 0.0 |
| home | wind | None | 0.0 |

2026_01_NYJ_TEN · projection-v2-172f3e04-a39aa883 · team MAE 6.739548525911747
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 19.11171087116824 | 19.11171087116824 |
| away | baseline | 19.11171087116824 | 0.15333929330715443 |
| away | elo | -140.0945306603512 | -1.2827238731395714 |
| away | elo_difference | 6.047671889572939 | 0.059682198044215394 |
| away | calibration_intercept | 1.0 | 2.8883545397390087 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | close_win_rate | 0.37499999999999994 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | 4.022332098582304 | 0.0 |
| away | def_explosive | 0.10689866402916529 | 0.0 |
| away | def_off_ppd | 2.427270296533659 | 0.0 |
| away | def_off_ypp | 5.838243656850129 | 0.0 |
| away | def_pass_epa | 0.13437572997040334 | 0.0 |
| away | def_rush_epa | 0.03626059017199609 | 0.0 |
| away | def_rush_success | 0.4342450517132173 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 9.117647058823529 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.3330328984740749 | 0.0 |
| away | fumble_recovery | 0.30128205128205127 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.3237179487179488 | 0.0 |
| away | momentum | -0.7564932811989928 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | -3.4506284036580834 | 0.0 |
| away | off_explosive | 0.08905558675242739 | 0.0 |
| away | off_off_ppd | 1.7381025856440342 | 0.0 |
| away | off_off_ypp | 4.809153607803687 | 0.0 |
| away | off_pass_epa | -0.100447783306928 | 0.0 |
| away | off_rush_epa | -0.0685470861612117 | 0.0 |
| away | off_rush_success | 0.4183259928146071 | 0.0 |
| away | opponent_drives | 9.235294117647058 | 0.0 |
| away | plays_per_drive | 5.249823868941516 | 0.0 |
| away | pressure_allowed | None | 0.0 |
| away | pressure_generated | None | 0.0 |
| away | pythagorean | 0.22708683353337283 | 0.0 |
| away | qb_backup | None | 0.0 |
| away | qb_career_starts | None | 0.0 |
| away | qb_cpoe | None | 0.0 |
| away | qb_epa | None | 0.0 |
| away | rb_share | 0.21351288125833517 | 0.0 |
| away | redzone_td | 0.35888888888888887 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 252 | 0.0 |
| away | return_points | 1.0588235294117645 | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | season_fg_long | 0.875 | 0.0 |
| away | season_fg_medium | 1.0 | 0.0 |
| away | season_fg_short | 1.0 | 0.0 |
| away | te_share | 0.2003301233716968 | 0.0 |
| away | travel_miles | 757.0367545756321 | 0.0 |
| away | turnover_margin | -1.0 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 19.92228914043722 | 19.92228914043722 |
| home | baseline | 19.92228914043722 | -0.003393877100979359 |
| home | elo | -146.14220254992415 | -1.3381075240884899 |
| home | elo_difference | -6.047671889572939 | -0.059682198044215394 |
| home | calibration_intercept | 1.0 | 2.8883545397390087 |
| home | career_fg_long | None | 0.0 |
| home | career_fg_medium | None | 0.0 |
| home | career_fg_short | None | 0.0 |
| home | close_win_rate | 0.39999999999999997 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 1.099158853618274 | 0.0 |
| home | def_explosive | 0.10545314088717422 | 0.0 |
| home | def_off_ppd | 2.563910664062687 | 0.0 |
| home | def_off_ypp | 5.650817493271019 | 0.0 |
| home | def_pass_epa | 0.17618224583993838 | 0.0 |
| home | def_rush_epa | 0.015261321001051391 | 0.0 |
| home | def_rush_success | 0.43433802616862716 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 9.235294117647058 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.3385869065145381 | 0.0 |
| home | fumble_recovery | 0.34722222222222227 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | -0.25277777777777777 | 0.0 |
| home | momentum | 0.2838355148641159 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | -1.615128669293104 | 0.0 |
| home | off_explosive | 0.09443919231363014 | 0.0 |
| home | off_off_ppd | 1.7781267126992713 | 0.0 |
| home | off_off_ypp | 5.016679427694675 | 0.0 |
| home | off_pass_epa | -0.07097720562464688 | 0.0 |
| home | off_rush_epa | -0.06054554241464738 | 0.0 |
| home | off_rush_success | 0.39574016530299233 | 0.0 |
| home | opponent_drives | 9.117647058823529 | 0.0 |
| home | plays_per_drive | 5.139122315592903 | 0.0 |
| home | pressure_allowed | None | 0.0 |
| home | pressure_generated | None | 0.0 |
| home | pythagorean | 0.2254980804917778 | 0.0 |
| home | qb_backup | None | 0.0 |
| home | qb_career_starts | None | 0.0 |
| home | qb_cpoe | None | 0.0 |
| home | qb_epa | None | 0.0 |
| home | rb_share | 0.16204893093774503 | 0.0 |
| home | redzone_td | 0.5885416666666667 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 252 | 0.0 |
| home | return_points | 1.4117647058823528 | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | season_fg_long | 0.6923076923076924 | 0.0 |
| home | season_fg_medium | 0.7777777777777777 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.2625605680868839 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | -0.4117647058823529 | 0.0 |
| home | wind | None | 0.0 |

Three-week team streaks: []

## RETROSPECTIVE
2 graded games; 0 pending.

| week | scope | games | team_points_mae | margin_mae | total_mae | team_points_sigma | margin_sigma | total_sigma | margin_coverage_50 | margin_coverage_80 | total_coverage_50 | total_coverage_80 | home_bias | total_bias | projected_team_points_sd | actual_team_points_sd | favorite_bias_[-inf,3) | favorite_bias_[3,7) | favorite_bias_[7,14) | favorite_bias_[14,inf) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | week | 2 | 12.474006946341948 | 12.012743413217672 | 21.95321662427476 | 9.691825528478072 | 16.988584656280498 | 8.007740437761939 | 0.5 | 0.5 | 0 | 0.5 | -16.110478403313465 | -21.95321662427476 | 0.9238724747806478 | 7.660776723022281 | -16.110478403313465 | — | — | — |
| 1 | cumulative | 2 | 12.474006946341948 | 12.012743413217672 | 21.95321662427476 | 9.691825528478072 | 16.988584656280498 | 8.007740437761939 | 0.5 | 0.5 | 0 | 0.5 | -16.110478403313465 | -21.95321662427476 | 0.9238724747806478 | 7.660776723022281 | -16.110478403313465 | — | — | — |

### Diagnostic buckets
| Input | Band | Count | Mean error | Standard error | Flag |
|---|---|---|---|---|---|
| divisional | false | 2 | -13.807772094898977 | 0.8725016154327515 | True |
| divisional | true | 2 | -8.14544452937578 | 11.14024179778492 | False |
| dome | unavailable | 4 | -10.97660831213738 | 4.845912764239036 | True |
| elo_difference | [-100,0) | 2 | -5.842738220961294 | 8.837535489370435 | False |
| elo_difference | [0,100) | 2 | -16.110478403313465 | 3.175207923847237 | True |
| luck_index | [-0.5,0.5) | 4 | -10.97660831213738 | 4.845912764239036 | True |
| momentum | [-0.5,0.5) | 4 | -10.97660831213738 | 4.845912764239036 | True |
| projected_margin | [-inf,3) | 4 | -10.97660831213738 | 4.845912764239036 | True |
| rest_days | [14,inf) | 4 | -10.97660831213738 | 4.845912764239036 | True |
| team | LA | 1 | -19.2856863271607 | None | False |
| team | NE | 1 | -14.68027371033173 | None | False |
| team | SEA | 1 | -12.935270479466226 | None | False |
| team | SF | 1 | 2.9947972684091404 | None | False |
| wind | unavailable | 4 | -10.97660831213738 | 4.845912764239036 | True |

### Ten largest game errors

2026_01_NE_SEA · projection-v1-67c39f9a-2e58a851 · team MAE 13.807772094898977
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | fitted_intercept | None | 22.793091537132987 |
| away | off_off_ypp | 6.2174389857132475 | 2.0807605588045304 |
| away | pythagorean | 0.7694492656647884 | 1.2954741335074167 |
| away | off_off_ppd | 2.640463001437451 | 1.117724445683908 |
| away | elo_difference | -68.81369643279459 | -0.777483135115945 |
| away | home_nondivisional | 0.0 | -0.7297638330735802 |
| away | travel_miles | 2484.594834012935 | 0.6815099552238704 |
| away | off_pass_epa | 0.21909763262292775 | -0.5123768865084342 |
| away | off_rush_epa | 0.031001724724862532 | -0.3173461989771569 |
| away | fumble_recovery | 0.6677855209655538 | 0.31168257240926894 |
| away | home_divisional | 0.0 | -0.30957771635417103 |
| away | def_off_ypp | 4.8963423198075935 | -0.2872387666691816 |
| away | def_pass_epa | -0.0737433317363666 | -0.28647205987445723 |
| away | off_explosive | 0.11768149496170982 | -0.28603244653465554 |
| away | elo | 68.09304127980477 | -0.269327973414575 |
| away | te_share | 0.2101624448870111 | 0.23527570319258972 |
| away | redzone_td | 0.7056843707081701 | -0.21117559698211205 |
| away | off_rush_success | 0.4460981503614262 | 0.20171184699751304 |
| away | fg_share | 0.15054903221693358 | 0.19433107176204542 |
| away | plays_per_drive | 6.163938686690542 | 0.18942541640969365 |
| away | def_explosive | 0.08176435955296574 | -0.17081774791074625 |
| away | rest_days | 248.0 | -0.1689382699071038 |
| away | def_rush_success | 0.38373969085136667 | -0.1658786898671802 |
| away | luck_index | 0.3907337257311051 | 0.12946191492566445 |
| away | season_fg_long | 1.0 | 0.10736331756111307 |
| away | off_cpoe | 6.529811621593255 | -0.1045868890578983 |
| away | momentum | 0.3593315515998537 | -0.08306375765247911 |
| away | opponent_drives | 9.364972745743234 | -0.07941104148660409 |
| away | close_win_rate | 0.7229482047655513 | -0.0789344070659701 |
| away | def_rush_epa | -0.09972174879137365 | 0.07768320313288281 |
| away | season_fg_short | 0.8662590889954915 | 0.06910365424699813 |
| away | divisional | 0.0 | 0.06395242685237565 |
| away | drives | 8.842055200306143 | 0.057622666922504444 |
| away | return_points | 1.4820829321617603 | -0.047869241419775464 |
| away | turnover_margin | 0.3280875795981389 | 0.033314250722365414 |
| away | season_fg_medium | 0.621164222887221 | -0.03143858957003033 |
| away | rb_share | 0.17401483456484326 | -0.031187479902830422 |
| away | def_cpoe | -0.6295059213503561 | -0.026960177444651286 |
| away | neutral | 0.0 | 0.018721819415103987 |
| away | baseline | 19.817535731901575 | -0.0161562044585226 |
| away | def_off_ppd | 1.7133581253547772 | 0.014100324676958802 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | continuity | None | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | pressure_allowed | None | 0.0 |
| away | pressure_generated | None | 0.0 |
| away | qb_backup | None | 0.0 |
| away | qb_career_starts | None | 0.0 |
| away | qb_cpoe | None | 0.0 |
| away | qb_epa | None | 0.0 |
| away | referee | None | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | wind | None | 0.0 |
| home | fitted_intercept | None | 22.793091537132987 |
| home | home_nondivisional | 1.0 | 1.618948003222156 |
| home | pythagorean | 0.7839721899929185 | 1.3646148825233777 |
| home | elo_difference | 68.81369643279459 | 0.777483135115945 |
| home | off_off_ypp | 5.7483549873397495 | 0.5890627924197606 |
| home | elo | 136.90673771259935 | -0.5414014895636674 |
| home | off_off_ppd | 2.307958728757817 | 0.47672914699620117 |
| home | home_divisional | 0.0 | -0.30957771635417103 |
| home | def_rush_success | 0.4430546467677715 | 0.2540263120766851 |
| home | redzone_td | 0.5023435473268324 | 0.218067926841451 |
| home | opponent_drives | 8.842055200306143 | -0.21461676506882355 |
| home | travel_miles | 0.0 | -0.1966151644782179 |
| home | fg_share | 0.32924146285959577 | -0.1919085889875862 |
| home | off_rush_epa | -0.004223308897444468 | -0.17357612566092254 |
| home | rest_days | 249.0 | -0.16968659415389456 |
| home | def_pass_epa | -0.01905577584435219 | -0.15818776021886222 |
| home | def_off_ypp | 5.239393356422711 | -0.13943426237004605 |
| home | off_rush_success | 0.4319781673765751 | 0.12845766018457322 |
| home | te_share | 0.2201056042236907 | 0.12716778037958135 |
| home | rb_share | 0.1528429382998132 | -0.12586525206066776 |
| home | off_explosive | 0.10603985534668271 | -0.10489536697902588 |
| home | plays_per_drive | 5.666090756924215 | -0.10246772707356523 |
| home | def_explosive | 0.08949532025084025 | -0.09542554248275806 |
| home | fumble_recovery | 0.5072818262050818 | 0.07669627124622376 |
| home | luck_index | 0.20230539871893827 | 0.07448482509193399 |
| home | close_win_rate | 0.6950235725138565 | -0.0693858944145769 |
| home | return_points | 1.733727211228039 | -0.06466754431153957 |
| home | divisional | 0.0 | 0.06395242685237565 |
| home | momentum | -0.2839312716181876 | 0.06247556736578807 |
| home | off_pass_epa | 0.06734981813926624 | -0.05724717892225349 |
| home | season_fg_long | 0.7877409778363693 | 0.04455243728013957 |
| home | off_cpoe | 2.3334603449470723 | -0.03185352390368266 |
| home | def_cpoe | 1.8154045483047911 | 0.03147488540424394 |
| home | baseline | 19.765791004437354 | -0.0286279291723962 |
| home | season_fg_short | 0.9753332544953286 | -0.026000977636274424 |
| home | drives | 9.364972745743234 | 0.021321148849132884 |
| home | def_rush_epa | -0.03283982767638909 | -0.020393772967807436 |
| home | neutral | 0.0 | 0.018721819415103987 |
| home | season_fg_medium | 0.8508233280823404 | 0.014396693324286003 |
| home | def_off_ppd | 2.034494320253117 | 0.0010657323118471278 |
| home | turnover_margin | 0.0026312450122169366 | 0.0003146722131727309 |
| home | career_fg_long | None | 0.0 |
| home | career_fg_medium | None | 0.0 |
| home | career_fg_short | None | 0.0 |
| home | continuity | None | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | pressure_allowed | None | 0.0 |
| home | pressure_generated | None | 0.0 |
| home | qb_backup | None | 0.0 |
| home | qb_career_starts | None | 0.0 |
| home | qb_cpoe | None | 0.0 |
| home | qb_epa | None | 0.0 |
| home | referee | None | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | wind | None | 0.0 |

2026_01_SF_LA · projection-v1-67c39f9a-2e58a851 · team MAE 11.14024179778492
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | fitted_intercept | None | 22.793091537132987 |
| away | travel_miles | 7872.720048074823 | 2.5858237023977098 |
| away | neutral | 1.0 | -1.0873938378650192 |
| away | off_off_ppd | 2.5844040553588137 | 1.009655094886675 |
| away | home_nondivisional | 0.0 | -0.7297638330735802 |
| away | pythagorean | 0.6169620475981829 | 0.5695128715552389 |
| away | rb_share | 0.28652432812378836 | 0.471939309659321 |
| away | elo_difference | -41.671790585015515 | -0.47082363060637034 |
| away | plays_per_drive | 6.609045507288787 | 0.4503959282510158 |
| away | home_divisional | 0.0 | -0.30957771635417103 |
| away | te_share | 0.2572719145027672 | -0.27692637790999974 |
| away | off_pass_epa | 0.13227711372791523 | -0.2519804023045578 |
| away | off_rush_epa | 0.0077795297855108424 | -0.22256540459119487 |
| away | elo | 55.71005713497925 | -0.22036850442294065 |
| away | baseline | 20.683128945035254 | 0.1924725930525856 |
| away | rest_days | 250.0 | -0.17043491840068534 |
| away | close_win_rate | 0.8701962092169379 | -0.12928419934698146 |
| away | luck_index | 0.37472114916492205 | 0.12478998011465435 |
| away | redzone_td | 0.6633528025533635 | -0.12181552072398577 |
| away | divisional | 1.0 | -0.11137169789916555 |
| away | off_rush_success | 0.4272424212534427 | 0.10388870485546363 |
| away | drives | 8.358037383421347 | 0.09122372253977305 |
| away | fg_share | 0.27773328537679315 | -0.08057482445576188 |
| away | fumble_recovery | 0.5045249399479842 | 0.07266003703211808 |
| away | def_off_ypp | 5.406945846976828 | -0.06724380040615545 |
| away | off_cpoe | 4.0424580731230035 | -0.061474770462071164 |
| away | def_pass_epa | 0.022695992689480728 | -0.06024781211949262 |
| away | def_rush_success | 0.39945051444526897 | -0.05465794781630884 |
| away | momentum | 0.23305115445984517 | -0.05449259964454016 |
| away | def_explosive | 0.09387671188191403 | -0.05269828117341027 |
| away | opponent_drives | 9.470770132263125 | -0.05205603624276024 |
| away | return_points | 0.0 | 0.051065962263554886 |
| away | season_fg_medium | 1.0 | 0.044169320683298506 |
| away | off_off_ypp | 5.5762168068175155 | 0.04165946959291667 |
| away | turnover_margin | -0.2995640251656916 | -0.03032635542585099 |
| away | season_fg_long | 0.7186597432659166 | 0.02411018182245838 |
| away | def_rush_epa | -0.03664816464636141 | -0.014809152075336281 |
| away | def_cpoe | 0.06359827994871256 | -0.010394504359101808 |
| away | off_explosive | 0.09864918315328114 | 0.010099154526151575 |
| away | season_fg_short | 0.9343497211686632 | 0.009733642311967727 |
| away | def_off_ppd | 2.055980093012244 | 0.00019364659241179918 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | continuity | None | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | pressure_allowed | None | 0.0 |
| away | pressure_generated | None | 0.0 |
| away | qb_backup | None | 0.0 |
| away | qb_career_starts | None | 0.0 |
| away | qb_cpoe | None | 0.0 |
| away | qb_epa | None | 0.0 |
| away | referee | None | 0.0 |
| away | schedule_strength | None | 0.0 |
| away | wind | None | 0.0 |
| home | fitted_intercept | None | 22.793091537132987 |
| home | travel_miles | 7928.580691775121 | 2.6055664120598454 |
| home | off_off_ypp | 5.971840701999543 | 1.2997524397598028 |
| home | neutral | 1.0 | -1.0873938378650192 |
| home | off_off_ppd | 2.5943234796155696 | 1.0287775689019054 |
| home | pythagorean | 0.7101311895584029 | 1.013072592363441 |
| home | home_nondivisional | 0.0 | -0.7297638330735802 |
| home | te_share | 0.27630256818461346 | -0.4838389264928896 |
| home | elo_difference | 41.671790585015515 | 0.47082363060637034 |
| home | baseline | 21.534259064287678 | 0.39761543683975864 |
| home | elo | 97.38184771999477 | -0.3851291723775626 |
| home | rb_share | 0.10157011724375602 | -0.3551501686816239 |
| home | def_rush_success | 0.45625146889318824 | 0.3474498261737993 |
| home | opponent_drives | 8.358037383421347 | -0.3397645627084956 |
| home | off_rush_success | 0.47070145025789917 | 0.32935327041598594 |
| home | home_divisional | 0.0 | -0.30957771635417103 |
| home | off_rush_epa | 0.02324495655892661 | -0.28568714820460006 |
| home | fg_share | 0.12279748608194635 | 0.2543154131575122 |
| home | off_pass_epa | 0.11929577531533891 | -0.21304611665506504 |
| home | fumble_recovery | 0.599852902637631 | 0.21222545565552556 |
| home | plays_per_drive | 6.185324521043613 | 0.2019641416751784 |
| home | rest_days | 249.0 | -0.16968659415389456 |
| home | redzone_td | 0.6847303705916592 | -0.16694262546835556 |
| home | off_explosive | 0.10969091314121623 | -0.16170368333825724 |
| home | def_pass_epa | 0.1055264372858632 | 0.13405316553235555 |
| home | def_explosive | 0.08654009356031458 | -0.12424486603715668 |
| home | divisional | 1.0 | -0.11137169789916555 |
| home | def_rush_epa | 0.005970398576838653 | -0.07730585876385071 |
| home | season_fg_short | 0.8619610726371268 | 0.0728512076820154 |
| home | season_fg_long | 0.4567863831370551 | -0.05338238411968575 |
| home | turnover_margin | 0.3944345430313545 | 0.0400414875157329 |
| home | close_win_rate | 0.38029009091601945 | 0.03823366539794586 |
| home | momentum | -0.1514956850722645 | 0.032511787121397025 |
| home | return_points | 0.3922451146012684 | 0.024881968463515494 |
| home | def_cpoe | 1.092524698223222 | 0.014197553577171106 |
| home | drives | 9.470770132263125 | 0.013976576511907052 |
| home | luck_index | -0.019857006446349523 | 0.009665258415735694 |
| home | season_fg_medium | 0.8208118047568673 | 0.008407004125838039 |
| home | def_off_ppd | 2.2370168207030963 | -0.007154450526665646 |
| home | def_off_ypp | 5.574550253364361 | 0.00496902964062764 |
| home | off_cpoe | 0.5514312223640663 | -0.0009664588456149024 |
| home | career_fg_long | None | 0.0 |
| home | career_fg_medium | None | 0.0 |
| home | career_fg_short | None | 0.0 |
| home | continuity | None | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | pressure_allowed | None | 0.0 |
| home | pressure_generated | None | 0.0 |
| home | qb_backup | None | 0.0 |
| home | qb_career_starts | None | 0.0 |
| home | qb_cpoe | None | 0.0 |
| home | qb_epa | None | 0.0 |
| home | referee | None | 0.0 |
| home | schedule_strength | None | 0.0 |
| home | wind | None | 0.0 |

Three-week team streaks: []

## Learning from edits

```json
{
  "rows": [],
  "weekly": [
    {
      "week": null,
      "count": 0,
      "projection_mae": null,
      "ours_mae": null,
      "helped_count": 0
    }
  ],
  "tags": [],
  "excluded": {}
}
```
