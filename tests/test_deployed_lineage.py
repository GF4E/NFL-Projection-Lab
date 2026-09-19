import datetime as dt
import hashlib,json,subprocess,unittest
from pathlib import Path
from zoneinfo import ZoneInfo
from engine.projection_v3.model import fit,predict
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/p).read_text())
class DeployedLineageTests(unittest.TestCase):
 def test_population_hash_and_full_precision_loss(self):
  receipt=load('work/projection-v2w/replay-receipt.json');ref=receipt['oof'];raw=(ROOT/ref['path']).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),ref['sha256']);rows=json.loads(raw)
  base=json.loads(next((ROOT/'work/projection-v3').glob('baseline-oof-bb7a7f0a*.json')).read_text());self.assertEqual(len(rows),2639);self.assertEqual({r['game_id'] for r in rows},{r['game_id'] for r in base})
  for r in rows:self.assertAlmostEqual(r['loss'][0],(abs(r['home']-r['actual_home'])+abs(r['away']-r['actual_away']))/2,places=12)
 def test_source_matches_direct_host_commit(self):
  r=load('work/projection-v2w/host-verification-2026-09-19.json')
  for f,h in r['source_sha256'].items():self.assertEqual(hashlib.sha256(subprocess.check_output(['git','show',r['commit']+':'+f],cwd=ROOT)).hexdigest(),h)
 def test_training_order_and_held_out_season(self):
  hist=load(load('work/in-season-learning-v1/historical-ref.json')['path']);train=[r for r in hist if r['season']<2016 and r['actual_points'] is not None and r['features']['baseline'] is not None]
  a=fit(train,['calibration','elo'],10);b=fit(list(reversed(train)),['elo','calibration'],10);self.assertEqual(a,b)
  receipt=load('work/projection-v2w/replay-receipt.json');pred={r['game_id']:r for r in load(receipt['oof']['path'])}
  for r in receipt['lineage']:
   season=pred[r['game_id']]['season'];self.assertLessEqual(r['last_training_season'],season)
   if r['through_week']==0:self.assertLess(r['last_training_season'],season)
   else:self.assertLess(r['through_week'],pred[r['game_id']]['week'])
 def test_no_training_result_before_available(self):
  receipt=load('work/projection-v2w/replay-receipt.json');ref=load('work/projection-v1/fit-ref.json');m=load(ref['path'])['source_manifest'];schedule=load(m['schedule']['path']);games=[g for g in schedule if g['game_type']=='REG'];by={g['game_id']:g for g in games}
  for r in receipt['lineage']:
   g=by[r['game_id']];issuance=dt.datetime.fromisoformat(r['issuance_at'])
   for prior in games:
    if int(prior['season'])==int(g['season']) and int(prior['week'])<=r['through_week']:
     available=dt.datetime.fromisoformat(prior['gameday']+'T'+prior['gametime']).replace(tzinfo=ZoneInfo('America/New_York'))+dt.timedelta(hours=4)
     self.assertLess(available,issuance)
