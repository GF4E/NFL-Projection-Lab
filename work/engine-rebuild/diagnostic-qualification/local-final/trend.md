# Season error trend

actual minus projected. 2016–2025 adaptive OOF; coverage excludes 2016 (no prior residuals).

REVIEW REQUESTED — Tier 2: bucket standard errors cluster both teams by game; alternative independent-team standard errors understate uncertainty when errors correlate. Flags remain exploratory, not gates.
REVIEW REQUESTED — Tier 2: conflicting latest edits at the same instant are excluded as ambiguous; alternative server sequence numbers are unavailable. No input-order tie-break or older-edit fallback.

## AS_ISSUED
30 graded games; 16 pending; 0 final cards need immutable first grades.

| week | scope | games | team_points_mae | margin_mae | total_mae | team_points_sigma | margin_sigma | total_sigma | margin_coverage_50 | margin_coverage_80 | total_coverage_50 | total_coverage_80 | home_bias | total_bias | projected_team_points_sd | actual_team_points_sd | favorite_bias_[-inf,3) | favorite_bias_[3,7) | favorite_bias_[7,14) | favorite_bias_[14,inf) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | week | 14 | 8.427663604561916 | 11.602647455761675 | 12.106675023932477 | 10.444043572793632 | 13.596230067716101 | 16.330911440921003 | 0.42857142857142855 | 0.7857142857142857 | 0.42857142857142855 | 0.9285714285714286 | 4.051335273532272 | 6.9079002454371485 | 1.9770869360742034 | 10.837623431022738 | -0.34965503170772794 | 13.234228182639809 | 7.657875544377649 | — |
| 1 | cumulative | 14 | 8.427663604561916 | 11.602647455761675 | 12.106675023932477 | 10.444043572793632 | 13.596230067716101 | 16.330911440921003 | 0.42857142857142855 | 0.7857142857142857 | 0.42857142857142855 | 0.9285714285714286 | 4.051335273532272 | 6.9079002454371485 | 1.9770869360742034 | 10.837623431022738 | -0.34965503170772794 | 13.234228182639809 | 7.657875544377649 | — |
| 2 | week | 16 | 8.836376140888 | 12.389271501554912 | 12.345573656114901 | 10.405115207815165 | 15.045753478509855 | 14.818886963008383 | 0.3125 | 0.8125 | 0.5 | 0.8125 | -3.5919377860080917 | -5.987355464774765 | 2.8356919640354015 | 10.463431484818926 | -5.036551944388351 | -7.886186656752293 | 3.2217228221958947 | — |
| 2 | cumulative | 30 | 8.645643623935827 | 12.022180280184735 | 12.234087627763103 | 10.83166533139144 | 14.192596439814318 | 16.61188614838374 | 0.36666666666666664 | 0.8 | 0.4666666666666667 | 0.8666666666666667 | -0.02507702488925515 | 0.030430533324127394 | 2.4826645165074996 | 11.052136545583492 | -2.2795537604585725 | -0.8460483769549261 | 4.330761002741333 | — |
| 3 | week | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 3 | cumulative | 30 | 8.645643623935827 | 12.022180280184735 | 12.234087627763103 | 10.83166533139144 | 14.192596439814318 | 16.61188614838374 | 0.36666666666666664 | 0.8 | 0.4666666666666667 | 0.8666666666666667 | -0.02507702488925515 | 0.030430533324127394 | 2.4826645165074996 | 11.052136545583492 | -2.2795537604585725 | -0.8460483769549261 | 4.330761002741333 | — |

### Diagnostic buckets
| Input | Band | Team observations | Games | Mean error | Game-cluster standard error | Flag |
|---|---|---|---|---|---|---|
| divisional | false | 22 | 11 | -2.2304125125342007 | 2.126124107840487 | False |
| divisional | true | 14 | 7 | -3.8060008513594403 | 2.7619940147408664 | False |
| divisional | unavailable | 24 | 12 | 4.302750133104517 | 2.4691235025434124 | False |
| dome | false | 24 | 12 | -2.450701101680881 | 2.2576232192929537 | False |
| dome | true | 4 | 2 | -3.48303619602864 | 2.042732096984593 | False |
| dome | unavailable | 32 | 16 | 2.3019339757556105 | 2.1779490350524533 | False |
| elo_difference | [-100,0) | 16 | 16 | 0.7094722635819355 | 2.821050467135796 | False |
| elo_difference | [-inf,-100) | 10 | 10 | -1.1294282746263857 | 2.708717665008865 | False |
| elo_difference | [0,100) | 16 | 16 | -0.076266469486993 | 3.639888605592531 | False |
| elo_difference | [100,inf) | 10 | 10 | -1.2139839650978606 | 2.499370236639447 | False |
| elo_difference | unavailable | 8 | 4 | 1.7769682114309013 | 2.6203427545956983 | False |
| luck_index | [-0.5,0.5) | 35 | 18 | -3.019176102837467 | 1.688497989941061 | False |
| luck_index | [-inf,-0.5) | 1 | 1 | 3.31807640452676 | None | False |
| luck_index | unavailable | 24 | 12 | 4.302750133104517 | 2.4691235025434124 | False |
| momentum | [-0.5,0.5) | 28 | 17 | -3.795116170715304 | 2.00716669152706 | False |
| momentum | [-inf,-0.5) | 4 | 3 | 5.480202189429007 | 3.0796275200731764 | False |
| momentum | [0.5,inf) | 4 | 4 | -4.502660793118025 | 3.530585337278912 | False |
| momentum | unavailable | 24 | 12 | 4.302750133104517 | 2.4691235025434124 | False |
| projected_margin | [-inf,3) | 34 | 17 | -0.22210950677884966 | 2.0083551434282505 | False |
| projected_margin | [3,7) | 18 | 9 | 0.7357859847525783 | 3.491940127474287 | False |
| projected_margin | [7,14) | 8 | 4 | -0.5974385619177114 | 1.2412448278073338 | False |
| rest_days | [-inf,6) | 2 | 1 | 9.764610222064288 | None | False |
| rest_days | [14,inf) | 4 | 2 | -1.6388499395970806 | 0.8673393823004996 | False |
| rest_days | [6,8) | 25 | 14 | -4.501548087224675 | 2.0862892265698374 | True |
| rest_days | [8,14) | 5 | 4 | -0.5576411399815896 | 3.3810412265821257 | False |
| rest_days | unavailable | 24 | 12 | 4.302750133104517 | 2.4691235025434124 | False |
| team | ARI | 2 | 2 | -3.6327939899792927 | 7.964939290389035 | False |
| team | ATL | 2 | 2 | -14.735627172099443 | 6.459512507927071 | True |
| team | BAL | 2 | 2 | 3.5284998777558254 | 13.299390244556802 | False |
| team | BUF | 2 | 2 | 12.357056148439487 | 1.0702139176430698 | True |
| team | CAR | 2 | 2 | 14.495563588442808 | 1.8892119035173263 | True |
| team | CHI | 2 | 2 | 6.262410264110727 | 27.547119802414706 | False |
| team | CIN | 2 | 2 | 3.178121677047887 | 5.981994934899095 | False |
| team | CLE | 2 | 2 | -3.3430463435766598 | 5.7006382579819075 | False |
| team | DAL | 2 | 2 | 4.402657534248641 | 9.263755053368564 | False |
| team | DEN | 2 | 2 | -7.67749318728286 | 5.335110491586697 | False |
| team | DET | 2 | 2 | 5.6366117948582275 | 0.4653385831877923 | True |
| team | GB | 2 | 2 | -2.113583996626284 | 2.9573768460749417 | False |
| team | HOU | 2 | 2 | -6.935293113280077 | 13.544695499038907 | False |
| team | IND | 2 | 2 | 4.0553341366145474 | 4.114927281468077 | False |
| team | JAX | 2 | 2 | -2.213456020836702 | 9.871331565214351 | False |
| team | KC | 2 | 2 | 8.149665341783516 | 0.1494403067091188 | True |
| team | LA | 1 | 1 | 3.0141914916987638 | None | False |
| team | LAC | 2 | 2 | -10.018232936505607 | 0.22433945956422896 | True |
| team | LV | 2 | 2 | 7.358149087534876 | 0.4448638086815926 | True |
| team | MIA | 2 | 2 | -6.99652043072123 | 1.846030435889844 | True |
| team | MIN | 2 | 2 | 0.6224760347894058 | 16.865516358882488 | False |
| team | NE | 1 | 1 | -4.057554824065974 | None | False |
| team | NO | 2 | 2 | 6.254635433887172 | 3.338122446716861 | False |
| team | NYG | 2 | 2 | -5.373825836599234 | 8.691902241125995 | False |
| team | NYJ | 2 | 2 | -0.23957318652633752 | 2.309210157407291 | False |
| team | PHI | 2 | 2 | -0.9669179869366253 | 1.6887992566601824 | False |
| team | PIT | 2 | 2 | -11.701102788101313 | 7.816790994491921 | False |
| team | SEA | 1 | 1 | 3.6015714987504914 | None | False |
| team | SF | 1 | 1 | 8.719314211434 | None | False |
| team | TB | 2 | 2 | -1.0311284310429283 | 4.184449702407031 | False |
| team | TEN | 2 | 2 | -3.8600523552456423 | 7.5494077256968986 | False |
| team | WAS | 2 | 2 | -0.6448363331996116 | 2.7568805778574106 | False |
| wind | [-inf,10) | 34 | 17 | -0.33378933721741894 | 2.3213517243568305 | False |
| wind | [10,20) | 2 | 1 | -2.5061893218975797 | None | False |
| wind | unavailable | 24 | 12 | 0.719755504537968 | 1.9858744788633016 | False |

