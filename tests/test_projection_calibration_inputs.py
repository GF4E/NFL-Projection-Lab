import copy, datetime as dt, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/engine-rebuild'))
from prepare_calibration_inputs import manifest, history_row, own_history
from engine.projection.model import hash_value

class CalibrationInputsTests(unittest.TestCase):
    def setUp(self):
        self.schedule={'prior':{'gameday':'2020-09-10','gametime':'20:00','home_score':24,'away_score':20},
                       'target':{'gameday':'2020-09-17','gametime':'20:00','home_score':21,'away_score':17}}
        self.at='2020-09-15T13:10:00+00:00';self.method='a'*64
        self.row={'game_id':'target','season':2020,'home':23.1,'away':20.2,'actual_home':21,'actual_away':17}
    def test_future_and_equality_training_outcomes_fail(self):
        for at in ('2020-09-11T03:59:59+00:00','2020-09-11T04:00:00+00:00'):
            with self.assertRaises(ValueError):manifest(self.method,['prior'],at,self.schedule)
    def test_fit_at_issuance_and_self_training_fail(self):
        m=manifest(self.method,['prior'],self.at,self.schedule)
        for corrupt in ({**m,'available_at':'2020-09-17T22:45:00+00:00'}, {**m,'training_game_ids':['target']}):
            with self.assertRaises(ValueError):history_row(self.row,corrupt,hash_value(corrupt),self.schedule)
    def test_actual_score_mismatch_fails(self):
        m=manifest(self.method,['prior'],self.at,self.schedule)
        with self.assertRaises(ValueError):history_row({**self.row,'actual_home':22},m,hash_value(m),self.schedule)
    def test_exact_fit_identity_and_reordering(self):
        fitted={'groups':['calibration','elo'],'penalty':10,'training_hash':'training'};sha=hash_value(fitted)
        f={'fit':fitted,'fit_sha256':sha,'training_games':['prior'],'available_at':self.at,'at':'2020-09-15T13:00:00+00:00'}
        g={**self.row,'fit_sha256':sha,'fit_at':self.at,'training_hash':'training'}
        bundle={'fits':[f],'games':[g]};source={'path':'fixture','sha256':'b'*64}
        a=own_history([(source,bundle)],self.method,self.schedule)
        self.assertEqual(a,own_history([(source,{'fits':list(reversed(bundle['fits'])),'games':list(reversed(bundle['games']))})],self.method,self.schedule))
        bad=copy.deepcopy(bundle);bad['fits'][0]['fit_sha256']='c'*64
        with self.assertRaises(ValueError):own_history([(source,bad)],self.method,self.schedule)
        bad=copy.deepcopy(bundle);bad['games'][0]['training_hash']='wrong'
        with self.assertRaises(ValueError):own_history([(source,bad)],self.method,self.schedule)
if __name__=='__main__':unittest.main()
