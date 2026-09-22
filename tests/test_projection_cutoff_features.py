import copy
import datetime as dt
import math
import unittest
from engine.projection import cutoff_features as new
from engine.projection.features import build as legacy, METRICS


def game(gid,day,week,season=2015,home='BAL',away='BUF',hour='13:00'):
    return dict(game_id=gid,gameday=day,gametime=hour,week=week,season=season,
                game_type='REG',home_team=home,away_team=away,home_score=30.,away_score=14.,
                source_hash='schedule',location='Home',roof='outdoors',stadium_id='fixture')


def stats(g):
    return [dict(game_id=g['game_id'],season=g['season'],week=g['week'],date=g['gameday'],
                 team=t,opponent=o,source_hash='stats',drives=10,plays_per_drive=6,
                 fg_points=3,turnovers_lost=1,**{k:2. if t==g['home_team'] else 1. for k in METRICS})
            for t,o in [(g['home_team'],g['away_team']),(g['away_team'],g['home_team'])]]


class CutoffFeaturesTests(unittest.TestCase):
    def run_build(self,games,**kwargs):
        return new.build([r for g in games for r in stats(g)],games,{'stadiums':[]},
                         mode='HISTORICAL_RECONSTRUCTION',**kwargs)

    def test_equivalent_sunday_history_preserves_every_feature(self):
        games=[game('p1','2014-09-07',1,2014),game('p2','2014-09-14',2,2014),
               game('g1','2015-09-13',1),game('g2','2015-09-20',2)]
        rows=[r for g in games for r in stats(g)]
        old=legacy(rows,games,{'stadiums':[]});got=self.run_build(games)['rows']
        old={r['row_id']:r for r in old}
        for row in got:
            self.assertEqual(row['features'],old[row['row_id']]['features'])
            self.assertEqual(row['metadata'],old[row['row_id']]['metadata'])
            self.assertIsNone(row['actual_points'])
            self.assertNotIn('home_score',row['game'])

    def test_thursday_result_enters_sunday_via_friday(self):
        games=[game('thursday','2015-09-10',1,hour='20:30'),game('sunday','2015-09-13',1)]
        result=self.run_build(games);rows={r['row_id']:r for r in result['rows']}
        thursday=rows['thursday:BAL'];sunday=rows['sunday:BAL']
        self.assertEqual(sunday['state_lineage']['cutoff_at'],'2015-09-11T13:00:00+00:00')
        self.assertEqual(sunday['state_lineage']['incorporated_count'],1)
        self.assertEqual(thursday['features']['elo'],0.)
        expected=20*math.log(17)*(2.2/2.265)*(1-1/(1+10**(-65/400)))
        self.assertAlmostEqual(sunday['features']['elo'],expected,places=11)

    def test_two_games_inside_interval_share_state_even_different_week_labels(self):
        games=[game('sat','2015-09-12',1),game('sun','2015-09-13',2)]
        result=self.run_build(games);rows=result['rows']
        self.assertEqual(len({r['state_lineage']['state_sha256'] for r in rows}),1)
        self.assertEqual(len({r['features']['elo'] for r in rows}),1)

    def test_delayed_source_and_boundary_wait_for_later_cutoff(self):
        games=[game('thu','2015-09-10',1,hour='20:30'),game('sun','2015-09-13',1)]
        availability={'thu':{'final_seen_at':'2015-09-11T13:00:00Z','team_stats_seen_at':'2015-09-11T12:00:00Z'}}
        result=new.build([r for g in games for r in stats(g)],games,{'stadiums':[]},
                         mode='LIVE_RECORDED_AVAILABILITY',availability=availability,
                         through='2015-09-13T15:00:00Z',forecast_ids=['sun'])
        sunday=next(r for r in result['rows'] if r['row_id']=='sun:BAL')
        self.assertEqual(sunday['state_lineage']['incorporated_count'],0)
        self.assertEqual(result['eligibility']['thu']['first_eligible_cutoff'],'2015-09-14T13:00:00+00:00')
        self.assertNotIn({'game_id':'sun','reason':'SOURCE_AVAILABILITY_NOT_RECORDED'},result['excluded'])

    def test_live_refuses_backdated_issuance_and_future_state(self):
        games=[game('sun','2015-09-13',1)]
        args=([r for g in games for r in stats(g)],games,{'stadiums':[]})
        with self.assertRaisesRegex(ValueError,'Past issuance'):
            new.build(*args,mode='LIVE_RECORDED_AVAILABILITY',through='2015-09-14T15:00:00Z',forecast_ids=['sun'])
        result=new.build(*args,mode='LIVE_RECORDED_AVAILABILITY',through='2015-09-10T15:00:00Z',forecast_ids=['sun'])
        self.assertEqual(result['rows'],[])
        self.assertIn({'game_id':'sun','reason':'REQUIRED_FORECAST_CUTOFF_NOT_REACHED'},result['excluded'])

    def test_live_does_not_assume_missing_past_source_availability(self):
        games=[game('thu','2015-09-10',1),game('sun','2015-09-13',1)]
        result=new.build([r for g in games for r in stats(g)],games,{'stadiums':[]},
                         mode='LIVE_RECORDED_AVAILABILITY',through='2015-09-13T15:00:00Z',forecast_ids=['sun'])
        self.assertIn({'game_id':'thu','reason':'SOURCE_AVAILABILITY_NOT_RECORDED'},result['excluded'])
        self.assertEqual(result['rows'][0]['state_lineage']['incorporated_count'],0)

    def test_live_mode_requires_execution_time(self):
        with self.assertRaisesRegex(ValueError,'execution time'):
            new.build([],[],{'stadiums':[]},mode='LIVE_RECORDED_AVAILABILITY')

    def test_reordering_rows_and_games_is_identical(self):
        games=[game('thu','2015-09-10',1),game('sun','2015-09-13',1),game('next','2015-09-20',2)]
        rows=[r for g in games for r in stats(g)]
        first=self.run_build(games)
        second=new.build(list(reversed(rows)),list(reversed(games)),{'stadiums':[]},mode='HISTORICAL_RECONSTRUCTION')
        self.assertEqual(first,second)

    def test_final_updates_elo_before_late_statistics_without_double_update(self):
        thu=game('thu','2015-09-10',2,hour='20:30')
        sun=game('sun','2015-09-13',2);sun.update(home_score=None,away_score=None)
        mon=game('mon','2015-09-14',2,hour='20:30');mon.update(home_score=None,away_score=None)
        games=[thu,sun,mon];availability={'thu':{'final_seen_at':'2015-09-11T04:00:00Z','team_stats_seen_at':'2015-09-14T12:00:00Z'}}
        args=(stats(thu),games,{'stadiums':[]})
        sunday=new.build(*args,mode='LIVE_RECORDED_AVAILABILITY',availability=availability,through='2015-09-13T15:00:00Z',forecast_ids=['sun'])
        monday=new.build(*args,mode='LIVE_RECORDED_AVAILABILITY',availability=availability,through='2015-09-14T16:00:00Z',forecast_ids=['mon'])
        a=next(r for r in sunday['rows'] if r['team']=='BAL');b=next(r for r in monday['rows'] if r['team']=='BAL')
        self.assertNotEqual(a['features']['elo'],0.)
        self.assertEqual(a['features']['elo'],b['features']['elo'])
        self.assertIsNone(a['features']['baseline']);self.assertIsNotNone(b['features']['baseline'])
        self.assertEqual(sum('thu' in r['added_games'] for r in monday['lineage']),1)
        self.assertEqual(sum('thu' in r['statistics_games'] for r in monday['lineage']),1)

    def test_game_cannot_update_twice_and_missing_pair_fails(self):
        g=game('g','2015-09-13',1);s=new.State();s.observe(g,stats(g))
        with self.assertRaisesRegex(ValueError,'Duplicate'):s.observe(g,stats(g))
        with self.assertRaisesRegex(ValueError,'Paired'):new.State().observe(g,stats(g)[:1])

    def test_future_final_cannot_change_earlier_projection(self):
        games=[game('g1','2015-09-13',1),game('g2','2015-09-20',2)]
        first=self.run_build(games);games[1]['home_score']=99.
        second=self.run_build(games)
        for left,right in zip(first['rows'],second['rows']):
            self.assertEqual(left,right)


if __name__=='__main__':unittest.main()