Input coverage: {'divisional': {'INSUFFICIENT': 24, 'ORIGINAL_ACTIVE_FIELD': 36}, 'dome': {'INSUFFICIENT': 32, 'ORIGINAL_EXPLICIT_ROOF': 28}, 'elo_difference': {'INSUFFICIENT': 8, 'ORIGINAL_ACTIVE_CONTRIBUTION': 16, 'ORIGINAL_ACTIVE_FIELD': 36}, 'luck_index': {'INSUFFICIENT': 24, 'ORIGINAL_ACTIVE_FIELD': 36}, 'momentum': {'INSUFFICIENT': 24, 'ORIGINAL_ACTIVE_FIELD': 36}, 'rest_days': {'INSUFFICIENT': 24, 'ORIGINAL_ACTIVE_FIELD': 36}, 'wind': {'INSUFFICIENT': 24, 'ORIGINAL_PRELOCK_FORECAST': 36}}
Flags require two distinct games and qualified input; exploratory and not multiplicity-adjusted.

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

2026_02_MIN_CHI · projection-v2.hfa1.w2 · team MAE 18.76387493119853
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 21.81700789813218 | 21.81700789813218 |
| away | baseline | 21.81700789813218 | -0.38357449874376665 |
| away | elo | 75.73707631823982 | 0.6953345840074167 |
| away | elo_difference | 21.45873683666764 | 0.21624518196772252 |
| away | calibration_intercept | 1.0 | 2.8980271587295334 |
| away | career_fg_long | 0.7916666666666666 | 0.0 |
| away | career_fg_medium | 0.8571428571428571 | 0.0 |
| away | career_fg_short | 0.9655172413793104 | 0.0 |
| away | close_win_rate | 0.5714285714285714 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | 1.874309571284631 | 0.0 |
| away | def_explosive | 0.1069126400946205 | 0.0 |
| away | def_off_ppd | 2.2901231853344 | 0.0 |
| away | def_off_ypp | 5.893673259364365 | 0.0 |
| away | def_pass_epa | 0.05114334606731052 | 0.0 |
| away | def_rush_epa | 0.002469624288041197 | 0.0 |
| away | def_rush_success | 0.4436526600142235 | 0.0 |
| away | divisional | 1.0 | 0.0 |
| away | drives | 9.341176470588236 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.29824884462730467 | 0.0 |
| away | fumble_recovery | 0.5346320346320347 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | 0.10606060606060608 | 0.0 |
| away | momentum | 0.21525805922637667 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | -1.3687730598103238 | 0.0 |
| away | off_explosive | 0.08814195137302963 | 0.0 |
| away | off_off_ppd | 2.1838108830401106 | 0.0 |
| away | off_off_ypp | 5.093039654324061 | 0.0 |
| away | off_pass_epa | -0.047633612903798285 | 0.0 |
| away | off_rush_epa | -0.02184850556172894 | 0.0 |
| away | off_rush_success | 0.4181883539939666 | 0.0 |
| away | opponent_drives | 10.16470588235294 | 0.0 |
| away | plays_per_drive | 5.394835230129348 | 0.0 |
| away | pressure_allowed | 0.30978494623655917 | 0.0 |
| away | pressure_generated | 0.3016138673042439 | 0.0 |
| away | pythagorean | 0.6041028622408637 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 89.0 | 0.0 |
| away | qb_cpoe | 0.22567432474445637 | 0.0 |
| away | qb_epa | -0.0037040247770371293 | 0.0 |
| away | rb_share | 0.1532961662478738 | 0.0 |
| away | redzone_td | 0.5772549019607843 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 7 | 0.0 |
| away | return_points | 0.5647058823529412 | 0.0 |
| away | schedule_strength | -0.00826577782518223 | 0.0 |
| away | season_fg_long | 0.8333333333333334 | 0.0 |
| away | season_fg_medium | 1.0 | 0.0 |
| away | season_fg_short | 1.0 | 0.0 |
| away | te_share | 0.24683207094294804 | 0.0 |
| away | travel_miles | 355.3086580162774 | 0.0 |
| away | turnover_margin | 0.15294117647058825 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 21.40554291979176 | 21.40554291979176 |
| home | baseline | 21.40554291979176 | -0.3010010813960567 |
| home | elo | 54.278339481572175 | 0.49838572314646495 |
| home | elo_difference | -21.45873683666764 | -0.21624518196772252 |
| home | calibration_intercept | 1.0 | 2.8980271587295334 |
| home | career_fg_long | 0.6666666666666666 | 0.0 |
| home | career_fg_medium | 0.7941176470588235 | 0.0 |
| home | career_fg_short | 0.9532163742690059 | 0.0 |
| home | close_win_rate | 0.6363636363636365 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | -2.9795891303521995 | 0.0 |
| home | def_explosive | 0.0928698799989443 | 0.0 |
| home | def_off_ppd | 1.944866908958524 | 0.0 |
| home | def_off_ypp | 5.214540902078313 | 0.0 |
| home | def_pass_epa | -0.06207459150979298 | 0.0 |
| home | def_rush_epa | -0.054821590729992924 | 0.0 |
| home | def_rush_success | 0.4254226536141801 | 0.0 |
| home | divisional | 1.0 | 0.0 |
| home | drives | 10.16470588235294 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.1960148702235109 | 0.0 |
| home | fumble_recovery | 0.6666666666666666 | 0.0 |
| home | home_divisional | 1.0 | 0.0 |
| home | home_nondivisional | 0.0 | 0.0 |
| home | luck_index | 0.3030303030303031 | 0.0 |
| home | momentum | 0.08619792113813922 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | 0.2297276695453246 | 0.0 |
| home | off_explosive | 0.10769360805802738 | 0.0 |
| home | off_off_ppd | 2.444689540214695 | 0.0 |
| home | off_off_ypp | 5.87689901268329 | 0.0 |
| home | off_pass_epa | 0.11516122033382506 | 0.0 |
| home | off_rush_epa | 0.06876871967215174 | 0.0 |
| home | off_rush_success | 0.46833254429450194 | 0.0 |
| home | opponent_drives | 9.341176470588236 | 0.0 |
| home | plays_per_drive | 5.914570919276802 | 0.0 |
| home | pressure_allowed | 0.13564716312056735 | 0.0 |
| home | pressure_generated | 0.18889236872324877 | 0.0 |
| home | pythagorean | 0.6105125779502454 | 0.0 |
| home | qb_backup | 0.0 | 0.0 |
| home | qb_career_starts | 37.0 | 0.0 |
| home | qb_cpoe | -0.7079933877704905 | 0.0 |
| home | qb_epa | 0.19057698758682723 | 0.0 |
| home | rb_share | 0.1472635987165487 | 0.0 |
| home | redzone_td | 0.7443137254901961 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 7 | 0.0 |
| home | return_points | 0.5647058823529412 | 0.0 |
| home | schedule_strength | -0.37545903412416815 | 0.0 |
| home | season_fg_long | 0.6666666666666666 | 0.0 |
| home | season_fg_medium | 0.8356164383561643 | 0.0 |
| home | season_fg_short | 0.9411764705882353 | 0.0 |
| home | te_share | 0.24181921040912133 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.7529411764705882 | 0.0 |
| home | wind | None | 0.0 |

