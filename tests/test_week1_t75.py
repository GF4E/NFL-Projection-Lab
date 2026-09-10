"""T75 contract tests use synthetic quotes/results, never provider credits."""
import copy
import datetime as dt
import importlib.util
import inspect
import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from engine import model_pick as pick
from engine import t75_grade as scoring
from engine.pick_store import put, sha, encode
from engine.t75_budget import transact, status
from engine.t75_report import score_files, scorecard, diagnose
from engine.t75_shadow import inactive_teams

ROOT=Path(__file__).resolve().parents[1]
SHAPE={'targets':{'margin':{'counts':{'-7':1,'-3':2,'0':4,'3':2,'7':1}},'total':{'counts':{'-7':1,'-3':2,'0':4,'3':2,'7':1}}}}
VERSION='model-pick-v1-T75-synthetic'
GAME={'game_id':'TEST_01_A_H','season':2026,'week':1,'home_team':'Home','away_team':'Away','home_abbr':'H','away_abbr':'A','kickoff_at':'2026-09-13T17:00:00Z','capture_at':'2026-09-13T15:40:00Z','cutoff_at':'2026-09-13T15:45:00Z','roof':'outdoors'}
RECEIPT={'request_at':'2026-09-13T15:40:00Z','received_at':'2026-09-13T15:40:05Z','status':'CAPTURED'}
CONFIG={'version':VERSION,'distribution':{'sha256':sha(encode(SHAPE))}}

def event():
    books=[]
    for b in pick.BOOKS[:3]:
        books.append({'key':b,'last_update':GAME['capture_at'],'markets':[
            {'key':'spreads','outcomes':[{'name':'Home','point':-3,'price':-110},{'name':'Away','point':3,'price':-110}]},
            {'key':'totals','outcomes':[{'name':'Over','point':45,'price':-110},{'name':'Under','point':45,'price':-110}]}]})
    return {'id':'synthetic','home_team':'Home','away_team':'Away','commence_time':GAME['kickoff_at'],'bookmakers':books}

def locked():return pick.lock(GAME,event(),RECEIPT,SHAPE,CONFIG,'2026-09-13T15:44:30Z')

def folder():
    p=ROOT/'work/model-pick-v1/tests'/str(uuid.uuid4());p.mkdir(parents=True);return p

