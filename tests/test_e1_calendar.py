import unittest
from engine.forecast_system.calendar import cutoff_before,plan,audit

class CalendarTests(unittest.TestCase):
    def game(self,gid,issued,completed,week=1):
        return dict(game_id=gid,season=2020,week=week,issuance_at=issued,completed_at=completed)
    def test_strict_cutoff_and_dst(self):
        self.assertEqual(cutoff_before('2020-10-13T13:00:00Z').isoformat(),'2020-10-06T13:00:00+00:00')
        self.assertEqual(cutoff_before('2020-10-13T13:00:01Z').isoformat(),'2020-10-13T13:00:00+00:00')
        self.assertEqual(cutoff_before('2020-11-03T14:01:00Z').isoformat(),'2020-11-03T14:00:00+00:00')
    def test_completion_at_cutoff_excluded_and_week_labels_ignored(self):
        games=[self.game('a','2020-10-12T15:00Z','2020-10-13T13:00Z',99),self.game('b','2020-10-13T16:00Z','2020-10-13T22:00Z',1),self.game('c','2020-10-18T16:00Z','2020-10-18T22:00Z',2)]
        batches=plan(games);self.assertEqual(audit(games,batches),3)
        batch=next(b for b in batches if any(g['game_id']=='b' for g in b['forecasts']))
        self.assertEqual([g['game_id'] for g in batch['forecasts']],['b','c'])
        self.assertEqual(batch['incorporated'],())
        batch['incorporated']=('a',)
        with self.assertRaises(AssertionError):audit(games,batches)
    def test_reordering_does_not_change_calendar(self):
        games=[self.game('a','2020-10-12T15:00Z','2020-10-12T22:00Z'),self.game('b','2020-10-14T15:00Z','2020-10-14T22:00Z')]
        self.assertEqual(plan(games),plan(games[::-1]))
    def test_unknown_completion_fails(self):
        with self.assertRaises((TypeError,AttributeError)):plan([self.game('a','2020-10-12T15:00Z',None)])

if __name__=='__main__':unittest.main()

class FilterCalendarTests(unittest.TestCase):
    def test_two_games_same_interval_use_same_team_state(self):
        import numpy as np
        from engine.forecast_system.state_fit import replay
        games=[]
        for gid,issued,completed,week in [('a','2020-10-13T16:00Z','2020-10-13T22:00Z',5),('b','2020-10-18T16:00Z','2020-10-18T22:00Z',6),('c','2020-10-25T16:00Z','2020-10-25T22:00Z',7)]:
            games.append(dict(game_id=gid,season=2020,week=week,issuance_at=issued,completed_at=completed,home_index=0,away_index=1,drives=np.array([10.,10.]),offset=np.zeros(2),actual=np.array([60.,0.])))
        records=replay(games,(.01,2.,.5),.2,2.,{})[1]
        self.assertEqual(records[0]['points'],records[1]['points'])
        self.assertEqual(records[0]['state_cutoff'],records[1]['state_cutoff'])
        self.assertNotEqual(records[1]['points'],records[2]['points'])

    def test_real_history_requires_all_completion_timestamps(self):
        import json
        from pathlib import Path
        report=json.loads(Path('work/projection-governance-v2/e1-calendar-corrected/calendar-audit.json').read_text())
        self.assertEqual(report['scored_period_games'],2639)
        self.assertEqual(set(report['by_season']),{str(y) for y in range(2016,2026)})
        if report['unknown_completions']:
            self.assertEqual(report['status'],'BLOCKED_COMPLETION_EVIDENCE')
            self.assertFalse(report['valid_e1_result'])
            self.assertTrue(all(v['affected_forecasts'] is None for v in report['by_season'].values()))

    def test_qb_changes_independent_of_unknown_coaches(self):
        import json
        from pathlib import Path
        rows=json.loads(Path('config/staff_history.json').read_text())['records']
        self.assertEqual([(r['season'],r['team']) for r in rows if r['qb1'] is None],[(2017,'MIA'),(2017,'TB')])
        for r in rows:
            self.assertIsNone(r['head_coach'])
            self.assertEqual(r['preseason_variance_doubled'],r['qb1_changed'] is True)

class CoreCalendarTests(unittest.TestCase):
    def test_control_and_shrinkage_share_calendar_history(self):
        from engine.forecast_system import core_features
        from scripts.e1_prepare import sample_weight
        from unittest.mock import patch
        fixtures=[('prior',2019,1,'2019-09-08','2019-09-08T16:00Z','2019-09-08T23:00Z',21,17),('a',2020,5,'2020-10-13','2020-10-13T16:00Z','2020-10-13T23:00Z',70,0),('b',2020,6,'2020-10-18','2020-10-18T16:00Z','2020-10-18T23:00Z',21,17)]
        games=[];rows=[]
        for gid,year,week,day,issued,completed,hs,aws in fixtures:
            games.append(dict(game_id=gid,season=year,week=week,game_type='REG',gameday=day,issuance_at=issued,completed_at=completed,home_team='SEA',away_team='SF',home_score=hs,away_score=aws,source_hash='synthetic'))
            for team,other,points in [('SEA','SF',hs),('SF','SEA',aws)]:
                rows.append(dict(game_id=gid,season=year,week=week,team=team,opponent=other,source_hash='synthetic',drives=10,plays_per_drive=5,fg_points=0,turnovers_lost=0,**{key:points/10 for key in core_features.METRICS}))
        original=core_features.weight
        for k in (None,4,8):
            function=original if k is None else lambda rr,s,w,h,k=k:sample_weight(rr,s,w,h,k)
            with patch.object(core_features,'weight',function):
                result=core_features.build(rows,games,{'stadiums':[]},calendar_batches=plan(games))
            a=next(r for r in result if r['game_id']=='a' and r['team']=='SEA')
            b=next(r for r in result if r['game_id']=='b' and r['team']=='SEA')
            for key in ('baseline','elo','elo_difference','drives','opponent_drives'):
                self.assertEqual(a['features'][key],b['features'][key],(k,key))
