import hashlib,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class SeriesRegistryTests(unittest.TestCase):
 def test_one_authority_and_unchanged_series(self):
  r=json.loads((ROOT/'work/series-registry/catalog.json').read_text());a=[x for x in r['series'] if x['authoritative']];self.assertEqual(len(a),1);self.assertEqual(a[0]['path'],r['authoritative_control'])
  for x in r['series']:
   self.assertEqual(hashlib.sha256((ROOT/x['path']).read_bytes()).hexdigest(),x['sha256']);self.assertTrue((ROOT/x['path']).parent.joinpath('SERIES.md').exists())
 def test_report_notices_and_closeout(self):
  for p in json.loads((ROOT/'work/series-registry/annotated-reports.json').read_text()):self.assertTrue((ROOT/p).read_text().startswith('SERIES NOTICE:'))
  q=json.loads((ROOT/'work/projection-governance-v2/queue.json').read_text());e=next(e for e in q['experiments'] if e['id']=='E-POST');self.assertEqual(e['state'],'REJECTED_ON_PREMISE');self.assertFalse(e['gate_evaluated'])