class LockTests(unittest.TestCase):
    def test_two_or_missed(self):
        r=locked();self.assertEqual(r['status'],'LOCKED');self.assertEqual([p['market'] for p in r['picks']],['spreads','totals'])
        e=event();e['bookmakers']=[]
        self.assertEqual(pick.lock(GAME,e,RECEIPT,SHAPE,CONFIG,'2026-09-13T15:44:30Z')['reason'],'NO_QUOTES')
        e=event()
        for b in e['bookmakers']:b['markets']=b['markets'][:1]
        r=pick.lock(GAME,e,RECEIPT,SHAPE,CONFIG,'2026-09-13T15:44:30Z');self.assertEqual(r['status'],'MISSED');self.assertFalse(r['picks'])
    def test_late_never_backdates(self):
        for received,freeze in [('2026-09-13T15:45:01Z','2026-09-13T15:44:30Z'),('2026-09-13T15:40:05Z','2026-09-13T15:45:01Z')]:
            r=pick.lock(GAME,event(),{**RECEIPT,'received_at':received},SHAPE,CONFIG,freeze)
            self.assertEqual(r['reason'],'LATE');self.assertEqual(r['freeze_timestamp'],freeze)
    def test_other_window_and_missing_timestamps(self):
        r=pick.lock(GAME,event(),{**RECEIPT,'request_at':'2026-09-13T15:30:00Z'},SHAPE,CONFIG,'2026-09-13T15:44:30Z')
        self.assertEqual(r['reason'],'OUTSIDE_T80')
        e=event()
        for b in e['bookmakers']:b.pop('last_update')
        self.assertEqual(pick.lock(GAME,e,RECEIPT,SHAPE,CONFIG,'2026-09-13T15:44:30Z')['status'],'MISSED')
    def test_leave_one_out_three_books_and_anchor(self):
        books={'betmgm':{'center':1},'draftkings':{'center':3},'fanduel':{'center':9}}
        r=pick.consensus(books,'betmgm');self.assertEqual(r['center'],6);self.assertNotIn('betmgm',r['contributors'])
        books['betmgm']['center']=100;self.assertEqual(pick.consensus(books,'betmgm'),r)
        books['pinnacle']={'center':4};self.assertEqual(pick.consensus(books,'betmgm')['center'],5)
    def test_devig_inverse(self):
        self.assertEqual(pick.devigged_center(SHAPE,'spreads',-3,.5),3)
        self.assertEqual(pick.devigged_center(SHAPE,'totals',45,.5),45)
    def test_seeded_tie_repeat_and_sides(self):
        c=[{'EV':0,'side':s,'book':'betmgm','line':0,'price':100} for s in ['A','H']]
        a=pick.select(c,'game',VERSION,'spreads');self.assertEqual(a,pick.select(c,'game',VERSION,'spreads'));self.assertTrue(a['seed'])
        self.assertEqual({pick.select(c,str(i),VERSION,'spreads')['side'] for i in range(30)},{'A','H'})
    def test_push_ev(self):
        for p in locked()['picks']:
            self.assertAlmostEqual(p['win']+p['push']+p['loss'],1)
            self.assertGreater(p['push'],0);self.assertAlmostEqual(p['EV'],p['win']*(100/110)-p['loss'])
    def test_shadow_cannot_affect_selection(self):
        r=locked();config={**CONFIG,'coefficients':{'elo_c':1000,'wind':-999}}
        self.assertEqual(r,pick.lock(GAME,event(),RECEIPT,SHAPE,config,'2026-09-13T15:44:30Z'))
    def test_immutable_write_and_repeat(self):
        p=folder()/'T75-picks.json';r=locked();put(p,r);before=p.read_bytes();put(p,r)
        with self.assertRaises(ValueError):put(p,{**r,'version':'changed'})
        self.assertEqual(before,p.read_bytes())
    def test_no_final_io_in_lock_and_no_quote_io_in_grade(self):
        import ast
        for module,banned in [(pick,('home_score','away_score','spread_line','total_line','urlopen','open','read_text','read_bytes')),(scoring,('capture','urlopen','open','read_text','read_bytes','quote_updated_at'))]:
            tree=ast.parse(inspect.getsource(module))
            names={n.attr for n in ast.walk(tree) if isinstance(n,ast.Attribute)}|{n.id for n in ast.walk(tree) if isinstance(n,ast.Name)}|{n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str)}
            self.assertFalse(names & set(banned))
        with patch.object(Path,'read_bytes',side_effect=AssertionError('File IO forbidden')),patch.object(Path,'read_text',side_effect=AssertionError('File IO forbidden')):
            self.assertEqual(locked()['status'],'LOCKED')