2026_02_CAR_ATL · projection-v2.hfa1.w2 · team MAE 16.900745682476
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 19.871140877879593 | 19.871140877879593 |
| away | baseline | 19.871140877879593 | 0.006925052918022715 |
| away | elo | -94.50731763180625 | -0.8671730189159397 |
| away | elo_difference | -51.13214963133851 | -0.5152717555366918 |
| away | calibration_intercept | 1.0 | 2.8980271587295334 |
| away | career_fg_long | 0.4 | 0.0 |
| away | career_fg_medium | 0.9090909090909091 | 0.0 |
| away | career_fg_short | 0.9333333333333333 | 0.0 |
| away | close_win_rate | 0.7 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -1.0820441151808429 | 0.0 |
| away | def_explosive | 0.09248200485224548 | 0.0 |
| away | def_off_ppd | 2.029278888332385 | 0.0 |
| away | def_off_ypp | 5.22857391177217 | 0.0 |
| away | def_pass_epa | -0.025992220169000164 | 0.0 |
| away | def_rush_epa | -0.027488301339244084 | 0.0 |
| away | def_rush_success | 0.4173595511870358 | 0.0 |
| away | divisional | 1.0 | 0.0 |
| away | drives | 9.16470588235294 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.19216163345860468 | 0.0 |
| away | fumble_recovery | 0.361038961038961 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | 0.06103896103896095 | 0.0 |
| away | momentum | -0.0807918373717716 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 0.3468214408278851 | 0.0 |
| away | off_explosive | 0.09235138182929707 | 0.0 |
| away | off_off_ppd | 2.0604232293910187 | 0.0 |
| away | off_off_ypp | 5.404314236485093 | 0.0 |
| away | off_pass_epa | -0.009046537598050748 | 0.0 |
| away | off_rush_epa | -0.011262412840324362 | 0.0 |
| away | off_rush_success | 0.43594307478127997 | 0.0 |
| away | opponent_drives | 10.270588235294117 | 0.0 |
| away | plays_per_drive | 5.71918173329938 | 0.0 |
| away | pressure_allowed | 0.20307656985420736 | 0.0 |
| away | pressure_generated | 0.15486111111111112 | 0.0 |
| away | pythagorean | 0.3304744067503932 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 46.0 | 0.0 |
| away | qb_cpoe | 0.5352275236749091 | 0.0 |
| away | qb_epa | -0.009572894323884255 | 0.0 |
| away | rb_share | 0.18516637846990996 | 0.0 |
| away | redzone_td | 0.6256582633053221 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 7 | 0.0 |
| away | return_points | 0.5647058823529412 | 0.0 |
| away | schedule_strength | 0.1545663548802949 | 0.0 |
| away | season_fg_long | 0.5 | 0.0 |
| away | season_fg_medium | 0.9183673469387756 | 0.0 |
| away | season_fg_short | 0.9333333333333335 | 0.0 |
| away | te_share | 0.2290598011562497 | 0.0 |
| away | travel_miles | 226.13456436316946 | 0.0 |
| away | turnover_margin | -0.1411764705882353 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 21.499597681080953 | 21.499597681080953 |
| home | baseline | 21.499597681080953 | -0.3198761338702587 |
| home | elo | -43.37516800046774 | -0.3978807814504047 |
| home | elo_difference | 51.13214963133851 | 0.5152717555366918 |
| home | calibration_intercept | 1.0 | 2.8980271587295334 |
| home | career_fg_long | 0.6875 | 0.0 |
| home | career_fg_medium | 0.7701863354037267 | 0.0 |
| home | career_fg_short | 0.9386281588447654 | 0.0 |
| home | close_win_rate | 0.3508771929824561 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 2.3648402395053134 | 0.0 |
| home | def_explosive | 0.09680593633887215 | 0.0 |
| home | def_off_ppd | 2.435882263515187 | 0.0 |
| home | def_off_ypp | 5.809992078962915 | 0.0 |
| home | def_pass_epa | 0.12115194302665455 | 0.0 |
| home | def_rush_epa | 0.03994932240262893 | 0.0 |
| home | def_rush_success | 0.42954572621929427 | 0.0 |
| home | divisional | 1.0 | 0.0 |
| home | drives | 10.270588235294117 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.31895971778734905 | 0.0 |
| home | fumble_recovery | 0.5037037037037038 | 0.0 |
| home | home_divisional | 1.0 | 0.0 |
| home | home_nondivisional | 0.0 | 0.0 |
| home | luck_index | -0.14541910331384011 | 0.0 |
| home | momentum | 0.06221594360893757 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | -1.5356169013462564 | 0.0 |
| home | off_explosive | 0.09802061300053015 | 0.0 |
| home | off_off_ppd | 1.9889744020825884 | 0.0 |
| home | off_off_ypp | 5.402216698077477 | 0.0 |
| home | off_pass_epa | -0.03136848083974036 | 0.0 |
| home | off_rush_epa | -0.027371816619136007 | 0.0 |
| home | off_rush_success | 0.42995741110387264 | 0.0 |
| home | opponent_drives | 9.16470588235294 | 0.0 |
| home | plays_per_drive | 5.5459426847662145 | 0.0 |
| home | pressure_allowed | 0.20427664079040225 | 0.0 |
| home | pressure_generated | 0.23199191102123357 | 0.0 |
| home | pythagorean | 0.3981547810305586 | 0.0 |
| home | qb_backup | 1.0 | 0.0 |
| home | qb_career_starts | 12.0 | 0.0 |
| home | qb_cpoe | -2.5317432009615004 | 0.0 |
| home | qb_epa | 0.049744229485943946 | 0.0 |
| home | rb_share | 0.294081561329417 | 0.0 |
| home | redzone_td | 0.7061728395061729 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 7 | 0.0 |
| home | return_points | 0.2823529411764706 | 0.0 |
| home | schedule_strength | 0.12165695204487337 | 0.0 |
| home | season_fg_long | 0.6282051282051281 | 0.0 |
| home | season_fg_medium | 0.6951219512195123 | 0.0 |
| home | season_fg_short | 0.846153846153846 | 0.0 |
| home | te_share | 0.21313864283232503 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | -0.011764705882352955 | 0.0 |
| home | wind | None | 0.0 |

