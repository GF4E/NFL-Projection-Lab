import datetime as dt,gzip,hashlib,json,unittest
from pathlib import Path
from scripts.elo_qb_starter_reproduce import select_pregame,kickoff
ROOT=Path(__file__).resolve().parents[1];O=ROOT/'work/e-elo-qb-hfa-v1'
class StarterRule(unittest.TestCase):
 def test_previous_leader_beats_chart(self):self.assertEqual(select_pregame([[{'id':'A','attempts':30},{'id':'B','attempts':5}]],3,{'B':1,'A':2},set()),('A','PREVIOUS_GAME_ATTEMPTS'))
 def test_injury_override_excludes_all_out_or_doubtful(self):self.assertEqual(select_pregame([[{'id':'A','attempts':30}]],3,{'A':1,'B':2,'C':3},{'A','B'}),('C','INJURY_OVERRIDE_CHART'))
 def test_ties_use_prior_two_not_future(self):self.assertEqual(select_pregame([[{'id':'B','attempts':20}],[{'id':'A','attempts':10},{'id':'B','attempts':10}]],4,{'A':1,'B':2},set())[0],'B')
 def test_chart_tiebreak_flag(self):self.assertEqual(select_pregame([[{'id':'A','attempts':10},{'id':'B','attempts':10}]],4,{'A':2,'B':1},set()),('B','CHART_TIEBREAK'))
 def test_week1_ignores_previous_season(self):self.assertEqual(select_pregame([[{'id':'A','attempts':30}]],1,{'B':1,'A':2},set()),('B','WEEK1_CHART'))
 def test_ambiguous_chart_is_unknown(self):self.assertIsNone(select_pregame([],1,{'A':1,'B':1},set())[0])
 def test_dst(self):self.assertEqual(kickoff({'gameday':'2025-11-09','gametime':'13:00'}).hour,18)
 def test_source_compression_exact_bytes(self):
  for r in json.loads((O/'source-receipts.json').read_text()):
   if r.get('compressed_path'):self.assertEqual(hashlib.sha256(gzip.decompress((ROOT/r['compressed_path']).read_bytes())).hexdigest(),r['sha256'])
 def test_no_2026_or_playoffs_in_gate(self):
  data=json.loads((O/'hfa-deployed-oof.json').read_text());control=json.loads((ROOT/json.loads((O/'E-ELO-HFA.json').read_text())['control']).read_text());ids={r['game_id'] for r in control}
  for values in data.values():self.assertEqual({r['game_id'] for r in values},ids)
 def test_unchanged_control_exact(self):
  g=json.loads((O/'hfa-deployed-gate.json').read_text());self.assertEqual(g['control_max_abs_prediction_difference'],0);self.assertEqual(g['control_max_abs_feature_difference'],0)
 def test_hfa_parameters_strictly_prior(self):
  for r in json.loads((O/'hfa-deployed-gate.json').read_text())['parameters']:self.assertLess(r['last_training_season'],r['season'])
 def test_table_sources_strictly_prior_and_flags(self):
  ref=json.loads((O/'starter-reproduction.json').read_text())['table'];rows=json.loads((ROOT/ref['path']).read_text())
  for r in rows:
   cutoff=dt.datetime.fromisoformat(r['T75_utc'])
   if r['source_previous_completion']:self.assertLess(dt.datetime.fromisoformat(r['source_previous_completion']),cutoff)
   for injury in r['injury_evidence']:self.assertLess(dt.datetime.fromisoformat(injury['at']),cutoff)
   if 'CHART' in r['reason']:self.assertTrue(r['UNTIMESTAMPED'])
if __name__=='__main__':unittest.main()
