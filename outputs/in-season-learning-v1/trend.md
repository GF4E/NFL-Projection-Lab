# Season error trend

actual minus projected. 2016–2025 adaptive OOF; coverage excludes 2016 (no prior residuals).

## AS_ISSUED
0 graded games; 30 pending.

| week | scope | games | team_points_mae | team_points_sigma | margin_mae | margin_sigma | margin_coverage_50 | margin_coverage_80 | total_mae | total_sigma | total_coverage_50 | total_coverage_80 | home_bias | total_bias | favorite_bias_[-inf,3) | favorite_bias_[3,7) | favorite_bias_[7,14) | favorite_bias_[14,inf) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | week | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 1 | cumulative | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 2 | week | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 2 | cumulative | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### Diagnostic buckets
| Input | Band | Count | Mean error | Standard error | Flag |
|---|---|---|---|---|---|

### Ten largest game errors

Three-week team streaks: []

## RETROSPECTIVE
2 graded games; 0 pending.

| week | scope | games | team_points_mae | team_points_sigma | margin_mae | margin_sigma | margin_coverage_50 | margin_coverage_80 | total_mae | total_sigma | total_coverage_50 | total_coverage_80 | home_bias | total_bias | favorite_bias_[-inf,3) | favorite_bias_[3,7) | favorite_bias_[7,14) | favorite_bias_[14,inf) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | week | 2 | 12.474006946341948 | 9.691825528478072 | 12.012743413217672 | 16.988584656280498 | 0.5 | 0.5 | 21.95321662427476 | 8.007740437761939 | 0 | 0.5 | -16.110478403313465 | -21.95321662427476 | -16.110478403313465 | — | — | — |
| 1 | cumulative | 2 | 12.474006946341948 | 9.691825528478072 | 12.012743413217672 | 16.988584656280498 | 0.5 | 0.5 | 21.95321662427476 | 8.007740437761939 | 0 | 0.5 | -16.110478403313465 | -21.95321662427476 | -16.110478403313465 | — | — | — |

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
