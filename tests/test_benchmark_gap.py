import collections,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'work/e-benchmark-gap'
class BenchmarkGapTests(unittest.TestCase):
 def test_same_games_arithmetic_and_bucket_reconciliation(self):
  rows=json.loads((OUT/'per-game.json').read_text());result=json.loads((OUT/'results.json').read_text());self.assertEqual(len(rows),1170);self.assertEqual(len({r['game_id'] for r in rows}),1170)
  for r in rows:
   for model in ['deployed','nfelo','closing','baseline']:self.assertAlmostEqual(r[model+'_loss'],abs(r['actual_margin']-r[model+'_margin']))
  for dim,buckets in result['buckets'].items():
   self.assertEqual(sum(x['games'] for x in buckets.values()),len(rows))
   self.assertAlmostEqual(sum(x['nfelo_excess_loss'] for x in buckets.values()),result['pooled']['nfelo_excess_loss'])
 def test_audit_sensitivity_and_no_fitting(self):
  a=json.loads((OUT/'audit-reconstruction.json').read_text())
  for m in a['variants'].values():self.assertEqual(m['games'],1177);self.assertAlmostEqual(m['baseline_mae'],10.563,places=3);self.assertAlmostEqual(m['closing_mae'],9.787,places=3)
  for script in ['benchmark_gap.py','benchmark_audit_reconcile.py']:
   text=(ROOT/'scripts'/script).read_text();self.assertNotIn('from engine',text);self.assertNotIn('.fit(',text)
 def test_registration_inputs_still_pinned(self):
  import hashlib
  r=json.loads((OUT/'registration.json').read_text())
  for p,h in r['files'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),h)
