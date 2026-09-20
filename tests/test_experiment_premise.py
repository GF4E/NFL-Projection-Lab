import json,unittest
from pathlib import Path
from scripts.experiment_premise import verify
ROOT=Path(__file__).resolve().parents[1]
class PremiseTests(unittest.TestCase):
 def test_authority_and_date_required(self):
  catalog=json.loads((ROOT/'work/series-registry/catalog.json').read_text());entry=next(x for x in catalog['series'] if x['authoritative']);r={'control':entry['path'],'authoritative':True,'generated_at':entry['date_added']};self.assertIn('authoritative deployed lineage: yes',verify(r))
  for bad in [dict(r,control='work/projection-v3/baseline.json'),dict(r,generated_at=''),dict(r,authoritative=False)]:
   with self.assertRaises(ValueError):verify(bad)
 def test_superseded_control_cannot_start_new_fit(self):
  r=json.loads((ROOT/'work/e-qb-change/registration.json').read_text())
  with self.assertRaises(ValueError):verify(r)
 def test_unknown_not_incorrect_and_population(self):
  r=json.loads((ROOT/'work/e-qb-change/results.json').read_text());self.assertEqual(sum(v['games'] for v in r['groups'].values()),2639);self.assertIsNone(r['lock_identity_counts_changed']['incorrect']);self.assertEqual(r['candidates_registered'],0)
