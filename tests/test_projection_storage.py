import concurrent.futures
import errno
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from engine.projection import storage
from scripts.projection_publish import save as production_save


class DurableProjectionTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory();self.addCleanup(self.folder.cleanup)
        self.path=Path(self.folder.name)/'nested'/'artifact.json'

    def test_existing_wire_format_and_immutable_retry(self):
        value={'z':1.25,'a':['BUF',None]}
        production_save(self.path,value,True)
        self.assertEqual(self.path.read_bytes(),(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode())
        before=self.path.stat().st_mtime_ns
        production_save(self.path,value,True)
        self.assertEqual(self.path.stat().st_mtime_ns,before)
        with self.assertRaisesRegex(ValueError,'Frozen'):production_save(self.path,{'z':2},True)
        self.assertEqual(json.loads(self.path.read_bytes()),value)

    def test_failed_replace_preserves_old_bytes_and_cleans_only_staging(self):
        storage.save(self.path,{'old':True});other=self.path.parent/'unrelated.pending';other.write_text('preserve')
        with patch.object(storage.os,'replace',side_effect=OSError(errno.ENOSPC,'full')):
            with self.assertRaises(OSError):storage.save(self.path,{'new':True})
        self.assertEqual(json.loads(self.path.read_bytes()),{'old':True})
        self.assertEqual(other.read_text(),'preserve')
        self.assertEqual(list(self.path.parent.glob('.artifact.json.*.pending')),[])

    def test_file_fsync_failure_does_not_publish(self):
        self.path.parent.mkdir()
        with patch.object(storage.os,'fsync',side_effect=OSError(errno.ENOSPC,'full')):
            with self.assertRaises(OSError):storage.save(self.path,{'new':True},True)
        self.assertFalse(self.path.exists())

    def test_post_commit_failure_retries_without_duplicate_or_rewrite(self):
        self.path.parent.mkdir();real_link=os.link
        def uncertain(src,dst):
            real_link(src,dst)
            raise OSError(errno.EIO,'response lost after commit')
        with patch.object(storage.os,'link',side_effect=uncertain):
            with self.assertRaises(OSError):storage.save(self.path,{'key':'same'},True)
        before=self.path.stat().st_mtime_ns
        self.assertEqual(storage.save(self.path,{'key':'same'},True),'UNCHANGED')
        self.assertEqual(self.path.stat().st_mtime_ns,before)
        with self.assertRaises(ValueError):storage.save(self.path,{'key':'changed'},True)

    def test_directory_fsync_failure_is_not_reported_as_success(self):
        self.path.parent.mkdir()
        with patch.object(storage,'_sync_directory',side_effect=OSError(errno.EIO,'directory sync')):
            with self.assertRaises(OSError):storage.save(self.path,{'n':1},True)
        self.assertEqual(storage.save(self.path,{'n':1},True),'UNCHANGED')

    def test_concurrent_different_immutable_writers_cannot_overwrite(self):
        self.path.parent.mkdir()
        def writer(n):
            try:return storage.save(self.path,{'n':n},True)
            except ValueError:return 'CONFLICT'
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            outcomes=list(pool.map(writer,range(16)))
        self.assertEqual(outcomes.count('COMMITTED'),1)
        self.assertEqual(outcomes.count('CONFLICT'),15)
        self.assertIn(json.loads(self.path.read_bytes())['n'],range(16))

    def test_concurrent_identical_writers_converge(self):
        self.path.parent.mkdir()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results=list(pool.map(lambda _:storage.save(self.path,{'same':1},True),range(16)))
        self.assertEqual(results.count('COMMITTED'),1)
        self.assertEqual(results.count('UNCHANGED'),15)

    def test_invalid_json_and_symlink_do_not_touch_record(self):
        storage.save(self.path,{'safe':1})
        with self.assertRaises(ValueError):storage.save(self.path,{'bad':float('nan')})
        link=self.path.parent/'link';link.symlink_to(self.path)
        with self.assertRaises(ValueError):storage.save(link,{'other':1})
        self.assertEqual(json.loads(self.path.read_bytes()),{'safe':1})

    def test_raw_content_addressed_blob_is_not_overwritten(self):
        self.assertEqual(storage.write_bytes(self.path,b'csv,bytes\n',True),'COMMITTED')
        with self.assertRaises(ValueError):storage.write_bytes(self.path,b'truncated',True)
        self.assertEqual(self.path.read_bytes(),b'csv,bytes\n')
