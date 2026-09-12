import copy,datetime as dt,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from engine.suit_feedback import scorecard,grade
from engine.suit_numbers import price_number,resolve,cap_game
from engine.suit_publish import early_at
from engine.suit_budget import transact
from scripts.suit_runner import jobs,lock
ROOT=Path(__file__).resolve().parents[1]
CF=json.loads((ROOT/'config/confidence_map.json').read_text())
GAME={'game_id':'2026_02_A_B','season':2026,'week':2,'home_team':'B','away_team':'A','kickoff_at':'2026-09-20T17:00:00+00:00','capture_at':'2026-09-20T15:40:00+00:00','cutoff_at':'2026-09-20T15:45:00+00:00'}
SHAPE={'targets':{t:{'counts':{'-3':1,'0':2,'3':1}} for t in ['margin','total']}}
def lean(person='Gabe',i=0):
 return {'person':person,'population':'REGULAR','tags':['PRICE'],'week':2,'phase':'LATE','input_class':'POST_OPEN','confidence':3,'confidence_probability':.58,'fair_probability':.6,'outcome':'W' if i%2 else 'L','brier_confidence':.1764 if i%2 else .3364,'brier_number':.16 if i%2 else .36,'clv_points':1,'conflict':True,'market':'spreads','side':'B','home_team':'B','line':-3}
class SuitTests(unittest.TestCase):
 def test_49_hides_map(self):
  rows,cal=scorecard([lean(i=i) for i in range(49)],CF)
  self.assertFalse(cal);self.assertTrue(all(r['brier_confidence'] is None and r['brier_number'] is None and r['conflicts'] is None and r['better_predictor'] is None for r in rows))
  self.assertTrue(any(r['confidence']==3 and r['hit_rate'] is not None for r in rows))
 def test_50_beta_prior_and_person_separation(self):
  rows,cal=scorecard([lean(i=i) for i in range(50)]+[lean('Jarrett')],CF)
  c=next(c for c in cal if c['level']==3);self.assertAlmostEqual(c['posterior'],(20*.58+25)/70);self.assertEqual(c['observed'],.5)
  self.assertTrue(all(c['person']=='Gabe' for c in cal));self.assertTrue(any(r['brier_number'] is not None for r in rows if r['person']=='Gabe'));self.assertTrue(all(r['brier_number'] is None for r in rows if r['person']=='Jarrett'))
 def test_populations_never_pool(self):
  a=[lean(i=i) for i in range(49)];a.append({**lean(),'population':'POSTSEASON'});self.assertEqual(scorecard(a,CF)[1],[])
 def test_push_not_binary_brier(self):
  g=grade(lean(),{'home_score':13,'away_score':10,'spread_line':3.5,'source_sha256':'h'});self.assertEqual(g['outcome'],'PUSH');self.assertIsNone(g['brier_number']);self.assertEqual(g['clv_points'],.5)
 def test_frozen_belief_grade(self):
  l={**lean(),'confidence_probability':.66};g=grade(l,{'home_score':30,'away_score':10,'source_sha256':'h'});self.assertAlmostEqual(g['brier_confidence'],.34**2)
 def test_disagreement_and_caps(self):
  a={'person':'Gabe','side':'A','confidence':3,'stake_dollars':80,'band':'BET','EV':.1};b={**a,'person':'Jarrett','side':'B'}
  self.assertEqual(resolve([a,b],'spreads')['verdict'],'PASS_DISAGREE');a['confidence']=4;b['confidence']=2;self.assertEqual(resolve([a,b],'spreads')['person'],'Gabe')
  b['side']='A';self.assertEqual(resolve([a,b],'spreads')['person'],'Jarrett');self.assertEqual(sum(x['stake_dollars'] for x in cap_game([a,b])),100);self.assertEqual(sum(x['stake_dollars'] for x in cap_game([a,b],40)),40)
 def test_no_autonomous_pick(self):
  self.assertEqual(resolve([],'spreads')['verdict'],'MISSED');self.assertEqual(resolve([{'side':None},{'side':'A'}],'spreads')['verdict'],'STORY')
 def test_pricing_conflict_and_sizing_independent(self):
  ctx={'game':GAME,'consensus':{'spreads':{'full':{'center':3}}},'offers':[{'market':'spreads','side':'B','line':-3,'book':'betmgm','price':-110}]};e={'person':'Gabe','spread':-5,'total':45,'confidence':1,'tags':['PRICE'],'submitted_at':'2026-09-12T00:00:00Z','input_class':'PRE_OPEN'};cfg={'provisional':CF['people']['Gabe']['provisional'],'version':'v1'}
  a=price_number(e,'spreads',ctx,SHAPE,cfg);b=price_number({**e,'confidence':5},'spreads',ctx,SHAPE,cfg);self.assertEqual(a['stake_dollars'],b['stake_dollars']);self.assertTrue(a['conflict']);self.assertFalse(b['conflict'])
  self.assertEqual(price_number({**e,'spread':-3},'spreads',ctx,SHAPE,cfg)['side'],None)
 def test_monday_capture_window(self):
  self.assertEqual(early_at(GAME),'2026-09-14T09:00:00-07:00');self.assertEqual(jobs([GAME],dt.datetime.fromisoformat('2026-09-14T16:00:10+00:00'))[0]['label'],'EARLY');self.assertEqual(jobs([GAME],dt.datetime.fromisoformat('2026-09-14T16:01:00+00:00')),[])
 def test_next_sheet_survives_monday_night_pending(self):
  from scripts.suit_prepare import sheet_week
  games=[{'week':2,'kickoff_at':'2026-09-20T17:00:00+00:00'},{'week':2,'kickoff_at':'2026-09-22T00:15:00+00:00'},{'week':3,'kickoff_at':'2026-09-25T00:15:00+00:00'}]
  for now in ['2026-09-21T03:01:00+00:00','2026-09-21T16:00:00+00:00']:
   self.assertEqual(sheet_week(games,dt.datetime.fromisoformat(now)),3)
 def test_budget_keeps_week1(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'budget';self.assertTrue(all(transact(p,'2026-W02',str(i)) for i in range(25)));self.assertFalse(transact(p,'2026-W02','26'));self.assertTrue(all(transact(p,'2026-W01',str(i)) for i in range(20)));self.assertFalse(transact(p,'2026-W01','21'))
 def test_missed_and_immutable_lock(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);(r/'config').mkdir();(r/'work/model-pick-v1').mkdir(parents=True);(r/'config/confidence_map.json').write_text(json.dumps(CF));(r/'work/model-pick-v1/runtime-config.json').write_text('{"distribution":{}}')
   with patch('scripts.suit_runner.read_pinned',return_value=SHAPE):
    lock(GAME,None,[],'LATE',dt.datetime.fromisoformat(GAME['cutoff_at']),r);p=r/'outputs/iron-man-v1/locks'/f"{GAME['game_id']}-spreads.json";raw=p.read_bytes();self.assertEqual(json.loads(raw)['verdict']['verdict'],'MISSED');lock(GAME,None,[],'LATE',dt.datetime.now(dt.timezone.utc),r);self.assertEqual(p.read_bytes(),raw)
if __name__=='__main__':unittest.main()