2026_02_PIT_NE · projection-v2.hfa1.w2 · team MAE 11.787724303329604
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 19.29367835020052 | 19.29367835020052 |
| away | baseline | 19.29367835020052 | 0.12281111081055592 |
| away | elo | 41.840162850356364 | 0.38422780521537014 |
| away | elo_difference | -17.946417607508693 | -0.18085064236274573 |
| away | calibration_intercept | 1.0 | 2.8980271587295334 |
| away | career_fg_long | 0.8125 | 0.0 |
| away | career_fg_medium | 0.8166666666666667 | 0.0 |
| away | career_fg_short | 0.9497206703910615 | 0.0 |
| away | close_win_rate | 0.7894736842105262 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | 1.7215390720107475 | 0.0 |
| away | def_explosive | 0.09424171325010886 | 0.0 |
| away | def_off_ppd | 2.005533391404601 | 0.0 |
| away | def_off_ypp | 5.396371054509655 | 0.0 |
| away | def_pass_epa | 0.02167797425995424 | 0.0 |
| away | def_rush_epa | -0.023907057189985474 | 0.0 |
| away | def_rush_success | 0.42809451442476076 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 9.752941176470587 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.24453791051188925 | 0.0 |
| away | fumble_recovery | 0.39125683060109284 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | 0.18073051481161906 | 0.0 |
| away | momentum | 0.05150836059289184 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 0.31787637436334504 | 0.0 |
| away | off_explosive | 0.08733284928289989 | 0.0 |
| away | off_off_ppd | 2.130564111160454 | 0.0 |
| away | off_off_ypp | 5.30074733884789 | 0.0 |
| away | off_pass_epa | 0.004315696816287247 | 0.0 |
| away | off_rush_epa | -0.006643862593947124 | 0.0 |
| away | off_rush_success | 0.42048838525242294 | 0.0 |
| away | opponent_drives | 8.905882352941177 | 0.0 |
| away | plays_per_drive | 5.6259691942044885 | 0.0 |
| away | pressure_allowed | 0.1780543727481166 | 0.0 |
| away | pressure_generated | 0.24860883797054012 | 0.0 |
| away | pythagorean | 0.5508196615961753 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 280.0 | 0.0 |
| away | qb_cpoe | -0.17470217066499263 | 0.0 |
| away | qb_epa | -0.05141246894093053 | 0.0 |
| away | rb_share | 0.2631374842932577 | 0.0 |
| away | redzone_td | 0.6262745098039215 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 7 | 0.0 |
| away | return_points | 1.7647058823529413 | 0.0 |
| away | schedule_strength | -0.04030448624979677 | 0.0 |
| away | season_fg_long | 0.631578947368421 | 0.0 |
| away | season_fg_medium | 0.9298245614035087 | 0.0 |
| away | season_fg_short | 0.8490566037735849 | 0.0 |
| away | te_share | 0.2845716080534954 | 0.0 |
| away | travel_miles | 468.23114398701495 | 0.0 |
| away | turnover_margin | 0.7647058823529411 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 20.561317071576376 | 20.561317071576376 |
| home | baseline | 20.561317071576376 | -0.13158055481423092 |
| home | elo | 59.78658045786506 | 0.5489405062115508 |
| home | elo_difference | 17.946417607508693 | 0.18085064236274573 |
| home | calibration_intercept | 1.0 | 2.8980271587295334 |
| home | career_fg_long | 0.8333333333333334 | 0.0 |
| home | career_fg_medium | 0.5833333333333334 | 0.0 |
| home | career_fg_short | 0.9523809523809523 | 0.0 |
| home | close_win_rate | 0.49122807017543857 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | -1.1758321325548082 | 0.0 |
| home | def_explosive | 0.09501377698824914 | 0.0 |
| home | def_off_ppd | 2.0089071591155805 | 0.0 |
| home | def_off_ypp | 5.291369633477842 | 0.0 |
| home | def_pass_epa | -0.0259303462039674 | 0.0 |
| home | def_rush_epa | -0.021577461354541215 | 0.0 |
| home | def_rush_success | 0.41688365291349394 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 8.905882352941177 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.1852847094397123 | 0.0 |
| home | fumble_recovery | 0.7255555555555557 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | 0.2167836257309943 | 0.0 |
| home | momentum | 0.5487925563204578 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | 5.64813537712637 | 0.0 |
| home | off_explosive | 0.105950523313987 | 0.0 |
| home | off_off_ppd | 2.3989413934291672 | 0.0 |
| home | off_off_ypp | 5.891081007570868 | 0.0 |
| home | off_pass_epa | 0.18623916714058902 | 0.0 |
| home | off_rush_epa | 0.0027443419139654528 | 0.0 |
| home | off_rush_success | 0.4277003963194983 | 0.0 |
| home | opponent_drives | 9.752941176470587 | 0.0 |
| home | plays_per_drive | 6.456446821152704 | 0.0 |
| home | pressure_allowed | 0.22464745554874316 | 0.0 |
| home | pressure_generated | 0.23024209857283182 | 0.0 |
| home | pythagorean | 0.6962443988862081 | 0.0 |
| home | qb_backup | 0.0 | 0.0 |
| home | qb_career_starts | 34.0 | 0.0 |
| home | qb_cpoe | 7.0966564344550696 | 0.0 |
| home | qb_epa | 0.20166842827232515 | 0.0 |
| home | rb_share | 0.19664036386933603 | 0.0 |
| home | redzone_td | 0.6419607843137255 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 11 | 0.0 |
| home | return_points | 1.4117647058823528 | 0.0 |
| home | schedule_strength | 0.5727837268046438 | 0.0 |
| home | season_fg_long | 1.0 | 0.0 |
| home | season_fg_medium | 0.6 | 0.0 |
| home | season_fg_short | 0.9333333333333335 | 0.0 |
| home | te_share | 0.1948079644904533 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | -0.4588235294117648 | 0.0 |
| home | wind | None | 0.0 |

