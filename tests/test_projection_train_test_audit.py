import copy
import importlib.util
from pathlib import Path
import unittest

path=Path(__file__).resolve().parents[1]/'work/engine-rebuild/check_train_test.py'
spec=importlib.util.spec_from_file_location('train_test_audit',path)
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)


class EvaluationAuditTests(unittest.TestCase):
    def setUp(self):
        self.schedule=[{'game_id':'train','season':2015,'gameday':'2015-12-20','gametime':'13:00','home_score':24,'away_score':21},
            {'game_id':'test','season':2016,'gameday':'2016-09-11','gametime':'13:00','home_score':17,'away_score':10}]
        fit={'training_hash':'example'};sha=audit.digest(fit)
        self.replay={'authoritative':False,'fits':[{'fit':fit,'fit_sha256':sha,'available_at':'2016-09-06T14:00:00Z',
            'at':'2016-09-06T13:00:00Z','training_games':['train'],'season':2016,'kind':'OUTER_SEASON_INITIAL_FIT'}],
            'games':[{'game_id':'test','season':2016,'fit_sha256':sha,'fit_at':'2016-09-06T14:00:00Z',
                'issuance_at':'2016-09-11T15:45:00Z','training_hash':'example','home':20.,'away':19.,'actual_home':17,'actual_away':10}]}

    def test_grouped_integer_targets_are_scored_as_regression(self):
        result=audit.audit(self.replay,self.schedule)
        self.assertEqual(result['test_games'],1);self.assertEqual(result['test_team_targets'],2)
        self.assertEqual(result['by_season']['2016']['team_mae'],6.)

    def test_training_on_target_or_future_game_fails(self):
        self.replay['fits'][0]['training_games'].append('test')
        with self.assertRaisesRegex(ValueError,'not complete'):audit.audit(self.replay,self.schedule)

    def test_source_numeric_strings_preserve_known_targets(self):
        for row in self.schedule:
            for side in ('home','away'):row[side+'_score']=str(row[side+'_score'])
        self.assertEqual(audit.audit(self.replay,self.schedule)['test_team_targets'],2)

    def test_fit_at_issuance_is_unavailable(self):
        value=self.replay['games'][0]['issuance_at']
        self.replay['fits'][0]['available_at']=value;self.replay['games'][0]['fit_at']=value
        with self.assertRaisesRegex(ValueError,'unavailable'):audit.audit(self.replay,self.schedule)

    def test_duplicate_targets_and_changed_actuals_fail(self):
        bad=copy.deepcopy(self.replay);bad['games']*=2
        with self.assertRaisesRegex(ValueError,'Duplicate test'):audit.audit(bad,self.schedule)
        self.replay['games'][0]['actual_home']=17.5
        with self.assertRaisesRegex(ValueError,'integer score'):audit.audit(self.replay,self.schedule)
