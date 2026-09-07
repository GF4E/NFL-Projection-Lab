import csv,datetime as dt,hashlib,importlib.util,json,sys,unittest,uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from engine import quote_capture as q
from engine.pricing import EXECUTION,normalize
from engine.pick_log import append
import week1_t60_runner as runner
ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'work/week1-followup-tests'/uuid.uuid4().hex;FIX.mkdir(parents=True)
G={'id':'test','refresh_at':'2026-09-09T23:15:00+00:00','cutoff_at':'2026-09-09T23:20:00+00:00','kickoff_at':'2026-09-10T00:20:00+00:00','event_ids':['g'],'reserved_credits':3}
def at(s): return dt.datetime.fromisoformat(s)
def fixture():
    return {'id':'g','home_team':'H','away_team':'A','commence_time':G['kickoff_at'],'bookmakers':[{'key':b,'last_update':G['refresh_at'],'markets':[{'key':'h2h','outcomes':[{'name':'H','price':-180},{'name':'A','price':160}]}]} for b in EXECUTION]}
class FollowupTests(unittest.TestCase):
    def test_heartbeat_once_per_hour_across_calls(self):
        state=FIX/'heartbeat.json'
        with patch('builtins.print') as log:
            self.assertTrue(runner.heartbeat(at(G['refresh_at']),state))
            self.assertFalse(runner.heartbeat(at(G['refresh_at'])+dt.timedelta(seconds=15),state))
            self.assertTrue(runner.heartbeat(at(G['refresh_at'])+dt.timedelta(hours=1),state))
            self.assertEqual(log.call_count,2)
    def test_heartbeat_clock_rollback_suppressed(self):
        state=FIX/'heartbeat-rollback.json'
        with patch('builtins.print'):
            runner.heartbeat(at(G['refresh_at']),state)
            self.assertFalse(runner.heartbeat(at(G['refresh_at'])-dt.timedelta(hours=1),state))
    def test_local_schedule_preserves_registered_utc(self):
        from zoneinfo import ZoneInfo
        before=json.loads((ROOT/'work/week1-operations-v1/schedule-before.json').read_text())
        after=json.loads(runner.PLAN.read_text())
        for old,new in zip(before['groups'],after['groups'],strict=True):
            for key,value in old.items(): self.assertEqual(new[key],value)
            for field in ('kickoff','refresh','cutoff'):
                self.assertEqual(new[field+'_local'],at(new[field+'_at']).astimezone(ZoneInfo(after['local_timezone'])).isoformat())
    def test_four_execution_books(self): self.assertEqual(EXECUTION,{'betmgm','williamhill_us','fanduel','draftkings'})
    def test_append_new_execution_books(self):
        rows,*_=normalize([(fixture(),{'at':G['refresh_at'],'sha256':'fixture'})])
        for b in ['fanduel','draftkings']:
            row=next(r for r in rows if r['executed_book']==b)
            self.assertEqual(append(FIX/(b+'.csv'),row,pick_id=b,status='declined',approver='test'),'appended')
    def test_phase_boundaries(self):
        self.assertEqual(runner.phase(G,at(G['refresh_at'])-dt.timedelta(seconds=1)),'WAIT')
        self.assertEqual(runner.phase(G,at(G['refresh_at'])),'REFRESH')
        self.assertEqual(runner.phase(G,at(G['refresh_at'])+dt.timedelta(seconds=60)),'WAIT_FOR_FREEZE')
        self.assertEqual(runner.phase(G,at(G['cutoff_at'])),'FREEZE')
        self.assertEqual(runner.phase(G,at(G['cutoff_at'])+dt.timedelta(seconds=60)),'MISSED')
    def receipt(self):
        raw=json.dumps([fixture()]).encode();p=FIX/'source.json'
        if not p.exists(): p.write_bytes(raw)
        return {'at':G['refresh_at'],'sha256':hashlib.sha256(raw).hexdigest(),'capture':str(p.relative_to(ROOT))}
    def test_freeze_labels_and_idempotency(self):
        folder=FIX/'freeze';r=runner.freeze(G,self.receipt(),at(G['cutoff_at']),folder)
        self.assertEqual(r['status'],'T60');before=(folder/'T60-pricing.csv').read_bytes()
        self.assertEqual(runner.freeze(G,self.receipt(),at(G['cutoff_at'])+dt.timedelta(seconds=15),folder),r)
        self.assertEqual(before,(folder/'T60-pricing.csv').read_bytes())
        with (folder/'T60-pricing.csv').open() as f: rows=list(csv.DictReader(f))
        self.assertTrue(all(x['evidence_label']=='T60' for x in rows))
    def test_late_freeze_rejected(self):
        with self.assertRaises(ValueError):runner.freeze(G,self.receipt(),at(G['cutoff_at'])+dt.timedelta(seconds=61),FIX/'late')
    def test_post_cutoff_input_rejected(self):
        r=self.receipt();r['at']=(at(G['cutoff_at'])+dt.timedelta(seconds=1)).isoformat()
        with self.assertRaises(ValueError):runner.freeze(G,r,at(G['cutoff_at']),FIX/'future')
    def test_one_sided_alias_not_fabricated(self):
        e=fixture();e['bookmakers'][0]['markets']=[{'key':'player_pass_yds_alternate','outcomes':[{'name':'Over','description':'QB','point':199.5,'price':-200}]}]
        rows,issues,*_=normalize([(e,{'at':G['refresh_at'],'sha256':'fixture'})]);self.assertFalse(any(r['market']=='player_pass_yds' for r in rows));self.assertTrue(issues)
    def test_live_budget_preserved(self):
        local=FIX/'budget';local.mkdir();(local/'credits.jsonl').write_text(json.dumps({'status':'reserved','request_id':'old','reserved_credits':281})+'\n'+json.dumps({'status':'complete','request_id':'old','credits':281})+'\n')
        with patch.object(q,'RUN',local),patch.object(q,'key',return_value='fixture'),patch.object(q.subprocess,'run') as transport:
            with self.assertRaisesRegex(RuntimeError,'remaining live'):q.fetch('sports/nfl/odds',{'markets':'h2h,spreads,totals','bookmakers':'betmgm'})
            transport.assert_not_called()
    def test_no_early_live_dispatch(self):
        plan=json.loads((ROOT/'work/week1-followups-v1/schedule.json').read_text());g=plan['groups'][0]
        with patch.object(q,'now',return_value=(at(g['refresh_at'])-dt.timedelta(seconds=1)).isoformat()),patch.object(q,'key',return_value='fixture'),patch.object(q.subprocess,'run') as transport:
            with self.assertRaisesRegex(RuntimeError,'Outside T65'):q.fetch('sports/americanfootball_nfl/odds',{'markets':'h2h,spreads,totals','bookmakers':'betmgm','eventIds':','.join(g['event_ids'])},live_group=g['id'])
            transport.assert_not_called()
if __name__=='__main__':unittest.main()
