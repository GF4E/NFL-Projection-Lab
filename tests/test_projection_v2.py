import copy,unittest
from engine.projection_v2.model import fit,predict,GROUPS
from engine.projection_v2.qualify import Study,gate,prior_shapes,block_interval
from engine.projection_v2.card import why

def fixture():
 rows=[]
 for season in range(2015,2026):
  for game in range(4):
   for home in (False,True):
    n=game+int(home);features={n:None for ns in GROUPS.values() for n in ns};features.update(baseline=20.+n,elo=float(game*20+int(home)*10),elo_difference=float(game),home_divisional=float(home),te_share=.2 if season==2025 else None,rb_share=.1 if season==2025 else None)
    rows.append({'row_id':f'{season}_{game}:{home}','game_id':f'{season}_{game}','season':season,'week':game+1,'home':home,'features':features,'actual_points':20.+n+game*.1,'game':{'roof':'outdoors'}})
 return rows

class V2Qualification(unittest.TestCase):
 def test_raw_control_exact(self):
  rows=fixture();f=fit(rows,[],10)
  for r in rows:self.assertEqual(predict(f,r['features'])['points'],r['features']['baseline'])
 def test_contributions_sum_and_reorder(self):
  rows=fixture();a=fit(rows,['elo','calibration'],10);b=fit(list(reversed(rows)),['calibration','elo'],10);self.assertEqual(a,b)
  import math
  for r in rows:
   p=predict(a,r['features']);self.assertEqual(p['points'],math.fsum(c['points'] for c in p['contributions']))
 def test_missing_stays_inactive(self):
  rows=fixture();f=fit(rows,['target_shares'],10);p=predict(f,rows[0]['features']);self.assertEqual(p['points'],rows[0]['features']['baseline']);self.assertTrue(all(c['points']==0 and c['status']=='INACTIVE' for c in p['contributions'][1:]))
 def test_late_feature_never_qualifies_from_test_only(self):
  rows=fixture();s=Study({'none':rows,'8':copy.deepcopy(rows)});self.assertEqual(s.eligible('target_shares',2026),set());self.assertEqual(s.qualify(2016)['selected_groups'],[])
 def test_future_labels_do_not_change_earlier_forecasts_or_settings(self):
  rows=fixture();other=copy.deepcopy(rows)
  for r in other:
   if r['season']>=2024:r['actual_points']+=200
  a=Study({'none':rows,'8':copy.deepcopy(rows)}).evaluate(['elo']);b=Study({'none':other,'8':copy.deepcopy(other)}).evaluate(['elo'])
  self.assertEqual([r for r in a['predictions'] if r['season']<2024],[r for r in b['predictions'] if r['season']<2024]);self.assertEqual(a['settings']['2024'],b['settings']['2024'])
 def test_prior_interval_ignores_current_and_future_errors(self):
  s=Study({'none':fixture(),'8':fixture()});rows=s.raw;other=copy.deepcopy(rows)
  for r in other:
   if r['season']>=2020:r['actual_home']+=1000
  self.assertEqual(prior_shapes(rows,2020),prior_shapes(other,2020));self.assertIsNone(prior_shapes(rows,2016));self.assertEqual(prior_shapes(rows,2017)['margin']['n'],4)
 def test_gate_requires_all_targets_and_history(self):
  rows=[{'game_id':str(y),'season':y,'week':1,'actual_home':20,'actual_away':10,'loss':[10,10,10]} for y in range(2016,2020)];good=[dict(r,loss=[9,9,9]) for r in rows];bad=[dict(r,loss=[9,9,11]) for r in rows]
  self.assertTrue(gate(good,rows,{2016,2017,2018,2019})['pass']);self.assertFalse(gate(bad,rows,{2016,2017,2018,2019})['pass']);self.assertFalse(gate(good,rows,{2016,2017})['pass'])
 def test_bootstrap_constant_paired_gain(self):
  rows=[{'season':y,'week':w} for y in (2016,2017) for w in range(1,18) for _ in range(4)];r=block_interval(rows,[.4]*len(rows),reps=100);self.assertAlmostEqual(r['lower95'],.4);self.assertAlmostEqual(r['upper95'],.4)
 def test_why_distinguishes_support_and_counterevidence(self):
  features={'off_off_ppd':2.,'def_off_ppd':1.7,'drives':10.,'opponent_drives':11.,'elo_difference':30.,'neutral':0.,'divisional':0.};rows={'home':{'team':'BAL','features':features},'away':{'team':'IND','features':features}};terms={'home':[{'group':'baseline','points':25.,'status':'ACTIVE'},{'group':'elo','points':2.,'status':'ACTIVE'},{'group':'venue','points':-1.,'status':'ACTIVE'}],'away':[{'group':'baseline','points':22.,'status':'ACTIVE'}]};w=why(terms,rows,{'home_win_probability':.6})
  self.assertEqual([r['group'] for r in w['support']],['baseline','elo']);self.assertEqual(w['counterevidence']['group'],'venue');self.assertNotIn('Venue',' '.join(w['lines']));self.assertIn('reduces',w['against'])
 def test_no_fabricated_counterevidence_or_padding(self):
  features={'off_off_ppd':2.,'def_off_ppd':2.,'drives':10.,'opponent_drives':10.};rows={'home':{'team':'BAL','features':features},'away':{'team':'IND','features':features}};terms={'home':[{'group':'baseline','points':24.,'status':'ACTIVE'}],'away':[{'group':'baseline','points':20.,'status':'ACTIVE'}]};w=why(terms,rows,{'home_win_probability':.6});self.assertEqual(len(w['lines']),1);self.assertIsNone(w['counterevidence'])

