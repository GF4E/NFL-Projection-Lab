import copy,datetime as dt,gzip,json,math,tempfile,unittest
from pathlib import Path
from engine.projection.model import fit,Fit
from engine.projection.distribution import summarize,pmf
from engine.projection.card import make_card,finish
from engine.projection.train import read,paired,OUT
from scripts import projection_publish as runtime

class ProjectionFittedAcceptance(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.artifact=read(json.loads((OUT/'fit-ref.json').read_text()));cls.shapes=read(cls.artifact['shapes']);cls.rows=json.loads(gzip.decompress((OUT/'current-features.json.gz').read_bytes()));cls.board=json.loads((runtime.OUT/'board.json').read_text())
 def test_every_week_two_has_three_projection_outputs(self):
  games=[g for g in self.board['games'] if g['week']==2];self.assertEqual(len(games),16)
  for g in games:
   self.assertEqual(g['source'],'PROJECTION');self.assertEqual(len(g['why']['lines']),3);self.assertTrue(g['why']['against'].startswith('Against:'));self.assertAlmostEqual(g['projection']['total'],g['projection']['home_points']+g['projection']['away_points'])
 def test_all_contributions_sum_and_inactive_stays_null(self):
  for g in self.board['games']:
   for side in ('away','home'):
    self.assertAlmostEqual(math.fsum(c['points'] for c in g['contributions'][side]),g['projection'][side+'_points'],places=12)
    for c in g['contributions'][side]:
     if c['status']=='INACTIVE':self.assertIsNone(c['value']);self.assertEqual(c['points'],0);self.assertEqual(c['weight'],0)
 def test_finals_are_retrospective_and_not_as_issued(self):
  finals=[g for g in self.board['games'] if g['status']=='FINAL'];self.assertEqual(len(finals),2)
  for g in finals:self.assertEqual(g['evidence'],'RETROSPECTIVE');self.assertIn('PROJECTION',g['grades'])
  self.assertTrue(all(s['n']==0 for s in self.board['scorecards'] if s['evidence']=='AS_ISSUED'))
 def test_wind_never_uses_later_training_season(self):
  for d in self.artifact['selection_history']:
   if d['season']<=2022:self.assertEqual(d['wind_training_n'],0);self.assertEqual(d['wind_weight'],0)
   self.assertLess(d['training_last_season'],d['season'])
 def test_residual_sample_sizes_and_unit_mass(self):
  self.assertEqual(self.shapes['margin']['n'],2639)
  for d in self.shapes.values():self.assertAlmostEqual(sum(pmf(d,0).values()),1.)
 def test_missing_design_never_substitutes_value(self):
  rows=[{'row_id':str(i),'features':{'x':float(i),'unknown':None},'actual_points':i+10} for i in range(4)];f=fit(rows,['x','unknown'],10);p=f.predict({'x':None,'unknown':None});self.assertEqual(p['points'],f.intercept);self.assertTrue(all(c.get('value') is None for c in p['contributions'] if c['input']!='fitted_intercept'))
 def test_current_row_target_labels_never_affect_projection(self):
  from engine.projection.card import project
  p=next(iter(paired(self.rows).values()));a=project(p,self.artifact,self.shapes);b=copy.deepcopy(p)
  for r in b.values():r['actual_points']=999;r['game']['home_score']=999;r['game']['away_score']=999
  self.assertEqual(a,project(b,self.artifact,self.shapes))
 def test_runtime_lock_survives_post_lock_edit(self):
  old=runtime.OUT
  with tempfile.TemporaryDirectory() as directory:
   runtime.OUT=Path(directory);g=next(g for g in self.board['games'] if g['week']==2);gid=g['game_id'];p=runtime.OUT/'locks'/f'{gid}.json';locked=copy.deepcopy(g);locked.update(status='LOCKED',freeze_time=g['cutoff_at']);runtime.save(p,locked,True);before=p.read_bytes();b=runtime.run(dt.datetime.fromisoformat(g['cutoff_at'])+dt.timedelta(minutes=1));after=p.read_bytes();self.assertEqual(before,after);self.assertEqual(next(x for x in b['games'] if x['game_id']==gid)['projection'],g['projection'])
  runtime.OUT=old
 def test_new_artifact_has_no_financial_fields(self):
  banned={'spread_line','total_line','consensus','market','odds','price','EV','book'}
  def walk(x):
   if isinstance(x,dict):
    self.assertFalse(set(x)&banned)
    for v in x.values():walk(v)
   elif isinstance(x,list):
    for v in x:walk(v)
  walk(self.board)