2026_02_CIN_HOU · projection-v2.hfa1.w2 · team MAE 11.641930935085096
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 20.993684110247806 | 20.993684110247806 |
| away | baseline | 20.993684110247806 | -0.2183486294037332 |
| away | elo | -3.895626270401408 | -0.0355364910929842 |
| away | elo_difference | -82.75595068224925 | -0.8339528906294137 |
| away | calibration_intercept | 1.0 | 2.8980271587295334 |
| away | career_fg_long | 0.7083333333333334 | 0.0 |
| away | career_fg_medium | 0.8085106382978723 | 0.0 |
| away | career_fg_short | 0.9859154929577465 | 0.0 |
| away | close_win_rate | 0.5918367346938777 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -0.5975580640777632 | 0.0 |
| away | def_explosive | 0.09515171236713427 | 0.0 |
| away | def_off_ppd | 2.0300397288683856 | 0.0 |
| away | def_off_ypp | 5.406618539479939 | 0.0 |
| away | def_pass_epa | 0.027013827198465463 | 0.0 |
| away | def_rush_epa | -0.04813905975088741 | 0.0 |
| away | def_rush_success | 0.40280901306025885 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 9.141176470588235 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.24819461630634884 | 0.0 |
| away | fumble_recovery | 0.5786163522012578 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | 0.1704530868951355 | 0.0 |
| away | momentum | 0.7388865802875161 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 0.9356509315511348 | 0.0 |
| away | off_explosive | 0.08875174015360675 | 0.0 |
| away | off_off_ppd | 2.25953514942744 | 0.0 |
| away | off_off_ypp | 5.399433543755528 | 0.0 |
| away | off_pass_epa | -0.008104872087125209 | 0.0 |
| away | off_rush_epa | 0.03835721824017833 | 0.0 |
| away | off_rush_success | 0.44131077571034527 | 0.0 |
| away | opponent_drives | 10.435294117647059 | 0.0 |
| away | plays_per_drive | 5.892727272727273 | 0.0 |
| away | pressure_allowed | 0.19389718076285242 | 0.0 |
| away | pressure_generated | 0.20686762778505902 | 0.0 |
| away | pythagorean | 0.44658279041755 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 85.0 | 0.0 |
| away | qb_cpoe | 4.133212949688497 | 0.0 |
| away | qb_epa | 0.05113099178646483 | 0.0 |
| away | rb_share | 0.19122406822781993 | 0.0 |
| away | redzone_td | 0.6721461187214611 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 7 | 0.0 |
| away | return_points | 1.7647058823529413 | 0.0 |
| away | schedule_strength | -0.11585547161449172 | 0.0 |
| away | season_fg_long | 0.8709677419354838 | 0.0 |
| away | season_fg_medium | 1.0 | 0.0 |
| away | season_fg_short | 1.0 | 0.0 |
| away | te_share | 0.23895757507995663 | 0.0 |
| away | travel_miles | 897.8793694668212 | 0.0 |
| away | turnover_margin | 0.6000000000000001 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 22.555856479630393 | 22.555856479630393 |
| home | baseline | 22.555856479630393 | -0.531847755250036 |
| home | elo | 78.86032441184784 | 0.7239998385796781 |
| home | elo_difference | 82.75595068224925 | 0.8339528906294137 |
| home | calibration_intercept | 1.0 | 2.8980271587295334 |
| home | career_fg_long | 0.7333333333333333 | 0.0 |
| home | career_fg_medium | 0.8311688311688312 | 0.0 |
| home | career_fg_short | 0.9556962025316456 | 0.0 |
| home | close_win_rate | 0.42105263157894735 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 1.7590454713637822 | 0.0 |
| home | def_explosive | 0.1021126605499934 | 0.0 |
| home | def_off_ppd | 2.3751277639923822 | 0.0 |
| home | def_off_ypp | 5.785546492124024 | 0.0 |
| home | def_pass_epa | 0.05119911912979437 | 0.0 |
| home | def_rush_epa | 0.02686732659305989 | 0.0 |
| home | def_rush_success | 0.4447943931262305 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 10.435294117647059 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.33170196885328085 | 0.0 |
| home | fumble_recovery | 0.3926940639269406 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | -0.18625330449411204 | 0.0 |
| home | momentum | -0.02714700006656574 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | 0.41578247360020204 | 0.0 |
| home | off_explosive | 0.09168248124396393 | 0.0 |
| home | off_off_ppd | 2.2336409878551744 | 0.0 |
| home | off_off_ypp | 5.373943692355623 | 0.0 |
| home | off_pass_epa | 0.06543302255801117 | 0.0 |
| home | off_rush_epa | -0.030667191198124215 | 0.0 |
| home | off_rush_success | 0.41143137618713455 | 0.0 |
| home | opponent_drives | 9.141176470588235 | 0.0 |
| home | plays_per_drive | 5.983590396531573 | 0.0 |
| home | pressure_allowed | 0.1966361507345114 | 0.0 |
| home | pressure_generated | 0.2158829676071055 | 0.0 |
| home | pythagorean | 0.6044238385506333 | 0.0 |
| home | qb_backup | 0.0 | 0.0 |
| home | qb_career_starts | 53.0 | 0.0 |
| home | qb_cpoe | -0.3191551161529672 | 0.0 |
| home | qb_epa | 0.05632482982602575 | 0.0 |
| home | rb_share | 0.12985106692237727 | 0.0 |
| home | redzone_td | 0.5631372549019608 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 7 | 0.0 |
| home | return_points | 1.1294117647058823 | 0.0 |
| home | schedule_strength | 0.34237049378135787 | 0.0 |
| home | season_fg_long | 0.7681159420289855 | 0.0 |
| home | season_fg_medium | 1.0 | 0.0 |
| home | season_fg_short | 1.0 | 0.0 |
| home | te_share | 0.26398329439069623 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.07058823529411762 | 0.0 |
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

