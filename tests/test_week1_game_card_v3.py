import copy,datetime as dt,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from engine.game_card_v3 import build,best,eligible,empty_tile
from engine.game_card_why import generate,BANNED
from engine.game_card_runtime import enrich,grade
ROOT=Path(__file__).resolve().parents[1]
SHAPE={'targets':{t:{'counts':{'-7':1,'-3':2,'0':3,'3':2,'7':1}} for t in ('margin','total')}}
G={'game_id':'2026_01_A_B','week':1,'season':2026,'home_team':'Home','away_team':'Away','home_abbr':'B','away_abbr':'A','kickoff_at':'2026-09-13T17:00:00Z','cutoff_at':'2026-09-13T15:45:00Z','status':'UPCOMING'}
R={'game':G,'status':'LIVE','captured_at':'2026-09-13T15:40:00Z','distribution_hash':'h','consensus':{'spreads':{'full':{'center':3}},'totals':{'full':{'center':44}}},'picks':[],'offers':[{'market':m,'side':s,'line':line,'book':b,'price':price} for m,s,line in [('spreads','Home',-3),('spreads','Away',3),('totals','Over',44),('totals','Under',44)] for b,price in [('betmgm',-110),('fanduel',-105)]]}
OURS={'spread':-7,'total':48,'confidence':3,'tags':['trenches'],'text':'We trust the running game','entered_at':'2026-09-12T12:00:00Z','post_lock':False}
def card(r=None,entries=(),sheet=None):return build(copy.deepcopy(G),copy.deepcopy(r or R),SHAPE,entries,sheet)
class GameCardTests(unittest.TestCase):
 def test_contract(self):
  c=card()
  for key in ('game_id','week','season','kickoff_utc','home','away','venue','roof','status','final','market','model','rules','ours','post_lock','sheet','wagers','grades','version','freeze_timestamp','distribution_hash'):self.assertIn(key,c)
 def test_market_fallback(self):
  c=card()
  for k in ('SPREAD','TOTAL'):self.assertEqual((c['tiles'][k]['probability'],c['tiles'][k]['confidence_source'],c['tiles'][k]['subtitle']),(.5,'MARKET','coin flip'))
 def test_human_precedence_winner_total_spread(self):
  base=card();c=card(entries=[OURS]);self.assertEqual(c['tiles']['SPREAD']['side'],'B');self.assertEqual(c['tiles']['TOTAL']['side'],'Over');self.assertGreater(c['tiles']['WINNER']['probability'],base['tiles']['WINNER']['probability']);self.assertEqual({x['confidence_source'] for x in c['tiles'].values()},{'OURS'})
 def test_rule_then_model(self):
  r=copy.deepcopy(R);r['picks']=[{'market':'totals','side':'Over','line':44,'fair_probability':.6,'edge_source':'price'}];self.assertEqual(card(r)['tiles']['TOTAL']['confidence_source'],'MODEL');r['paper_picks']=[{'market':'totals','side':'Under','line':44,'fair_probability':.65,'rule_id':'wind'}];c=card(r);self.assertEqual(c['tiles']['TOTAL']['side'],'Under');self.assertEqual(c['tiles']['TOTAL']['confidence_source'],'RULE');self.assertEqual(card(r,[OURS])['tiles']['TOTAL']['confidence_source'],'OURS')
 def test_best_execution(self):
  self.assertEqual(card()['tiles']['TOTAL']['book'],'fanduel');self.assertIsNone(best(R['offers'],'spreads','Home',-9));self.assertIsNone(best([dict(R['offers'][0],book='pinnacle')],'spreads','Home'))
 def test_model_line_probability_stays_together(self):
  r=copy.deepcopy(R);r['picks']=[{'market':'spreads','side':'Home','line':-3,'fair_probability':.59,'edge_source':'price'}];r['offers'].append({'market':'spreads','side':'Home','line':-2,'price':-150,'book':'betmgm'});c=card(r);self.assertEqual(c['tiles']['SPREAD']['line'],-3);self.assertEqual(c['tiles']['SPREAD']['probability'],.59)
 def test_post_lock_and_equality(self):
  for e in [dict(OURS,post_lock=True),dict(OURS,entered_at=G['cutoff_at'])]:self.assertIsNone(eligible([e],G['cutoff_at']));self.assertEqual(card(entries=[e]),card())
 def test_original_lock_immutable(self):
  c=card(entries=[OURS]);out=build(G,R,SHAPE,[dict(OURS,spread=15)],locked=c);self.assertEqual(out,c);out['tiles']['SPREAD']['side']='changed';self.assertNotEqual(out,c)
 def test_missing_history_sea_sf(self):
  board=json.loads((ROOT/'outputs/model-pick-v1/board.json').read_text());sea=next(g['card_v3'] for g in board['games'] if g['game_id']=='2026_01_NE_SEA');sf=next(g['card_v3'] for g in board['games'] if g['game_id']=='2026_01_SF_LA')
  self.assertEqual([sea['tiles'][k]['grade'] for k in ('WINNER','SPREAD','TOTAL')],['NOT_RECORDED']*3);self.assertEqual([sf['tiles'][k]['grade'] for k in ('WINNER','SPREAD','TOTAL')],['NOT_RECORDED','WIN','LOSS']);self.assertEqual(sea['wagers'][0]['outcome'],'P');self.assertEqual(sf['wagers'][0]['outcome'],'L')
 def test_why_deterministic_safe_human_first_against(self):
  c=card(entries=[OURS]);w=generate(c);self.assertEqual(w,generate(c));self.assertFalse(BANNED.search(json.dumps(w)));self.assertTrue(w['bullets'][0] in (OURS['text'],OURS['tags'][0]));self.assertTrue(any(x.startswith('Against:') for x in w['bullets']));self.assertTrue(all(len(x)<100 for x in w['bullets']))
 def test_unmeasured_never_why(self):
  c=card();c['sheet']={'7':{'measured':True,'teams':{'B':{'measured':False,'epa_per_dropback':9,'n_dropbacks':300}}}};w=generate(c);self.assertNotIn('9.000',json.dumps(w));self.assertEqual(w['bullets'],[])
 def test_source_priority_and_counter(self):
  c=card(entries=[OURS]);c['sheet']={'7':{'measured':True,'teams':{'B':{'measured':True,'epa_per_dropback':.1,'n_dropbacks':20},'A':{'measured':True,'epa_per_dropback':.4,'n_dropbacks':30}}}};w=generate(c);self.assertTrue(any(x.startswith('Against: A') for x in w['bullets']));self.assertIn('QB',w['statement'])
 def test_prospective_freeze_requires_sync_and_prior_quote(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'work/model-pick-v1').mkdir(parents=True);(root/'work/game-card-v3').mkdir();(root/'config').mkdir();(root/'.cloud-private').mkdir();(root/'work/model-pick-v1/runtime-config.json').write_text('{"distribution":{"sha256":"h"}}');(root/'work/game-card-v3/runtime.json').write_text('{"activated_at":"2026-09-12T00:00:00Z"}');(root/'config/confidence_map.json').write_bytes((ROOT/'config/confidence_map.json').read_bytes());(root/'.cloud-private/card-v3-entries.json').write_text(json.dumps({'entries':[dict(OURS,game_id=G['game_id'])],'synced_at':'2026-09-13T15:45:01Z'}))
   with patch('engine.game_card_runtime.read_pinned',return_value=SHAPE):
    enrich({'games':[copy.deepcopy(G)]},[copy.deepcopy(R)],root,dt.datetime.fromisoformat('2026-09-13T15:45:02+00:00'));p=root/'outputs/game-card-v3/locks'/f"{G['game_id']}.json";self.assertTrue(p.exists());raw=p.read_bytes();enrich({'games':[copy.deepcopy(G)]},[dict(R,offers=[])],root,dt.datetime.fromisoformat('2026-09-13T16:00:00+00:00'));self.assertEqual(p.read_bytes(),raw)
 def test_no_input_returns_not_recorded(self):
  r=dict(R,consensus={},offers=[]);self.assertTrue(all(t['grade']=='NOT_RECORDED' for t in card(r)['tiles'].values()))

 def test_grades_frozen_lines_and_first_result(self):
  import hashlib
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);out=root/'outputs/game-card-v3';(out/'locks').mkdir(parents=True);(root/'work/model-pick-v1').mkdir(parents=True);(root/'work/model-pick-v1/runtime-config.json').write_text('{"distribution":{}}');refs=root/'outputs/model-pick-v1/result-refreshes';refs.mkdir(parents=True)
   c=card(entries=[OURS]);c.update(status='LOCKED',freeze_timestamp=G['cutoff_at']);(out/'locks/x.json').write_text(json.dumps(c))
   raw=('game_id,home_score,away_score,spread_line,total_line,result,total\n'+G['game_id']+',24,21,3,44,3,45\n').encode();source=root/'results.csv';source.write_bytes(raw);ref={'path':str(source),'sha256':hashlib.sha256(raw).hexdigest(),'received_at':'2026-09-14T00:00:00Z'};(refs/'x.json').write_text(json.dumps(ref))
   with patch('engine.game_card_runtime.read_pinned',return_value=SHAPE):self.assertEqual(grade(root),1)
   p=out/'grades/x.json';saved=p.read_bytes();g=json.loads(saved);self.assertEqual(g['grades']['WINNER'],'WIN');self.assertEqual(g['grades']['SPREAD'],'PUSH');self.assertEqual(g['grades']['TOTAL'],'WIN');self.assertIsNotNone(g['clv_by_tile']['SPREAD'])
   with patch('engine.game_card_runtime.read_pinned',return_value=SHAPE):self.assertEqual(grade(root),0)
   self.assertEqual(p.read_bytes(),saved)
