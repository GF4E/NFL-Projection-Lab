"""Unavailable personnel results cannot enter the corrected research donor."""
import copy
import datetime as dt
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/engine-rebuild'))
sys.path.insert(0,str(ROOT/'tests'))
from reconstruct_donor_qualification import prior_personnel
from engine.projection_v3.personnel import enrich
from test_projection_v3 import raw, row
from scripts.projection_v3_sources import aggregate
UTC=dt.timezone.utc

class DonorCalendarTests(unittest.TestCase):
    def test_strict_four_hour_boundary_and_actual_played_date(self):
        games=[{'game_id':'equal','season':2020,'date':'2020-12-08'},
               {'game_id':'prior','season':2020,'date':'2020-12-07'}]
        schedule={'equal':{'gameday':'2020-12-08','gametime':'05:00'},
                  'prior':{'gameday':'2020-12-07','gametime':'20:00'}}
        result=prior_personnel({'games':games,'charts':[]},schedule,'2020-12-10',dt.datetime(2020,12,8,14,tzinfo=UTC))
        self.assertEqual([g['game_id'] for g in result['games']],['prior'])

    def test_legacy_first_game_date_cap_is_preserved(self):
        game={'game_id':'new','season':2020,'date':'2020-12-07'}
        data={'games':[game],'charts':[]}
        self.assertEqual(prior_personnel(data,{},'2020-12-07',dt.datetime(2020,12,8,14,tzinfo=UTC))['games'],[])

    def test_unavailable_player_outcome_perturbation_cannot_change_features(self):
        games,_=aggregate(raw(),'fixture')
        later=copy.deepcopy(games[0]); later.update(game_id='late',date='2020-09-15',week=2)
        later['teams']['BAL']['qbs']['B']['epa_sum']=10000
        schedule={games[0]['game_id']:{'gameday':'2020-09-10','gametime':'20:00'},
                  'late':{'gameday':'2020-09-15','gametime':'20:00'}}
        cutoff=dt.datetime(2020,9,15,13,tzinfo=UTC)
        expected=enrich([row()],{'games':games,'charts':[]})
        actual=enrich([row()],prior_personnel({'games':games+[later],'charts':[]},schedule,'2020-09-17',cutoff))
        self.assertEqual(actual,expected)
        # Positive control: the unfiltered source changes the feature, so the test can detect leakage.
        self.assertNotEqual(enrich([row()],{'games':games+[later],'charts':[]})[0]['features']['qb_epa'],expected[0]['features']['qb_epa'])

    def test_unknown_recent_game_fails_instead_of_inventing_time(self):
        with self.assertRaises(KeyError):
            prior_personnel({'games':[{'game_id':'missing','date':'2020-09-10','season':2020}]}, {},'2020-09-17',dt.datetime(2020,9,15,13,tzinfo=UTC))

if __name__=='__main__': unittest.main()
