import hashlib
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from scripts.projection_backup import archive,restore,verify_tree,git,digest_file,accept,run

class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.base=Path(self.temp.name)
        self.source=self.base/'source';self.source.mkdir();git(self.source,'init','-q')
        (self.source/'record.json').write_bytes(b'{"locked":true}\n');(self.source/'code.py').write_bytes(b'print("fixture")\n');(self.source/'code.py').chmod(0o755)
        (self.source/'link').symlink_to('record.json')
        git(self.source,'add','.');git(self.source,'-c','user.name=Fixture','-c','user.email=fixture@invalid','commit','-qm','fixture')
        self.commit=git(self.source,'rev-parse','HEAD').strip().decode()

    def test_standalone_archive_restores_tree_without_remote_or_alternates(self):
        record=archive(self.source,self.commit,self.base/'backup')
        (self.source/'record.json').write_bytes(b'new unrelated workspace bytes')
        result=restore(record,self.base/'restored')
        self.assertEqual(result['verified_entries'],3);self.assertFalse(result['object_alternates']);self.assertFalse(result['network_remote'])
        self.assertEqual((self.base/'restored/record.json').read_bytes(),b'{"locked":true}\n')

    def test_corrupted_archive_is_not_accepted(self):
        record=archive(self.source,self.commit,self.base/'backup');p=Path(record['path']);p.write_bytes(p.read_bytes()[:-20])
        with self.assertRaises(ValueError):restore(record,self.base/'restored')
        self.assertFalse((self.base/'restored').exists())

    def test_truncated_archive_with_rehashed_envelope_fails_object_restore(self):
        record=archive(self.source,self.commit,self.base/'backup');p=Path(record['path']);p.write_bytes(p.read_bytes()[:-20]);record['sha256']=digest_file(p)
        with self.assertRaises(subprocess.CalledProcessError):restore(record,self.base/'restored')

    def test_existing_restore_is_never_overwritten(self):
        record=archive(self.source,self.commit,self.base/'backup');p=self.base/'restored';p.mkdir();(p/'mine').write_text('retain')
        with self.assertRaises(ValueError):restore(record,p)
        self.assertEqual((p/'mine').read_text(),'retain')

    def test_failed_attempt_preserves_last_accepted_recovery_point(self):
        git(self.source,'update-ref','refs/remotes/origin/engine-v2',self.commit)
        accepted=accept(self.source,{'state':'RESTORE_VERIFIED','source_commit':self.commit,'fixture':'previous'})
        path=self.source/'work/engine-rebuild/backup-restore.json';before=path.read_bytes()
        with patch('scripts.projection_backup.archive',side_effect=OSError('full')):
            with self.assertRaises(OSError):run(self.source,self.base/'new-backups')
        self.assertEqual(path.read_bytes(),before)
        attempt=json.loads((self.source/'work/engine-rebuild/backup-attempt.json').read_bytes())
        self.assertEqual(attempt['state'],'FAILED')
        receipt=self.source/accepted['receipt_ref']['path']
        self.assertEqual(hashlib.sha256(receipt.read_bytes()).hexdigest(),accepted['receipt_ref']['sha256'])
        with self.assertRaises(ValueError):accept(self.source,attempt)

    def test_held_backup_lock_prevents_duplicate_work_without_timeout(self):
        base=self.base/'backups';base.mkdir()
        with (base/'.backup.lock').open('a+') as handle:
            fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch('scripts.projection_backup.archive',side_effect=AssertionError('duplicate')):
                self.assertEqual(run(self.source,base),{'state':'LOCAL_BACKUP_ACTIVE'})
        self.assertFalse((self.source/'work/engine-rebuild/backup-attempt.json').exists())

    def test_changed_restored_file_or_mode_fails_verification(self):
        record=archive(self.source,self.commit,self.base/'backup');p=self.base/'restored';restore(record,p)
        (p/'record.json').write_text('changed')
        with self.assertRaises(ValueError):verify_tree(p,self.commit)
        (p/'record.json').write_bytes(b'{"locked":true}\n');(p/'code.py').chmod(0o644)
        with self.assertRaises(ValueError):verify_tree(p,self.commit)

if __name__=='__main__':unittest.main()
