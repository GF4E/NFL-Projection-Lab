import copy,gzip,json,unittest
from pathlib import Path
from engine.elo import Elo
from engine.elo_hfa import SeasonElo
from engine.projection.features import build
from scripts.elo_hfa_deployed_gate import elo_features,read
from scripts.elo_hfa_release import O,ROOT
from scripts.projection_learning import current_rows
from engine.projection_v3.model import fit
class HFAReleaseTests(unittest.TestCase):
 def test_optional_hfa_preserves_legacy(self):
  a=Elo({'A':1505,'B':1505});b=SeasonElo({'A':1505,'B':1505},hfa=55)
  self.assertEqual(a.forecast('A','B',False,0,0)['margin_location'],2.6)
  self.assertEqual(b.forecast('A','B',False,0,0)['margin_location'],2.2)
  self.assertEqual(b.forecast('A','B',True,0,0)['margin_location'],0)
 def test_shipping_features_equal_gated_map(self):
  r=read(json.loads((O/'release-ref.json').read_text()));a=read(r['fit']);v=read(json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text()));m=v['source_manifest'];schedule=read(m['schedule']);stadiums=json.loads((ROOT/'config/stadiums.json').read_text());rows=build(read(m['team_games']),schedule,stadiums,None,m['roster_source_hashes'],a['elo_hfa']);expected=elo_features(schedule,{int(k):v for k,v in a['elo_hfa'].items()})
  for row in rows:
   for k,v in expected[row['game_id'],row['team']].items():self.assertEqual(row['features'][k],v)
 def test_release_parent_training_matches(self):
  r=read(json.loads((O/'release-ref.json').read_text()));a=read(r['parent_fit']);receipt=json.loads((ROOT/'work/projection-v2w/replay-receipt.json').read_text());hist=read(receipt['historical_features']);rows=json.loads(gzip.decompress((O/'parent-week1-features.json.gz').read_bytes()));train=[x for x in hist+rows if (x['season']<2026 or x['week']<=a['through_week']) and x.get('actual_points') is not None and x['features'].get('baseline') is not None]
  f=fit(train,a['groups'],a['selected'][1]);self.assertEqual(len(train),5822)
  for x,y in zip(f['coefficients'],a['fit']['coefficients']):self.assertAlmostEqual(x,y,12)
  self.assertAlmostEqual(f['intercept'],a['fit']['intercept'],12)
if __name__=='__main__':unittest.main()

class HFASeparationTest(unittest.TestCase):
 def test_shipping_adapter_has_no_external_io_or_market_import(self):
  import ast
  tree=ast.parse((ROOT/'engine/elo_hfa.py').read_text());imports=[n.module for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)]+[a.name for n in ast.walk(tree) if isinstance(n,ast.Import) for a in n.names]
  self.assertEqual(set(imports),{'math','engine.elo'})
  from unittest.mock import patch
  with patch('builtins.open',side_effect=AssertionError('Forecast attempted external read')):
   e=SeasonElo({'BUF':1505,'DET':1505},55);p=e.forecast('BUF','DET',False,0,0);e.update('BUF','DET',20,17,p)
