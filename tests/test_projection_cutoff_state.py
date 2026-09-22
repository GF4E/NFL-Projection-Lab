"""Availability, durable recovery and immutable reconstruction of inactive states."""
import copy
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from engine.projection import cutoff_state as cs, observations as obs
from engine.forecast_system.calendar import timestamp

FRIDAY='2026-09-11T13:00:00Z'
MONDAY='2026-09-14T13:00:00Z'
TUESDAY='2026-09-15T13:00:00Z'


def game(gid='thu',day='2026-09-10',hour='20:30'):
    return dict(game_id=gid,season=2026,week=2,game_type='REG',gameday=day,gametime=hour,
                home_team='BAL',away_team='BUF',home_score=24.,away_score=20.,
                location='Home',roof='outdoors',stadium_id='fixture')


def statistics(g):
    rows=[]
    for team,opponent in [('BAL','BUF'),('BUF','BAL')]:
        r={k:None for k in obs.STAT_FIELDS}
        r.update(game_id=g['game_id'],team=team,opponent=opponent,season=g['season'],week=g['week'],
                 date=g['gameday'],drives=10,plays_per_drive=6,off_ppd=2.,fg_points=3,turnovers_lost=1)
        r.update({k:0 for k in obs.STAT_FIELDS if k.startswith('fg_') and k!='fg_points'})
        rows.append(r)
    return rows


class CutoffStateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.fit=self.write('work/in-season-learning-v1/fit.json',
                            {'groups':['calibration','elo'],'selected':['none',10],'elo_hfa':{'2026':65.}})
        self.g=game()
        self.clock=patch.object(cs,'now',return_value=timestamp('2026-09-20T00:00:00Z'))
        self.clock.start();self.addCleanup(self.clock.stop)

    def write(self,path,value):
        data=obs.raw(value);p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        return {'path':path,'sha256':obs.sha(data)}

    def source(self,name,rows):
        return self.write(f'work/projection-v1/data/{name}-{obs.sha(obs.raw(rows))}.json',rows)

    def capture(self,games=None,stats=None,at='2026-09-11T12:00:00Z'):
        games=[self.g] if games is None else games
        stats=[r for g in games for r in statistics(g)] if stats is None else stats
        manifest={'schedule':self.source('schedule',games),'team_games':self.source('team-games',stats)}
        with patch.object(obs,'now',return_value=timestamp(at)):return obs.capture(self.root,manifest)

    def advance(self,cutoff):return cs.advance(self.root,cutoff,self.fit)

    def test_three_cutoffs_restore_once_and_keep_same_state_without_new_facts(self):
        self.capture();a=self.advance(FRIDAY);b=self.advance(MONDAY);c=self.advance(TUESDAY)
        first=cs.restore(self.root,a)[1];second=cs.restore(self.root,b)[1];third=cs.restore(self.root,c)[1]
        self.assertEqual(first['added_games'],['thu']);self.assertEqual(second['added_games'],[])
        self.assertEqual(third['added_games'],[]);self.assertEqual(first['state_sha256'],third['state_sha256'])
        self.assertEqual(third['incorporated'],['thu']);self.assertEqual(second['parent'],a);self.assertEqual(third['parent'],b)
        self.assertEqual(self.advance(FRIDAY),a);self.assertEqual(cs.current(self.root),c)

    def test_final_and_statistics_arrive_on_independent_clocks(self):
        self.capture(stats=[]);a=self.advance(FRIDAY);state,first=cs.restore(self.root,a)
        self.assertNotEqual(state.elo.teams['BAL']['elo'],1505.);self.assertEqual(state.history['BAL'],[])
        self.capture(at='2026-09-14T12:00:00Z');b=self.advance(MONDAY);state,second=cs.restore(self.root,b)
        self.assertEqual(first['elo'],second['elo']);self.assertEqual(len(state.history['BAL']),1)
        self.assertEqual(second['added_games'],[]);self.assertEqual(second['added_statistics'],['thu'])
        self.assertEqual(cs.restore(self.root,a)[0].history['BAL'],[])

    def test_equal_arrival_clock_waits_until_next_cutoff(self):
        first=self.capture(stats=[])
        second=self.capture(at=FRIDAY)
        a=self.advance(FRIDAY);b=self.advance(MONDAY)
        self.assertEqual(cs.read(self.root,a)['observation_ref'],first)
        self.assertEqual(cs.read(self.root,b)['observation_ref'],second)
        self.assertEqual(cs.read(self.root,a)['statistics_hashes'],{})

    def test_no_snapshot_before_cutoff_cannot_be_backdated(self):
        self.capture(at=FRIDAY)
        with self.assertRaisesRegex(ValueError,'No observed source'):self.advance(FRIDAY)
        self.assertIsNone(cs.current(self.root))
        with self.assertRaisesRegex(ValueError,'Future cutoff'):self.advance('2026-09-25T13:00:00Z')
        with self.assertRaisesRegex(ValueError,'scheduled'):self.advance('2026-09-11T14:00:00Z')

    def test_proxy_boundary_is_strict_even_when_source_has_a_final(self):
        g=game(hour='05:00',day='2026-09-11') # 09 UTC + 4h equals cutoff
        self.capture([g],at='2026-09-11T12:59:00Z');a=self.advance(FRIDAY)
        self.assertEqual(cs.read(self.root,a)['incorporated'],[])
        b=self.advance(MONDAY);self.assertEqual(cs.read(self.root,b)['incorporated'],['thu'])

    def test_cutoff_retries_recover_after_pointer_failure_and_lost_response(self):
        self.capture();real=cs.save
        def fail(path,value,immutable=False):
            if str(path).endswith('current-ref.json'):raise OSError('disk full')
            return real(path,value,immutable)
        with patch.object(cs,'save',side_effect=fail),self.assertRaises(OSError):self.advance(FRIDAY)
        self.assertIsNone(cs.current(self.root))
        receipt=next((self.root/cs.BASE/'cutoffs').glob('*.json'));original=json.loads(receipt.read_bytes())
        def lost(path,value,immutable=False):
            result=real(path,value,immutable)
            if str(path).endswith('current-ref.json'):raise OSError('lost response')
            return result
        with patch.object(cs,'save',side_effect=lost),self.assertRaises(OSError):self.advance(FRIDAY)
        self.assertEqual(cs.current(self.root),original)
        with patch.object(cs,'now',return_value=timestamp('2026-09-21T00:00:00Z')):
            self.assertEqual(self.advance(FRIDAY),original)
        self.assertEqual(cs.read(self.root,original)['created_at'],'2026-09-20T00:00:00+00:00')

    def test_failed_object_or_receipt_write_commits_no_effect_and_retry_succeeds(self):
        self.capture()
        for name in ('write_bytes','save'):
            with patch.object(cs,name,side_effect=OSError('injected crash')),self.assertRaises(OSError):self.advance(FRIDAY)
            self.assertIsNone(cs.current(self.root))
        ref=self.advance(FRIDAY);self.assertEqual(cs.read(self.root,ref)['incorporated'],['thu'])

    def test_late_older_game_rebuilds_in_played_order_not_arrival_order(self):
        newer=game('new','2026-09-10');older=game('old','2026-09-06','13:00')
        self.capture([newer]);a=self.advance(FRIDAY)
        self.capture([newer,older],at='2026-09-14T12:00:00Z');b=self.advance(MONDAY)
        state,body=cs.restore(self.root,b)
        self.assertEqual(body['incorporated'],['old','new']);self.assertEqual(body['added_games'],['old'])
        self.assertEqual(state.last['BAL'][-1]['game_id'],'new')
        self.assertEqual(cs.read(self.root,a)['incorporated'],['new'])
        _,finals,stats,_=cs.available(self.root,body['observation_ref'],timestamp(MONDAY))
        independently=cs.features.reconstruct(list(reversed(list(finals.values()))),stats,{'2026':65.})
        self.assertEqual(state.identity(),independently.identity())

    def test_revisions_change_later_state_and_preserve_original(self):
        self.capture();a=self.advance(FRIDAY);original=cs.restore(self.root,a)[1]
        revised=copy.deepcopy(self.g);revised['home_score']=31.;stats=statistics(revised);stats[0]['off_ppd']=3.
        self.capture([revised],stats,at='2026-09-14T12:00:00Z');b=self.advance(MONDAY);later=cs.read(self.root,b)
        self.assertEqual(later['added_games'],[]);self.assertEqual(later['incorporated'],['thu'])
        self.assertEqual(len(later['revised_finals']),1);self.assertEqual(len(later['revised_statistics']),1)
        self.assertNotEqual(original['state_sha256'],later['state_sha256'])
        self.assertEqual(cs.restore(self.root,a)[1],original)

    def test_withdrawn_evidence_or_skipped_cutoff_fails_closed(self):
        self.capture();a=self.advance(FRIDAY)
        with self.assertRaisesRegex(ValueError,'scheduled order'):self.advance(TUESDAY)
        self.capture(stats=[],at='2026-09-14T12:00:00Z')
        with self.assertRaisesRegex(ValueError,'withdrawn'):self.advance(MONDAY)
        self.assertEqual(cs.current(self.root),a)

    def test_corruption_in_state_or_source_fails_restore(self):
        self.capture();a=self.advance(FRIDAY);body=cs.read(self.root,a);path=self.root/a['path'];before=path.read_bytes()
        path.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'hash mismatch'):cs.restore(self.root,a)
        path.write_bytes(before)
        _,_,transaction=cs.snapshot_before(self.root,body['observation_ref'],timestamp(FRIDAY))
        (self.root/transaction['sources']['schedule']['path']).write_bytes(b'[]')
        with self.assertRaisesRegex(ValueError,'hash mismatch'):cs.restore(self.root,a)

    def test_ownership_and_incompatible_method_fail_closed(self):
        self.capture()
        with cs.writer(self.root),self.assertRaisesRegex(ValueError,'writer already'):self.advance(FRIDAY)
        a=self.advance(FRIDAY)
        with patch.object(cs,'method',return_value={}):
            with self.assertRaisesRegex(ValueError,'method mismatch'):cs.restore(self.root,a)
        bad=self.write('work/in-season-learning-v1/unqualified.json',{'groups':['kalman'],'selected':['none',10]})
        with self.assertRaisesRegex(ValueError,'Unqualified'):cs.advance(self.root,MONDAY,bad)

    def test_same_cutoff_does_not_accept_a_changed_fit_request(self):
        self.capture();a=self.advance(FRIDAY)
        equivalent=self.write('work/in-season-learning-v1/other-fit.json',
                              {'groups':['calibration','elo'],'selected':['none',10],'elo_hfa':{'2026':65.},'weight_version':'next'})
        with self.assertRaisesRegex(ValueError,'method/fit differs'):cs.advance(self.root,FRIDAY,equivalent)
        self.assertEqual(cs.current(self.root),a)
        # A weight-only refit can accompany a later cutoff without changing state mathematics.
        b=cs.advance(self.root,MONDAY,equivalent)
        self.assertEqual(cs.read(self.root,a)['state_sha256'],cs.read(self.root,b)['state_sha256'])

    def test_shadow_forecast_requires_its_cutoff_and_rejects_labels(self):
        self.capture();a=self.advance(FRIDAY)
        g=game('sun','2026-09-13','13:00');g={k:g.get(k) for k in cs.features.GAME_FIELDS};g['source_hash']='fixture'
        rows=cs.forecast_rows(self.root,a,[g],{'stadiums':[]})
        self.assertEqual(len(rows),2);self.assertIsNone(rows[0]['actual_points'])
        with self.assertRaisesRegex(ValueError,'Duplicate'):cs.forecast_rows(self.root,a,[g,g],{'stadiums':[]})
        self.assertEqual(rows[0]['state_lineage']['evidence'],'SHADOW_NOT_ISSUED')
        for field in ('home_score','spread_line','total_line'):
            with self.assertRaisesRegex(ValueError,'unapproved'):cs.forecast_rows(self.root,a,[{**g,field:999}],{'stadiums':[]})
        g['gameday']='2026-09-14';g['gametime']='20:30'
        with self.assertRaisesRegex(ValueError,'required cutoff'):cs.forecast_rows(self.root,a,[g],{'stadiums':[]})


if __name__=='__main__':unittest.main()