2026_02_DET_BUF · projection-v2.w2 · team MAE 9.764610222064288
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 22.54236301514563 | 22.54236301514563 |
| away | baseline | 22.54236301514563 | -0.530823241750882 |
| away | elo | 63.30772768541942 | 0.5767032218976283 |
| away | elo_difference | -58.44493951137156 | -0.5882205320679286 |
| away | calibration_intercept | 1.0 | 2.8980271587295334 |
| away | career_fg_long | 0.5882352941176471 | 0.0 |
| away | career_fg_medium | 0.8421052631578947 | 0.0 |
| away | career_fg_short | 1.0 | 0.0 |
| away | close_win_rate | 0.5555555555555556 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -1.3927316206835396 | 0.0 |
| away | def_explosive | 0.10285027614064696 | 0.0 |
| away | def_off_ppd | 2.231259114413561 | 0.0 |
| away | def_off_ypp | 5.339076034518982 | 0.0 |
| away | def_pass_epa | -0.022469569428649146 | 0.0 |
| away | def_rush_epa | 0.041574473479795114 | 0.0 |
| away | def_rush_success | 0.4437968584154437 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 10.423529411764706 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.15825124006828967 | 0.0 |
| away | fumble_recovery | 0.3008658008658009 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.14357864357864353 | 0.0 |
| away | momentum | -0.4417584259129906 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 1.4025625498621306 | 0.0 |
| away | off_explosive | 0.10109488998336796 | 0.0 |
| away | off_off_ppd | 2.317348259562412 | 0.0 |
| away | off_off_ypp | 5.7009599745386526 | 0.0 |
| away | off_pass_epa | 0.09936202647712836 | 0.0 |
| away | off_rush_epa | -0.022484320691586478 | 0.0 |
| away | off_rush_success | 0.4241850529517863 | 0.0 |
| away | opponent_drives | 9.4 | 0.0 |
| away | plays_per_drive | 5.8392445463033695 | 0.0 |
| away | pressure_allowed | 0.24319069525214826 | 0.0 |
| away | pressure_generated | 0.21128936423054073 | 0.0 |
| away | pythagorean | 0.5737935607325313 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 161.0 | 0.0 |
| away | qb_cpoe | 1.0876805410301638 | 0.0 |
| away | qb_epa | 0.1404422123813756 | 0.0 |
| away | rb_share | 0.2107239844652896 | 0.0 |
| away | redzone_td | 0.6736134453781513 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 4 | 0.0 |
| away | return_points | 0.2823529411764706 | 0.0 |
| away | schedule_strength | -0.26007711878284234 | 0.0 |
| away | season_fg_long | 0.375 | 0.0 |
| away | season_fg_medium | 0.8 | 0.0 |
| away | season_fg_short | 1.0 | 0.0 |
| away | te_share | 0.18192101068038896 | 0.0 |
| away | travel_miles | 218.78463504289815 | 0.0 |
| away | turnover_margin | 0.49411764705882355 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 23.75192511462512 | 23.75192511462512 |
| home | baseline | 23.75192511462512 | -0.774332231528324 |
| home | elo | 121.75266719679098 | 1.1088893600231857 |
| home | elo_difference | 58.44493951137156 | 0.5882205320679286 |
| home | calibration_intercept | 1.0 | 2.8980271587295334 |
| home | career_fg_long | 0.75 | 0.0 |
| home | career_fg_medium | 0.7346938775510204 | 0.0 |
| home | career_fg_short | 0.9134615384615384 | 0.0 |
| home | close_win_rate | 0.7551020408163266 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | -0.27695463005959986 | 0.0 |
| home | def_explosive | 0.10004497173893143 | 0.0 |
| home | def_off_ppd | 2.2190437087027317 | 0.0 |
| home | def_off_ypp | 5.44280044723465 | 0.0 |
| home | def_pass_epa | 0.01524808090858041 | 0.0 |
| home | def_rush_epa | -0.0038788435877752945 | 0.0 |
| home | def_rush_success | 0.41942037019682 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 9.4 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.12888122173667613 | 0.0 |
| home | fumble_recovery | 0.4931506849315068 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | 0.2482527257478334 | 0.0 |
| home | momentum | -0.024186809248404034 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | 2.2333296742376083 | 0.0 |
| home | off_explosive | 0.11283776130935277 | 0.0 |
| home | off_off_ppd | 2.573629608194919 | 0.0 |
| home | off_off_ypp | 5.998078101923544 | 0.0 |
| home | off_pass_epa | 0.14555122699673287 | 0.0 |
| home | off_rush_epa | 0.03598653920098649 | 0.0 |
| home | off_rush_success | 0.4516162348634232 | 0.0 |
| home | opponent_drives | 10.423529411764706 | 0.0 |
| home | plays_per_drive | 6.049664714370596 | 0.0 |
| home | pressure_allowed | 0.17902097902097902 | 0.0 |
| home | pressure_generated | 0.21285714285714288 | 0.0 |
| home | pythagorean | 0.6406508451240147 | 0.0 |
| home | qb_backup | 0.0 | 0.0 |
| home | qb_career_starts | 141.0 | 0.0 |
| home | qb_cpoe | 4.342871685316383 | 0.0 |
| home | qb_epa | 0.2150406661115633 | 0.0 |
| home | rb_share | 0.17512131898233385 | 0.0 |
| home | redzone_td | 0.6756302521008404 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 4 | 0.0 |
| home | return_points | 0.8470588235294118 | 0.0 |
| home | schedule_strength | 0.20360125898678882 | 0.0 |
| home | season_fg_long | 1.0 | 0.0 |
| home | season_fg_medium | 1.0 | 0.0 |
| home | season_fg_short | 0.9459459459459458 | 0.0 |
| home | te_share | 0.2572072541256497 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.4470588235294118 | 0.0 |
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

