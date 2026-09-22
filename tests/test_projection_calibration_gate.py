import copy
import unittest
from engine.projection_experiments import digest,release_eligibility,CALIBRATION_GATE
from test_projection_governance import fixture


def seal(r,e,reviews):
    r['sha256']=digest({k:v for k,v in r.items() if k!='sha256'})
    e['registration_sha256']=r['sha256']
    e['sha256']=digest({k:v for k,v in e.items() if k!='sha256'})
    for review in reviews:review['evidence_sha256']=e['sha256']
    return r,e,reviews


def calibration_fixture():
    r,e,reviews=fixture()
    r.update(experiment='E-CAL-LINEAGE',gate_policy=CALIBRATION_GATE,point_tolerance=1e-12,candidates=['lineage'])
    e.update(before_team_mae=8.,after_team_mae=8.,before_team_crps=6.,after_team_crps=5.9)
    e['coverage']={t:{'50':.5,'80':.8} for t in ('team','margin','total')}
    e['before_interval_score']={t:{'50':20.,'80':30.} for t in ('team','margin','total')}
    e['after_interval_score']=copy.deepcopy(e['before_interval_score'])
    point={'away':21.25,'home':24.5,'margin':3.25,'total':45.75}
    e['point_forecasts']=[{'game_id':'g','before':point,'after':point.copy()}]
    return seal(r,e,reviews)


class CalibrationGateTests(unittest.TestCase):
    def decision(self,r,e,reviews):return release_eligibility(*seal(r,e,reviews))

    def test_calibration_can_qualify_without_point_mae_gain(self):
        r,e,v=calibration_fixture();d=self.decision(r,e,v)
        self.assertEqual(d['reasons'],[]);self.assertFalse(d['activates_method'])

    def test_exception_cannot_be_borrowed_by_point_experiment(self):
        r,e,v=calibration_fixture();r['experiment']='E-VENUE-DIRECT'
        d=self.decision(r,e,v)
        self.assertIn('UNREGISTERED_GATE_POLICY',d['reasons']);self.assertIn('TEAM_MAE_GATE',d['reasons'])

    def test_each_point_field_checked_on_every_game(self):
        for field in ('away','home','margin','total'):
            r,e,v=calibration_fixture();e['point_forecasts'][0]['after'][field]+=.01
            self.assertIn('POINT_FORECAST_CHANGED_OUT_OF_SCOPE',self.decision(r,e,v)['reasons'])

    def test_points_missing_or_incomplete_population_cannot_pass(self):
        r,e,v=calibration_fixture();e['point_forecasts']=[]
        self.assertIn('POINT_POPULATION_MISMATCH',self.decision(r,e,v)['reasons'])
        r,e,v=calibration_fixture();del e['point_forecasts']
        self.assertIn('MISSING_CALIBRATION_GATE_EVIDENCE',self.decision(r,e,v)['reasons'])

    def test_interval_gate_covers_each_target_and_level(self):
        for target in ('team','margin','total'):
            for level in ('50','80'):
                r,e,v=calibration_fixture();e['after_interval_score'][target][level]+=.01
                self.assertIn('INTERVAL_SCORE_GATE',self.decision(r,e,v)['reasons'])
                r,e,v=calibration_fixture();e['coverage'][target][level]+=.031
                self.assertIn('COVERAGE_GATE',self.decision(r,e,v)['reasons'])

    def test_crps_threshold_and_immutable_tolerance(self):
        r,e,v=calibration_fixture();e['after_team_crps']=5.95
        self.assertIn('TEAM_CRPS_GATE',self.decision(r,e,v)['reasons'])
        r,e,v=calibration_fixture();r['point_tolerance']=1
        self.assertIn('POINT_TOLERANCE_NOT_REGISTERED',self.decision(r,e,v)['reasons'])

    def test_reviews_and_lineage_still_required(self):
        r,e,v=calibration_fixture()
        self.assertIn('TWO_DISTINCT_REVIEWS_REQUIRED',self.decision(r,e,v[:1])['reasons'])
        r,e,v=calibration_fixture();e['baseline_hash']='different'
        self.assertIn('BASELINE_CHANGED',self.decision(r,e,v)['reasons'])

    def test_ordinary_gate_still_requires_point_gain(self):
        r,e,v=fixture();e['after_team_mae']=e['before_team_mae']
        self.assertIn('TEAM_MAE_GATE',self.decision(r,e,v)['reasons'])