class GradeTests(unittest.TestCase):
    def test_grade_locked_line_close_only_clv(self):
        p={'market':'spreads','side':'Home','home_team':'Home','line':-3,'price':-110,'fair_probability':.5}
        r={'final':True,'home_score':24,'away_score':20,'spread_line':7,'total_line':45,'source_sha256':'test'}
        a=scoring.grade(p,r,SHAPE);b=scoring.grade(p,{**r,'spread_line':0},SHAPE)
        self.assertEqual(a['outcome'],'W');self.assertEqual(a['outcome'],b['outcome']);self.assertNotEqual(a['clv_probability'],b['clv_probability'])
        self.assertEqual(scoring.grade({**p,'line':-7},r,SHAPE)['outcome'],'L')
    def test_push_total_ot_pending(self):
        p={'market':'totals','side':'Under','home_team':'Home','line':44,'price':-120,'fair_probability':.5}
        r={'final':True,'home_score':24,'away_score':20,'spread_line':7,'total_line':45,'source_sha256':'test'}
        a=scoring.grade(p,r,SHAPE);self.assertEqual(a['outcome'],'P');self.assertEqual(a['units'],0);self.assertTrue(a['overtime_included'])
        self.assertEqual(scoring.grade(p,{**r,'total_line':None},SHAPE)['status'],'PENDING')
    def test_idempotent_scoring_and_files(self):
        f=folder();p=f/'T75-picks.json';record=locked();put(p,record)
        r={'final':True,'home_score':24,'away_score':20,'spread_line':7,'total_line':45,'source_sha256':'test'}
        a=score_files([p],{GAME['game_id']:r},SHAPE,f/'grades');b=score_files([p],{GAME['game_id']:{**r,'home_score':99}},SHAPE,f/'grades')
        self.assertEqual(a,b);self.assertEqual(len(a),2);self.assertEqual(p.read_bytes(),encode(record))
        report=scorecard([record],a);self.assertEqual(next(x for x in report if x['week']=='ALL' and x['market']=='spreads' and x['subset']=='all')['pending'],0)
        self.assertTrue(all(x['status']=='INSUFFICIENT_SAMPLE' for x in diagnose(a)))
    def test_score_job_never_opens_capture_path(self):
        f=folder();p=f/'T75-picks.json';record=locked();record['capture']['source']={'path':'FORBIDDEN-T80','sha256':'fake'};put(p,record)
        score_files([p],{},SHAPE,f/'grades')
        self.assertFalse((f/'grades').exists())

class BudgetTests(unittest.TestCase):
    def test_hard_cap_reserve_and_61st_refusal(self):
        p=folder()/'budget.jsonl'
        self.assertTrue(all(transact(p,'2026-W01',str(i)) for i in range(20)))
        self.assertFalse(transact(p,'2026-W01','21'));self.assertFalse(transact(p,'2026-W01','61'))
        self.assertEqual(status(p)['accounted_by_week']['2026-W01'],60)
        self.assertEqual(json.loads(p.read_text().splitlines()[-1])['action'],'refused')
    def test_settle_duplicate_and_new_week(self):
        p=folder()/'budget.jsonl';self.assertTrue(transact(p,'W1','a'));self.assertFalse(transact(p,'W1','a'))
        transact(p,'W1','a','settle',2);self.assertEqual(status(p)['accounted_by_week']['W1'],2)
        self.assertTrue(transact(p,'W2','a'))
        with self.assertRaises(ValueError):transact(p,'W2','a','settle',4)
        self.assertEqual(status(p)['accounted_by_week']['W2'],3)

