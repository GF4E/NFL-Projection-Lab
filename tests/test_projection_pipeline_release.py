import copy
import gzip
import json
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch

import test_projection_cutoff_selection as selection_helpers
from engine.projection import pipeline_release as release, prepared, cutoff_pipeline as pipeline, bundle
from engine.projection.lineage import read_artifact
from engine.forecast_system.calendar import timestamp
from engine.projection.storage import save
from scripts import projection_v3_prepare as preparer, projection_v3_publish as publisher, projection_learning, cloud_scheduler


class Base(selection_helpers.SelectionTests):
    pass


for name in vars(selection_helpers.SelectionTests):
    if name.startswith('test_'):
        setattr(Base, name, None)


class ReleaseTests(Base):
    def setUp(self):
        super().setUp()
        self.initialize_preparer()
        self.code = {'commit':'a'*40, 'files':{'engine/fixture.py':'b'*64}, 'environment':{'python':'fixture'}}
        self.source = patch.object(release, 'source', return_value=self.code)
        self.source.start(); self.addCleanup(self.source.stop)
        save(self.root/release.OWNER, {'state':'ACTIVE','owner':'owner','generation':1})
        self.legacy = release.checkpoint(self.root,label='before')
        self.prepare_at()
        self.scheduled = release.checkpoint(self.root,label='after')

    def switch(self, target=None, op='activate', expected=None):
        return release.switch(self.root,target or self.scheduled,owner='owner',operation_id=op,expected_active=expected)

    def test_checkpoint_restores_mode_fit_and_original_prepared_clock(self):
        self.switch()
        selected=release.guard(self.root)
        self.assertEqual(selected['mode'],'SCHEDULED')
        before=release.read(self.root,self.legacy,'manifests')
        checkpoint=prepared.load(self.root,ref=before['prepared_ref'])[1]
        self.switch(self.legacy,'rollback',self.scheduled)
        self.assertEqual(release.guard(self.root)['mode'],'LEGACY')
        self.assertEqual(prepared.current(self.root),checkpoint)

    def test_wrong_owner_and_held_dispatch_or_preparation_lock(self):
        with self.assertRaisesRegex(ValueError,'owner differs'):
            release.switch(self.root,self.scheduled,owner='other',operation_id='x',expected_active=None)
        with prepared.writer(self.root),self.assertRaisesRegex(ValueError,'already active'):
            self.switch()
        import fcntl
        path=self.root/'outputs/model-pick-v1/.cloud-dispatch.lock'
        with path.open('a+') as handle:
            fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaisesRegex(ValueError,'Scheduler writer'):self.switch()
        self.assertIsNone(release.pointer(self.root,release.ACTIVE))

    def crash_and_resume(self, suffix, after=False):
        real=release.save;seen=[]
        def fail(path,value,immutable=False):
            if str(path).endswith(suffix) and not seen:
                seen.append(1)
                if after:real(path,value,immutable)
                raise OSError('injected commit interruption')
            return real(path,value,immutable)
        with patch.object(release,'save',side_effect=fail),self.assertRaises(OSError):self.switch()
        self.assertTrue(seen)
        pending=release.pointer(self.root,release.OPERATION)
        if pending and not pending.get('receipt_ref'):
            with self.assertRaisesRegex(ValueError,'reconciliation'):release.guard(self.root)
        result=self.switch()
        self.assertEqual(result['state'],'COMMITTED')
        self.assertEqual(release.guard(self.root)['mode'],'SCHEDULED')
        self.assertEqual(self.switch(),result)

    def test_crash_before_operation_pointer_resumes_retained_id(self):
        self.crash_and_resume('/operation.json')

    def test_crash_after_operation_id_resumes_before_any_pointer_write(self):
        self.crash_and_resume('/operation-ids/activate.json',after=True)

    def test_crash_before_prepared_pointer_blocks_then_resumes(self):
        self.crash_and_resume('/current-ref.json')

    def test_crash_after_prepared_pointer_blocks_then_resumes(self):
        self.crash_and_resume('/current-ref.json',after=True)

    def test_crash_after_active_pointer_blocks_then_resumes(self):
        self.crash_and_resume('/active.json',after=True)

    def test_lost_completion_response_does_not_rewrite_newer_preparation(self):
        real=release.save
        def fail(path,value,immutable=False):
            answer=real(path,value,immutable)
            if str(path).endswith('/operation.json') and value.get('receipt_ref'):raise OSError('lost acknowledgment')
            return answer
        with patch.object(release,'save',side_effect=fail),self.assertRaises(OSError):self.switch()
        _,meta,data=prepared.load(self.root)
        with prepared.writer(self.root):new=prepared.commit(self.root,data,{**meta,'refresh_note':'later compatible preparation'})
        self.assertEqual(self.switch()['state'],'COMMITTED')
        self.assertEqual(prepared.current(self.root),new)

    def test_changed_payload_and_superseded_operation_cannot_switch_again(self):
        self.switch()
        with self.assertRaisesRegex(ValueError,'changed payload'):self.switch(self.legacy)
        self.switch(self.legacy,'rollback',self.scheduled)
        with self.assertRaisesRegex(ValueError,'superseded'):self.switch()
        self.assertEqual(release.guard(self.root)['mode'],'LEGACY')

    def test_compare_and_swap_requires_exact_active_reference(self):
        with self.assertRaisesRegex(ValueError,'compare-and-swap'):self.switch(expected=self.legacy)

    def test_rollback_cannot_hide_games_published_after_checkpoint(self):
        rows,meta,data=prepared.load(self.root)
        later=copy.deepcopy(rows[:2])
        # Preserve paired shape while adding another already visible game.
        for row in later:row['game_id']='new-visible'
        data=gzip.compress(prepared.raw(rows+later),mtime=0)
        with prepared.writer(self.root):prepared.commit(self.root,data,{**meta,'sha256':prepared.sha(data)})
        with self.assertRaisesRegex(ValueError,'omit current publication games'):self.switch()
        self.assertIsNone(release.pointer(self.root,release.OPERATION))

    def test_code_fit_calibration_and_configuration_drift_fail_closed(self):
        self.switch()
        with patch.object(release,'source',return_value={**self.code,'commit':'c'*40}),self.assertRaisesRegex(ValueError,'code or runtime'):
            release.guard(self.root)
        with patch.object(prepared,'active_fit',return_value={'path':'other','sha256':'d'*64}),self.assertRaisesRegex(ValueError,'active fit'):
            release.guard(self.root)
        from engine.projection import cutoff_worker
        path=self.root/cutoff_worker.CONFIG;original=path.read_bytes()
        path.write_bytes(b'{}')
        with self.assertRaises((KeyError,ValueError)):release.guard(self.root)
        path.write_bytes(original)
        (self.root/self.artifact['shapes']['path']).write_bytes(b'{}')
        with self.assertRaises(ValueError):release.guard(self.root)

    def test_actual_preparer_dispatches_active_mode_and_refuses_override(self):
        self.switch()
        with patch.object(preparer,'ROOT',self.root),patch.object(preparer,'_prepare_scheduled',return_value=['scheduled']) as scheduled:
            self.assertEqual(preparer.prepare(at='2026-09-11T15:00:00Z'),['scheduled'])
            scheduled.assert_called_once()
            with self.assertRaisesRegex(ValueError,'differs from active'):preparer.prepare(select_scheduled=False)
        self.switch(self.legacy,'rollback',self.scheduled)
        with patch.object(preparer,'ROOT',self.root),patch.object(preparer,'_prepare',return_value=['legacy']):
            self.assertEqual(preparer.prepare(),['legacy'])

    def test_actual_publisher_and_refit_reject_pending_transition_before_work(self):
        save(self.root/release.OPERATION,{'intent_ref':release.store(self.root,'intents',{'target':self.scheduled})})
        with patch.object(publisher,'ROOT',self.root),patch.object(publisher,'_run') as run:
            with self.assertRaisesRegex(ValueError,'reconciliation'):publisher.run()
            run.assert_not_called()
        with patch.object(projection_learning,'ROOT',self.root),patch.object(projection_learning,'_weekly_refit') as fit:
            with self.assertRaisesRegex(ValueError,'reconciliation'):projection_learning.weekly_refit([],1,None)
            fit.assert_not_called()

    def test_publisher_holds_shared_writer_and_refit_handoff_is_explicit(self):
        with patch.object(publisher,'ROOT',self.root),prepared.writer(self.root),self.assertRaisesRegex(ValueError,'already active'):
            publisher.run()
        self.switch()
        with patch.object(projection_learning,'ROOT',self.root),patch.object(projection_learning,'_weekly_refit') as fit:
            with self.assertRaisesRegex(ValueError,'qualified release handoff'):projection_learning.weekly_refit([],1,None)
            fit.assert_not_called()

    def test_scheduler_guard_precedes_publication_and_provider_workers(self):
        save(self.root/release.OPERATION,{'intent_ref':release.store(self.root,'intents',{'target':self.scheduled})})
        with patch.multiple(cloud_scheduler,ROOT=self.root,OUT=self.root/'outputs/model-pick-v1'),\
                patch.object(cloud_scheduler,'ownership',return_value={'state':'ACTIVE','owner':'owner'}),\
                patch.object(cloud_scheduler,'synchronize'),patch.object(cloud_scheduler,'publish_artifacts') as publish,\
                patch.object(cloud_scheduler,'worker') as worker:
            with self.assertRaisesRegex(ValueError,'reconciliation'):cloud_scheduler.run('daily','owner')
            publish.assert_not_called();worker.assert_not_called()

    def test_actual_issued_bundle_keeps_its_release_identity_after_rollback(self):
        self.switch()
        with ExitStack() as stack:
            stack.enter_context(patch.multiple(publisher,ROOT=self.root,OUT=self.root/'outputs/projection-v3',WORK=self.root/'work/projection-v3'))
            stack.enter_context(patch.object(publisher,'read',side_effect=lambda ref:read_artifact(self.root,ref)))
            stack.enter_context(patch.object(projection_learning,'active_artifact_with_ref',return_value=(self.fit,self.artifact)))
            stack.enter_context(patch('scripts.board_v7_publish.run',return_value=None))
            stack.enter_context(patch.object(bundle,'capture_code',return_value=self.code))
            stack.enter_context(patch.object(pipeline,'now',return_value=timestamp('2026-09-11T15:01:00Z')))
            board=publisher.run(timestamp('2026-09-11T15:01:00Z'))
        for card in board['games']:
            self.assertEqual(bundle.resolve(self.root,card['release_ref'],'releases')['pipeline_release_ref'],self.scheduled)
        self.switch(self.legacy,'rollback',self.scheduled)
        for card in board['games']:self.assertIsNotNone(bundle.verify_card(self.root,card))
