import unittest,tempfile,json,hashlib
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from scripts.harvest_scan import closeout_ready
class HarvestScanTests(unittest.TestCase):
 def test_closeout_prerequisite(self):
  now=datetime(2026,10,6,9,tzinfo=ZoneInfo('America/Los_Angeles'))
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);self.assertFalse(closeout_ready(root,now)[0]);p=root/'outputs/cadence-v2/closeouts/2026-10-06.json';p.parent.mkdir(parents=True);artifact=root/'report.json';artifact.write_text('{}')
   r={'state':'PUBLISHED','all_games_graded':True,'published_at':'2026-10-06T08:00:00-07:00','source_commit':'fixture','artifacts':{'report.json':hashlib.sha256(artifact.read_bytes()).hexdigest()}};p.write_text(json.dumps(r));self.assertTrue(closeout_ready(root,now)[0])
   r['published_at']='2026-10-06T10:00:00-07:00';p.write_text(json.dumps(r));self.assertFalse(closeout_ready(root,now)[0])
 def test_not_first_tuesday(self):
  self.assertEqual(closeout_ready(Path('.'),datetime(2026,10,13,9,tzinfo=ZoneInfo('America/Los_Angeles'))),(False,'NOT_FIRST_TUESDAY'))
if __name__=='__main__':unittest.main()
