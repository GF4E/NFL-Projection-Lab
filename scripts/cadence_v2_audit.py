"""Full-history calendar audit only; does not claim numerical forecast replay."""
import gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.forecast_system import cadence
from engine.forecast_system.calendar import plan as old_plan
OUT=ROOT/'work/cadence-v2'
def run():
 p=ROOT/'work/projection-governance-v2/e1-calendar-corrected/calendar-games.json';games=json.loads(p.read_text());new=cadence.plan(games);old=old_plan(games);count=cadence.audit(games,new)
 old_by={g['game_id']:set(b['incorporated']) for b in old for g in b['forecasts']};new_by={g['game_id']:set(b['incorporated']) for b in new for g in b['forecasts']}
 result={'status':'CALENDAR_PASS_NUMERICAL_REPLAY_PENDING','source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'all_forecasts_audited':count,'gate_period_forecasts':sum(2016<=g['season']<=2025 for g in games),'duplicates':0,'early_assimilations':0,'by_season':{},'definition':'Directly changed available-result sets, not numerical changed forecasts. Full state replay and host installation await Tier 3 decisions.'}
 for s in range(2016,2026):
  population=[g for g in games if g['season']==s];changed=[g['game_id'] for g in population if old_by[g['game_id']]!=new_by[g['game_id']]]
  assert all(old_by[g['game_id']]<=new_by[g['game_id']] for g in population)
  result['by_season'][str(s)]={'games':len(population),'direct_dependency_changes':len(changed),'game_ids':changed}
 lineage=[{'cutoff':b['cutoff'],'incorporated_this_cutoff':[g['game_id'] for g in b['observations']],'forecast_game_ids':[g['game_id'] for g in b['forecasts']]} for b in new]
 (OUT/'calendar-lineage.json.gz').write_bytes(gzip.compress(json.dumps(lineage,sort_keys=True).encode(),mtime=0));(OUT/'calendar-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({**result,'by_season':{s:{k:v for k,v in r.items() if k!='game_ids'} for s,r in result['by_season'].items()}},indent=2))
if __name__=='__main__':run()
