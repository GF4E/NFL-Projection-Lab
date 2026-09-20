"""Cross-source QB definition checks; descriptive sensitivity, no population replacement."""
import collections,csv,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
O=ROOT/'work/e-qb-change-review-v2'
def run():
 reg=json.loads((ROOT/'work/e-qb-change/registration.json').read_text());sp=next(p for p in reg['files'] if 'schedules-' in p);s={g['game_id']:g for g in csv.DictReader((ROOT/sp).open())}
 ref=json.loads((ROOT/'work/projection-v3/personnel-ref.json').read_text());p=json.loads((ROOT/ref['path']).read_text());pg={g['game_id']:g for g in p['games']};ledger=json.loads((O/'game-ledger.json').read_text());m=[]
 for g in ledger:
  for side in ['home','away']:
   sg=s[g['game_id']];t=sg[side+'_team'];other=pg.get(g['game_id'],{}).get('teams',{}).get({'LA':'LAR','LV':'OAK','WAS':'WSH'}.get(t,t),{})
   if other.get('first_qb') and other['first_qb']!=sg[side+'_qb_id']:
    m.append({'game_id':g['game_id'],'season':g['season'],'team':t,'schedule_qb':sg[side+'_qb_id'],'schedule_qb_name':sg[side+'_qb_name'],'pbp_first_dropback_qb':other['first_qb'],'pbp_most_dropbacks_qb':other.get('qb'),'interpretation':'DISAGREEMENT_REQUIRES_GAMEBOOK_REVIEW_NOT_AUTOMATIC_ERROR'})
 lock=[]
 for f in (ROOT/'outputs').rglob('*.json'):
  if 'locks' not in f.parts:continue
  try:x=json.loads(f.read_text())
  except Exception:continue
  lock.append({'path':str(f.relative_to(ROOT)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'game_id':x.get('game_id',f.stem),'top_keys':list(x)[:30] if isinstance(x,dict) else [],'historical_2016_2025_id':any(f.stem.startswith(str(y)+'_') for y in range(2016,2026))})
 out={'mismatches':m,'mismatch_team_sides_by_season':dict(collections.Counter(str(x['season']) for x in m)),'lock_inventory':lock,'historical_named_locks':sum(x['historical_2016_2025_id'] for x in lock),'qualification':'First dropback is not literal first snap. This screen identifies disagreements for source review, does not silently change original585 membership.'}
 (O/'source-cross-checks.json').write_text(json.dumps(out,indent=2)+'\n');print({k:v for k,v in out.items() if k not in ['mismatches','lock_inventory']})
if __name__=='__main__':run()
