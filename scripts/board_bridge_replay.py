"""Offline replay of immutable board-bridge-v1/synthetic-v2 (zero provider calls)."""
import datetime as dt
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine.board_bridge import project
from engine.pick_store import encode,sha
BASE=ROOT/'work/board-bridge-v1/synthetic-v2'
if __name__=='__main__':
    manifest=json.loads((BASE/'manifest.json').read_text())
    raw=(BASE/'input.json').read_bytes()
    assert sha(raw)==manifest['input_sha256']
    data=json.loads(raw);data['now']=dt.datetime.fromisoformat(data['now'])
    result=project(**data)
    assert sha(encode(result))==manifest['output_sha256']
    assert encode(result)==(BASE/'expected.json').read_bytes()
    print(json.dumps({'experiment':'board-bridge-v1/synthetic-v2','status':'PASS','games':len(result['games']),'output_sha256':manifest['output_sha256'],'credits_spent':0}))
