import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from engine.projection.finals import parse, refresh, grade_once

RAW=b'game_id,away_score,home_score,result,total\nfinished,13,20,7,33\nlive,3,7,,\nbad,10,20,8,30\n'

class FinalsTests(unittest.TestCase):
    def test_requires_consistent_completed_result_without_market_fields(self):
        self.assertEqual(parse(RAW),{'finished':{'away_score':13.,'home_score':20.}})

    def test_failure_retains_last_good_and_next_tick_retries(self):
        with tempfile.TemporaryDirectory() as tmp:
            now=dt.datetime.now(dt.timezone.utc)
            refresh(tmp,now,lambda:RAW)
            p=Path(tmp)/'outputs/projection-v3/final-feed.json';before=p.read_bytes()
            def fail():raise OSError('offline')
            later=now+dt.timedelta(seconds=61)
            self.assertEqual(refresh(tmp,later,fail)['state'],'RETRY_NEXT_TICK')
            self.assertEqual(p.read_bytes(),before)
            self.assertEqual(refresh(tmp,later,lambda:RAW)['state'],'REFRESHED')
            self.assertEqual(refresh(tmp,later,fail)['state'],'FRESH')

    def test_grade_is_create_only_and_does_not_change_projection_or_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            original=next(g for g in json.loads((Path(__file__).resolve().parents[1]/'outputs/projection-v3/board.json').read_text())['games'] if g['game_id']=='2026_01_ATL_PIT')
            original.pop('grades',None)
            snapshot=json.dumps(original,sort_keys=True);p=Path(tmp)/'grade.json'
            first=grade_once(original,p,{'away_score':13,'home_score':20})
            self.assertEqual(first['status'],'FINAL')
            self.assertEqual(first['projection'],original['projection'])
            self.assertEqual(first['version'],original['version'])
            self.assertEqual(json.dumps(original,sort_keys=True),snapshot)
            before=p.read_bytes()
            self.assertEqual(grade_once(original,p,{'away_score':99,'home_score':99}),first)
            self.assertEqual(grade_once(original,p,None),first)
            self.assertEqual(p.read_bytes(),before)

    def test_busy_dispatch_retries_without_entering_workers(self):
        import fcntl
        from scripts import cloud_scheduler as s
        with tempfile.TemporaryDirectory() as tmp, patch.object(s,'OUT',Path(tmp)),patch.object(s,'ownership') as owner:
            with (Path(tmp)/'.cloud-dispatch.lock').open('a+') as f:
                fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
                self.assertEqual(s.run('capture','test')['state'],'LOCAL_JOB_ACTIVE')
                owner.assert_not_called()
            owner.return_value={'state':'ACTIVE','owner':'other'}
            self.assertEqual(s.run('capture','test')['state'],'YIELD_TO_OWNER')
            owner.assert_called_once()
