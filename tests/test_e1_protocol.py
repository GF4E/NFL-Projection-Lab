import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from scripts.e1_protocol import canonical_hash,validate_addendum,validate_population,influence

class ProtocolTests(unittest.TestCase):
    def test_tier_two_review_does_not_block(self):
        value=dict(original_registration_sha256='parent',candidates_gate_metrics_population_unchanged=True,
                   items=[dict(id='C1',tier=2,decision='Keep existing',reason='Conservative',source='Repo',alternative='Different convention',status='REVIEW_REQUESTED')])
        value['sha256']=canonical_hash(value)
        self.assertEqual(len(validate_addendum(value,{'sha256':'parent'},value['sha256'])),1)
        changed=copy.deepcopy(value);changed['items'][0]['decision']='Different'
        with self.assertRaises(ValueError):validate_addendum(changed,{'sha256':'parent'},value['sha256'])

    def test_equal_reduced_population_is_rejected(self):
        rows=[dict(game_id=g,season=2020,home=home) for g in ('a','b') for home in (False,True)]
        self.assertEqual(validate_population(rows,{'a','b'}),2)
        with self.assertRaises(ValueError):validate_population(rows[:2],{'a','b'})
        rows[1]['home']=False
        with self.assertRaises(ValueError):validate_population(rows,{'a','b'})

    def test_extreme_game_sensitivity_pairs_whole_games(self):
        control=np.array([2.,3.,10.]);candidate=np.array([1.,4.,5.]);ids=['a','b','c']
        expected=[1-np.delete(candidate,i).mean()/np.delete(control,i).mean() for i in range(3)]
        result=influence(control,candidate,ids)
        self.assertAlmostEqual(result['minimum'],min(expected))
        self.assertAlmostEqual(result['maximum'],max(expected))
        self.assertFalse(result['used_for_selection'])

    def test_missing_completion_preflight_never_fits_or_compares(self):
        from scripts import e1_calendar_run as runner
        with patch.object(runner.e1_calendar_audit,'run',return_value={'status':'BLOCKED_COMPLETION_EVIDENCE'}),patch.object(runner.e1_evaluate,'run') as fit,patch.object(runner.e1_prepare,'run') as prepare:
            with self.assertRaises(SystemExit):runner.run()
            fit.assert_not_called();prepare.assert_not_called()

    def test_published_sweep_is_hashed_and_parent_unchanged(self):
        root=Path('work/projection-governance-v2')
        addendum=json.loads((root/'e1-calendar-corrected/preregistration-addendum.json').read_text())
        parent=json.loads((root/'e1/registration.json').read_text())
        flags=validate_addendum(addendum,parent,addendum['sha256'])
        self.assertEqual(len(flags),4)
        self.assertEqual([i['id'] for i in addendum['items'] if i['tier']==3],['B01'])
        self.assertEqual(parent['sha256'],'a48e85241a47301ff3e462af70db6171c7c0edd750a67ac878ebe2b4411f1e62')
        self.assertEqual(canonical_hash({k:v for k,v in parent.items() if k!='sha256'}),parent['sha256'])

if __name__=='__main__':unittest.main()

class ReportConventionTests(unittest.TestCase):
    def test_numeric_pass_is_not_reported_as_rejection_and_alternatives_are_at_top(self):
        from scripts import e1_report
        names=('linear','k4','k8','state_space')
        metrics=dict(mae=7.,projected_sd=5.,actual_sd=10.,skill_climatology=.1,skill_persistence=.1,crps=4.,coverage_50=.5,coverage_80=.8)
        summary={target:dict(metrics) for target in ('team','margin','total')}
        gate=dict(numeric_gate_pass=True,relative_team_mae_improvement=.02,paired_mae_improvement_interval_95=[0.,.3])
        report=dict(decision='NUMERIC_PASS_PENDING_REVIEWS_AND_RELEASE_AUDIT',first_comparative_result_at='2026-09-16T20:00Z',games=2639,pooled={n:summary for n in names},gate={n:gate for n in names[1:]},annual={n:{str(y):summary for y in range(2016,2026)} for n in names},weeks_1_to_4={n:summary for n in names},runtime_seconds=1.,peak_rss_mib=20.)
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)
            values={'verification.json':report,'registration.json':{'sha256':'synthetic','registered_at':'2026-09-16T19:00Z'},'staff-coverage.json':{'sha256':'synthetic','coverage':{}},'state-fits.json':[], 'preregistration-addendum.json':{'items':[{'id':'C1','tier':2,'topic':'Choice','decision':'Keep registered choice.','alternative':'Unchosen alternative.'}]}}
            for name,value in values.items():(out/name).write_text(json.dumps(value))
            with patch.object(e1_report,'OUT',out):e1_report.run()
            text=(out/'report.md').read_text()
            self.assertTrue(text.startswith('**REVIEW REQUESTED'))
            self.assertIn('Unchosen alternative.',text.split('# E1')[0])
            self.assertNotIn('All registered challengers failed',text)
            self.assertIn('NUMERIC_PASS_PENDING_REVIEWS_AND_RELEASE_AUDIT',text)
