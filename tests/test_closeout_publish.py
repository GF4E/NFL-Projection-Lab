import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts.closeout_publish import publish, require_published

class CloseoutTest(unittest.TestCase):
    def test_missing_schedule_game_blocks_publication(self):
        with tempfile.TemporaryDirectory() as d:
            result=publish(Path(d),[{'season':2026,'week':1,'game_id':'missing'}],{'games':[]},1,lambda:self.fail('must not publish'),lambda:self.fail('must not refresh'),dt.datetime(2026,9,16,tzinfo=dt.timezone.utc))
            self.assertEqual(result['missing_games'],['missing'])

    def test_publication_order_hashes_and_idempotence(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); events=[]
            def push():
                receipts=list(root.glob('outputs/cadence-v2/closeouts/*.json'))
                events.append(bool(receipts));return 'a'*40
            rows=[{'season':2026,'week':1,'game_id':'g'}]
            # No historical lock: report named shortfall, never fabricate a forecast.
            board={'games':[{'game_id':'g','final':{'home_points':20,'away_points':10}}]}
            now=dt.datetime.now(dt.timezone.utc)
            with patch('scripts.closeout_publish.qualified',return_value=False):
                result=publish(root,rows,board,1,push,lambda:({'weeks':[],'reference_lines':{'schema':'reference-lines-report-v1','series':{}}},{'weeks':[]}),now)
                self.assertEqual(events,[False,True])
                scorecard=json.loads(next(root.glob('outputs/cadence-v2/weeks/*/scorecard.json')).read_text())
                self.assertEqual(scorecard['reference_lines']['schema'],'reference-lines-report-v1')
                receipt=next(root.glob('outputs/cadence-v2/closeouts/*.json'))
                later=dt.datetime.now(dt.timezone.utc)
                self.assertEqual(require_published(root,receipt,later),result)
                self.assertEqual(publish(root,rows,board,1,push,lambda:self.fail('must reuse'),later),result)
                self.assertEqual(events,[False,True])
                with self.assertRaises(ValueError):require_published(root,receipt,dt.datetime(2000,1,1,tzinfo=dt.timezone.utc))
                (root/next(iter(result['artifacts']))).write_text('changed')
                with self.assertRaises(ValueError):require_published(root,receipt,later)

    def test_failed_publish_has_no_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            def fail():raise RuntimeError('push failed')
            with patch('scripts.closeout_publish.qualified',return_value=False),self.assertRaises(RuntimeError):
                publish(root,[{'season':2026,'week':1,'game_id':'g'}],{'games':[{'game_id':'g','final':{ 'home_points':1}}]},1,fail,lambda:({},{}),dt.datetime.now(dt.timezone.utc))
            self.assertFalse(list(root.glob('outputs/cadence-v2/closeouts/*.json')))

class CloseoutRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.rows=[{'season':2026,'week':1,'game_id':'g'}]
        self.board={'games':[{'game_id':'g','final':{'home_points':20,'away_points':10}}]}
        self.qualify=patch('scripts.closeout_publish.qualified',return_value=False);self.qualify.start();self.addCleanup(self.qualify.stop)

    def publish(self,push,refresh=lambda:({'created':'original'},{})):
        return publish(self.root,self.rows,self.board,1,push,refresh,dt.datetime.now(dt.timezone.utc))

    def test_failed_receipt_push_cannot_satisfy_refit_or_scan(self):
        calls=[]
        def push():
            calls.append(1)
            if len(calls)==2:raise RuntimeError('remote receipt response lost')
            return 'a'*40
        with self.assertRaises(RuntimeError):self.publish(push)
        receipt=next(self.root.glob('outputs/cadence-v2/closeouts/*.json'))
        with self.assertRaises(FileNotFoundError):require_published(self.root,receipt,dt.datetime.now(dt.timezone.utc))
        before=receipt.read_bytes();result=self.publish(push,lambda:self.fail('must resume, not regenerate'))
        self.assertEqual(before,receipt.read_bytes());self.assertEqual(len(calls),3)
        self.assertEqual(require_published(self.root,receipt,dt.datetime.now(dt.timezone.utc)),result)

    def test_snapshot_reused_after_failed_evidence_push(self):
        def fail():raise RuntimeError('first push failed')
        with self.assertRaises(RuntimeError):self.publish(fail)
        path=next(self.root.glob('outputs/cadence-v2/weeks/*/trend.json'));before=path.read_bytes()
        self.publish(lambda:'a'*40,lambda:self.fail('time-sensitive report must not regenerate'))
        self.assertEqual(path.read_bytes(),before)

    def test_crash_between_snapshot_files_resumes_checkpoint(self):
        import scripts.closeout_publish as module
        real=module.write_bytes
        def fail(path,raw,immutable=False):
            if path.name=='trend.json':raise OSError('disk full')
            return real(path,raw,immutable)
        with patch.object(module,'write_bytes',side_effect=fail),self.assertRaises(OSError):self.publish(lambda:'a'*40)
        self.assertTrue(list(self.root.glob('outputs/cadence-v2/weeks/*/checkpoint.json')))
        self.assertFalse(list(self.root.glob('outputs/cadence-v2/closeouts/*.json')))
        result=self.publish(lambda:'a'*40,lambda:self.fail('must resume checkpoint'))
        self.assertEqual(result['state'],'PUBLISHED')

    def test_corrupt_acknowledgment_fails(self):
        from scripts.closeout_publish import _ack_path
        result=self.publish(lambda:'a'*40);receipt=next(self.root.glob('outputs/cadence-v2/closeouts/*.json'))
        p=_ack_path(receipt);v=json.loads(p.read_text());v['receipt_sha256']='bad';p.write_text(json.dumps(v))
        with self.assertRaises(ValueError):require_published(self.root,receipt,dt.datetime.now(dt.timezone.utc))
        with self.assertRaises(ValueError):self.publish(lambda:self.fail('must not republish corrupt receipt'))

    def test_corrupt_checkpoint_cannot_be_regenerated_silently(self):
        def fail():raise RuntimeError('first push failed')
        with self.assertRaises(RuntimeError):self.publish(fail)
        p=next(self.root.glob('outputs/cadence-v2/weeks/*/checkpoint.json'))
        value=json.loads(p.read_text());value['snapshots']['trend.json']={'changed':True};p.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError,'checkpoint hash'):self.publish(lambda:self.fail('must not publish'),lambda:self.fail('must not regenerate'))

    def test_partial_legacy_snapshot_is_not_invented(self):
        folder=self.root/'outputs/cadence-v2/weeks/2026-w1';folder.mkdir(parents=True);(folder/'trend.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'Legacy partial'):self.publish(lambda:self.fail('must not publish'))

    def test_weekly_refit_cannot_bypass_publication_precondition(self):
        from scripts import projection_learning as runtime
        with patch.object(runtime,'initialize'),patch.object(runtime,'current_rows',return_value=self.rows),patch.object(runtime,'due_week',return_value=1),patch.object(runtime,'closeout_for_refit',return_value=False),patch.object(runtime,'weekly_refit',side_effect=AssertionError('refit before closeout')):
            result=runtime.run_weekly();self.assertEqual(result['state'],'WAITING_FOR_PUBLISHED_CLOSEOUT')