class PruningAndFreeze(unittest.TestCase):
 def test_conditional_failure_removes_redundant_groups(self):
  class Tiny(Study):
   def __init__(self):
    self.raw=[{'game_id':str(y),'season':y,'week':1,'actual_home':20,'actual_away':10,'loss':[10,10,10]} for y in range(2016,2020)]
   def eligible(self,g,before):return set(range(2016,2020)) if g in ('elo','venue') else set()
   def evaluate(self,groups):return {'predictions':[dict(r,loss=[9,9,9] if len(groups)==1 else [9.5,9.5,9.5] if len(groups)==2 else [10,10,10]) for r in self.raw]}
  q=Tiny().qualify(2020);self.assertEqual(q['selected_groups'],[]);self.assertEqual(set(q['conditional_rounds'][0]['removed']),{'elo','venue'})
 def test_lock_uses_original_distribution_and_keeps_version(self):
  from scripts.projection_v2_publish import lock_card,stamp
  from engine.projection.distribution import residual_distribution,summarize
  shape=residual_distribution([-1,0,1],'fixture');shapes={'margin':shape,'total':shape};projection=summarize(20,23,shapes);card={'version':'projection-v1-original','issued_at':'2026-09-13T12:00:00Z','projection':projection,'home':'BAL','away':'IND','ours':None};locked=lock_card(card,None,shapes,stamp('2026-09-13T15:45:00Z'));self.assertEqual(locked['version'],card['version']);self.assertEqual(locked['projection'],projection);self.assertNotIn('freeze_time',card)
  with self.assertRaises(ValueError):lock_card(card,None,shapes,stamp(card['issued_at']))
 def test_v2_package_remains_football_only(self):
  import ast
  from pathlib import Path
  banned={'spread_line','total_line','consensus','market','odds','price'}
  for p in Path('engine/projection_v2').glob('*.py'):
   for n in ast.walk(ast.parse(p.read_text())):
    if isinstance(n,ast.Constant) and isinstance(n.value,str):self.assertNotIn(n.value,banned)

class FootballExplanation(unittest.TestCase):
 def test_attack_defense_decomposition_reconciles_calibrated_baseline(self):
  import math
  home={'off_off_ppd':2.5,'def_off_ppd':2.2,'drives':10.,'opponent_drives':12.};away={'off_off_ppd':2.,'def_off_ppd':1.8,'drives':12.,'opponent_drives':10.};hp=4.7/2*11;ap=3.8/2*11;rows={'home':{'team':'BAL','features':home},'away':{'team':'IND','features':away}};terms={'home':[{'group':'baseline','points':hp,'status':'ACTIVE'},{'group':'calibration','points':-.2*hp,'status':'ACTIVE'}],'away':[{'group':'baseline','points':ap,'status':'ACTIVE'},{'group':'calibration','points':-.2*ap,'status':'ACTIVE'}]};f={'groups':['calibration'],'names':['baseline'],'coefficients':[-.4],'scales':[2.]};w=why(terms,rows,{'home_win_probability':.6},f)
  self.assertAlmostEqual(sum(r['margin_points'] for r in w['support']),.8*(hp-ap));self.assertIn('adjusted defense allows',' '.join(w['lines']));self.assertNotIn('calibration',' '.join(w['lines']).lower())
