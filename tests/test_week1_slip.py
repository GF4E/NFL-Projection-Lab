import csv
import copy
import datetime as dt
import json
import unittest
import uuid
from pathlib import Path
from engine.slip_ingest import ingest,parse,validate,SLIP_FIELDS
from engine.slip_grade import settle
from engine.scorecard import scorecard
ROOT=Path(__file__).resolve().parents[1]
G={'game_id':'2026_01_SF_LA','season':2026,'week':1,'home_team':'Los Angeles Rams','away_team':'San Francisco 49ers','home_abbr':'LA','away_abbr':'SF','kickoff_at':'2026-09-11T00:35:00Z'}
TEXT='BetMGM\n2026_01_SF_LA\nSan Francisco 49ers @ Los Angeles Rams\nSpread\nPick: Los Angeles Rams -3 (-110)\nStake: $25.00\nPlaced: 2026-09-10T18:05:00-04:00'
SHAPE={'targets':{'margin':{'counts':{'-7':1,'0':2,'7':1}},'total':{'counts':{'-7':1,'0':2,'7':1}}}}
class SlipTests(unittest.TestCase):
    def setUp(self):
        self.root=ROOT/'work/slip-ingest-v1/tests'/uuid.uuid4().hex;self.root.mkdir(parents=True)
        self.log=self.root/'pick_log.csv'
    def ingest(self,text=TEXT,**kw):return ingest(text,[G],self.log,private=self.root/'private-input',**kw)
    def rows(self):return list(csv.DictReader(self.log.read_text().splitlines()))
    def test_complete_text_and_dedup(self):
        r=self.ingest();self.assertEqual(r['status'],'executed');row=self.rows()[0]
        self.assertEqual((row['source'],row['status'],row['record_class']),('jaret','executed','live'))
        self.assertEqual(float(row['stake']),25);self.assertEqual(row['placed_at'],'2026-09-10T18:05:00-04:00')
        self.assertEqual(self.ingest()['status'],'already_recorded');self.assertEqual(len(self.rows()),1)
        self.assertEqual(row['fair_probability'],'');self.assertEqual(row['model_probability'],'')
    def test_missing_fields_no_row_then_confirmation(self):
        r=self.ingest(TEXT.replace('Stake: $25.00','').replace('Placed: 2026-09-10T18:05:00-04:00',''))
        self.assertEqual(r['status'],'NEEDS_CONFIRMATION');self.assertIn('placed_at',r['questions']);self.assertFalse(self.log.exists())
        r=self.ingest(TEXT.replace('Stake: $25.00',''),overrides={'stake':'30','stake_currency':'USD'})
        self.assertEqual(r['status'],'executed')
    def test_ocr_requires_review(self):
        r=self.ingest(ocr=[{'text':TEXT,'confidence':.99}]);self.assertEqual(r['status'],'NEEDS_CONFIRMATION');self.assertFalse(self.log.exists())
        r=self.ingest(ocr=[{'text':TEXT,'confidence':.99}],confirmed=list(parse(TEXT,[G])))
        self.assertEqual(r['status'],'executed')
    def test_missing_timezone_ambiguous_game(self):
        r=self.ingest(TEXT.replace('-04:00',''));self.assertIn('placed_at',r['questions'])
        other={**G,'game_id':'2026_18_SF_LA'}
        p=parse(TEXT.replace('2026_01_SF_LA\n',''),[G,other]);self.assertIsNone(p['game'])
    def test_thousands_and_malformed_amount(self):
        self.assertEqual(parse(TEXT.replace('$25.00','$1,250.00'),[G])['stake'],'1250.00')
        self.assertIsNone(parse(TEXT.replace('$25.00','$1,25'),[G])['stake'])
    def test_totals_moneyline_and_reject_ticket(self):
        r=self.ingest(TEXT.replace('Spread\nPick: Los Angeles Rams -3','Total\nUnder 44.5'))
        self.assertEqual(r['status'],'executed');self.assertEqual(self.rows()[0]['side'],'Under')
        self.assertTrue(validate(parse(TEXT+'\nParlay',[G]),[G]).get('ticket'))
        r=parse(TEXT.replace('Spread\nPick: Los Angeles Rams -3','Moneyline\nPick: Los Angeles Rams'),[G]);self.assertEqual(r['line'],'0');self.assertEqual(r['market'],'moneyline')
    def test_reject_invalid_book_and_stake(self):
        r=self.ingest(overrides={'book':'other','stake':'-2'});self.assertIn('book',r['questions']);self.assertIn('stake',r['questions']);self.assertFalse(self.log.exists())
    def test_grade_and_source_breakdown(self):
        self.ingest();p=self.rows()[0];r={'final':True,'home_score':24,'away_score':21,'spread_line':4,'total_line':46,'source_sha256':'synthetic'}
        g=settle(p,r,SHAPE);self.assertEqual(g['outcome'],'P');self.assertEqual(g['profit'],0);self.assertEqual(g['clv_reference'],'nflverse_close_vs_executed_price')
        win=settle({**p,'line_at_approval':'-2.5'},r,SHAPE);self.assertEqual(win['outcome'],'W');self.assertAlmostEqual(win['profit'],25*100/110)
        self.assertEqual(settle(p,None,SHAPE)['status'],'PENDING')
        paths=[]
        for name,rows in [('results',[{'event_id':G['game_id'],'home_score':24,'away_score':21,'status':'final'}]),('grades',[{**p,**g}])]:
            path=self.root/(name+'.csv');paths.append(path)
            with path.open('w',newline='') as f:w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
        rows=scorecard([self.log],paths[0],[paths[1]],self.root/'scorecard.csv')
        row=next(r for r in rows if r['source']=='jaret' and r['scope']=='cumulative' and r['market']=='spreads' and r['record_class']=='live')
        self.assertEqual(row['pushes'],1);self.assertEqual(row['clv_n'],1)
    def test_moneyline_tie_and_total_settle(self):
        self.ingest();p=self.rows()[0];r={'final':True,'home_score':24,'away_score':24,'spread_line':0,'total_line':46,'source_sha256':'synthetic'}
        self.assertEqual(settle({**p,'market':'moneyline','line_at_approval':'0'},r,SHAPE)['outcome'],'P')
        self.assertEqual(settle({**p,'market':'totals','side':'Under','line_at_approval':'47.5'},r,SHAPE)['outcome'],'L')