2026_02_NYG_LA · projection-v2.hfa1.w2 · team MAE 8.539959784711996
| Side | Input | Value | Contribution |
|---|---|---|---|
| away | football_baseline | 18.662415983622203 | 18.662415983622203 |
| away | baseline | 18.662415983622203 | 0.24949380215798123 |
| away | elo | -58.07669724794687 | -0.5328118102543637 |
| away | elo_difference | -120.21100495396877 | -1.2113970565301262 |
| away | calibration_intercept | 1.0 | 2.8980271587295334 |
| away | career_fg_long | None | 0.0 |
| away | career_fg_medium | None | 0.0 |
| away | career_fg_short | None | 0.0 |
| away | close_win_rate | 0.14285714285714285 | 0.0 |
| away | continuity | None | 0.0 |
| away | def_cpoe | -0.3505347006489221 | 0.0 |
| away | def_explosive | 0.0925720587517305 | 0.0 |
| away | def_off_ppd | 2.104851744625147 | 0.0 |
| away | def_off_ypp | 5.4231567145117285 | 0.0 |
| away | def_pass_epa | 0.02520143586316355 | 0.0 |
| away | def_rush_epa | -0.008440261251025427 | 0.0 |
| away | def_rush_success | 0.4267096626828006 | 0.0 |
| away | divisional | 0.0 | 0.0 |
| away | drives | 8.552941176470588 | 0.0 |
| away | elo_qb_adjustment | None | 0.0 |
| away | fg_share | 0.1788453322709378 | 0.0 |
| away | fumble_recovery | 0.430365296803653 | 0.0 |
| away | home_divisional | 0.0 | 0.0 |
| away | home_nondivisional | 0.0 | 0.0 |
| away | luck_index | -0.42677756033920417 | 0.0 |
| away | momentum | 0.5154914888925397 | 0.0 |
| away | neutral | 0.0 | 0.0 |
| away | off_cpoe | 0.5415236987407338 | 0.0 |
| away | off_explosive | 0.09232882651285913 | 0.0 |
| away | off_off_ppd | 2.238215630071327 | 0.0 |
| away | off_off_ypp | 5.37006467043055 | 0.0 |
| away | off_pass_epa | 0.06581982269613498 | 0.0 |
| away | off_rush_epa | 0.005577961855055911 | 0.0 |
| away | off_rush_success | 0.43693500108575506 | 0.0 |
| away | opponent_drives | 8.635294117647058 | 0.0 |
| away | plays_per_drive | 6.800407435701554 | 0.0 |
| away | pressure_allowed | 0.2488409090909091 | 0.0 |
| away | pressure_generated | 0.18844611528822053 | 0.0 |
| away | pythagorean | 0.4722500203786686 | 0.0 |
| away | qb_backup | 0.0 | 0.0 |
| away | qb_career_starts | 13.0 | 0.0 |
| away | qb_cpoe | 1.7924135866419406 | 0.0 |
| away | qb_epa | 0.15325235171416585 | 0.0 |
| away | rb_share | 0.1920694328990915 | 0.0 |
| away | redzone_td | 0.6094117647058823 | 0.0 |
| away | referee | None | 0.0 |
| away | rest_days | 8 | 0.0 |
| away | return_points | 0.5647058823529412 | 0.0 |
| away | schedule_strength | -0.23555869839242316 | 0.0 |
| away | season_fg_long | 0.3333333333333333 | 0.0 |
| away | season_fg_medium | 0.75 | 0.0 |
| away | season_fg_short | 1.0 | 0.0 |
| away | te_share | 0.2206606458663536 | 0.0 |
| away | travel_miles | 2449.365264026628 | 0.0 |
| away | turnover_margin | -0.1411764705882353 | 0.0 |
| away | wind | None | 0.0 |
| home | football_baseline | 20.406384792943744 | 20.406384792943744 |
| home | baseline | 20.406384792943744 | -0.10048850961572146 |
| home | elo | 62.1343077060219 | 0.5704880097135562 |
| home | elo_difference | 120.21100495396877 | 1.2113970565301262 |
| home | calibration_intercept | 1.0 | 2.8980271587295334 |
| home | career_fg_long | 1.0 | 0.0 |
| home | career_fg_medium | 0.9 | 0.0 |
| home | career_fg_short | 1.0 | 0.0 |
| home | close_win_rate | 0.4444444444444444 | 0.0 |
| home | continuity | None | 0.0 |
| home | def_cpoe | 1.5479316468134856 | 0.0 |
| home | def_explosive | 0.09933596567763534 | 0.0 |
| home | def_off_ppd | 2.3250081467848367 | 0.0 |
| home | def_off_ypp | 5.530796190379297 | 0.0 |
| home | def_pass_epa | 0.06286788575463685 | 0.0 |
| home | def_rush_epa | 0.07762449988533156 | 0.0 |
| home | def_rush_success | 0.4589222438537466 | 0.0 |
| home | divisional | 0.0 | 0.0 |
| home | drives | 8.635294117647058 | 0.0 |
| home | elo_qb_adjustment | None | 0.0 |
| home | fg_share | 0.09812772456980187 | 0.0 |
| home | fumble_recovery | 0.6536796536796536 | 0.0 |
| home | home_divisional | 0.0 | 0.0 |
| home | home_nondivisional | 1.0 | 0.0 |
| home | luck_index | 0.09812409812409806 | 0.0 |
| home | momentum | -0.30130702435592244 | 0.0 |
| home | neutral | 0.0 | 0.0 |
| home | off_cpoe | 0.5808310066432584 | 0.0 |
| home | off_explosive | 0.10883826126046818 | 0.0 |
| home | off_off_ppd | 2.4239109699850974 | 0.0 |
| home | off_off_ypp | 5.900492727691489 | 0.0 |
| home | off_pass_epa | 0.08718737063508544 | 0.0 |
| home | off_rush_epa | 0.01019720613172472 | 0.0 |
| home | off_rush_success | 0.4722210783585987 | 0.0 |
| home | opponent_drives | 8.552941176470588 | 0.0 |
| home | plays_per_drive | 6.113476197005609 | 0.0 |
| home | pressure_allowed | 0.19934662998624486 | 0.0 |
| home | pressure_generated | 0.19448798553096205 | 0.0 |
| home | pythagorean | 0.6010694671421659 | 0.0 |
| home | qb_backup | 0.0 | 0.0 |
| home | qb_career_starts | 253.0 | 0.0 |
| home | qb_cpoe | -0.4235777250949178 | 0.0 |
| home | qb_epa | 0.14426944866639824 | 0.0 |
| home | rb_share | 0.11082592832553775 | 0.0 |
| home | redzone_td | 0.6510364145658263 | 0.0 |
| home | referee | None | 0.0 |
| home | rest_days | 11 | 0.0 |
| home | return_points | 0.2823529411764706 | 0.0 |
| home | schedule_strength | 0.4879025104124235 | 0.0 |
| home | season_fg_long | 0.5 | 0.0 |
| home | season_fg_medium | 0.8 | 0.0 |
| home | season_fg_short | 0.8 | 0.0 |
| home | te_share | 0.24203473386765023 | 0.0 |
| home | travel_miles | 0.0 | 0.0 |
| home | turnover_margin | 0.3764705882352941 | 0.0 |
| home | wind | None | 0.0 |

Three-week team streaks: []

