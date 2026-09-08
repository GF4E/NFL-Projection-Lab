import copy,json,unittest
from pathlib import Path
import pandas as pd
from engine.qb_history import aggregate,rolling_table
ROOT=Path(__file__).resolve().parents[1]
class QBHistoryTests(unittest.TestCase):
    def test_anya_sacks_and_nullified_plays(self):
        default=dict(game_id='g',season=2015,week=1,posteam='H',passer_player_id='qb',passer_id='qb',passer_player_name='QB',play_type='pass',two_point_attempt=0,pass_attempt=1,sack=0,passing_yards=0,yards_gained=0,pass_touchdown=0,interception=0)
        plays=[dict(default,passing_yards=30,yards_gained=30,pass_touchdown=1),dict(default,interception=1),dict(default,sack=1,yards_gained=-5),dict(default,play_type='no_play',passing_yards=100),dict(default,two_point_attempt=1,passing_yards=2)]
        rows,missing=aggregate(pd.DataFrame(plays));self.assertEqual(missing,0)
        self.assertEqual(len(rows),1);r=rows[0]
        self.assertEqual(r['attempts'],2);self.assertEqual(r['sacks'],1)
        self.assertEqual(r['numerator'],0);self.assertEqual(r['denominator'],3)
    def record(self,week,qb='q',num=60,den=10,attempts=9):
        return dict(game_id=f'2014_{week:02d}_A_H',season=2014,week=week,posteam='H',qb_id=qb,numerator=num,denominator=den,attempts=attempts)
    def test_target_stats_cannot_change_own_pregame_value(self):
        records=[self.record(1),self.record(2),self.record(3)]
        before=rolling_table(records)[-1]
        modified=copy.deepcopy(records);modified[-1]['numerator']=999999
        after=rolling_table(modified)[-1]
        for key in ('qb_rolling_anya','team_rolling_anya','qb_adjustment_elo','training_week'):self.assertEqual(before[key],after[key])
        self.assertEqual(before['training_week'],2)
    def test_starter_most_attempts_and_rookie_prior(self):
        rows=[self.record(1),self.record(2,'rookie',num=10,den=20,attempts=3),self.record(2,'backup',num=100,den=22,attempts=2)]
        last=rolling_table(rows)[-1]
        self.assertEqual(last['starter_qb_id'],'rookie')
        self.assertTrue(last['rookie_prior']);self.assertEqual(last['qb_rolling_anya'],6)
    def test_rolling_window_is_pooled_and_capped(self):
        rows=[self.record(w,num=w*10,den=10) for w in range(1,13)]
        last=rolling_table(rows)[-1]
        self.assertEqual(last['qb_prior_games'],10)
        self.assertEqual(last['qb_rolling_anya'],sum(range(2,12))/10)
    def test_full_comparison_coverage_and_shapes(self):
        r=json.loads((ROOT/'work/harvest-elo-v2/run-2/experiment.json').read_text())
        for row in r['shape_audit']:
            self.assertTrue(row['max_training_season'] is None or row['max_training_season']<row['season'])
        self.assertFalse(r['missing_qb_game_ids'])
        allrows=[x for x in r['comparisons'] if x['season']=='ALL']
        self.assertTrue(all(x['paired_n']>0 for x in allrows))
        self.assertEqual(r['gates']['plain']['total'],r['gates']['anya']['total'])
        for gate in r['gates'].values():
            self.assertEqual(gate['numeric_gate_pass'],gate['margin_improves'] and gate['total_does_not_worsen'])
            self.assertFalse(gate['promotion_eligible'])
