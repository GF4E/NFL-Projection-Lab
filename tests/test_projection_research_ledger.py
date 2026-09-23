import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from engine.projection import research_ledger as l, storage

class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        storage.save(self.root/'work/registration.json',{'claimed_at':'2016-01-01','candidate':'a'})
        self.req=dict(key='explicit-operation',kind='DOCUMENT_IMPORTED',experiment='E-TEST',evidence=[l.reference(self.root,'work/registration.json')])
    def record(self,**changes):return l.record(self.root,**{**self.req,**changes})
    def test_duplicate_preserves_first_clock_and_source_snapshot(self):
        t=dt.datetime(2026,9,23,tzinfo=dt.timezone.utc)
        with patch.object(l,'now',return_value=t):r=self.record()
        storage.save(self.root/'work/registration.json',{'candidate':'b'})
        with patch.object(l,'now',side_effect=AssertionError('Retry moved time')):self.assertEqual(r,self.record())
        b=l.read_event(self.root,r['path'])['body'];self.assertEqual(b['recorded_at'],t.isoformat())
        self.assertEqual(json.loads((self.root/b['snapshots'][0]['path']).read_bytes())['candidate'],'a')
        self.assertEqual(l.inventory(self.root)['past_unlogged_views'],'UNKNOWN')
    def test_changed_payload_under_key_rejected(self):
        self.record()
        with self.assertRaisesRegex(ValueError,'Changed payload'):self.record(context={'new':True})
    def test_corrupted_snapshot_or_envelope_rejected(self):
        r=self.record();b=l.read_event(self.root,r['path'])['body']
        (self.root/b['snapshots'][0]['path']).write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'Snapshot changed'):l.inventory(self.root)
    def test_hash_mismatch_commits_no_event(self):
        self.req['evidence'][0]['sha256']='0'*64
        with self.assertRaises(ValueError):self.record()
        self.assertEqual(l.inventory(self.root)['events'],[])
    def test_path_and_private_evidence_refused(self):
        for p in ['../outside','/absolute','.cloud-private/key','work/../private','work//x']:
            with self.assertRaises(ValueError):self.record(evidence=[dict(path=p,sha256='0'*64)])
    def test_symlink_escaping_root_refused(self):
        (self.root/'work/link').symlink_to('/etc/hosts')
        with self.assertRaises(ValueError):l.reference(self.root,'work/link')
    def test_failure_before_commit_and_lost_response_retry(self):
        real=storage.save
        def before(path,value,immutable=False):
            if '/events/' in str(path):raise OSError('before commit')
            return real(path,value,immutable)
        with patch.object(storage,'save',side_effect=before),self.assertRaises(OSError):self.record()
        self.assertFalse(l.inventory(self.root)['events'])
        def after(path,value,immutable=False):
            result=real(path,value,immutable)
            if '/events/' in str(path):raise OSError('lost response')
            return result
        with patch.object(storage,'save',side_effect=after),self.assertRaises(OSError):self.record()
        first=l.inventory(self.root)['events'][0];self.record()
        self.assertEqual(l.inventory(self.root)['events'],[first])
    def test_views_are_explicit_and_reports_not_human_views(self):
        self.record(kind='REPORT_GENERATED');self.record(key='view-1',kind='EVALUATION_VIEWED')
        v=l.inventory(self.root);self.assertEqual(len(v['events']),2)
        self.assertFalse(v['exhaustive_historical_trial_count'])
    def test_partial_staging_is_not_a_committed_event(self):
        folder=self.root/l.BASE/'events';folder.mkdir(parents=True)
        (folder/'.event.pending').write_bytes(b'partial')
        v=l.inventory(self.root);self.assertEqual(v['uncommitted_staging'],['.event.pending']);self.assertEqual(v['events'],[])

    def test_concurrent_duplicate_dispatch_has_one_committed_event(self):
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=4) as pool:refs=list(pool.map(lambda _:self.record(),range(8)))
        self.assertTrue(all(r==refs[0] for r in refs));self.assertEqual(len(l.inventory(self.root)['events']),1)

if __name__=='__main__':unittest.main()
