import copy
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from engine.projection import release_preflight as p
from engine.projection import runtime_snapshot


class ReleasePreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.code='print("fixture")\n';self.write('engine/test.py',self.code.encode())
        self.cal=self.put('cal.json',{'fixture':True})
        self.fit=self.put('fit.json',{'shapes':self.cal})
        self.put('work/in-season-learning-v1/active-fit-ref.json',self.fit)
        self.replay=self.put('replay.json.gz',{'fixture':'not used for fitting'},compressed=True)
        self.training=self.put('training.json.gz',{'method_fit_ref':self.fit,'replay_ref':self.replay},compressed=True)
        score=self.put('score.json',{'games':1})
        self.close=self.put('public.json',{'status':'HTTP_BYTES_VERIFIED','observed_at':'fixture','artifacts':{score['path']:score['sha256']}})
        self.consumer={'status':'RESTORED_CONSUMER_PASS','source_commit':'a'*40,'runtime_manifest_sha256':'b'*64,
          'namespace_isolation_verified':True,'read_only_restored_mounts':True,'elapsed_seconds':10,
          'external_native_files':{},'parity':{'restored_forecasts':1},
          'lifecycle':{'status':'PASS','locks':1,'slate_games':1,'synthetic_grades':1,
           'original_bundles_graded_after_rollback':True,'numerical_retry_skipped':True,
           'peak_rss_bytes':100,'original_source_records_preserved':2,'parent_fit':self.fit,
           'code':{'files':{'engine/test.py':p.sha(self.code.encode())}}}}
        self.accepted={'status':'SAME_HOST_EXECUTABLE_RESTORE_VERIFIED','unit':{'ActiveState':'inactive','Result':'success','ExecMainStatus':'0'},
          'original_mounts_and_namespaces_unchanged':True,'original_records_and_pointers_unchanged':3,'external_native_files_verified':0}
        self.packet={'schema':'initial-chronology-release-review-v1','authorizes_activation':False,
          'documents':[self.put('review.md',{'review':'fixture'})],
          'fit_ref':self.fit,'calibration_ref':self.cal,'training_ref':self.training,'replay_ref':self.replay,
          'evidence':{'public_closeout':self.close}}
        self.bind_recovery()

    def write(self,name,data):
        path=self.root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        return {'path':name,'sha256':p.sha(data)}

    def put(self,name,body,compressed=False):
        data=json.dumps(body,sort_keys=True).encode()
        return self.write(name,gzip.compress(data,mtime=0) if compressed else data)

    def bind_recovery(self):
        c=self.put('consumer.json',self.consumer)
        for key in ('source_commit','runtime_manifest_sha256','parity','lifecycle'):self.accepted[key]=copy.deepcopy(self.consumer[key])
        self.accepted['consumer_receipt_sha256']=c['sha256']
        self.packet['evidence'].update(restored_consumer=c,recovery_acceptance=self.put('accepted.json',self.accepted))

    def check(self,**kwargs):return p.check(self.root,self.put('packet.json',self.packet),**kwargs)

    def test_good_evidence_still_requires_real_reviews_runtime_and_live_transition(self):
        report=self.check();checks={c['name']:c['status'] for c in report['checks']}
        self.assertEqual(report['status'],'BLOCKED');self.assertFalse(report['activation'])
        self.assertEqual(checks['CURRENT_RUNTIME'],'NOT_CHECKED')
        self.assertEqual(checks['EXTERNAL_REVIEW_Claude'],'NOT_RECORDED')
        self.assertEqual(checks['EXTERNAL_REVIEW_Dr. M'],'NOT_RECORDED')
        self.assertEqual(checks['LIVE_TRANSITION'],'NOT_INSTALLED')
        for c in report['checks']:
            if c['name'].startswith('EXTERNAL_REVIEW_'):self.assertFalse(c['blocks_initial_chronology_work'])

    def test_pointer_presence_is_not_verified_activation(self):
        self.put('outputs/projection-v3/pipeline-releases/active.json',{})
        self.put('work/projection-weekly-refit-v1/configuration.json',{})
        report=self.check()
        self.assertEqual(next(c['status'] for c in report['checks'] if c['name']=='LIVE_TRANSITION'),'NOT_VERIFIED')
        self.assertFalse(report['activation'])

    def test_changed_evidence_rejected_without_rehashing(self):
        (self.root/'consumer.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'hash differs'):self.check()

    def test_forged_running_success_is_not_completion(self):
        self.accepted['unit']['ActiveState']='active';self.bind_recovery()
        with self.assertRaisesRegex(ValueError,'terminal-success'):self.check()

    def test_acceptance_from_another_consumer_rejected(self):
        self.accepted['consumer_receipt_sha256']='c'*64
        self.packet['evidence']['recovery_acceptance']=self.put('accepted.json',self.accepted)
        with self.assertRaisesRegex(ValueError,'another consumer'):self.check()

    def test_changed_issuing_source_rejected(self):
        self.write('engine/test.py',b'changed')
        with self.assertRaisesRegex(ValueError,'issuing source'):self.check()

    def test_new_active_fit_requires_new_packet(self):
        self.put('work/in-season-learning-v1/active-fit-ref.json',{'path':'new','sha256':'c'*64})
        with self.assertRaisesRegex(ValueError,'Active fit changed'):self.check()

    def test_wrong_replay_binding_rejected(self):
        self.packet['replay_ref']=self.put('other.json.gz',{},compressed=True)
        with self.assertRaisesRegex(ValueError,'Training history'):self.check()

    def test_incomplete_lifecycle_rejected_even_with_valid_hashes(self):
        self.consumer['lifecycle']['synthetic_grades']=0;self.bind_recovery()
        with self.assertRaisesRegex(ValueError,'Incomplete'):self.check()

    def test_resource_overrun_rejected(self):
        self.consumer['elapsed_seconds']=570;self.bind_recovery()
        with self.assertRaisesRegex(ValueError,'resource ceiling'):self.check()

    def test_changed_review_document_rejected(self):
        self.write('review.md',b'changed')
        with self.assertRaisesRegex(ValueError,'hash differs'):self.check()

    def test_unsafe_evidence_path_rejected(self):
        with self.assertRaisesRegex(ValueError,'Unsafe'):p.read(self.root,{'path':'../outside','sha256':'a'*64})

    def test_wrong_private_manifest_rejected(self):
        manifest=self.root/'private.json';manifest.write_text('{}')
        with self.assertRaisesRegex(ValueError,'Private runtime manifest'):self.check(runtime_manifest=manifest)

    def runtime_fixture(self):
        prefix=self.root/'runtime';prefix.mkdir();(prefix/'python').write_bytes(b'interpreter fixture')
        manifest={'schema':runtime_snapshot.SCHEMA,'source_prefix':str(prefix),'entries':runtime_snapshot.inventory(prefix)}
        ref=self.put('private-runtime.json',manifest)
        native=self.root/'native';native.write_bytes(b'native fixture')
        self.consumer['runtime_manifest_sha256']=ref['sha256']
        self.consumer['external_native_files']={str(native):p.sha(native.read_bytes())}
        self.accepted['external_native_files_verified']=1;self.bind_recovery()
        return prefix,self.root/ref['path'],native

    def test_current_runtime_exactly_matches_but_is_not_review_approval(self):
        prefix,manifest,_=self.runtime_fixture()
        with patch.object(p.sys,'prefix',str(prefix)):
            result=self.check(runtime_manifest=manifest)
        self.assertEqual(next(x['status'] for x in result['checks'] if x['name']=='CURRENT_RUNTIME'),'PASS')
        self.assertEqual(result['status'],'BLOCKED')

    def test_native_library_drift_rejected(self):
        prefix,manifest,native=self.runtime_fixture();native.write_bytes(b'changed')
        with patch.object(p.sys,'prefix',str(prefix)),self.assertRaisesRegex(ValueError,'native dependency differs'):
            self.check(runtime_manifest=manifest)

    def test_interpreter_tree_drift_rejected(self):
        prefix,manifest,_=self.runtime_fixture();(prefix/'python').write_bytes(b'changed')
        with patch.object(p.sys,'prefix',str(prefix)),self.assertRaisesRegex(ValueError,'metadata differ'):
            self.check(runtime_manifest=manifest)

if __name__=='__main__':unittest.main()
