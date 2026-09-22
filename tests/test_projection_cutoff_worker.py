import datetime as dt
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import test_projection_cutoff_state as helpers
from test_projection_cutoff_state import FRIDAY, MONDAY, TUESDAY, game
from engine.projection import cutoff_worker as worker, cutoff_state as cs
from engine.forecast_system.calendar import timestamp
from scripts import cloud_scheduler as cloud


class WorkerTests(helpers.CutoffStateTests):
    # Reuse isolated source/fit helpers without re-running their inherited cases.
    pass
for name in list(vars(helpers.CutoffStateTests)):
    if name.startswith('test_'):setattr(WorkerTests,name,None)


class ScheduledWorkerTests(WorkerTests):
    def configure(self):
        self.capture()
        with patch.object(worker,'now',return_value=timestamp('2026-09-11T12:30:00Z')):
            return worker.configure(self.root,'owner',self.fit)

    def run_at(self,at=FRIDAY,**kwargs):
        with patch.object(worker,'now',return_value=timestamp(at)),patch.object(cs,'now',return_value=timestamp(at)):
            return worker.run_due(self.root,'owner',**kwargs)

    def test_first_cutoff_is_prospective_and_idle_is_read_only(self):
        config=self.configure();self.assertEqual(config['first_cutoff'],timestamp(FRIDAY).isoformat())
        before={str(p):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result=self.run_at('2026-09-11T12:59:00Z')
        self.assertEqual(result['state'],'WAITING_FOR_CUTOFF')
        self.assertEqual(before,{str(p):p.read_bytes() for p in self.root.rglob('*') if p.is_file()})
        with self.assertRaisesRegex(ValueError,'owner'):worker.configuration(self.root,'wrong')

    def test_due_cutoffs_catch_up_one_at_a_time_without_duplicate_effects(self):
        self.configure();a=self.run_at(TUESDAY);b=self.run_at(TUESDAY);c=self.run_at(TUESDAY)
        self.assertEqual([r['cutoff_at'] for r in (a,b,c)],[timestamp(t).isoformat() for t in (FRIDAY,MONDAY,TUESDAY)])
        self.assertEqual(a['added_games'],['thu']);self.assertEqual(b['added_games'],[])
        self.assertEqual(c['added_games'],[]);self.assertEqual(self.run_at(TUESDAY)['state'],'WAITING_FOR_CUTOFF')

    def test_capture_deferral_is_not_an_attempt(self):
        self.configure();result=self.run_at(safe_until='2026-09-11T13:10:00Z')
        self.assertEqual(result['state'],'DEFERRED_CAPTURE_WINDOW')
        self.assertFalse((self.root/cs.BASE/'operations').exists());self.assertIsNone(cs.current(self.root))

    def test_crash_after_state_commit_recovers_ack_without_another_assimilation(self):
        self.configure()
        with patch.object(worker,'finish',side_effect=KeyboardInterrupt),self.assertRaises(KeyboardInterrupt):self.run_at()
        ref=cs.current(self.root);self.assertIsNotNone(ref)
        recovered=self.run_at('2026-09-11T13:01:00Z')
        self.assertEqual(recovered['state'],'COMMITTED');self.assertEqual(recovered['attempts'],1)
        self.assertEqual(cs.current(self.root),ref)

    def test_repeated_interrupted_execution_exhausts_budget_and_stays_latched(self):
        self.configure()
        for minute in range(3):
            with patch.object(cs,'advance',side_effect=KeyboardInterrupt),self.assertRaises(KeyboardInterrupt):
                self.run_at(f'2026-09-11T13:0{minute}:00Z')
        with patch.object(cs,'advance',side_effect=AssertionError('retry beyond budget')):
            first=self.run_at('2026-09-11T13:03:00Z');second=self.run_at('2026-09-11T13:04:00Z')
        self.assertEqual(first['state'],'FAILED_CLOSED');self.assertEqual(first,second)
        self.assertEqual(first['reason'],'RECOVERY_BUDGET_EXHAUSTED')

    def test_elapsed_deadline_stops_even_before_three_attempts(self):
        self.configure()
        with patch.object(cs,'advance',side_effect=KeyboardInterrupt),self.assertRaises(KeyboardInterrupt):self.run_at()
        result=self.run_at('2026-09-11T13:10:00Z')
        self.assertEqual(result['state'],'FAILED_CLOSED');self.assertEqual(result['attempts'],1)

    def test_hard_source_and_disk_errors_latch_without_timer_retry(self):
        self.configure()
        with patch.object(cs,'advance',side_effect=OSError('fixture disk')):result=self.run_at()
        self.assertEqual(result['reason'],'LOCAL_IO')
        with patch.object(cs,'advance',side_effect=AssertionError('retry')):
            self.assertEqual(self.run_at('2026-09-11T13:01:00Z'),result)

    def test_missing_final_is_named_and_observer_detects_shortfall(self):
        g=game();g['home_score']=None;self.capture([g],stats=[])
        with patch.object(worker,'now',return_value=timestamp('2026-09-11T12:30:00Z')):worker.configure(self.root,'owner',self.fit)
        result=self.run_at();self.assertEqual(result['completeness'],'DEGRADED')
        self.assertIn({'game_id':'thu','reason':'FINAL_NOT_RECORDED'},result['missing'])
        health=worker.health(self.root,timestamp('2026-09-11T13:01:00Z'))
        self.assertEqual(health['state'],'INPUTS_INCOMPLETE');self.assertEqual(health['missing_games'],['thu'])

    def test_observer_detects_stopped_job_and_failed_job_without_running_it(self):
        self.configure()
        self.assertEqual(worker.health(self.root,timestamp('2026-09-11T13:11:00Z'))['state'],'DUE')
        self.assertEqual(worker.health(self.root,timestamp('2026-09-11T13:11:01Z'))['state'],'OVERDUE')
        with patch.object(cs,'advance',side_effect=ValueError('integrity')):self.run_at()
        self.assertEqual(worker.health(self.root,timestamp('2026-09-11T13:01:00Z'))['state'],'FAILED_CLOSED')


class SchedulerBoundaryTests(unittest.TestCase):
    def test_cutoff_mode_does_not_call_projection_sync_or_paid_worker(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch.object(cloud,'ROOT',root),patch.object(cloud,'OUT',root/'out'),patch.object(cloud,'ownership',return_value={'state':'ACTIVE','owner':'host'}),patch.object(cloud,'synchronize'),patch.object(cloud,'publish_artifacts',return_value='commit'),patch.object(cloud,'capture_window',return_value=False),patch.object(cloud,'weekly_capture_window',return_value=False),patch.object(cloud,'next_capture_boundary',return_value=None),patch.object(worker,'run_due',return_value={'state':'WAITING_FOR_CUTOFF'}) as due,patch.object(cloud,'worker',side_effect=AssertionError('paid worker')),patch('scripts.projection_publish.sync',side_effect=AssertionError('entry network')):
                self.assertEqual(cloud.run('cutoff','host')['state'],'WAITING_FOR_CUTOFF');due.assert_called_once()

    def test_full_budget_reserved_before_weekly_capture(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp,patch.object(cloud,'ROOT',Path(tmp)):
            start=timestamp('2026-09-11T18:40:00Z')
            self.assertEqual(cloud.next_capture_boundary(start),timestamp('2026-09-11T18:54:00Z'))


if __name__=='__main__':unittest.main()
