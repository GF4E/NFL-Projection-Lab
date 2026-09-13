import copy,math,unittest
from engine.projection.model import baseline,fit
from engine.projection.distribution import residual_distribution,pmf,summarize
from engine.projection.grade import grade,score,coverage_flag
from engine.projection.edits import apply

class ProjectionArithmetic(unittest.TestCase):
 def test_baseline(self):self.assertAlmostEqual(baseline(2.5,1.5,10,12),22.,places=3)
 def test_missing_is_not_zero(self):
  with self.assertRaises(ValueError):baseline(None,1.5,10,12)
 def test_contributions_and_order(self):
  rows=[{'row_id':str(i),'features':{'baseline':float(i),'pace':float(i%3)},'actual_points':2.*i+5} for i in range(20)]
  a=fit(rows,['baseline','pace'],1);b=fit(list(reversed(rows)),['baseline','pace'],1)
  self.assertEqual(a,b);self.assertEqual(a.fit_hash,b.fit_hash)
  for r in rows:
   p=a.predict(r['features']);self.assertEqual(math.fsum(c['points'] for c in p['contributions']),p['points'])
 def test_integer_mass_and_hash(self):
  d=residual_distribution([-2.2,-.5,0.,.5,2.2],'fixture');m=pmf(d,0)
  self.assertAlmostEqual(sum(m.values()),1.);self.assertTrue(all(isinstance(x,int) for x in m));self.assertGreater(m[0],0.)
  bad=copy.deepcopy(d);bad['counts']['0']+=1
  with self.assertRaises(ValueError):pmf(bad,0)
 def test_winner_tie_split_and_intervals(self):
  d=residual_distribution([-1,0,0,1],'fixture');r=summarize(21,21,{'margin':d,'total':d});self.assertEqual(r['home_win_probability'],.5);self.assertEqual(r['tie_probability'],.5);self.assertEqual(r['intervals']['margin']['80'],[-1,1])
 def test_grade_flags(self):
  d=residual_distribution([-1,0,1],'fixture');p=summarize(21,24,{'margin':d,'total':d});s=score([grade(p,7,40)]*2)
  self.assertTrue(s['metrics']['margin']['coverage']['80']['flag']);self.assertFalse(coverage_flag(.77,.8));self.assertTrue(coverage_flag(.769,.8))
 def test_lock_and_post_lock(self):
  d=residual_distribution([-1,0,1],'fixture');r={'margin':d,'total':d};base={'source':'PROJECTION','projected':summarize(21,24,r)};entry={'away_points':30,'home_points':20,'entered_at':'2026-09-13T15:45:00Z'}
  deadline=entry['entered_at'];late=apply(base,entry,r,deadline);self.assertEqual(late['projected'],base['projected']);self.assertNotIn('ours',late)
  self.assertEqual(apply(base,entry,r,deadline,locked=base),base)
  entry['entered_at']='2026-09-13T15:44:59Z';early=apply(base,entry,r,deadline);self.assertEqual(early['source'],'OURS');self.assertEqual(early['ours']['margin'],-10)

class ProjectionBoundary(unittest.TestCase):
 def test_package_has_no_financial_dependencies(self):
  import ast
  from pathlib import Path
  banned={'spread_line','total_line','consensus','market','odds','price'}
  for p in (Path(__file__).resolve().parents[1]/'engine/projection').glob('*.py'):
   for node in ast.walk(ast.parse(p.read_text())):
    if isinstance(node,ast.Constant) and isinstance(node.value,str):self.assertNotIn(node.value,banned,p.name)
    if isinstance(node,ast.Attribute):self.assertNotIn(node.attr,banned,p.name)
    if isinstance(node,ast.ImportFrom):self.assertFalse(any(x in (node.module or '').split('.') for x in banned),p.name)
 def test_provenance_and_future_input_rejected(self):
  from engine.projection.contracts import FootballInput
  v=FootballInput('rush_efficiency',.1,'a'*64,'2026-09-13T15:00:00Z','MEASURED')
  self.assertEqual(v.validate('2026-09-13T15:45:00Z'),v)
  with self.assertRaises(ValueError):v.validate('2026-09-13T14:00:00Z')
  with self.assertRaises(ValueError):FootballInput('rush_efficiency',0.,'a'*64,'2026-09-13T15:00:00Z','UNKNOWN').validate('2026-09-13T15:45:00Z')
