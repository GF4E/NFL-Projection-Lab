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
