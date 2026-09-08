import copy,csv,importlib.util,io,json,math,unittest
from pathlib import Path
from unittest.mock import patch
from engine.elo import Elo,qb_adjustment
from engine.harvest import crps,distribution
ROOT=Path(__file__).resolve().parents[1]
class HarvestTests(unittest.TestCase):
    def test_mit_port_matches_upstream(self):
        path=ROOT/'work/harvest-elo-v1/sources/nfl-elo-game-forecast.py'
        spec=importlib.util.spec_from_file_location('upstream_538',path);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        games=[dict(team1='H',team2='A',season=y,neutral=n,score1=h,score2=a,result1=1. if h>a else .5 if h==a else 0.,elo_prob1=.5) for y,n,h,a in [(2015,0,24,21),(2015,1,10,10),(2016,0,7,28)]]
        oracle=copy.deepcopy(games)
        with patch('builtins.open',return_value=io.StringIO('team,elo\nH,1500\nA,1500\n')):mod.Forecast.forecast(oracle)
        model=Elo({'H':1500,'A':1500})
        for game,expected in zip(games,oracle):
            model.prepare('H',game['season']);model.prepare('A',game['season'])
            pred=model.forecast('H','A',bool(game['neutral']),0.,0.)
            self.assertAlmostEqual(pred['home_win_probability'],expected['my_prob1'],places=12)
            model.update('H','A',game['score1'],game['score2'],pred)
    def test_qb_adjustment_and_missing_guard(self):
        self.assertEqual(qb_adjustment(100,90),33)
        model=Elo({'H':1500,'A':1500})
        with self.assertRaises(ValueError):model.forecast('H','A')
        self.assertGreater(model.forecast('H','A',False,33,0)['home_win_probability'],model.forecast('H','A',False,0,0)['home_win_probability'])
        with self.assertRaises(ValueError):qb_adjustment(None,90)
    def test_crps_agrees_cdf_formula(self):
        pmf=distribution([-3,0,0,3,7],3).pmf
        for actual in (-10,0,3,11):
            cdf=0.;score=0.
            for x in range(min(min(pmf),actual),max(max(pmf),actual)+1):
                cdf+=pmf.get(x,0);score+=(cdf-(1 if actual<=x else 0))**2
            self.assertAlmostEqual(crps(pmf,actual),score,places=9)
    def test_forecast_no_target_label(self):
        model=Elo({'H':1500,'A':1500});before=model.forecast('H','A',False,0,0)
        self.assertEqual(before,model.forecast('H','A',False,0,0))
        model.prepare('H',2020)
        with self.assertRaises(ValueError):model.prepare('H',2019)

    def test_rolling_fit_and_missing_targets(self):
        result=json.loads((ROOT/'work/harvest-elo-v1/run-3/experiment.json').read_text())
        for row in result['season_fit_audit']:
            self.assertTrue(row['training_max_season'] is None or row['training_max_season']<row['season'])
        self.assertFalse(result['promotion_eligible'])
        for row in result['scores']:
            if row['series'] in {'candidate_total','nfelo_total'}:
                self.assertEqual(row['paired_n'],0);self.assertIsNone(row['crps'])

    def test_future_qb_input_is_rejected(self):
        import uuid
        from engine.harvest import run
        folder=ROOT/'work/harvest-tests'/uuid.uuid4().hex;folder.mkdir(parents=True)
        p=folder/'future.csv'
        p.write_text('game_id,home_qb_adjustment,away_qb_adjustment,available_at,training_season,training_week\n2015_01_PIT_NE,0,0,2026-01-01T00:00:00Z,2014,20\n')
        with self.assertRaisesRegex(ValueError,'violates T60'):run('538-qb-elo',folder/'out',p)
    def test_imported_target_week_training_rejected(self):
        import uuid
        from engine.harvest import run
        folder=ROOT/'work/harvest-tests'/uuid.uuid4().hex;folder.mkdir(parents=True)
        p=folder/'target-week.csv'
        p.write_text('game_id,margin_location,total_location,available_at,training_season,training_week\n2015_01_PIT_NE,3,45,2015-09-01T00:00:00Z,2015,1\n')
        with self.assertRaisesRegex(ValueError,'target week'):run('named-test-component',folder/'out',predictions_input=p)
