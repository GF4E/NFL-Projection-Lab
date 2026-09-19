import json,hashlib,unittest
from scripts.e_scoring_evidence import annual_bias,ROOT,OUT
class ScoringEvidenceTests(unittest.TestCase):
 def test_pairing_and_sign(self):
  rows=[{'season':2016,'game_id':'g','home':False,'actual':31,'point':25},{'season':2016,'game_id':'g','home':True,'actual':41,'point':28}]
  self.assertEqual(annual_bias(rows),annual_bias(rows[::-1]));self.assertEqual(annual_bias(rows)[0]['signed_total_bias'],19)
  with self.assertRaises(ValueError):annual_bias(rows[:1])
 def test_registration_and_queue(self):
  p=OUT/'registration.json';digest=hashlib.sha256(p.read_bytes()).hexdigest();self.assertEqual(digest,(OUT/'registration.sha256').read_text().split()[0]);r=json.loads(p.read_text())
  for f,h in r['file_hashes'].items():self.assertEqual(hashlib.sha256((ROOT/f).read_bytes()).hexdigest(),h,f)
  q=json.loads((ROOT/'work/projection-governance-v2/queue.json').read_text());self.assertEqual(q['next_experiment'],'E-SCORE');ids=[x['id'] for x in q['experiments']];self.assertLess(ids.index('E-SCORE'),ids.index('E2'))
 def test_after_action_and_coverage(self):
  a=json.loads((OUT/'DET-BUF-after-action.json').read_text());self.assertEqual(a['teams']['DET']['inside'],{'50':True,'80':True});self.assertEqual(a['teams']['BUF']['inside'],{'50':False,'80':True});self.assertAlmostEqual(sum(x['points'] for x in a['buffalo_contributions']),a['teams']['BUF']['projection']);self.assertEqual(hashlib.sha256((ROOT/a['lock_path']).read_bytes()).hexdigest(),a['lock_sha256'])
 def test_full_control_population(self):
  d=json.loads((OUT/'control-evidence.json').read_text());self.assertEqual(sum(x['games'] for x in d['annual']),2639);self.assertEqual([x['season'] for x in d['annual']],list(range(2016,2026)));self.assertIsNone(d['comparative_candidate_results'])
if __name__=='__main__':unittest.main()
