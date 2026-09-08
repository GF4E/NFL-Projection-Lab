import csv,json,unittest,uuid
from pathlib import Path
from engine.scorecard import scorecard
from engine.pick_log import FIELDS,append
ROOT=Path(__file__).resolve().parents[1]
class ScorecardTests(unittest.TestCase):
    def setUp(self):
        self.root=ROOT/'work/joint-scorecard-tests'/uuid.uuid4().hex;self.root.mkdir(parents=True)
    def write(self,name,rows):
        p=self.root/name
        with p.open('w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
        return p
    def pick(self,id,mode='live',market='spreads',side='H',line=-3,week=1,status='picked'):
        return dict(pick_id=id,status=status,record_class=mode,season=2026,week=week,event_id='g'+str(week),market=market,home_team='H',away_team='A',side=side,line_at_approval=line,executed_book='betmgm',quote_id=id,book_price=-110)
    def test_joint_schema_and_idempotency(self):
        self.assertNotIn('approver',FIELDS);self.assertNotIn('executor',FIELDS);self.assertNotIn('execution_confirmed',FIELDS)
        q=dict(executed_book='betmgm',line=-3,book_fair_probability=.5,commence_time='2026-09-10T00:20:00Z',week=1)
        p=self.root/'joint.csv'
        self.assertEqual(append(p,q,pick_id='joint'),'appended')
        self.assertEqual(append(p,q,pick_id='joint'),'already_recorded')
        with p.open() as f: rows=list(csv.DictReader(f))
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['record_class'],'live')
    def test_weekly_cumulative_and_classes(self):
        picks=[self.pick('push'),self.pick('win','paper',line=-2.5),self.pick('loss',side='A',line=2.5),self.pick('under','paper','totals','Under',45),self.pick('over','live','totals','Over',44.5),self.pick('second',week=2),self.pick('no',status='declined')]
        p=self.write('picks.csv',picks)
        results=self.write('results.csv',[dict(event_id='g1',home_score=24,away_score=21,status='final')])
        grades=[dict(picks[0],clv_cents=10,clv_status='EXACT_LINE_EXECUTED_BOOK_CLOSE'),dict(picks[1],clv_cents=20,clv_status='EXACT_LINE_EXECUTED_BOOK_CLOSE')]
        g=self.write('clv.csv',grades)
        rows=scorecard([p],results,[g],self.root/'scorecard.csv')
        def select(scope,market,mode,week='ALL'):
            return next(r for r in rows if (r['scope'],r['market'],r['record_class'],r['week'])==(scope,market,mode,week))
        r=select('cumulative','spreads','combined')
        self.assertEqual((r['wins'],r['losses'],r['pushes'],r['pending'],r['declined']),(1,1,1,1,1))
        self.assertEqual(r['mean_clv_cents'],15);self.assertEqual(r['clv_n'],2)
        self.assertEqual(select('week','spreads','paper',1)['wins'],1)
        self.assertEqual(select('week','spreads','live',1)['mean_clv_cents'],10)
        self.assertEqual(select('cumulative','totals','combined')['pushes'],1)
        self.assertEqual(select('cumulative','totals','combined')['wins'],1)
        self.assertEqual(select('cumulative','totals','combined')['mean_clv_cents'],'')
        self.assertEqual(select('week','spreads','combined',2)['pending'],1)
    def test_duplicate_and_wrong_clv_rejected(self):
        pick=self.pick('x');p=self.write('duplicate.csv',[pick,pick])
        with self.assertRaisesRegex(ValueError,'Duplicate'):scorecard([p],output=self.root/'dup.csv')
        p=self.write('one.csv',[pick]);g=self.write('wrong.csv',[dict(pick,executed_book='fanduel',clv_cents=10,clv_status='EXACT_LINE_EXECUTED_BOOK_CLOSE')])
        with self.assertRaisesRegex(ValueError,'frozen'):scorecard([p],grades=[g],output=self.root/'bad.csv')
    def test_same_id_different_class_counted_separately(self):
        p=self.write('both.csv',[self.pick('x'),self.pick('x','paper')])
        rows=scorecard([p],output=self.root/'both-out.csv')
        combined=next(r for r in rows if r['scope']=='cumulative' and r['market']=='spreads' and r['record_class']=='combined')
        self.assertEqual(combined['picks'],2)
