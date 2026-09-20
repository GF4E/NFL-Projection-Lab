import json
import unittest
from pathlib import Path
from scripts.accuracy_scope import validate
from scripts.reference_lines import ROOT, audit, normalize, render

class AccuracyScopeTests(unittest.TestCase):
    def test_team_mae_and_score_supporting_metrics_allowed(self):
        self.assertEqual(validate({'gate':{'primary':'team_points_MAE','supporting':['margin MAE','total MAE','bias','dispersion','interval coverage','CRPS','interval score']}}),'ACTUAL_SCORE_ACCURACY_ONLY')

    def test_market_objectives_and_selection_rejected(self):
        for metric in ['ATS','cover rate','over-under','market-relative','closing line','CLV','ROI']:
            with self.subTest(metric=metric),self.assertRaises(ValueError):validate({'gate':{'primary':'team_points_MAE'},'selection_metric':metric})
        with self.assertRaises(ValueError):validate({'gate':{'primary':'CRPS'}})

    def test_completed_qb_registration_is_accuracy_only(self):
        reg=json.loads((ROOT/'work/e-elo-qb-value-v2/registration.json').read_text())
        self.assertEqual(validate(reg),'ACTUAL_SCORE_ACCURACY_ONLY')
        source=(ROOT/'scripts/elo_qb_value_evaluate.py').read_text()
        for field in ['reference_lines','spread_line','total_line','cover_rate','home_line_open']:
            self.assertNotIn(field,source)
        gate=json.loads((ROOT/'work/e-elo-qb-value-v2/gate.json').read_text())
        self.assertIn('oracle_a',gate['summary'])
        self.assertEqual([r['season'] for r in gate['scales']['a_qb']],list(range(2016,2026)))

    def test_two_diagnostic_lines_and_no_default_condition_buckets(self):
        refs={k:{'spread':{},'total':{}} for k in ['CLOSE','OPEN']}
        result=audit([],refs)
        self.assertEqual(result['label'],'DIAGNOSTIC ONLY')
        self.assertEqual(result['references']['CLOSE']['spread']['buckets'],{})
        text=render({'series':{'fixture':{'audit':result}}})
        self.assertEqual(len(text.splitlines()),2)
        self.assertEqual(text.count('<summary>DIAGNOSTIC ONLY'),2)
        self.assertIn('34.3%',text);self.assertIn('By season:',text)
        self.assertNotIn('##',text);self.assertNotIn('|---',text)

if __name__=='__main__':unittest.main()
