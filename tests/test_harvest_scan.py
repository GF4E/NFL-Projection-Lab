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
 def test_new_local_receipt_requires_remote_acknowledgment(self):
  now=datetime(2026,10,6,9,tzinfo=ZoneInfo('America/Los_Angeles'))
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'outputs/cadence-v2/closeouts/2026-10-06.json';p.parent.mkdir(parents=True);artifact=root/'report.json';artifact.write_text('{}')
   r={'schema':'closeout-publication-v2','state':'PUBLISHED','all_games_graded':True,'published_at':'2026-10-06T08:00:00-07:00','source_commit':'a'*40,'artifacts':{'report.json':hashlib.sha256(artifact.read_bytes()).hexdigest()}};p.write_text(json.dumps(r))
   self.assertFalse(closeout_ready(root,now)[0])
   ack=p.parent/'acknowledgments'/p.name;ack.parent.mkdir();ack.write_text(json.dumps({'receipt_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'verified_remote_commit':'b'*40,'confirmed_at':'2026-10-06T08:01:00-07:00'}))
   self.assertTrue(closeout_ready(root,now)[0])
if __name__=='__main__':unittest.main()
