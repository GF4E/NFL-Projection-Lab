import copy
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from engine.projection import prepared
from engine.projection.storage import save


class PreparedTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.fit={'path':'work/projection-v3/fixture.json','sha256':'a'*64}
        save(self.root/'work/in-season-learning-v1/active-fit-ref.json',self.fit)
        self.rows=[{'game_id':'g','home':home,'features':{'baseline':22.}} for home in (False,True)]
        self.data=gzip.compress(prepared.raw(self.rows),mtime=0)
        self.meta={'sha256':prepared.sha(self.data),'fit':self.fit,'signature':'fixture',
                   'source_manifest':{'source':'original'},'personnel_source_hashes':[]}
        (self.root/prepared.LEGACY).parent.mkdir(parents=True,exist_ok=True)
        (self.root/prepared.LEGACY).write_bytes(self.data)
        save(self.root/prepared.POINTER,self.meta)

    def commit(self,data=None,meta=None):
        with prepared.writer(self.root):return prepared.commit(self.root,data or self.data,meta or self.meta)

    def test_migrate_exact_legacy_bytes_and_reuse_without_alias_writes(self):
        old=(self.root/prepared.LEGACY).read_bytes()
        pointer=self.commit();rows,manifest,data=prepared.load(self.root)
        self.assertEqual((rows,data),(self.rows,self.data));self.assertEqual(manifest,pointer)
        self.assertEqual((self.root/prepared.LEGACY).read_bytes(),old)
        self.assertEqual(self.commit(),pointer)
        self.assertEqual(len(list((self.root/prepared.BASE/'prepared-features').glob('*'))),1)
        self.assertEqual(len(list((self.root/prepared.BASE/'prepared-manifests').glob('*'))),1)

    def test_failed_snapshot_or_manifest_or_pointer_keeps_last_good_readable(self):
        old=self.commit();before=(self.root/prepared.POINTER).read_bytes()
        rows=copy.deepcopy(self.rows);rows[0]['features']['baseline']=25.
        data=gzip.compress(prepared.raw(rows),mtime=0);meta={**self.meta,'sha256':prepared.sha(data)}
        real=prepared.write_bytes
        for stage in ('prepared-features','prepared-manifests','pointer'):
            def write(path,raw,immutable=False):
                if stage in Path(path).parts:raise OSError('simulated storage failure')
                return real(path,raw,immutable)
            with self.subTest(stage=stage),patch.object(prepared,'write_bytes',side_effect=write):
                pointer_patch=patch.object(prepared,'save',side_effect=OSError('pointer failed')) if stage=='pointer' else patch.object(prepared,'save',wraps=save)
                with pointer_patch,self.assertRaises(OSError):self.commit(data,meta)
            self.assertEqual((self.root/prepared.POINTER).read_bytes(),before)
            self.assertEqual(prepared.load(self.root)[0],self.rows)
        new=self.commit(data,meta)
        self.assertEqual(prepared.load(self.root)[0],rows)
        self.assertEqual(prepared.load(self.root,ref=old['prepared_manifest_ref'])[0],self.rows)
        self.assertNotEqual(old,new)

    def test_lost_pointer_response_retries_same_snapshot(self):
        real=prepared.save
        def lost(path,value):
            real(path,value);raise OSError('response lost after durable commit')
        with patch.object(prepared,'save',side_effect=lost),self.assertRaises(OSError):self.commit()
        original=(self.root/prepared.POINTER).read_bytes()
        self.assertEqual(prepared.load(self.root)[0],self.rows)
        self.commit();self.assertEqual((self.root/prepared.POINTER).read_bytes(),original)

    def test_explicit_corruption_never_falls_back_to_legacy_cache(self):
        pointer=self.commit();path=self.root/pointer['features_ref']['path'];path.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'artifact hash'):prepared.load(self.root)
        self.assertEqual((self.root/prepared.LEGACY).read_bytes(),self.data)

    def test_pointer_metadata_tampering_rejected(self):
        pointer=self.commit();pointer['fit']={'path':'other','sha256':'0'*64}
        save(self.root/prepared.POINTER,pointer)
        with self.assertRaisesRegex(ValueError,'immutable manifest'):prepared.load(self.root)

    def test_changed_fit_before_final_pointer_does_not_publish(self):
        self.commit();before=(self.root/prepared.POINTER).read_bytes()
        calls=[]
        def current_fit(_):
            calls.append(1);return self.fit if len(calls)==1 else {'path':'new','sha256':'b'*64}
        with patch.object(prepared,'active_fit',side_effect=current_fit),self.assertRaisesRegex(ValueError,'changed during'):
            self.commit()
        self.assertEqual((self.root/prepared.POINTER).read_bytes(),before)

    def test_writer_exclusion_applies_to_preparation_and_weekly_refit(self):
        from scripts import projection_learning
        with prepared.writer(self.root):
            with self.assertRaisesRegex(ValueError,'already active'):
                with prepared.writer(self.root):self.fail('second writer')
            with patch.object(projection_learning,'ROOT',self.root),patch.object(projection_learning,'_weekly_refit',side_effect=AssertionError('must not fit')):
                with self.assertRaisesRegex(ValueError,'already active'):projection_learning.weekly_refit([],1,None)

    def test_duplicate_unpaired_and_empty_population_rejected(self):
        for rows in ([],self.rows[:1],self.rows+self.rows[:1]):
            data=gzip.compress(prepared.raw(rows),mtime=0)
            with self.subTest(rows=rows),self.assertRaises(ValueError):self.commit(data,{**self.meta,'sha256':prepared.sha(data)})

    def test_all_current_readers_ignore_obsolete_alias(self):
        from scripts import projection_learning
        self.commit();(self.root/prepared.LEGACY).write_bytes(b'old non-authoritative cache')
        with patch.object(projection_learning,'ROOT',self.root):self.assertEqual(projection_learning.current_rows(),self.rows)
        self.assertEqual(prepared.load(self.root)[0],self.rows)

    def test_learning_scheduler_prepares_new_fit_before_publishing(self):
        from contextlib import ExitStack
        from scripts import cloud_scheduler as scheduler
        events=[];newfit={'path':'work/projection-v3/new.json','sha256':'b'*64}
        def prepare():
            ref=prepared.active_fit(self.root);self.commit(meta={**self.meta,'fit':ref})
            events.append('prepare-new' if ref==newfit else 'prepare-old')
        def publish(**_):
            ref=prepared.active_fit(self.root)
            self.assertEqual(prepared.load(self.root)[1]['fit'],ref)
            events.append('publish-new' if ref==newfit else 'publish-old')
        def refit(*,owner,dispatch_handle):
            self.assertEqual(owner,'fixture')
            self.assertFalse(dispatch_handle.closed)
            self.assertEqual(Path(dispatch_handle.name),self.root/'scheduler/.cloud-dispatch.lock')
            events.append('refit');save(self.root/'work/in-season-learning-v1/active-fit-ref.json',newfit)
            return {'state':'REFIT_COMPLETE'}
        def closeout(_):events.append('closeout');return {'state':'PUBLISHED'}
        replacements={
            'scripts.reference_line_refresh.refresh':lambda *_:None,
            'scripts.projection_publish.sync':lambda:True,
            'engine.board_results.refresh':lambda:None,
            'scripts.suit_prepare.run':lambda **_:None,
            'scripts.projection_refresh.prepare':lambda:None,
            'scripts.projection_v3_prepare.prepare':prepare,
            'scripts.projection_v3_publish.run':publish,
            'scripts.projection_learning.report':lambda:None,
            'scripts.projection_learning.run_weekly':refit,
            'scripts.closeout_publish.run':closeout}
        with ExitStack() as stack:
            stack.enter_context(patch.multiple(scheduler,ROOT=self.root,OUT=self.root/'scheduler'))
            stack.enter_context(patch.object(scheduler,'ownership',return_value={'state':'ACTIVE','owner':'fixture'}))
            stack.enter_context(patch.object(scheduler,'synchronize'))
            stack.enter_context(patch.object(scheduler,'publish_artifacts',return_value='c'*40))
            for target,value in replacements.items():stack.enter_context(patch(target,side_effect=value))
            result=scheduler.run('learning','fixture')
        self.assertEqual(result['state'],'REFIT_COMPLETE')
        self.assertEqual(events,['prepare-old','publish-old','closeout','refit','prepare-new','publish-new'])


if __name__=='__main__':unittest.main()
