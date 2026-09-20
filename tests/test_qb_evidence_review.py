import datetime as dt,json,unittest
from pathlib import Path
from scripts.qb_evidence_review import instant,matrix,metrics
ROOT=Path(__file__).resolve().parents[1];O=ROOT/'work/e-qb-change-review-v2'
class EvidenceReview(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.games=json.loads((O/'game-ledger.json').read_text());cls.sides=json.loads((O/'changed-team-ledger.json').read_text())
 def test_membership(self):
  self.assertEqual(len(self.games),2639);self.assertEqual(len({g['game_id'] for g in self.games}),2639);self.assertEqual(sum(g['starter_group']=='CHANGED' for g in self.games),585);self.assertEqual(len(self.sides),660)
 def test_every_accepted_announcement_strictly_prelock(self):
  for z in self.sides:
   a=z['announcement']
   if a:self.assertLess(dt.datetime.fromisoformat(a['latest_publication_bound_utc']),dt.datetime.fromisoformat(z['T75_utc']))
 def test_reconstructed_not_as_issued(self):
  for z in self.sides:
   self.assertIsNone(z['as_issued_engine_qb']);self.assertIn('NOT_ACTUAL_LOCK',z['reconstruction_status']);self.assertIsNone(z['qualified_quality_gap'])
 def test_past_outcome_windows(self):
  for z in self.sides:
   for v in z['reconstructed_quality'].values():
    if v['latest_included_completion_proxy']:self.assertLess(dt.datetime.fromisoformat(v['latest_included_completion_proxy']),dt.datetime.fromisoformat(z['T75_utc']))
 def test_2025_charts_independently_reconciled(self):
  rows=json.loads((O/'independent/2025-chart-review.json').read_text())['rows'];own={(z['game_id'],z['team']):z for z in self.sides if z['season']==2025}
  for r in rows:self.assertEqual(own[r['game_id'],r['team']]['chart']['id'],r['ids'][0])
 def test_dst_schedule_et(self):
  self.assertEqual(instant({'gameday':'2025-09-07','gametime':'13:00'}).hour,17);self.assertEqual(instant({'gameday':'2025-12-07','gametime':'13:00'}).hour,18)
 def test_bias_and_game_pair(self):
  r={'home':20.,'away':15.,'actual_home':24.,'actual_away':14.};self.assertEqual(matrix([r]).tolist(),[[2.5,-1.5,5.,-5.]])
 def test_reordering_invariance(self):
  a=metrics(self.games);b=metrics(list(reversed(self.games)))
  for k in ['team_mae','team_bias','margin_mae','margin_bias']:self.assertAlmostEqual(a[k],b[k],places=10)
if __name__=='__main__':unittest.main()
