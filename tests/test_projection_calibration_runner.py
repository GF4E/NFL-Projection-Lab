"""Synthetic file-to-score integration; no production evidence is exercised."""
import copy
import datetime as dt
from unittest.mock import patch
import test_projection_calibration_admission as admission_fixture
from test_projection_calibration_evaluate import fixture
from engine.projection import calibration_evaluate as e, calibration_admission as a


class Base(admission_fixture.AdmissionTests):pass
for name in vars(admission_fixture.AdmissionTests):
    if name.startswith('test_'):setattr(Base,name,None)


class RunnerTests(Base):
    def setUp(self):
        super().setUp()
        admitted,self.weeks=fixture()
        self.control=admitted['control'];self.inputs['roles']=admitted['inputs']['roles']
        for role,source in self.inputs['roles'].items():
            mapping={};fits={}
            for old,manifest in source['fits'].items():
                manifest['method_sha256']=self.inputs['methods'][role]['sha256']
                new=a.digest(manifest);mapping[old]=new;fits[new]=manifest
            source['fits']=fits
            for row in source['history']:row['fit_evidence_sha256']=mapping[row['fit_evidence_sha256']]
        self.inputs.update(folds=admitted['inputs']['folds'],evaluation_game_ids=sorted(self.weeks))
        self.inputs['sources']['schedule']=self.save('work/schedule.json',[
            {'game_id':gid,'week':week} for gid,week in self.weeks.items()])
        control_ref=self.save(self.control_ref['path'],self.control)
        self.catalog['series'][0]['sha256']=control_ref['sha256']
        self.save('work/series-registry/catalog.json',self.catalog)
        self.r.update(baseline_hash=control_ref['sha256'],population_game_ids=sorted(self.weeks),seasons=[2016,2017])
        self.save_inputs();self.ref=self.registration()

    def clock(self):return dt.datetime.fromisoformat(self.now.replace('Z','+00:00'))

    def test_real_admission_adapter_scorer_and_recheck_are_read_only(self):
        before=self.snapshot();result=e.run(self.root,self.ref,clock=self.clock)
        self.assertEqual(result['sha256'],a.digest({k:v for k,v in result.items() if k!='sha256'}))
        self.assertEqual(result['pooled']['control']['team']['n'],6)
        self.assertEqual(result['input_ref'],self.r['inputs'])
        self.assertEqual(before,self.snapshot());self.assertFalse(result['activates_method'])

    def test_changed_control_during_computation_prevents_return(self):
        real=e.numerical
        def change(*args,**kwargs):
            result=real(*args,**kwargs);self.save(self.control_ref['path'],[]);return result
        with patch.object(e,'numerical',side_effect=change),self.assertRaisesRegex(ValueError,'bytes changed'):
            e.run(self.root,self.ref,clock=self.clock)

    def test_expiry_during_computation_prevents_return(self):
        times=iter([self.clock(),dt.datetime.fromisoformat(self.r['deadline_at'].replace('Z','+00:00'))])
        with self.assertRaisesRegex(ValueError,'clock expired'):
            e.run(self.root,self.ref,clock=lambda:next(times))

    def test_registration_failure_never_enters_numerical_worker(self):
        self.r['authoritative']=False;ref=self.registration()
        with patch.object(e,'numerical') as worker,self.assertRaisesRegex(ValueError,'Non-authoritative'):
            e.run(self.root,ref,clock=self.clock)
        worker.assert_not_called()