## RETROSPECTIVE
0 graded games; 0 pending; 2 final cards need immutable first grades.

| week | scope | games | team_points_mae | margin_mae | total_mae | team_points_sigma | margin_sigma | total_sigma | margin_coverage_50 | margin_coverage_80 | total_coverage_50 | total_coverage_80 | home_bias | total_bias | projected_team_points_sd | actual_team_points_sd | favorite_bias_[-inf,3) | favorite_bias_[3,7) | favorite_bias_[7,14) | favorite_bias_[14,inf) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | week | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 1 | cumulative | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### Diagnostic buckets
| Input | Band | Team observations | Games | Mean error | Game-cluster standard error | Flag |
|---|---|---|---|---|---|---|

Input coverage: {}
Flags require two distinct games and qualified input; exploratory and not multiplicity-adjusted.

### Ten largest game errors

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
  "excluded": {},
  "definitions": {
    "selection": "Last unambiguous timezone-qualified pre-lock revision per game; identical duplicates count once; optional stored_at must also precede lock",
    "snapshot": "Projection as seen at the edit, ours as recorded, actual from immutable first grade; no current-fit substitution",
    "candidate": "Descriptive investigation flag only; no automatic fitting, registration or promotion"
  }
}
```

## First-grade probability diagnostics

Descriptive operational evidence; no model gate. Errors are actual minus projected. All-fit rows are not a single-model evaluation.

Team intervals are reconstructed from each original calibration. Legacy centers, tie-split probabilities and invalid score support remain unchanged.

REVIEW REQUESTED (Tier 2): paired-game bootstrap ignores cross-game dependence; two observed weeks do not qualify week-block uncertainty. No significance or promotion claim.

| Evidence | Season | Week | Scope | Games | Team MAE | Team CRPS | Margin CRPS | Total CRPS | Team 50 hits/n | Team 80 hits/n | Brier |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AS_ISSUED | 2026 | all | season | 30 | 8.6456 | 6.0696 | 8.2019 | 9.0349 | 28/60 | 47/60 | 0.2288 |
| AS_ISSUED | 2026 | 1 | week | 14 | 8.4277 | 5.8295 | 7.7644 | 8.7781 | 12/28 | 23/28 | 0.2105 |
| AS_ISSUED | 2026 | 1 | cumulative | 14 | 8.4277 | 5.8295 | 7.7644 | 8.7781 | 12/28 | 23/28 | 0.2105 |
| AS_ISSUED | 2026 | 2 | week | 16 | 8.8364 | 6.2796 | 8.5846 | 9.2596 | 16/32 | 24/32 | 0.2448 |
| AS_ISSUED | 2026 | 2 | cumulative | 30 | 8.6456 | 6.0696 | 8.2019 | 9.0349 | 28/60 | 47/60 | 0.2288 |

Pending games: 16. Missing immutable first grades: 2.
Complete counts, interval scores/widths, RMSE, bias, dispersion, PIT, reliability, paired intervals, lineage strata and original evidence hashes are in trend.json → forecast_diagnostics.

- 2026_01_NE_SEA: needs Immutable original first-grade record.
- 2026_01_SF_LA: needs Immutable original first-grade record.

<details><summary>DIAGNOSTIC ONLY — CLOSE — AS_ISSUED / projection-v2-172f3e04-a39aa883: ATS 3/8 (37.50%; 95% 13.68–69.43%); total 2/8 (25.00%; 95% 7.15–59.07%) | AS_ISSUED / projection-v2.hfa1.w2: ATS 6/15 (40.00%; 95% 19.82–64.25%); total 5/15 (33.33%; 95% 15.18–58.29%) | AS_ISSUED / projection-v2.w2: ATS 0/1 (0.00%; 95% 0.00–79.35%); total 0/1 (0.00%; 95% 0.00–79.35%) | AS_ISSUED / projection-v3-b7a84dbe-2b5d9d0f: ATS 3/6 (50.00%; 95% 18.76–81.24%); total 2/6 (33.33%; 95% 9.68–70.00%)</summary>By season: AS_ISSUED / projection-v2-172f3e04-a39aa883 2026: ATS 3/8 (37.50%; 95% 13.68–69.43%); total 2/8 (25.00%; 95% 7.15–59.07%); spread coverage 8/8 | AS_ISSUED / projection-v2.hfa1.w2 2026: ATS 6/15 (40.00%; 95% 19.82–64.25%); total 5/15 (33.33%; 95% 15.18–58.29%); spread coverage 15/15 | AS_ISSUED / projection-v2.w2 2026: ATS 0/1 (0.00%; 95% 0.00–79.35%); total 0/1 (0.00%; 95% 0.00–79.35%); spread coverage 1/1 | AS_ISSUED / projection-v3-b7a84dbe-2b5d9d0f 2026: ATS 3/6 (50.00%; 95% 18.76–81.24%); total 2/6 (33.33%; 95% 9.68–70.00%); spread coverage 6/6. Source: nflverse spread_line / total_line. Counts exclude actual pushes and exact forecast-on-line cases. Never a target, gate, ranking, selection criterion or justification for a model change.</details>
<details><summary>DIAGNOSTIC ONLY — OPEN — AS_ISSUED / projection-v2-172f3e04-a39aa883: ATS 3/8 (37.50%; 95% 13.68–69.43%); spread coverage 8/8 | AS_ISSUED / projection-v2.hfa1.w2: ATS 5/13 (38.46%; 95% 17.71–64.48%); spread coverage 13/15 | AS_ISSUED / projection-v2.w2: ATS 0/1 (0.00%; 95% 0.00–79.35%); spread coverage 1/1 | AS_ISSUED / projection-v3-b7a84dbe-2b5d9d0f: ATS 3/5 (60.00%; 95% 23.07–88.24%); spread coverage 5/6; totals INSUFFICIENT (34.3% historical coverage)</summary>By season: AS_ISSUED / projection-v2-172f3e04-a39aa883 2026: ATS 3/8 (37.50%; 95% 13.68–69.43%); spread coverage 8/8 | AS_ISSUED / projection-v2.hfa1.w2 2026: ATS 5/13 (38.46%; 95% 17.71–64.48%); spread coverage 13/15 | AS_ISSUED / projection-v2.w2 2026: ATS 0/1 (0.00%; 95% 0.00–79.35%); spread coverage 1/1 | AS_ISSUED / projection-v3-b7a84dbe-2b5d9d0f 2026: ATS 3/5 (60.00%; 95% 23.07–88.24%); spread coverage 5/6. Source: nfelo historic_projected_spreads.csv home_line_open; totals source nfelo_games.csv total_line_open, unblended. Counts exclude actual pushes and exact forecast-on-line cases. Never a target, gate, ranking, selection criterion or justification for a model change.</details>

Confidence: near-total — reported errors and diagnostics are arithmetic on saved projections and grades. Move down to high if a source or lineage mismatch invalidates those rows.
