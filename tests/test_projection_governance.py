import copy
import datetime as dt
import statistics
import unittest
from unittest.mock import patch
from engine.projection_experiments import digest,release_eligibility
from engine.projection_learning import metrics,build_report
from scripts import projection_learning as runtime
from scripts import projection_learning_gate as legacy
from test_projection_learning import card


def fixture():
    r=dict(experiment='E1',week=2,registered_at='2026-09-15T12:00:00+00:00',candidates=['k4','k8','state'],training_window='prior seasons',tuning='nested',tie_break='simpler',disproving_conditions=['no gain'],baseline_hash='baseline')
    r['sha256']=digest(r)
    e=dict(registration_sha256=r['sha256'],baseline_hash='baseline',first_comparative_result_at='2026-09-15T13:00:00+00:00',baseline_game_ids=['g'],candidate_game_ids=['g'],population='HISTORICAL_DEVELOPMENT',nested_chronology_verified=True,candidate_specific_calibration=True,paired_uncertainty=True,current_as_issued_comparison=True,separation_tests_passed=True,immutability_tests_passed=True,before_team_mae=10.,after_team_mae=9.8,coverage={t:{'50':.5,'80':.8} for t in ('margin','total')},registered_extra_gates_passed=True,data_corrections=[],rollback_fit_hash='parent',candidate_hashes={k:k for k in ('code','configuration','data','fit')})
    e['sha256']=digest(e)
    reviews=[dict(reviewer=name,evidence_sha256=e['sha256'],answers=['answer']*4,objections=[]) for name in ('Claude','Dr. M')]
    return r,e,reviews


class GovernanceTests(unittest.TestCase):
    def test_old_proposal_cannot_read_or_replay_promoted_receipt(self):
        with patch.object(legacy,'active_artifact',side_effect=AssertionError('must not load')),patch.object(legacy,'save',side_effect=AssertionError('must not write')):
            self.assertEqual(legacy.propose(1,dt.datetime.now(dt.timezone.utc))['state'],'METHOD_PROMOTION_DISABLED')

    def test_weekly_runner_never_calls_method_proposal(self):
        with patch.object(runtime,'initialize'),patch.object(runtime,'current_rows',return_value=[{'season':2026}]),patch.object(runtime,'due_week',return_value=1),patch.object(runtime,'closeout_for_refit',return_value=True),patch.object(runtime,'weekly_refit',return_value={'state':'REFIT_COMPLETE'}),patch.object(runtime,'save'),patch.object(legacy,'propose',side_effect=AssertionError('automatic promotion path called')):
            r=runtime.run_weekly()
            self.assertEqual(r['improvement']['state'],'METHOD_PROMOTION_DISABLED')

    def test_sd_uses_same_graded_population(self):
        c=card();before=copy.deepcopy(c);r=metrics([c])
        self.assertEqual(r['projected_team_points_sd'],0)
        self.assertEqual(r['actual_team_points_sd'],statistics.pstdev([24,17]))
        self.assertEqual(c,before)
        report=build_report([c],{})
        self.assertIn('actual_team_points_sd',report['columns'])

    def test_positive_decision_never_activates(self):
        r,e,reviews=fixture();d=release_eligibility(r,e,reviews)
        self.assertEqual(d['state'],'ELIGIBLE_FOR_EXPLICIT_RELEASE');self.assertFalse(d['activates_method'])

    def test_leak_and_double_count_objections_block(self):
        for kind in ('leak','double_count'):
            r,e,reviews=fixture();reviews[0]['objections']=[dict(kind=kind)]
            self.assertIn('UNRESOLVED_REVIEW_OBJECTION',release_eligibility(r,e,reviews)['reasons'])

    def test_missing_review_and_changed_hash_block(self):
        r,e,reviews=fixture();r['week']=3
        self.assertIn('REGISTRATION_HASH_MISMATCH',release_eligibility(r,e,reviews[:1])['reasons'])
        self.assertIn('TWO_DISTINCT_REVIEWS_REQUIRED',release_eligibility(r,e,reviews[:1])['reasons'])

    def test_unpaired_comparison_and_subthreshold_gain_block(self):
        r,e,reviews=fixture();e['candidate_game_ids']=['other'];e['after_team_mae']=9.95
        d=release_eligibility(r,e,reviews)
        self.assertIn('UNPAIRED_POPULATION',d['reasons']);self.assertIn('TEAM_MAE_GATE',d['reasons'])


if __name__=='__main__':unittest.main()
