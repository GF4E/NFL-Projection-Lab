"""Grades frozen lean DTOs and results; no imports of capture/lock modules."""
import csv,datetime,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.suit_feedback import run
from engine.pick_store import read_pinned,put
from engine.live_picks import overwrite

def main():
 out=ROOT/'outputs/model-pick-v1';refs=[json.loads(p.read_text()) for p in (out/'result-refreshes').glob('*.json')]+[json.loads(p.read_text()) for p in (out/'daily').glob('*/results-ref.json')];ref=max(refs,key=lambda r:r.get('received_at',''),default=None);results={}
 if ref:
  raw=Path(ref['path']).read_bytes()
  if hashlib.sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('Finals source hash mismatch')
  for r in csv.DictReader(raw.decode().splitlines()):
   if r.get('home_score') and r.get('away_score'):results[r['game_id']]={**r,'source_sha256':ref['sha256']}
 cfg=json.loads((ROOT/'work/model-pick-v1/runtime-config.json').read_text());rows,cal=run(ROOT,results,read_pinned(cfg['distribution']))
 from zoneinfo import ZoneInfo
 today=datetime.datetime.now(ZoneInfo('America/Los_Angeles'));week=today.strftime('%G-W%V');dest=ROOT/'outputs/iron-man-v1/confidence-maps'/f'{week}.json'
 if today.weekday()==0 and cal and not dest.exists():
  put(dest,{'version':'confidence-map-'+week,'generated_at':today.isoformat(),'calibration':cal,'minimum_graded':50,'prior_weight':20})
 from engine.suit_slips import run as match_slips
 match_slips(ROOT)
 return {'rows':len(rows),'calibration_levels':len(cal)}
if __name__=='__main__':print(json.dumps(main()))
