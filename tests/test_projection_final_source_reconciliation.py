"""Detect wrong derived scores even when all byte hashes are self-consistent."""
import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from engine.projection.watchdog import reconcile_final_scores, digest
from scripts import projection_watchdog as runner
from test_projection_watchdog import NOW, board

GID='2026_02_A_B'
SCORE={'away_score':14.,'home_score':17.}
SCHEDULE=[{'game_id':GID,'cutoff_at':NOW.isoformat()}]


class FinalReconciliationTests(unittest.TestCase):
    def test_agreement_accepts_integer_and_float_scores(self):
        report=reconcile_final_scores({GID:SCORE},{GID:{'away_score':14,'home_score':17}},SCHEDULE,NOW)
        self.assertEqual(report['matched_games'],1);self.assertEqual(report['findings'],[])

    def test_carry_forward_is_unknown_not_a_wrong_score(self):
        report=reconcile_final_scores({}, {GID:SCORE},SCHEDULE,NOW)
        self.assertEqual(report['carried_without_current_source'],1)
        self.assertEqual(report['conflicting_games'],0)
        self.assertEqual(report['findings'][0]['code'],'FINAL_SOURCE_ROW_UNAVAILABLE')

    def test_source_only_final_is_reported(self):
        report=reconcile_final_scores({GID:SCORE},{},SCHEDULE,NOW)
        self.assertEqual(report['source_games_missing_from_feed'],1)
        self.assertEqual(report['findings'][0]['code'],'FINAL_FEED_ROW_MISSING')

    def test_due_population_limits_alerts_not_source_counts(self):
        source={GID:SCORE,'2010_01_X_Y':SCORE}
        schedule=[{'game_id':GID,'cutoff_at':(NOW+dt.timedelta(seconds=1)).isoformat()}]
        report=reconcile_final_scores(source,{},schedule,NOW)
        self.assertEqual(report['source_games_missing_from_feed'],2)
        self.assertEqual(report['findings'],[])

    def test_boolean_cannot_impersonate_a_score(self):
        report=reconcile_final_scores({GID:{'home_score':1.,'away_score':0.}},
            {GID:{'home_score':True,'away_score':False}},SCHEDULE,NOW)
        self.assertEqual(report['conflicting_games'],1)

    def test_wrong_feed_and_board_cannot_validate_each_other(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);out=root/'outputs/projection-v3';out.mkdir(parents=True)
            work=root/'work/projection-v1';work.mkdir(parents=True)
            b=board();card=b['games'][0];card['status']='FINAL';card['grades']={'recorded':True}
            card['issued_at']=(NOW-dt.timedelta(hours=12)).isoformat()
            card['final']={'home_points':20.,'away_points':14.}
            b['content_sha256']=digest({k:v for k,v in b.items() if k!='content_sha256'})
            (out/'board.json').write_text(json.dumps(b))
            schedule=[{'game_id':GID,'season':'2026','game_type':'REG','gameday':'2026-09-21','gametime':'20:00'}]
            raw=json.dumps(schedule).encode();(work/'schedule.json').write_bytes(raw)
            (work/'source-manifest.json').write_text(json.dumps({'schedule':{'path':'work/projection-v1/schedule.json','sha256':hashlib.sha256(raw).hexdigest()}}))
            raw=b'game_id,away_score,home_score,result,total\n2026_02_A_B,14,17,3,31\n';sha=hashlib.sha256(raw).hexdigest()
            (out/'final-sources').mkdir();(out/'final-sources'/f'{sha}.csv').write_bytes(raw)
            feed={'received_at':NOW.isoformat(),'source_sha256':sha,'games':{GID:{'away_score':14.,'home_score':20.}},'refresh_operation_id':'op'}
            (out/'final-feed.json').write_text(json.dumps(feed));(out/'operations').mkdir()
            operation={'state':'HEALTHY','operation_id':'op','expected_feed_sha256':digest(feed)}
            (out/'operations/final-feed.json').write_text(json.dumps(operation))
            before={str(p):p.read_bytes() for p in root.rglob('*') if p.is_file()}
            result=runner.source_snapshot(root,NOW,NOW)
            self.assertEqual(result['final_commit_receipt'],'VERIFIED')
            self.assertEqual(result['final_source_reconciliation']['conflicting_games'],1)
            codes=[f['code'] for f in result['findings']]
            self.assertIn('FINAL_FEED_VALUE_CONFLICT',codes)
            self.assertIn('FINAL_SOURCE_CONFLICT',codes)
            self.assertEqual(before,{str(p):p.read_bytes() for p in root.rglob('*') if p.is_file()})

    def test_malformed_feed_map_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'score maps'):
            reconcile_final_scores({GID:SCORE},[],SCHEDULE,NOW)
