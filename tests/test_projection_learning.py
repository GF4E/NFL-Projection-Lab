import copy,datetime as dt,json,math,statistics,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from engine.projection_learning import bucket,edit_learning,build_report
from scripts.projection_learning_gate import passes
from scripts import projection_learning as runtime

def card():
 p={'home_points':20.,'away_points':20.,'margin':0.,'total':40.}
 return {'game_id':'g','week':1,'season':2026,'home':'H','away':'A','version':'old','evidence':'AS_ISSUED','cutoff_at':'2026-09-14T00:00:00+00:00','projection':p,'grades':{'PROJECTION':{'actual':{'home_points':24.,'away_points':17.,'margin':7.,'total':41.},'errors':{'home_points':4.,'away_points':-3.,'margin':7.,'total':1.},'interval_hits':{'margin':{'50':True,'80':True},'total':{'50':True,'80':True}}}}}
class LearningTests(unittest.TestCase):
 def test_flag_exact_standard_error_rule(self):
  for errors in [[],[7],[0,0],[1,1],[-1,3],[2,3,4],[-10,-9,-8],[1,-1,0]]:
   b=bucket(errors);expected=len(errors)>1 and abs(statistics.mean(errors))>2*statistics.stdev(errors)/math.sqrt(len(errors));self.assertEqual(b['flag'],expected)
 def test_postlock_excluded_and_last_prelock_revision_only(self):
  c=card();e={'game_id':'g','projection':c['projection'],'evidence':'AS_ISSUED','version':'old','away_points':17,'home_points':24,'tags':[' Roll '],'entered_at':'2026-09-13T23:00:00+00:00','post_lock':False}
  late={**e,'entered_at':c['cutoff_at'],'home_points':90};flagged={**e,'post_lock':True,'entered_at':'2026-09-13T23:30:00+00:00'}
  r=edit_learning([e,late,flagged],[c]);self.assertEqual(len(r['rows']),1);self.assertEqual(r['rows'][0]['ours_mae'],0);self.assertEqual(r['excluded']['post_lock'],2)
 def test_candidate_twenty_distinct_games_seventy_percent(self):
  cards=[];edits=[]
  for i in range(20):
   c=card();c['game_id']=str(i);cards.append(c);edits.append({'game_id':str(i),'projection':c['projection'],'evidence':'AS_ISSUED','away_points':20,'home_points':21 if i<14 else 19,'tags':['roll'],'entered_at':'2026-09-13T23:00:00+00:00'})
  r=edit_learning(edits,cards);self.assertTrue(next(t for t in r['tags'] if t['target']=='home_points')['candidate']);self.assertFalse(next(t for t in edit_learning(edits[:-1],cards)['tags'] if t['target']=='home_points')['candidate'])
 def test_gate_all_coverages_required(self):
  before={'team_points_mae':10};after={'team_points_mae':9.9,**{f'{t}_coverage_{l}':int(l)/100 for t in ['margin','total'] for l in ['50','80']}};self.assertTrue(passes(before,after));after['total_coverage_80']=.831;self.assertFalse(passes(before,after));after['total_coverage_80']=None;self.assertFalse(passes(before,after))
 def test_due_time_and_dst(self):
  rows=[{'game_id':'g','week':1,'game':{'gameday':'2026-09-14'}}]
  self.assertIsNone(runtime.due_week(rows,dt.datetime.fromisoformat('2026-09-15T12:59:59+00:00')));self.assertEqual(runtime.due_week(rows,dt.datetime.fromisoformat('2026-09-15T13:00:00+00:00')),1)
  postponed=[{'game_id':'first','week':1,'game':{'gameday':'2026-09-10'}},{'game_id':'late','week':1,'game':{'gameday':'2026-09-15'}}]
  self.assertEqual(runtime.due_week(postponed,dt.datetime.fromisoformat('2026-09-15T13:00:00+00:00')),1)
  rows[0]['game']['gameday']='2026-11-02';self.assertIsNone(runtime.due_week(rows,dt.datetime.fromisoformat('2026-11-03T13:59:59+00:00')));self.assertEqual(runtime.due_week(rows,dt.datetime.fromisoformat('2026-11-03T14:00:00+00:00')),1)
 def test_refit_preserves_grade_and_excludes_future_and_retries(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);work=root/'work';out=root/'out';work.mkdir();out.mkdir();(root/'work/projection-v1').mkdir();(root/'outputs/projection-v3/grades').mkdir(parents=True)
   old=card();gradefile=root/'outputs/projection-v3/grades/g.json';gradefile.write_text(json.dumps(old));original=gradefile.read_bytes();(root/'outputs/projection-v3/board.json').write_text(json.dumps({'games':[old]}));(root/'work/projection-v1/source-manifest.json').write_text(json.dumps({'team_games':{'kind':'games'}}));(work/'historical-ref.json').write_text(json.dumps({'kind':'history'}))
   history=[{'row_id':'h','season':2025,'week':1,'actual_points':20,'features':{'baseline':20}}];rows=[{'row_id':'g','game_id':'g','season':2026,'week':1,'actual_points':22,'features':{'baseline':20}},{'row_id':'future','game_id':'future','season':2026,'week':2,'actual_points':999,'features':{'baseline':20}}];artifact={'version':'old','groups':['calibration'],'selected':['none',10],'shapes':{'frozen':True}}
   def read(ref):return [{'game_id':'g'}] if ref['kind']=='games' else history
   with patch.multiple(runtime,ROOT=root,WORK=work,OUT=out),patch.object(runtime,'read',side_effect=read),patch.object(runtime,'active_artifact',return_value=artifact):
    first=runtime.weekly_refit(rows,1,dt.datetime.now(dt.timezone.utc));self.assertEqual(first['training_rows'],2);self.assertEqual(gradefile.read_bytes(),original);second=runtime.weekly_refit([],1,dt.datetime.now(dt.timezone.utc));self.assertEqual(first,second);self.assertEqual(gradefile.read_bytes(),original)
 def test_trend_population_and_week_arithmetic(self):
  a=card();b=card();b.update(game_id='b',week=2,evidence='RETROSPECTIVE');r=build_report([a,b],{});self.assertEqual(r['populations']['AS_ISSUED']['tables'][0]['team_points_mae'],3.5);self.assertEqual(r['populations']['AS_ISSUED']['graded'],1)
if __name__=='__main__':unittest.main()
