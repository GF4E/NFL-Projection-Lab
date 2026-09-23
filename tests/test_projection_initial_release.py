"""Actual stage/switch/recovery with synthetic recovery and training fixtures.

Full source recovery and historical reconstruction are independently tested.
These fixture proofs cannot be used to qualify production activation.
"""
from contextlib import ExitStack
from unittest.mock import patch

import test_projection_pipeline_release as helpers
from engine.projection import initial_release as initial,pipeline_release as release
from engine.projection import prepared,cutoff_pipeline as p,cutoff_state as cs,weekly_refit as weekly
from engine.projection import training_ledger as ledger,release_preflight as preflight
from engine.projection.storage import save
from engine.forecast_system.calendar import timestamp
from scripts import projection_v3_prepare as preparer,cloud_scheduler as scheduler


class Base(helpers.ReleaseTests):pass
for name in vars(helpers.ReleaseTests):
    if name.startswith('test_'):setattr(Base,name,None)


class InitialReleaseTests(Base):
    def setUp(self):
        super().setUp()
        old=release.read(self.root,self.legacy,'manifests')
        self.before=prepared.load(self.root,ref=old['prepared_ref'])[1]
        save(self.root/prepared.POINTER,self.before)
        self.clock=timestamp('2026-09-11T15:00:00Z')
        self.runtime=self.root/'runtime-manifest.json';self.runtime.write_bytes(b'{"fixture":true}\n')
        self.runtime_sha=cs.obs.sha(self.runtime.read_bytes())
        self.training=p.store(self.root,'training',{'schema':ledger.SCHEMA,'created_at':'2026-09-10T15:00:00Z'})
        self.packet=initial.store(self.root,'fixtures',{'fit_ref':self.fit,'training_ref':self.training,
            'evidence':{'recovery_acceptance':{},'restored_consumer':{}}})
        stack=ExitStack();self.addCleanup(stack.close)
        stack.enter_context(patch.object(p,'now',side_effect=lambda:self.clock))
        stack.enter_context(patch.object(preparer,'ROOT',self.root))
        stack.enter_context(patch.object(scheduler,'ROOT',self.root))
        stack.enter_context(patch.object(scheduler,'capture_window',return_value=False))
        stack.enter_context(patch.object(scheduler,'next_capture_boundary',return_value=None))
        self.proof=stack.enter_context(patch.object(preflight,'check',side_effect=self.evidence))
        stack.enter_context(patch.object(preflight,'recovery',return_value={'runtime_manifest_sha256':self.runtime_sha}))
        def extend(root,parent,**kwargs):
            self.assertEqual(parent,self.training)
            return p.store(root,'training',{'schema':ledger.SCHEMA,'created_at':kwargs['at'].isoformat(),
                'migration_boundary':{'parent_ref':parent,'boundary_at':kwargs['at'].isoformat()}})
        self.extend=stack.enter_context(patch.object(ledger,'extend_migration',side_effect=extend))

    def evidence(self,root,packet_ref,**kwargs):
        return {'packet_ref':packet_ref,'checks':[{'name':k,'status':'PASS'} for k in sorted(initial.REQUIRED)]}

    def stage(self):return initial.stage(self.root,self.packet,owner='owner',runtime_manifest=self.runtime)
    def activate(self,staged):return initial.activate(self.root,staged['plan_ref'],owner='owner')

    def test_stage_preserves_live_pointers_and_activation_couples_configuration(self):
        staged=self.stage();self.assertEqual(staged['state'],'STAGED_NOT_ACTIVATED')
        self.assertEqual(prepared.current(self.root),self.before)
        self.assertIsNone(release.pointer(self.root,release.ACTIVE));self.assertIsNone(weekly.load(self.root,weekly.CONFIG))
        self.assertEqual(prepared.active_fit(self.root),self.fit);self.extend.assert_called_once()
        result=self.activate(staged)
        self.assertEqual(weekly.load(self.root,weekly.CONFIG)['training_ref'],staged['training_ref'])
        self.assertEqual(release.guard(self.root)['mode'],'SCHEDULED')
        self.assertEqual(self.activate(staged),result);self.assertEqual(self.proof.call_count,2)
        with self.assertRaisesRegex(ValueError,'already activated'):self.stage()

    def test_recovery_never_starts_an_unused_plan(self):
        self.stage()
        with release.dispatch(self.root) as handle:self.assertIsNone(initial.recover(self.root,'owner',handle))
        self.assertIsNone(release.pointer(self.root,release.ACTIVE));self.assertIsNone(release.pointer(self.root,release.OPERATION))

    def test_expired_unused_plan_and_drifted_preparation_fail_before_commit(self):
        staged=self.stage();self.clock=timestamp(staged['expires_at'])
        with self.assertRaisesRegex(ValueError,'expired'):self.activate(staged)
        self.assertIsNone(release.pointer(self.root,release.OPERATION))
        self.clock=timestamp('2026-09-11T15:00:01Z')
        save(self.root/prepared.POINTER,{**self.before,'refresh_note':'new preparation'})
        with self.assertRaisesRegex(ValueError,'source state changed'):self.activate(staged)

    def test_incomplete_current_proof_refuses_activation(self):
        staged=self.stage()
        def incomplete(*args,**kwargs):
            result=self.evidence(*args,**kwargs);result['checks'][0]['status']='NOT_CHECKED';return result
        self.proof.side_effect=incomplete
        with self.assertRaisesRegex(ValueError,'technical evidence incomplete'):self.activate(staged)
        self.assertIsNone(release.pointer(self.root,release.ACTIVE));self.assertIsNone(weekly.load(self.root,weekly.CONFIG))

    def test_runtime_tamper_refuses_activation(self):
        staged=self.stage();initial.runtime_path(self.root,self.runtime_sha).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'private runtime evidence differs'):self.activate(staged)
        self.assertIsNone(release.pointer(self.root,release.OPERATION))

    def crash_switch(self,staged,suffix,after=False):
        real=release.save;seen=[]
        def crash(path,value,immutable=False):
            if str(path).endswith(suffix) and not seen:
                seen.append(True)
                if after:real(path,value,immutable)
                raise OSError('injected initial handoff crash')
            return real(path,value,immutable)
        with patch.object(release,'save',side_effect=crash),self.assertRaises(OSError):self.activate(staged)
        self.assertTrue(seen)

    def test_begun_switch_recovers_after_plan_expiry(self):
        staged=self.stage();self.crash_switch(staged,weekly.CONFIG,after=True)
        with self.assertRaisesRegex(ValueError,'reconciliation'):release.guard(self.root)
        self.clock=timestamp('2026-09-11T15:15:00Z')
        with release.dispatch(self.root) as handle:result=initial.recover(self.root,'owner',handle)
        self.assertEqual(result['state'],'COMMITTED')
        self.assertEqual(weekly.load(self.root,weekly.CONFIG)['training_ref'],staged['training_ref'])
        self.assertEqual(release.guard(self.root)['mode'],'SCHEDULED')

    def test_rollback_disables_configuration_and_preserves_training(self):
        staged=self.stage();self.activate(staged);before=(self.root/staged['training_ref']['path']).read_bytes()
        result=release.switch(self.root,staged['rollback'],owner='owner',operation_id='rollback',expected_active=staged['target'])
        self.assertEqual(result['state'],'COMMITTED');self.assertEqual(prepared.current(self.root),self.before)
        self.assertIsNone(weekly.load(self.root,weekly.CONFIG))
        self.assertEqual((self.root/staged['training_ref']['path']).read_bytes(),before)
        with self.assertRaisesRegex(ValueError,'source state changed|superseded'):self.activate(staged)

    def test_owner_change_stops_recovery(self):
        staged=self.stage();self.crash_switch(staged,weekly.CONFIG)
        save(self.root/release.OWNER,{'owner':'owner','state':'ACTIVE','generation':2})
        with release.dispatch(self.root) as handle,self.assertRaisesRegex(ValueError,'fence changed'):
            initial.recover(self.root,'owner',handle)

    def test_attempt_budget_stops_repeated_recovery(self):
        staged=self.stage()
        for attempt in range(3):self.crash_switch(staged,weekly.CONFIG)
        with self.assertRaisesRegex(ValueError,'attempts exhausted'):self.activate(staged)
        self.assertIsNone(release.pointer(self.root,release.ACTIVE))

    def test_capture_window_stops_before_training_or_switch(self):
        with patch.object(scheduler,'capture_window',return_value=True),self.assertRaisesRegex(ValueError,'deferred'):
            self.stage()
        self.extend.assert_not_called();self.assertIsNone(release.pointer(self.root,release.OPERATION))

    def test_scheduler_recovers_before_guard_and_provider_work(self):
        staged=self.stage();self.crash_switch(staged,weekly.CONFIG,after=True)
        with patch.object(scheduler,'OUT',self.root/'outputs/model-pick-v1'),\
             patch.object(scheduler,'ownership',return_value={'owner':'owner','state':'ACTIVE'}),\
             patch.object(scheduler,'synchronize'),patch.object(scheduler,'publish_artifacts',side_effect=RuntimeError('sentinel after guard')):
            with self.assertRaisesRegex(RuntimeError,'sentinel after guard'):scheduler.run('daily','owner')
        self.assertEqual(release.guard(self.root)['mode'],'SCHEDULED')
