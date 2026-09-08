import csv,json,math,unittest,uuid
from pathlib import Path
from engine.market_distribution import forecast,load,REGISTRY,wong
from engine.market_grade import grade
from engine.pricing import normalize,qualifies
ROOT=Path(__file__).resolve().parents[1]
class MarketTests(unittest.TestCase):
    def test_residual_mass(self):
        ref=json.loads(REGISTRY.read_text());artifact=load(ref['path'],ref['sha256'])
        for target in artifact['targets'].values():
            self.assertEqual(sum(target['counts'].values()),target['n'])
            self.assertEqual(sum(target['exact_residual_counts'].values()),target['n'])
            self.assertAlmostEqual(sum(c/target['n'] for c in target['counts'].values()),1)
    def test_integer_push_and_cover(self):
        m=forecast(-3,45)
        self.assertGreater(m.spread(-3)['push'],0)
        self.assertLess(m.spread(-3)['win'],.5)
        self.assertGreater(m.spread(-2.5)['win'],.5)
        self.assertEqual(m.spread(-2.5)['push'],0)
        self.assertGreater(m.totals(45)['push'],0)
        self.assertGreater(forecast(-3.5,45.5).moneyline()['push'],0)
    def test_teaser_symmetry_and_mass(self):
        m=forecast(-3,45)
        for home,line in [(True,-3),(False,3)]:
            self.assertGreater(m.teaser(line,home=home)['win'],m.spread(line,home)['win'])
        for over in (True,False): self.assertGreater(m.teaser(45,'totals',over=over)['win'],m.totals(45,over)['win'])
        self.assertAlmostEqual(m.spread(-3)['win']+m.spread(3,False)['win']+m.spread(-3)['push'],1)
        self.assertAlmostEqual(sum(m.margin.pmf.values()),1)
        self.assertTrue(all(m.margin.cdf(x)<=m.margin.cdf(x+1) for x in range(-100,100)))
        self.assertAlmostEqual(m.moneyline()['win']+m.moneyline(False)['win']+m.moneyline()['push'],1)
    def test_wong(self):
        for line in (-8.5,-8,-7.5,1.5,2,2.5): self.assertTrue(wong(line))
        for line in (-9,-7,1,3): self.assertFalse(wong(line))
    def rows(self):
        event={'id':'test','home_team':'H','away_team':'A','commence_time':'2026-09-10T00:20:00+00:00','bookmakers':[]}
        for book in ('betmgm','draftkings'):
            event['bookmakers'].append({'key':book,'last_update':'2026-09-09T23:15:00+00:00','markets':[
                {'key':'spreads','outcomes':[{'name':'H','point':-3,'price':-110},{'name':'A','point':3,'price':-110}]},
                {'key':'totals','outcomes':[{'name':'Over','point':45,'price':-110},{'name':'Under','point':45,'price':-110}]},
                {'key':'alternate_spreads','outcomes':[{'name':'H','point':3,'price':-110},{'name':'A','point':-3,'price':-110}]}]})
        return normalize([(event,{'at':'2026-09-09T23:15:00+00:00','sha256':'fixture'})])[0]
    def test_board_filter_is_explicit_union(self):
        rows=self.rows()
        self.assertTrue(any(r['model_filter_pass'] for r in rows))
        for r in rows:
            self.assertEqual(r['filter_pass'],r['consensus_filter_pass'] or r['model_filter_pass'])
            self.assertEqual(r['model_filter_pass'],qualifies(r['model_fair_probability'],r['book_price']))
    def test_grade_and_book_isolation(self):
        folder=ROOT/'work/market-distribution-tests'/uuid.uuid4().hex;folder.mkdir(parents=True)
        rows=self.rows()
        for r in rows:r.update(evidence_label='T60',frozen_at='2026-09-09T23:20:00+00:00',cutoff_at='2026-09-09T23:20:00+00:00',input_received_at='2026-09-09T23:15:00+00:00')
        def write(name,data):
            p=folder/name
            with p.open('w',newline='') as f:
                w=csv.DictWriter(f,fieldnames=list(data[0]));w.writeheader();w.writerows(data)
            return p
        t=write('T60.csv',rows);res=write('results.csv',[dict(event_id='test',home_score=24,away_score=21,status='final')])
        pick=next(r for r in rows if r['executed_book']=='betmgm' and r['market']=='spreads')
        p=write('picks.csv',[dict(quote_id=pick['quote_id'],pick_id='p',event_id='test',executed_book='betmgm',market='spreads',player='',side=pick['side'],line_at_approval=pick['line'],book_price=-110,decision_at=pick['cutoff_at'],record_class='executed')])
        close=dict(pick,executed_book='draftkings',quote_updated_at='2026-09-10T00:19:00+00:00')
        c=write('wrong-book.csv',[close]);summary=grade([t],res,p,c,folder/'grade-missing')
        self.assertEqual(len(summary['coverage']),6)
        self.assertTrue(all(x['n']==1 for x in summary['coverage']))
        self.assertIn('MISSING_EXECUTED_BOOK_CLOSE',(folder/'grade-missing/pick_clv.csv').read_text())
        close['executed_book']='betmgm';c=write('close.csv',[close]);grade([t],res,p,c,folder/'grade')
        self.assertIn('EXACT_LINE_EXECUTED_BOOK_CLOSE',(folder/'grade/pick_clv.csv').read_text())
        with (folder/'grade/pick_clv.csv').open() as f: graded=list(csv.DictReader(f))
        self.assertAlmostEqual(float(graded[0]['clv_cents']),-10)
        rows[0]['frozen_at']='2026-09-09T23:21:00+00:00'
        late=write('late.csv',rows)
        with self.assertRaises(ValueError):grade([late],res,p,c,folder/'rejected')
