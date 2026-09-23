"""Synthetic evidence only: real validators, no fit, network or activation."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from engine.projection import calibration_admission as a
from engine.projection import cutoff_pipeline as pipeline, refit_release, pipeline_release as release
from engine.projection_v3.model import GROUPS
from engine.projection.public_closeout import mapping, proof_path, CONFIG
from scripts.accuracy_scope import validate


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.now='2026-09-22T16:00:00Z'
        self.control=[{'game_id':'fixture','season':2016,'home':24.5,'away':20.2,
                       'actual_home':27,'actual_away':17}]
        self.control_ref=self.save('work/control.json',self.control)
        own={'family':'fixed_calibration_elo_ridge','groups':['calibration','elo'],'selected':['none',10]}
        legacy={'family':'legacy_adaptive_donor'}
        source=self.save('work/source.json',{'synthetic':True})
        self.inputs={'schema':'calibration-history-inputs-v1',
            'methods':{k:{'descriptor':v,'sha256':a.digest(v)} for k,v in [('own',own),('legacy',legacy)]},
            'sources':{'point_replay':source},'code':[self.save('work/code.json',{'synthetic':True})],
            'plan':self.save('work/plan.json',{'synthetic':True}),
            'roles':{'own':{'history':copy.deepcopy(self.control)}},
            'evaluation_game_ids':['fixture'],'folds':[{'season':2016}]}
        self.catalog={'authoritative_control':self.control_ref['path'],'series':[{
            **self.control_ref,'authoritative':True,'generated_at':'2026-09-21T16:00:00Z',
            'point_method_sha256':a.digest(own),'source_history':source}]}
        self.save('work/series-registry/catalog.json',self.catalog)
        self.closed={'schema':'closeout-publication-v2','state':'PUBLISHED','all_games_graded':True,
            'season':2026,'week':2,'published_at':'2026-09-22T13:10:00+00:00','source_commit':'a'*40,
            'artifacts':{}}
        for name in ('scorecard','trend','season'):
            ref=self.save(f'outputs/cadence-v2/weeks/2026-w2/{name}.json',{'synthetic':name})
            self.closed['artifacts'][ref['path']]=ref['sha256']
        self.closed_path='outputs/cadence-v2/closeouts/2026-09-22.json'
        self.save(CONFIG,{'schema':'public-closeout-endpoints-v1','base_url':'https://fixture.invalid/closeouts'})
        closed_ref=self.save(self.closed_path,self.closed)
        self.proof={'schema':'verified-public-closeout-v1','status':'HTTP_BYTES_VERIFIED',
            'receipt_sha256':closed_ref['sha256'],'observed_at':'2026-09-22T13:12:00Z',
            'artifacts':self.closed['artifacts'],'urls':mapping(self.root,self.closed)}
        self.save(str(proof_path(Path(self.closed_path))),self.proof)
        self.save('outputs/cadence-v2/closeouts/acknowledgments/2026-09-22.json',{
            'receipt_sha256':closed_ref['sha256'],'confirmed_at':'2026-09-22T13:11:00+00:00',
            'verified_remote_commit':'b'*40})
        names=sorted({n for group in own['groups'] for n in GROUPS[group]})
        numerical={'groups':own['groups'],'names':names,'penalty':10,'training_hash':'c'*64,
                   'means':[0.]*len(names),'scales':[1.]*len(names),'coefficients':[0.]*len(names),'intercept':22.}
        parent={'groups':own['groups'],'selected':own['selected'],'elo_hfa':{'2026':40.},
                'through_week':1,'issued_at':'2026-09-15T13:25:00Z','version':'projection-v2.w2',
                'fit':numerical,'inactive':[]}
        parent_ref=self.save('work/in-season-learning-v1/parent-fit.json',parent)
        shadow=copy.deepcopy(parent)
        shadow.update(role='SHADOW_WEIGHT_ONLY',parent_fit_ref=parent_ref,through_week=2,
            parent_training_hash=parent['fit']['training_hash'],issued_at=None,
            fit_started_at='2026-09-22T13:15:00Z',computation_completed_at='2026-09-22T13:24:00Z',
            intent_sha256='a'*64)
        shadow['fit']['intercept']=22.1
        self.shadow_ref=pipeline.store(self.root,'shadow-fits',shadow)
        self.availability=f"{pipeline.BASE}/fit-availability/{self.shadow_ref['sha256']}.json"
        self.save(self.availability,{'fit_ref':self.shadow_ref,'status':'DURABLY_STORED_NOT_ACTIVATED',
            'available_at':'2026-09-22T13:25:00Z','intent_sha256':'a'*64})
        fit_ref=refit_release.retain(self.root,self.shadow_ref)
        self.fit=refit_release.verify(self.root,fit_ref)
        self.op='work/projection-weekly-refit-v1/operations/2026-w2'
        self.request={'schema':'recorded-weekly-request-v1','closeout_ref':closed_ref,
            'public_proof_sha256':a.digest(self.proof),'season':2026,'week':2,
            'fit_at':'2026-09-22T13:15:00Z','parent_fit':parent_ref,
            'operation_id':'weekly-2026-w2',
            'parent_release':release.store(self.root,'manifests',{'synthetic_parent':True})}
        request_ref=self.save_envelope(self.op+'/request.json',self.request)
        target=release.store(self.root,'manifests',{'schema':'projection-pipeline-release-v1',
            'mode':'SCHEDULED','fit_ref':fit_ref})
        intent=release.store(self.root,'intents',{'target':target,'expected_active':self.request['parent_release'],
            'fit_before':parent_ref,'operation_id':self.request['operation_id'],'started_at':'2026-09-22T13:26:00Z'})
        receipt=release.store(self.root,'receipts',{'intent_ref':intent,'state':'COMMITTED','target':target})
        self.result={'state':'REFIT_COMPLETE','request_sha256':a.digest(self.request),'through_week':2,
                     'fit':fit_ref,'issued_at':self.fit['issued_at'],'release_ref':target,'release_receipt':receipt}
        result_ref=self.save_envelope(self.op+'/result.json',self.result)
        self.r={'experiment':'E-CAL-LINEAGE','gate_policy':a.CALIBRATION_GATE,
            'point_tolerance':a.POINT_TOLERANCE,'candidates':['own_lineage_empirical'],
            'gate':copy.deepcopy(a.GATE),'calibration_settings':copy.deepcopy(a.SETTINGS),
            'training_window':'prior seasons','tuning':'none','tie_break':'retain control',
            'disproving_conditions':'registered gate failure','baseline_hash':self.control_ref['sha256'],
            'week':2,'registered_at':'2026-09-22T14:00:00Z','deadline_at':'2026-09-29T13:00:00Z',
            'authoritative':True,'control':self.control_ref['path'],'generated_at':self.catalog['series'][0]['generated_at'],
            'inputs':self.save('work/inputs.json',self.inputs),
            'method_hashes':{k:v['sha256'] for k,v in self.inputs['methods'].items()},
            'population_game_ids':['fixture'],'seasons':[2016],'closeout':closed_ref,
            'weekly_request':request_ref,'weekly_result':result_ref}

    def save(self,path,value):
        raw=json.dumps(value,sort_keys=True).encode();target=self.root/path
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        return {'path':path,'sha256':hashlib.sha256(raw).hexdigest()}

    def save_envelope(self,path,value):
        return self.save(path,{'body':value,'sha256':a.digest(value)})

    def registration(self):
        body={k:v for k,v in self.r.items() if k!='sha256'}
        return self.save('work/registration.json',{**body,'sha256':a.digest(body)})

    def snapshot(self):
        return {str(p.relative_to(self.root)):hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.root.rglob('*') if p.is_file()}

    def rejects(self,pattern,ref=None):
        ref=ref or self.registration();before=self.snapshot();worker=Mock()
        with self.assertRaisesRegex((ValueError,FileNotFoundError),pattern):
            a.evaluate(self.root,ref,at=self.now,worker=worker)
        worker.assert_not_called();self.assertEqual(before,self.snapshot())

    def save_inputs(self):self.r['inputs']=self.save('work/inputs.json',self.inputs)

    def save_weekly(self):
        self.r['weekly_request']=self.save_envelope(self.op+'/request.json',self.request)
        self.result['request_sha256']=a.digest(self.request)
        self.r['weekly_result']=self.save_envelope(self.op+'/result.json',self.result)

    def test_complete_synthetic_evidence_admits_exactly_once_without_mutation(self):
        ref=self.registration();before=self.snapshot();worker=Mock(return_value={'fixture_only':True})
        self.assertEqual(a.evaluate(self.root,ref,at=self.now,worker=worker),{'fixture_only':True})
        worker.assert_called_once();admission=worker.call_args.args[0]
        self.assertFalse(admission['activates_method']);self.assertEqual(admission['control'],self.control)
        self.assertEqual(before,self.snapshot())

    def test_registration_bytes_and_body_are_independently_bound(self):
        ref=self.registration();(self.root/ref['path']).write_text('{}')
        self.rejects('bytes changed',ref)
        ref=self.save('work/registration.json',{**self.r,'sha256':'0'*64})
        self.rejects('body changed',ref)

    def test_gate_and_settings_cannot_be_weakened(self):
        self.r['gate']['minimum_relative_improvement']=0
        self.rejects('adopted calibration contract')

    def test_clock_and_tuesday_registration(self):
        self.r['registered_at']='2026-09-23T14:00:00Z';self.rejects('Tuesday clock')
        self.r['registered_at']='2026-09-22T12:00:00Z';self.rejects('Tuesday clock')
        self.r['registered_at']='2026-09-22T14:00:00Z'
        self.now='2026-09-29T13:00:00Z';self.rejects('clock expired')

    def test_control_authority_hash_and_date(self):
        self.r['authoritative']=False;self.rejects('Non-authoritative')
        self.r['authoritative']=True;self.r['generated_at']='2026-09-20T16:00:00Z'
        self.rejects('generation date differs')
        self.r['generated_at']=self.catalog['series'][0]['generated_at']
        (self.root/self.control_ref['path']).write_text('[]');self.rejects('bytes changed')

    def test_unqualified_corrected_history_and_changed_source_fail(self):
        self.catalog['series'][0].pop('point_method_sha256');self.save('work/series-registry/catalog.json',self.catalog)
        self.rejects('authority not qualified')
        self.catalog['series'][0]['point_method_sha256']=self.inputs['methods']['own']['sha256']
        self.save('work/series-registry/catalog.json',self.catalog)
        self.save('work/source.json',{'changed':True});self.rejects('bytes changed')

    def test_changed_method_and_population_fail(self):
        self.inputs['methods']['own']['descriptor']['groups']=[];self.save_inputs()
        self.rejects('method identity differs')
        self.inputs['methods']['own']['descriptor']['groups']=['calibration','elo'];self.save_inputs()
        self.r['population_game_ids']=[];self.rejects('evaluation population')

    def test_different_points_actuals_and_nonfinite_values_fail(self):
        row=self.inputs['roles']['own']['history'][0]
        for key,value,pattern in [('home',24.7,'Control points'),('actual_home',28,'Control outcomes'),
                                   ('home',float('nan'),'Finite points'),('actual_home',27.5,'integer finals'),
                                   ('away',True,'Finite points')]:
            with self.subTest(key=key,value=value):
                previous=row[key];row[key]=value;self.save_inputs();self.rejects(pattern);row[key]=previous

    def test_public_proof_and_remote_ack_required(self):
        path=str(proof_path(Path(self.closed_path)))
        self.save(path,{**self.proof,'status':'UNVERIFIED'});self.rejects('proof identity')
        self.save(path,self.proof)
        self.save('outputs/cadence-v2/closeouts/acknowledgments/2026-09-22.json',{
            'receipt_sha256':self.r['closeout']['sha256'],'confirmed_at':'2026-09-22T13:11:00+00:00',
            'verified_remote_commit':''})
        self.rejects('publication is not confirmed')

    def test_stale_closeout_rejected_even_with_consistent_hashes(self):
        self.closed['published_at']='2026-09-21T13:10:00+00:00'
        self.r['closeout']=self.save(self.closed_path,self.closed)
        self.proof['receipt_sha256']=self.r['closeout']['sha256']
        self.save(str(proof_path(Path(self.closed_path))),self.proof)
        self.save('outputs/cadence-v2/closeouts/acknowledgments/2026-09-22.json',{
            'receipt_sha256':self.r['closeout']['sha256'],'confirmed_at':'2026-09-22T13:11:00+00:00',
            'verified_remote_commit':'b'*40})
        self.rejects('post-cutoff Tuesday closeout')

    def test_weekly_binding_missing_result_and_envelope(self):
        self.result['state']='PENDING';self.save_weekly();self.rejects('Weekly refit not bound')
        self.result['state']='REFIT_COMPLETE';self.save_weekly()
        self.r['weekly_result']=self.save(self.op+'/result.json',{'body':self.result,'sha256':'0'*64})
        self.rejects('envelope differs')
        self.r['weekly_result']={'path':self.op+'/result.json.missing','sha256':'0'*64}
        self.rejects('Wrong weekly operation')

    def test_refit_before_publication_or_after_registration_rejected(self):
        self.request['fit_at']='2026-09-22T13:11:00Z';self.save_weekly();self.rejects('order differs')
        self.request['fit_at']='2026-09-22T13:15:00Z';self.result['issued_at']=self.r['registered_at']
        self.save_weekly();self.rejects('order differs')

    def test_weight_refit_cannot_change_method(self):
        self.fit['selected']=['none',100];self.result['fit']=self.save('work/fit.json',self.fit)
        self.save_weekly();self.rejects('changes qualified point method')

    def test_self_consistent_fit_tampering_still_fails_recorded_refit_verification(self):
        self.fit['fit']['intercept']+=1
        self.result['fit']=self.save('work/in-season-learning-v1/tampered.json',self.fit)
        self.save_weekly();self.rejects('differs from recorded refit')

    def test_unavailable_recorded_fit_fails_before_worker(self):
        self.save(self.availability,{'fit_ref':self.shadow_ref,'status':'DURABLY_STORED_NOT_ACTIVATED',
            'available_at':'2026-09-22T13:14:00Z','intent_sha256':'a'*64})
        self.rejects('availability chronology')

    def test_completed_result_requires_committed_matching_release(self):
        old=release.read(self.root,self.result['release_receipt'],'receipts')
        self.result['release_receipt']=release.store(self.root,'receipts',{**old,'state':'PENDING'})
        self.save_weekly();self.rejects('release receipt or chronology')

    def test_path_cannot_leave_root(self):
        self.r['inputs']={'path':'../outside.json','sha256':'0'*64}
        self.rejects('outside repository')

    def test_exception_does_not_escape_experiment_or_admit_market_objective(self):
        validate(self.r)
        for field,value in [('experiment','E-VENUE-DIRECT'),('gate_policy','ordinary'),('point_tolerance',.01)]:
            bad=copy.deepcopy(self.r);bad[field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'team-points MAE'):validate(bad)
        bad=copy.deepcopy(self.r);bad['selection_metric']='ATS'
        with self.assertRaisesRegex(ValueError,'Market-relative'):validate(bad)


if __name__=='__main__':unittest.main()
