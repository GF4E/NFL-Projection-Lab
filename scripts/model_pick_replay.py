"""Reproduce the immutable synthetic T75 capture/lock/grade experiment offline."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.model_pick import lock
from engine.pick_store import put, read_pinned, sha
from engine.t75_report import score_files,scorecard

def run():
    base=ROOT/'work/model-pick-v1/synthetic-v1'
    fixture=json.loads((base/'inputs.json').read_text());config=json.loads((ROOT/'work/model-pick-v1/config.json').read_text())
    shape=read_pinned(config['distribution'])
    record=lock(fixture['game'],fixture['event'],fixture['receipt'],shape,config,fixture['freeze_at'])
    record['evidence']='SYNTHETIC_OFFLINE_NOT_A_LIVE_CAPTURE'
    path=base/'T75-picks.json';put(path,record)
    grades=score_files([path],fixture['results'],shape,base/'grades')
    tables=scorecard([record],grades);put(base/'scorecard.json',tables)
    result={'experiment':'model-pick-v1/synthetic-v1','status':record['status'],'picks':len(record['picks']),
            'scored':len(grades),'pick_sha256':sha(path.read_bytes()),'credits_spent':0,'provider_calls':0}
    put(base/'experiment.json',result);return result

if __name__=='__main__':print(json.dumps(run(),indent=2))