class ShadowTests(unittest.TestCase):
    def test_unknown_inactives_are_not_no(self):
        r=inactive_teams([],GAME,[],RECEIPT['request_at']);self.assertEqual(r['H']['starting_qb_inactive'],'unknown');self.assertIsNone(r['H']['listed_starters_inactive'])
    def test_known_list_join(self):
        depth=[{'team':'H','dt':RECEIPT['request_at'],'espn_id':'1','gsis_id':'g','pos_rank':'1','pos_abb':'QB'}]
        r=inactive_teams([{'team':{'abbreviation':'H'},'athletes':[{'id':'1'}]}],GAME,depth,RECEIPT['request_at'])
        self.assertEqual(r['H']['starting_qb_inactive'],'yes');self.assertEqual(r['H']['listed_starters_inactive'],1)
    def test_missing_or_late_weather(self):
        spec=importlib.util.spec_from_file_location('t75runner',ROOT/'scripts/model_pick_runner.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        self.assertFalse(m.forecast_qualified({},GAME))
        weather={'status':'FORECAST','forecast_run_initialized_at':'2026-09-13T12:00:00Z','forecast_issued_at':'2026-09-13T15:45:01Z','request_at':RECEIPT['request_at'],'received_at':RECEIPT['received_at'],'valid_at':GAME['kickoff_at']}
        self.assertFalse(m.forecast_qualified(weather,GAME))

if __name__=='__main__':unittest.main()

class OperationalTests(unittest.TestCase):
    def test_frozen_file_survives_changed_shadow_configuration(self):
        spec=importlib.util.spec_from_file_location('t75runner',ROOT/'scripts/model_pick_runner.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        f=folder();r=locked();put(f/'T75-picks.json',r)
        changed={**CONFIG,'coefficients':{'elo_c':100000}}
        returned=m.freeze_game(GAME,f,SHAPE,changed,event(),RECEIPT)
        self.assertEqual(returned,r);self.assertEqual((f/'T75-picks.json').read_bytes(),encode(r))
    def test_concurrent_credit_reservations(self):
        from concurrent.futures import ThreadPoolExecutor
        p=folder()/'budget.jsonl'
        with ThreadPoolExecutor(max_workers=8) as pool:
            values=list(pool.map(lambda i:transact(p,'W1',str(i)),range(40)))
        self.assertEqual(sum(values),20);self.assertEqual(status(p)['accounted_by_week']['W1'],60)
    def test_paper_rule_cannot_use_missing_forecast(self):
        spec=importlib.util.spec_from_file_location('t75runner',ROOT/'scripts/model_pick_runner.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        r=locked();r['shadows']={'weather':{'qualified_T75':False,'wind_mph':12}}
        self.assertEqual(m.paper_pick(r,SHAPE,event(),RECEIPT),[])
    def test_schedule_projection_excludes_outcomes(self):
        from engine.t75_prepare import schedule
        source=ROOT/'work/model-pick-v1/discovery/schedule-ref.json'
        ref=json.loads(source.read_text());import csv
        records=list(csv.DictReader(Path(ref['path']).read_text().splitlines()))
        result=schedule(records)
        for group in result['groups']:
            for game in group['games']:
                self.assertFalse(set(game)&{'home_score','away_score','spread_line','total_line','result','total'})
                self.assertEqual((pick.timestamp(game['kickoff_at'])-pick.timestamp(game['capture_at'])).total_seconds(),80*60)
    def test_diagnose_zero_picks_reports_insufficient(self):
        self.assertTrue(all(r['status']=='INSUFFICIENT_SAMPLE' for r in diagnose([],[VERSION])))

class CaptureTests(unittest.TestCase):
    def test_transport_reserves_logs_cost_and_strips_secret(self):
        import engine.t75_capture as transport
        f=folder();group={k:GAME[k] for k in ('season','week','kickoff_at','capture_at','cutoff_at')}
        secret='synthetic-test-secret'
        payload=event();payload['test_redaction']=secret
        class Response:
            headers={'date':'Sun, 13 Sep 2026 15:40:00 GMT','x-requests-last':'2','Authorization':secret}
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self):return json.dumps([payload]).encode()
        with patch.object(transport,'now',return_value=pick.timestamp(RECEIPT['request_at'])),patch.object(transport.urllib.request,'urlopen',return_value=Response()) as request:
            r=transport.capture(group,f/'capture',f/'budget.jsonl',secret)
            self.assertEqual(request.call_count,1);self.assertEqual(r['status'],'CAPTURED')
            self.assertNotIn(secret,Path(r['source']['path']).read_text());self.assertNotIn('Authorization',r['headers'])
            self.assertEqual(status(f/'budget.jsonl')['accounted_by_week']['2026-W01'],2)
            transport.capture(group,f/'other',f/'budget.jsonl',secret);self.assertEqual(request.call_count,1)
    def test_transport_refuses_outside_window_before_network(self):
        import engine.t75_capture as transport
        group={k:GAME[k] for k in ('season','week','kickoff_at','capture_at','cutoff_at')}
        with patch.object(transport,'now',return_value=pick.timestamp(GAME['cutoff_at'])),patch.object(transport.urllib.request,'urlopen') as request:
            with self.assertRaises(ValueError):transport.capture(group,folder(),folder()/'ledger','synthetic')
            request.assert_not_called()
