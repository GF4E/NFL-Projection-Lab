"""Verify the named immutable board-redesign-v1 publication offline."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=json.loads((ROOT/'work/board-redesign-v1/replay.json').read_text())
p=ROOT/m['board']['path'];raw=p.read_bytes()
assert hashlib.sha256(raw).hexdigest()==m['board']['sha256']
b=json.loads(raw);g=next(g for g in b['games'] if g['game_id']==m['expected_game'])
assert g['status']=='FINAL' and g['final_score']=={'home':7,'away':27}
assert {k:v['grade'] for k,v in g['verdicts'].items()}==m['grades']
assert next(g for g in b['games'] if g['game_id']=='2026_01_NE_SEA')['lock_status']=='MISSED'
print(json.dumps({'experiment':m['name'],'status':'PASS','credits_spent':0}))
