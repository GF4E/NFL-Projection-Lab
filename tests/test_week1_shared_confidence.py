import copy,json,tempfile,unittest,datetime as dt
from pathlib import Path
from engine.shared_confidence import score,publish,beliefs
ROOT=Path(__file__).resolve().parents[1];CFG=json.loads((ROOT/'config/confidence_map.json').read_text())
def rows(n):return [dict(confidence=3,confidence_probability=.58,number_probability=.6,outcome='WIN' if i%2 else 'LOSS',conflict=True) for i in range(n)]
class SharedConfidenceTests(unittest.TestCase):
 def test_one_map(self):self.assertNotIn('people',CFG);self.assertEqual(CFG['provisional'],{'1':.52,'2':.55,'3':.58,'4':.62,'5':.66})
 def test_49_hidden_50_visible(self):
  a=score(rows(49),CFG);self.assertFalse(a['visible']);self.assertNotIn('brier_confidence',a);self.assertNotIn('posterior',a['levels'][2]);b=score(rows(50),CFG);self.assertTrue(b['visible']);self.assertAlmostEqual(b['levels'][2]['posterior'],(20*.58+25)/70);self.assertAlmostEqual(b['brier_confidence'],(.58**2+.42**2)/2);self.assertEqual(b['conflicts'],50)
 def test_missing_records_do_not_count(self):self.assertEqual(score(rows(49)+[dict(rows(1)[0],outcome='NOT_RECORDED')],CFG)['graded'],49)
 def test_push_excluded_brier(self):
  a=score(rows(50),CFG);b=score(rows(50)+[dict(rows(1)[0],outcome='PUSH')],CFG);self.assertEqual(a['brier_number'],b['brier_number']);self.assertEqual(b['graded'],51)
 def test_frozen_probabilities(self):
  a=score(rows(50),CFG);new=copy.deepcopy(CFG);new['provisional']['3']=.9;b=score(rows(50),new);self.assertEqual(a['brier_confidence'],b['brier_confidence'])

 def test_weekly_map_create_only_and_frozen_sizing_hidden(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'config').mkdir();(root/'config/confidence_map.json').write_text(json.dumps(CFG))
   with patch('engine.shared_confidence.load_rows',return_value=rows(50)):
    publish(root,dt.datetime.fromisoformat('2026-09-14T16:00:00+00:00'))
   p=next((root/'outputs/game-card-v3/confidence-maps').glob('*.json'));raw=p.read_bytes()
   with patch('engine.shared_confidence.load_rows',return_value=rows(60)):
    publish(root,dt.datetime.fromisoformat('2026-09-15T16:00:00+00:00'))
   self.assertEqual(p.read_bytes(),raw)
   with patch('engine.shared_confidence.load_rows',return_value=rows(60)):
    publish(root,dt.datetime.fromisoformat('2026-09-21T16:00:00+00:00'))
   self.assertEqual(len(list((root/'outputs/game-card-v3/confidence-maps').glob('*.json'))),2)
