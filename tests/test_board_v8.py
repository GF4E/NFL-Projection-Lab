import ast,copy,json,tempfile,unittest
from pathlib import Path
from scripts.board_v8_market_publish import complete,run
class BoardV8(unittest.TestCase):
 def offers(self,book='betmgm'):
  return [dict(book=book,market=m,side=s,line=l) for m,s,l in [('spreads','Home',-3.5),('spreads','Away',3.5),('totals','Over',44.5),('totals','Under',44.5)]]
 def test_priority_and_missing_pairs(self):
  self.assertEqual(complete(self.offers()+self.offers('williamhill_us'),'Home','Away')['book'],'Caesars')
  self.assertEqual(complete(self.offers()+self.offers('williamhill_us')[:2],'Home','Away')['book'],'BetMGM')
  self.assertIsNone(complete(self.offers()[:3],'Home','Away'))
 def test_export_is_pinned_display_only_and_rejects_postcutoff(self):
  with tempfile.TemporaryDirectory() as d:
   r=Path(d);folder=r/'outputs/iron-man-v1/markets';folder.mkdir(parents=True)
   p=folder/'game.json';p.write_text(json.dumps(dict(game=dict(game_id='g',home_team='Home',away_team='Away',cutoff_at='2026-09-01T17:00:00Z'),captured_at='2026-09-01T16:00:00Z',offers=self.offers())))
   before=p.read_bytes();v=run(r);self.assertEqual(v['games']['g']['home_handicap'],-3.5);self.assertEqual(p.read_bytes(),before);self.assertTrue((r/'outputs/board-v8-market'/f"{v['content_sha256']}.json").exists());self.assertEqual(v,run(r))
   x=json.loads(p.read_text());x['captured_at']=x['game']['cutoff_at'];p.write_text(json.dumps(x));self.assertEqual(run(r)['games'],{})
 def test_projection_packages_cannot_import_market_display_or_provider(self):
  for folder in Path('engine').glob('projection*'):
   if not folder.is_dir():continue
   for p in folder.rglob('*.py'):
    tree=ast.parse(p.read_text());imports=[]
    banned={'spread_line','total_line','consensus','market','odds','price','spread','odds_api','home_handicap'}
    for n in ast.walk(tree):
     if isinstance(n,ast.Constant) and isinstance(n.value,str):self.assertNotIn(n.value,banned,str(p))
     if isinstance(n,ast.Attribute):self.assertNotIn(n.attr,banned,str(p))
     if isinstance(n,ast.Import):imports.extend(a.name for a in n.names)
     if isinstance(n,ast.ImportFrom):imports.append(n.module or '')
    for name in imports:
     self.assertFalse(any(x in name for x in ('board_v8_market','suit','live_picks','odds','pricing','consensus')),f'{p}: {name}')
 def test_display_export_has_no_network_or_fit(self):
  tree=ast.parse(Path('scripts/board_v8_market_publish.py').read_text())
  imports=[n.module or '' for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)]+[a.name for n in ast.walk(tree) if isinstance(n,ast.Import) for a in n.names]
  self.assertFalse(any(any(v in x for v in ('requests','urllib','projection','train','subprocess')) for x in imports))
