"""Add present-time projections to still-open saved Week 1 picks, zero provider calls."""
import datetime as dt
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.live_picks import overwrite
from engine.week1_projection import project
from engine.pick_store import read_pinned
from engine.pricing import timestamp

def run(root=ROOT):
    root=Path(root);now=dt.datetime.now(dt.timezone.utc)
    config=json.loads((root/'work/model-pick-v1/runtime-config.json').read_text())
    shape=read_pinned(config['distribution']);changed=[]
    for path in (root/'outputs/model-pick-v1/live').glob('*.json'):
        record=json.loads(path.read_text());g=record['game']
        if g['week']!=1 or record['status']!='LIVE' or timestamp(g['cutoff_at'])<=now or record.get('projection'):
            continue
        if (root/'outputs/model-pick-v1/locks'/g['game_id']/'T75-picks.json').exists():continue
        record['projection']=project(record,shape,now.isoformat());overwrite(path,record);changed.append(g['game_id'])
    from engine.board_bridge import publish
    return {'updated':changed,'credits_spent':0,'publication':publish(root,now)}

if __name__=='__main__':print(json.dumps(run(),indent=2))
