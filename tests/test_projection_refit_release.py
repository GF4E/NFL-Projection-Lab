import copy
from unittest.mock import patch

import test_projection_pipeline_release as helpers
from engine.projection import refit_release, pipeline_release as release, prepared, cutoff_pipeline as p
from engine.projection.storage import save
from engine.forecast_system.calendar import timestamp
from scripts import projection_v3_prepare as preparer


class Base(helpers.ReleaseTests):pass
for name in vars(helpers.ReleaseTests):
    if name.startswith('test_'):setattr(Base,name,None)


class RefitReleaseTests(Base):
    def setUp(self):
        super().setUp()
        self.shadow=copy.deepcopy(self.artifact)
        self.shadow.update(role='SHADOW_WEIGHT_ONLY',parent_fit_ref=self.fit,through_week=1,
            parent_training_hash=self.artifact['fit']['training_hash'],issued_at=None,
            fit_started_at='2026-09-11T13:03:00Z',computation_completed_at='2026-09-11T13:04:00Z',
            intent_sha256='a'*64)
        self.shadow['fit']['intercept']+=0.25
        self.shadow['fit']['training_hash']='c'*64
        self.shadow_ref=self.store_shadow(self.shadow)

    def store_shadow(self,value):
        ref=p.store(self.root,'shadow-fits',value)
        save(self.root/p.BASE/'fit-availability'/(ref['sha256']+'.json'),
             {'fit_ref':ref,'status':'DURABLY_STORED_NOT_ACTIVATED',
              'available_at':'2026-09-11T13:05:00Z','intent_sha256':value['intent_sha256']},immutable=True)
        return ref

    def stage(self):
        with patch.object(preparer,'ROOT',self.root),patch.object(p,'now',return_value=timestamp('2026-09-11T15:00:10Z')):
            return preparer.stage_refit(self.shadow_ref,at='2026-09-11T15:00:00Z')

    def test_stages_without_active_pointer_changes(self):
        before=(prepared.current(self.root),prepared.active_fit(self.root),release.pointer(self.root,release.ACTIVE))
        target=self.stage();manifest=release.read(self.root,target,'manifests')
        self.assertEqual(before,(prepared.current(self.root),prepared.active_fit(self.root),release.pointer(self.root,release.ACTIVE)))
        self.assertNotEqual(manifest['fit_ref'],self.fit)
        body=refit_release.verify(self.root,manifest['fit_ref'])
        self.assertEqual(body['fit'],self.shadow['fit'])
        self.assertEqual(body['shapes'],self.artifact['shapes'])
        self.assertEqual(body['issued_at'],'2026-09-11T13:05:00+00:00')

    def test_changed_method_calibration_or_penalty_rejected(self):
        for key,value in [('elo_hfa',{'2026':12.}),('shapes',{'path':'other','sha256':'b'*64}),('unknown_setting',True)]:
            with self.subTest(key=key):
                changed=copy.deepcopy(self.shadow);changed[key]=value
                with self.assertRaisesRegex(ValueError,'parent method'):refit_release.retain(self.root,self.store_shadow(changed))
        changed=copy.deepcopy(self.shadow);changed['fit']['penalty']+=1
        with self.assertRaisesRegex(ValueError,'settings differ'):refit_release.retain(self.root,self.store_shadow(changed))

    def test_new_fit_switch_and_rollback_preserve_state_configuration(self):
        from engine.projection import cutoff_worker
        config=(self.root/cutoff_worker.CONFIG).read_bytes()
        target=self.stage();self.switch(target)
        manifest=release.guard(self.root)
        self.assertEqual(prepared.active_fit(self.root),manifest['fit_ref'])
        self.assertNotEqual(manifest['fit_ref'],self.fit)
        self.assertEqual((self.root/cutoff_worker.CONFIG).read_bytes(),config)
        self.switch(self.scheduled,'rollback',target)
        self.assertEqual(prepared.active_fit(self.root),self.fit)
        self.assertEqual((self.root/cutoff_worker.CONFIG).read_bytes(),config)

    def test_fit_receipt_or_envelope_tampering_rejected(self):
        ref=refit_release.retain(self.root,self.shadow_ref)
        value=refit_release.verify(self.root,ref);value['fit']['intercept']+=1
        bad=self.write('work/in-season-learning-v1/tampered.json',value)
        with self.assertRaisesRegex(ValueError,'differs from recorded'):refit_release.verify(self.root,bad)
        path=self.root/p.BASE/'fit-availability'/(self.shadow_ref['sha256']+'.json')
        receipt=release.pointer(self.root,str(path.relative_to(self.root)));receipt['available_at']='2026-09-11T13:00:00Z';save(path,receipt)
        with self.assertRaisesRegex(ValueError,'chronology'):refit_release.verify(self.root,ref)

    def test_crashes_at_each_pointer_resume_same_operation(self):
        for suffix in (release.FIT_POINTER,prepared.POINTER,release.ACTIVE):
            with self.subTest(pointer=suffix):
                target=self.stage();real=release.save;seen=[]
                def fail(path,value,immutable=False):
                    result=real(path,value,immutable)
                    if str(path).endswith(suffix) and not seen:
                        seen.append(True);raise OSError('crash after pointer')
                    return result
                op='switch-'+str(len(suffix));previous=release.pointer(self.root,release.ACTIVE)
                with patch.object(release,'save',side_effect=fail),self.assertRaises(OSError):self.switch(target,op,previous)
                with self.assertRaisesRegex(ValueError,'reconciliation'):release.guard(self.root)
                result=self.switch(target,op,previous)
                self.assertEqual(self.switch(target,op,previous),result)
                self.switch(self.scheduled,'rollback-'+op,target)

    def test_fit_after_preparation_rejected(self):
        with patch.object(preparer,'ROOT',self.root),self.assertRaisesRegex(ValueError,'unavailable'):
            preparer.stage_refit(self.shadow_ref,at='2026-09-11T13:04:00Z')

    def test_unrelated_fit_cannot_be_rollback_target(self):
        target=refit_release.retain(self.root,self.shadow_ref)
        other=copy.deepcopy(self.artifact);other['fit']['intercept']+=2
        other_ref=self.write('work/in-season-learning-v1/unrelated.json',other)
        with self.assertRaisesRegex(ValueError,'ancestor'):refit_release.linked(self.root,target,other_ref)

    def test_actual_publisher_uses_new_coefficients_and_preserves_bundle_on_rollback(self):
        from contextlib import ExitStack
        from scripts import projection_v3_publish as publisher,projection_learning
        from engine.projection import bundle
        from engine.projection.lineage import read_artifact
        target=self.stage();self.switch(target)
        active=prepared.active_fit(self.root);artifact=read_artifact(self.root,active)
        with ExitStack() as stack:
            stack.enter_context(patch.multiple(publisher,ROOT=self.root,OUT=self.root/'outputs/projection-v3',WORK=self.root/'work/projection-v3'))
            stack.enter_context(patch.object(publisher,'read',side_effect=lambda ref:read_artifact(self.root,ref)))
            stack.enter_context(patch.object(projection_learning,'active_artifact_with_ref',return_value=(active,artifact)))
            stack.enter_context(patch('scripts.board_v7_publish.run',return_value=None))
            stack.enter_context(patch.object(bundle,'capture_code',return_value=self.code))
            stack.enter_context(patch.object(p,'now',return_value=timestamp('2026-09-11T15:01:00Z')))
            board=publisher.run(timestamp('2026-09-11T15:01:00Z'))
        self.assertTrue(board['games'])
        for card in board['games']:
            self.assertEqual(card['fit_artifact_ref'],active)
            self.assertEqual(card['fit_sha256'],release.hash_value(self.shadow['fit']))
            self.assertEqual(bundle.resolve(self.root,card['release_ref'],'releases')['pipeline_release_ref'],target)
        from engine.projection_v3.model import predict
        rows=prepared.load(self.root)[0]
        for card in board['games']:
            for side in ('home','away'):
                row=next(r for r in rows if r['game_id']==card['game_id'] and r['home']==(side=='home'))
                baseline=predict(self.artifact['fit'],row['features'])['points']
                self.assertAlmostEqual(card['projection'][side+'_points']-baseline,0.25,places=10)
        self.switch(self.scheduled,'rollback',target)
        for card in board['games']:self.assertIsNotNone(bundle.verify_card(self.root,card))
        self.assertEqual(prepared.active_fit(self.root),self.fit)
