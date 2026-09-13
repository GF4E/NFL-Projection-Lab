import copy,datetime as dt,unittest
import pandas as pd
from scripts.projection_v3_sources import aggregate
from engine.projection_v3.personnel import enrich,select_chart,rate

def raw():
 rows=[]
 for play,(qb,scramble,hit,sack,kicker,fg) in enumerate([('A',0,1,1,None,None),('B',1,0,0,None,None),('B',1,0,0,None,None),(None,0,0,0,'K','made')]):
  rows.append(dict(game_id='2020_01_BAL_IND',season=2020,season_type='REG',week=1,game_date='2020-09-10',play_id=play,posteam='BAL',defteam='IND',home_team='IND',away_team='BAL',play_type='run' if scramble else 'field_goal' if fg else 'pass',qtr=1,wp=.5,qb_dropback=int(qb is not None),qb_scramble=scramble,qb_spike=0,qb_kneel=0,passer_player_id=qb if not scramble else None,rusher_player_id=qb if scramble else None,epa=1.,cpoe=None,qb_hit=hit,sack=sack,kicker_player_id=kicker,field_goal_result=fg,extra_point_result=None,kick_distance=52))
 return pd.DataFrame(rows)
def row(week=2,date='2020-09-17'):
 return dict(row_id='target:BAL',game_id='target',team='BAL',season=2020,week=week,features={},metadata={},source_hashes=[],game=dict(gameday=date,gametime='13:00'))
class PersonnelTests(unittest.TestCase):
 def test_dropbacks_include_scramble_and_literal_pressure_overlap(self):
  games,a=aggregate(raw(),'hash');t=games[0]['teams']['BAL'];self.assertEqual(t['qb'],'B');self.assertEqual(t['qb_counts'],{'B':2,'A':1});self.assertEqual(t['pressure_allowed'],{'n':3,'sum':2.});self.assertEqual(a['hit_and_sack'],1);self.assertEqual(t['kickers']['K']['long'],[1,1])
 def test_unknown_pressure_not_zero(self):
  p=raw();p.loc[0,'qb_hit']=None;g,a=aggregate(p,'hash');self.assertIsNone(g[0]['teams']['BAL']['pressure_allowed']['sum'])
 def test_target_participation_cannot_choose_starter_or_change_history(self):
  g,a=aggregate(raw(),'hash');future=copy.deepcopy(g[0]);future.update(date='2020-09-17',game_id='target',week=2);future['teams']['BAL']['qb']='X';future['teams']['BAL']['kicker']='X'
  one=enrich([row()],dict(games=g,charts=[]))[0];two=enrich([row()],dict(games=g+[future],charts=[]))[0];self.assertEqual(one,two);self.assertEqual(one['personnel']['qb_id'],'B');self.assertIsNone(one['features']['qb_cpoe']);self.assertEqual(one['features']['career_fg_long'],1.);self.assertEqual(one['features']['qb_career_starts'],0.);self.assertEqual(one['features']['qb_backup'],1.)
 def test_chart_override_and_cutoff(self):
  c=dict(team='BAL',position='QB',season=2020,week=2,id='C',at=None,status='WEEKLY_PROXY_ISSUANCE_UNVERIFIED',source_hash='depth');g,a=aggregate(raw(),'hash');r=enrich([row()],dict(games=g,charts=[c]))[0];self.assertEqual(r['personnel']['qb_id'],'C');self.assertIsNone(r['features']['qb_epa']);self.assertEqual(r['features']['qb_backup'],1.)
  now=dt.datetime(2026,9,13,15,45,tzinfo=dt.timezone.utc);c.update(season=2026,week=None,at='2026-09-13T16:00:00Z',received_at='2026-09-13T16:01:00Z');self.assertIsNone(select_chart([c],'BAL','QB',2026,1,now)[0]);c.update(at='2026-09-13T12:00:00Z',received_at='2026-09-13T12:01:00Z');self.assertIsNotNone(select_chart([c],'BAL','QB',2026,1,now)[0])
 def test_ambiguous_chart_and_first_team_game_remain_unknown(self):
  now=dt.datetime(2020,9,17,tzinfo=dt.timezone.utc);c=dict(team='BAL',position='QB',season=2020,week=2,id='A',at=None,status='WEEKLY',source_hash='h');self.assertIsNone(select_chart([c,dict(c,id='B')],'BAL','QB',2020,2,now)[0]);r=enrich([row()],dict(games=[],charts=[]))[0];self.assertTrue(all(v is None for v in r['features'].values()))
 def test_future_player_outcomes_do_not_change_earlier_features(self):
  g,a=aggregate(raw(),'hash');later=copy.deepcopy(g[0]);later.update(date='2021-01-01',season=2021);later['teams']['BAL']['qbs']['B']['epa_sum']=10000;data=dict(games=g+[later],charts=[]);self.assertEqual(enrich([row()],data),enrich([row()],dict(games=g,charts=[])))
 def test_player_measurements_weight_by_observed_counts(self):
  h=[dict(season=2019,week=1,n=10,s=10),dict(season=2019,week=2,n=30,s=60),dict(season=2020,week=1,n=10,s=30)];self.assertAlmostEqual(rate(h,2020,2,None,'s','n'),.8*1.75+.2*3)
 def test_career_fgs_include_garbage_time(self):
  p=raw();p.loc[3,['qtr','wp']]=[4,.99];g,a=aggregate(p,'hash');self.assertEqual(g[0]['teams']['BAL']['kickers']['K']['long'],[1,1])
if __name__=='__main__':unittest.main()

class VersionAndPublicationTests(unittest.TestCase):
 def test_old_fit_distribution_lookup(self):
  import json
  from pathlib import Path
  from scripts.projection_v3_publish import shape_for
  from engine.projection_v3.qualify import read
  for version in ['v1','v2']:
   a=read(json.loads(Path(f'work/projection-{version}/fit-ref.json').read_text()));self.assertEqual(shape_for({'version':a['version']},{}),read(a['shapes']))
 def test_edit_at_lock_updates_conflict_note_but_preserves_original_projection(self):
  from scripts.projection_v3_publish import lock_card,stamp
  from engine.projection.distribution import residual_distribution,summarize
  shape=residual_distribution([1,2,3],'fixture');shapes={'margin':shape,'total':shape};p=summarize(20,23,shapes);card=dict(version='projection-v3-test',issued_at='2026-09-13T12:00:00Z',projection=p,display=p,home='IND',away='BAL',score_probability_conflict=False,score_probability_note=None)
  locked=lock_card(card,{'away_points':24,'home_points':23},shapes,stamp('2026-09-13T15:45:00Z'));self.assertTrue(locked['score_probability_conflict']);self.assertIn('BAL',locked['score_probability_note']);self.assertEqual(locked['projection'],p)
