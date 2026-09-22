import copy
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from engine.projection.source_archive import FOLDER,store_source,read_source,reference
from engine.projection.finals import parse,refresh

RAW=b'game_id,away_score,home_score,result,total,spread_line,total_line\ng,13,20,7,33,3.5,40\n'

class SourceArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.logical=hashlib.sha256(RAW).hexdigest();self.feed={'source_sha256':self.logical}

    def compressed(self):
        ref=store_source(self.root,RAW);return {**self.feed,'source_ref':ref}

    def test_exact_bytes_and_both_hashes(self):
        feed=self.compressed();ref=feed['source_ref'];self.assertEqual(ref['encoding'],'gzip')
        stored=(self.root/ref['path']).read_bytes()
        self.assertEqual(hashlib.sha256(stored).hexdigest(),ref['sha256'])
        self.assertEqual(gzip.decompress(stored),RAW);self.assertEqual(read_source(self.root,feed),RAW)
        self.assertEqual(parse(read_source(self.root,feed)),parse(RAW))

    def test_legacy_csv_reused_without_rewriting_or_new_archive(self):
        path=self.root/FOLDER/(self.logical+'.csv');path.parent.mkdir(parents=True);path.write_bytes(RAW)
        before=(path.read_bytes(),path.stat().st_mtime_ns)
        self.assertEqual(read_source(self.root,self.feed),RAW)
        ref=store_source(self.root,RAW);self.assertEqual(ref,reference(self.feed))
        self.assertEqual((path.read_bytes(),path.stat().st_mtime_ns),before)
        self.assertEqual(len(list(path.parent.iterdir())),1)

    def test_repeat_is_durable_and_does_not_accumulate_or_rewrite(self):
        feed=self.compressed();path=self.root/feed['source_ref']['path'];before=path.stat().st_mtime_ns
        with patch('engine.projection.storage._sync_directory') as sync:
            self.assertEqual(store_source(self.root,RAW),feed['source_ref']);self.assertTrue(sync.called)
        self.assertEqual(path.stat().st_mtime_ns,before);self.assertEqual(len(list(path.parent.iterdir())),1)

    def test_stored_and_uncompressed_corruption_each_fail(self):
        feed=self.compressed();path=self.root/feed['source_ref']['path'];path.write_bytes(b'corrupt')
        with self.assertRaises(ValueError):read_source(self.root,feed)
        replacement=gzip.compress(b'other rows',mtime=0);path.write_bytes(replacement)
        feed['source_ref']['sha256']=hashlib.sha256(replacement).hexdigest()
        with self.assertRaisesRegex(ValueError,'Uncompressed'):read_source(self.root,feed)
        with self.assertRaises(ValueError):store_source(self.root,RAW)
        self.assertEqual(path.read_bytes(),replacement)

    def test_explicit_bad_reference_never_falls_back_to_existing_csv(self):
        path=self.root/FOLDER/(self.logical+'.csv');path.parent.mkdir(parents=True);path.write_bytes(RAW)
        for bad in (None,{}, {'path':'../outside','sha256':self.logical}):
            with self.subTest(ref=bad),self.assertRaises(ValueError):read_source(self.root,{**self.feed,'source_ref':bad})
        feed={**self.feed,'source_ref':{'path':f'{FOLDER}/{self.logical}.csv.gz','sha256':'a'*64,'sha256_uncompressed':self.logical,'encoding':'gzip'}}
        with self.assertRaises(FileNotFoundError):read_source(self.root,feed)

    def test_crash_after_source_commit_before_feed_preserves_last_good(self):
        now=dt.datetime(2026,9,22,17,tzinfo=dt.timezone.utc)
        refresh(self.root,now,lambda:RAW,owner='test');path=self.root/'outputs/projection-v3/final-feed.json';before=path.read_bytes()
        newer=RAW.replace(b'13,20,7,33',b'13,21,8,34')
        with patch('engine.projection.recovery.FinalFeedRecovery.output_intent',side_effect=OSError('crash')):
            with self.assertRaises(OSError):refresh(self.root,now+dt.timedelta(seconds=61),lambda:newer,owner='test')
        self.assertEqual(path.read_bytes(),before)
        self.assertEqual(read_source(self.root,{'source_sha256':hashlib.sha256(newer).hexdigest(),'source_ref':store_source(self.root,newer)}),newer)

    def test_source_disk_failure_never_changes_feed_timestamp(self):
        now=dt.datetime(2026,9,22,17,tzinfo=dt.timezone.utc)
        refresh(self.root,now,lambda:RAW,owner='test');path=self.root/'outputs/projection-v3/final-feed.json';before=path.read_bytes()
        with patch('engine.projection.source_archive.write_bytes',side_effect=OSError('full')):
            with self.assertRaises(OSError):refresh(self.root,now+dt.timedelta(seconds=61),lambda:RAW+b'\n',owner='test')
        self.assertEqual(path.read_bytes(),before)

    def test_board_schedule_reader_consumes_verified_decompressed_rows(self):
        import csv,io
        from scripts import board_v9_publish as reader
        feed=self.compressed();feed['games']=parse(RAW)
        (self.root/'outputs/projection-v3/final-feed.json').write_text(json.dumps(feed))
        fit=self.root/'work/projection-v1/fit-ref.json';fit.parent.mkdir(parents=True);fit.write_text('{}')
        with patch.object(reader,'ROOT',self.root), patch.object(reader,'read',side_effect=[{'source_manifest':{'schedule':{}}},[]]), patch.object(reader,'build',return_value={'games':{}}) as build, patch.object(reader,'save'):
            result=reader.run(board={'games':[]},shape_loader=lambda _:None)
        self.assertEqual(build.call_args.args[1],list(csv.DictReader(io.StringIO(RAW.decode()))))
        self.assertEqual(result['schedule_source'],feed['source_ref'])

    def test_weekly_diagnostic_reads_identical_lines_from_compressed_source(self):
        from scripts import reference_lines as reader
        # Stub only unrelated OPEN history; CLOSE is read by the real source adapter.
        receipt_path=Path(reader.SOURCE_DIR)/'open-source-receipts.json'
        (self.root/receipt_path).parent.mkdir(parents=True,exist_ok=True)
        receipts=[]
        for filename in ('historic_projected_spreads.csv','nfelo_games.csv'):
            raw=b'game_id,season,home_line_open,total_line_open\n';stored=gzip.compress(raw)
            name=Path(reader.SOURCE_DIR)/(filename+'.gz');(self.root/name).write_bytes(stored)
            receipts.append({'url':'https://fixture/'+filename,'path':str(name),'sha256':hashlib.sha256(stored).hexdigest(),'sha256_uncompressed':hashlib.sha256(raw).hexdigest()})
        (self.root/receipt_path).write_text(json.dumps(receipts))
        feed=self.compressed();(self.root/'outputs/projection-v3/final-feed.json').write_text(json.dumps(feed))
        refs,meta=reader.load_references(self.root,weekly=True)
        self.assertEqual(refs['CLOSE'],{'spread':{'g':3.5},'total':{'g':40.}})
        self.assertEqual(meta['CLOSE']['sha256_uncompressed'],self.logical)


if __name__=='__main__':unittest.main()
