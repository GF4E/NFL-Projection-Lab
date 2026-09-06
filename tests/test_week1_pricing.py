import copy,csv,importlib.util,json,math,sys,unittest,uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.pricing import *
from engine.pick_log import append,initialize,FIELDS
from engine import quote_capture
FIXTURES=Path(__file__).resolve().parents[1]/'work/week1-pricing-tests'/uuid.uuid4().hex
FIXTURES.mkdir(parents=True)
def fixture():
    e={'id':'g','home_team':'Home','away_team':'Away','commence_time':'2026-09-10T00:20:00Z','bookmakers':[]}
    for b in ['betmgm','fanduel']:
        e['bookmakers'].append({'key':b,'last_update':'2026-09-06T21:00:00Z','markets':[{'key':'spreads','outcomes':[{'name':'Home','point':-3.5,'price':-110},{'name':'Away','point':3.5,'price':-110}]}]})
    return e,{'at':'2026-09-06T21:01:00+00:00','sha256':'fixture'}
class PricingTests(unittest.TestCase):
    def test_symmetric_two_way(self):
        p,k=power_devig([-110,-110]);self.assertAlmostEqual(p[0],.5,places=12);self.assertGreater(k,1)
    def test_symmetric_three_way(self):
        p,k=power_devig([200,200,200]);self.assertTrue(all(abs(v-1/3)<1e-12 for v in p))
    def test_hand_solvable_asymmetric_power(self):
        desired=[.5,.3,.2]; prices=[american(math.sqrt(p)) for p in desired]
        probs,k=power_devig(prices);self.assertAlmostEqual(k,2,places=10)
        for a,b in zip(probs,desired): self.assertAlmostEqual(a,b,places=12)
    def test_no_vig_even_money(self): self.assertAlmostEqual(power_devig([-100,100])[1],1)
    def test_invalid_prices(self):
        for p in ([0,-110],[float('nan'),-110],[-110],[-110]*4):
            with self.assertRaises(ValueError): power_devig(p)
    def test_cents_and_boundaries(self):
        self.assertAlmostEqual(american(.6),-150);self.assertAlmostEqual(price_edge(.6,-140),10)
        self.assertTrue(qualifies(.6,-140));self.assertFalse(qualifies(.5999,-140));self.assertFalse(qualifies(.7001,-140));self.assertFalse(qualifies(.6,-141))
        self.assertAlmostEqual(cents(-100),cents(100))
    def test_exact_line_consensus(self):
        e,r=fixture();rows,issues,_,_=normalize([(e,r)])
        self.assertEqual(len(rows),4);self.assertTrue(all(x['qualifying_books']==2 for x in rows));self.assertTrue(all(abs(x['fair_probability']-.5)<1e-12 for x in rows))
    def test_no_mixed_line_devig(self):
        e,r=fixture();e['bookmakers'][0]['markets'][0]['outcomes'][1]['point']=4.5
        rows,issues,_,_=normalize([(e,r)]);self.assertTrue(issues);self.assertTrue(all(x['executed_book']=='fanduel' for x in rows))
    def test_no_cross_line_consensus(self):
        e,r=fixture()
        e['bookmakers'][1]['markets'][0]['outcomes'][0]['point']=-4.5;e['bookmakers'][1]['markets'][0]['outcomes'][1]['point']=4.5
        rows,*_=normalize([(e,r)]);self.assertTrue(all(x['qualifying_books']==1 for x in rows))
    def test_snapshot_deduplicates_book(self):
        e,r=fixture();rows,*_=normalize([(e,r),(e,r)]);self.assertEqual(len(rows),4)
    def test_stale_quote_rejected(self):
        e,r=fixture();r['at']='2026-09-06T23:01:00Z';rows,issues,*_=normalize([(e,r)]);self.assertEqual(rows,[]);self.assertTrue(issues)
    def test_sharp_priority(self):
        e,r=fixture();b=copy.deepcopy(e['bookmakers'][0]);b['key']='pinnacle';e['bookmakers'].append(b)
        rows,_,sharp,_=normalize([(e,r)]);self.assertEqual(sharp,'pinnacle');self.assertFalse(any(x['board_eligible'] for x in rows if x['executed_book']=='pinnacle'))
    def test_actual_qualifying_board_path(self):
        e,r=fixture()
        e['bookmakers'][0]['markets'][0]['outcomes'][0]['price']=-140
        e['bookmakers'][0]['markets'][0]['outcomes'][1]['price']=130
        e['bookmakers'][1]['markets'][0]['outcomes'][0]['price']=-200
        e['bookmakers'][1]['markets'][0]['outcomes'][1]['price']=170
        sharp=copy.deepcopy(e['bookmakers'][1]);sharp['key']='pinnacle';e['bookmakers'].append(sharp)
        rows,*_=normalize([(e,r)])
        flags=[q for q in rows if q['board_eligible']]
        self.assertEqual(len(flags),1);self.assertEqual(flags[0]['executed_book'],'betmgm')
        self.assertEqual(append(FIXTURES/'flagged-paper.csv',flags[0],pick_id='flagged',status='approved',approver='test',paper=True),'appended')
        with (FIXTURES/'flagged-paper.csv').open() as f: saved=list(csv.DictReader(f))
        self.assertEqual(saved[0]['record_class'],'paper');self.assertEqual(saved[0]['quote_id'],flags[0]['quote_id'])
    def test_append_idempotency_and_conflict(self):
        q=normalize([fixture()])[0][0];q['executed_book']='betmgm';p=FIXTURES/'decisions.csv'
        self.assertEqual(append(p,q,pick_id='test',status='declined',approver='test'), 'appended');before=p.read_bytes()
        self.assertEqual(append(p,q,pick_id='test',status='declined',approver='test'),'already_recorded');self.assertEqual(p.read_bytes(),before)
        with self.assertRaises(ValueError): append(p,q,pick_id='test',status='approved',approver='test')
    def test_paper_execution_separate(self):
        q=normalize([fixture()])[0][0];q['executed_book']='betmgm'
        with self.assertRaises(ValueError): append(FIXTURES/'paper.csv',q,pick_id='x',status='executed',approver='test',paper=True)
    def test_cap_no_dispatch(self):
        p=FIXTURES/'budget';p.mkdir();(p/'credits.jsonl').write_text(json.dumps({'request_id':'old','status':'reserved','reserved_credits':299})+'\n'+json.dumps({'request_id':'old','status':'complete','credits':299})+'\n')
        with patch.object(quote_capture,'RUN',p),patch.object(quote_capture,'key',return_value='fixture'),patch.object(quote_capture.subprocess,'run') as call:
            with self.assertRaisesRegex(RuntimeError,'cap'): quote_capture.fetch('unused',{'markets':'h2h,spreads,totals','bookmakers':'betmgm'})
            call.assert_not_called()
    def test_uncertain_cost_is_reserved(self):
        self.assertEqual(quote_capture.spent([{'request_id':'x','status':'reserved','reserved_credits':10}]),10)
if __name__=='__main__': unittest.main()