class SlipIntegrationTests(unittest.TestCase):
    def test_first_grade_survives_corrected_final(self):
        from engine.slip_grade import run
        root=ROOT/'work/slip-ingest-v1/tests'/uuid.uuid4().hex;root.mkdir(parents=True)
        log=root/'pick_log.csv';ingest(TEXT,[G],log,private=root/'private-input')
        a=root/'a.csv';b=root/'b.csv'
        a.write_text('game_id,home_score,away_score,spread_line,total_line,result,total\n2026_01_SF_LA,24,20,4,46,4,44\n')
        b.write_text('game_id,home_score,away_score,spread_line,total_line,result,total\n2026_01_SF_LA,3,20,4,46,-17,23\n')
        first=run(log,root/'grade',a,include_model=False);second=run(log,root/'grade',b,include_model=False)
        self.assertEqual(first,second)
        grades=list((root/'grade/grades').glob('*.json'));self.assertEqual(len(grades),1)
        self.assertEqual(json.loads(grades[0].read_text())['outcome'],'W')
    def test_mixed_clv_references_not_averaged(self):
        root=ROOT/'work/slip-ingest-v1/tests'/uuid.uuid4().hex;root.mkdir(parents=True)
        log=root/'pick_log.csv';ingest(TEXT,[G],log,private=root/'private-input')
        p=list(csv.DictReader(log.read_text().splitlines()))[0]
        other={**p,'pick_id':'engine-test','source':'engine','status':'picked'}
        with log.open('a',newline='') as f:csv.DictWriter(f,fieldnames=SLIP_FIELDS).writerow(other)
        g=root/'grades.csv';rows=[{**p,'clv_cents':10,'clv_status':'SLIP_NFLVERSE_CLOSE_PRICED','clv_reference':'nflverse_close_vs_executed_price'}, {**other,'clv_cents':30,'clv_status':'EXACT_LINE_EXECUTED_BOOK_CLOSE','clv_reference':'executed_book_close'}]
        with g.open('w',newline='') as f:w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
        report=scorecard([log],grades=[g],output=root/'scorecard.csv')
        row=next(r for r in report if r['source']=='ALL' and r['scope']=='cumulative' and r['market']=='spreads' and r['record_class']=='combined')
        self.assertEqual(row['clv_reference'],'MIXED_SEE_REFERENCE_ROWS');self.assertEqual(row['mean_clv_cents'],'')

class SlipLiveTimingTest(unittest.TestCase):
    def test_live_placement_has_no_pregame_clv(self):
        p={'market':'spreads','side':G['home_team'],'home_team':G['home_team'],'line_at_approval':'-3','book_price':'-110','stake':'25','stake_currency':'USD','placed_at':'2026-09-11T01:00:00Z','commence_time':G['kickoff_at']}
        r={'final':True,'home_score':24,'away_score':20,'spread_line':4,'total_line':46,'source_sha256':'synthetic'}
        g=settle(p,r,SHAPE);self.assertEqual(g['outcome'],'W');self.assertIsNone(g['clv_cents']);self.assertEqual(g['clv_status'],'INAPPLICABLE_PLACED_AFTER_PREGAME_CLOSE')
