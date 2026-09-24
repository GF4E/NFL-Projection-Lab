import copy,json,math,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from engine import projection_learning as d
from engine.projection import weekly_diagnostics as w
from test_projection_learning import card
from test_projection_weekly_diagnostics import fixture


def edit(c,**changes):
 return {'game_id':c['game_id'],'projection':c['projection'],'evidence':'AS_ISSUED','version':c['version'],
         'home_points':24,'away_points':17,'tags':['roll'],'entered_at':'2026-09-13T22:00:00Z',**changes}


class QualifiedDiagnostics(unittest.TestCase):
 def test_same_game_is_one_cluster(self):
  one=d.paired_bucket([('a',10),('a',10)]);self.assertFalse(one['flag']);self.assertEqual(one['games'],1)
  two=d.paired_bucket([('a',1),('a',1),('b',3),('b',3)])
  self.assertEqual(two['mean_signed_error'],2);self.assertEqual(two['standard_error'],1);self.assertFalse(two['flag'])
  self.assertTrue(d.bucket([1,1,3,3])['flag']) # old independent-team rule is different
 def test_cluster_singletons_match_sample_standard_error(self):
  for errors in ([1,3,4],[-10,-9,-8],[0,0],[10]):
   r=d.paired_bucket(list(zip(map(str,range(len(errors))),errors)))
   b=d.bucket(errors);self.assertAlmostEqual(r['standard_error'] or 0,b['standard_error'] or 0);self.assertEqual(r['flag'],b['flag'])
 def test_unknown_bucket_never_flags(self):
  r=d.paired_bucket([('a',7),('b',7)],qualified=False)
  self.assertFalse(r['flag']);self.assertEqual(r['status'],'INSUFFICIENT')
 def test_inactive_zero_not_observation_and_active_zero_is(self):
  c=card();c['contributions']={'home':[{'input':'luck_index','status':'INACTIVE','value':0}]}
  values,sources=d.qualified_features(c,'home');self.assertIsNone(values['luck_index'])
  c['contributions']['home'][0]['status']='ACTIVE';self.assertEqual(d.qualified_features(c,'home')[0]['luck_index'],0)
 def test_roof_needs_explicit_known_value(self):
  c=card();c['learning_features']={'home':{'features':{'dome':False},'game':{'roof':''}}}
  self.assertIsNone(d.qualified_features(c,'home')[0]['dome'])
  c['learning_features']['home']['game']['roof']='outdoors';self.assertEqual(d.qualified_features(c,'home')[0]['dome'],0)
  c['learning_features']['home']['game']['roof']='closed';self.assertEqual(d.qualified_features(c,'home')[0]['dome'],1)
 def test_wind_requires_original_prelock_forecast(self):
  c=card();f={'status':'FORECAST','wind_mph':0,'source_sha256':'a'*64,'forecast_issued_at':'2026-09-13T20:00:00Z','received_at':'2026-09-13T21:00:00Z'};c['forecast']=f
  self.assertEqual(d.qualified_features(c,'home')[0]['wind'],0)
  for key,value in [('received_at',c['cutoff_at']),('forecast_issued_at','2026-09-14T01:00:00Z'),('source_sha256','unknown'),('wind_mph',float('nan'))]:
   c['forecast']={**f,key:value};self.assertIsNone(d.qualified_features(c,'home')[0]['wind'])
 def test_streak_seasons_and_multiple_games_per_week(self):
  cards=[]
  for i in range(1,4):
   c=card();c.update(game_id=str(i),week=i);cards.append(c)
  self.assertTrue(any(x['team']=='H' for x in d.diagnostics(cards)['team_streaks']))
  cards[0]['season']=2025;self.assertFalse(d.diagnostics(cards)['team_streaks'])
  cards[0]['season']=2026;extra=copy.deepcopy(cards[1]);extra['game_id']='extra';extra['grades']['PROJECTION']['errors']['home_points']=-4
  self.assertFalse(any(x['team']=='H' for x in d.diagnostics(cards+[extra])['team_streaks']))
 def test_diagnostic_row_order_invariant(self):
  cards=[]
  for i in range(3):
   c=card();c['game_id']=str(i);cards.append(c)
  self.assertEqual(d.diagnostics(cards),d.diagnostics(list(reversed(cards))))
 def test_edit_selects_utc_instant_not_string(self):
  c=card();earlier=edit(c,entered_at='2026-09-13T23:30:00+02:00',home_points=90);later=edit(c)
  r=d.edit_learning([earlier,later],[c]);self.assertEqual(r['rows'][0]['ours_mae'],0)
  self.assertEqual(r,d.edit_learning([later,earlier],[c]))
 def test_exact_lock_late_storage_unknown_time_excluded(self):
  c=card();es=[edit(c,entered_at=c['cutoff_at']),edit(c,stored_at=c['cutoff_at']),edit(c,entered_at='2026-09-13T22:00:00'),edit(c,post_lock=True)]
  r=d.edit_learning(es,[c]);self.assertFalse(r['rows']);self.assertEqual(r['excluded'],{'post_lock':3,'unqualified_time':1})
 def test_duplicate_instants_and_ambiguous_latest(self):
  c=card();a=edit(c);b=edit(c,entered_at='2026-09-14T00:00:00+02:00')
  self.assertEqual(len(d.edit_learning([a,b,a],[c])['rows']),1)
  b['home_points']=25;r=d.edit_learning([a,b],[c]);self.assertFalse(r['rows']);self.assertEqual(r['excluded']['ambiguous_latest_revision'],1)
  self.assertEqual(r,d.edit_learning([b,a],[c]))
 def test_invalid_scores_and_retrospective_target_excluded(self):
  c=card();r=d.edit_learning([edit(c,home_points=float('nan')),edit(c,away_points=True)],[c]);self.assertFalse(r['rows'])
  c['evidence']='RETROSPECTIVE';self.assertFalse(d.edit_learning([edit(c)],[c])['rows'])
 def test_first_grade_wins_and_missing_original_is_named(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);c,_=fixture(root);board=copy.deepcopy(c);board['projection']['home_points']=99
   report=w.build(root,[board]);original=w.original_cards(root,[board],report)
   self.assertEqual(original[0]['projection'],c['projection']);self.assertEqual(d.diagnostics(original)['worst_games'][0]['projection'],c['projection'])
   (root/f"outputs/projection-v3/grades/{c['game_id']}.json").unlink()
   with self.assertRaises(FileNotFoundError):w.original_cards(root,[board],report)
   report=w.build(root,[board]);r=d.build_report(w.original_cards(root,[board],report),{})
   self.assertEqual(r['populations']['AS_ISSUED']['unverified_final'],1);self.assertEqual(r['populations']['AS_ISSUED']['pending'],0)
 def test_changed_locked_input_fails(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);c,_=fixture(root);p=root/f"outputs/projection-v3/grades/{c['game_id']}.json";g=json.loads(p.read_bytes());g['learning_features']={'changed':True};p.write_text(json.dumps(g))
   with self.assertRaisesRegex(ValueError,'lock/first-grade'):w.build(root,[c])
 def test_report_never_initializes_missing_references(self):
  from scripts import projection_learning as runtime
  with tempfile.TemporaryDirectory() as temp:
   with patch.object(runtime,'WORK',Path(temp)),patch.object(runtime,'initialize',side_effect=AssertionError('Report cannot initialize')):
    with self.assertRaises(FileNotFoundError):runtime.report()

if __name__=='__main__':unittest.main()
