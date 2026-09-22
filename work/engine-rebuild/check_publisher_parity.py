"""Production-equivalent captured inputs; intercept every publisher write."""
import datetime as dt
import hashlib
import copy
import gzip
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from scripts import projection_v3_publish as current
from scripts import projection_publish, board_v7_publish
from engine.projection.lineage import calibration_for
from engine.projection.model import hash_value

BASE='9c8a88e061b5b3d319b539473209559881e2011d'
source=subprocess.check_output(['git','show',BASE+':scripts/projection_v3_publish.py'],cwd=ROOT).decode()
prior=types.ModuleType('frozen_publisher');prior.__file__=str(ROOT/'scripts/projection_v3_publish.py')
exec(compile(source,prior.__file__,'exec'),prior.__dict__)
now=dt.datetime.now(dt.timezone.utc)
inputs={}
for pattern in ('outputs/projection-v3/locks/*.json','outputs/projection-v3/grades/*.json','outputs/projection-v3/live/*.json'):
 for p in ROOT.glob(pattern):inputs[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()

def run(module):
    writes={}
    def capture(path,value,immutable=False):writes[str(Path(path).relative_to(module.ROOT))]=value
    with patch.object(module,'save',side_effect=capture),patch.object(projection_publish,'save',side_effect=capture),patch.object(board_v7_publish,'run',return_value=None):
        board=module.run(now=now)
    return board,writes

old,oldwrites=run(prior);new,newwrites=run(current)
# These are the only permitted parity differences: explicit new lineage plus the
# publication times/hashes that change when a current card gains that metadata.
IGNORED={'fit_artifact_ref','calibration_ref','calibration_lineage','issued_at','published_at','content_sha256'}
def normalize(value):
 if isinstance(value,dict):return {k:normalize(v) for k,v in value.items() if k not in IGNORED}
 if isinstance(value,list):return [normalize(v) for v in value]
 return value
assert normalize(old)==normalize(new),'Numerical/card-content mismatch'
assert oldwrites.keys()==newwrites.keys(),'Different publication population'
assert all(normalize(oldwrites[k])==normalize(newwrites[k]) for k in oldwrites),'Written artifact mismatch'
assert all(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==sha for p,sha in inputs.items()),'Frozen inputs changed'
resolutions={}
for p in ROOT.glob('outputs/projection-v3/live/*.json'):
 card=json.loads(p.read_bytes())
 if card.get('projection'):
  _,proof=calibration_for(card,ROOT)
  resolutions[proof['status']]=resolutions.get(proof['status'],0)+1
result={'checked_at':now.isoformat(),'baseline_code_commit':BASE,'new_publisher_sha256':hashlib.sha256((ROOT/'scripts/projection_v3_publish.py').read_bytes()).hexdigest(),'scope':'Captured current repository inputs, all writes intercepted; not a deployed publication','cards':len(new['games']),'same_written_paths':len(newwrites),'all_non_lineage_card_fields_identical':True,'excluded_metadata_fields':sorted(IGNORED),'source_records_checked_unchanged':len(inputs),'source_records_manifest_sha256':hash_value(inputs),'legacy_resolution_counts':resolutions,'exact_reference_cards':sum(bool(g.get('fit_artifact_ref')) for g in new['games'])}
# Current rows are already locked/final. Exercise new issuance in a separately
# labeled simulated pre-lock fixture, never claim these are historical forecasts.
from scripts.projection_learning import active_artifact_with_ref
from engine.forecast_system.calendar import schedule_kickoff
ref,artifact=active_artifact_with_ref()
rows=json.loads(gzip.decompress((ROOT/'work/projection-v3/current-features.json.gz').read_bytes()))
now=min(schedule_kickoff(r['game']['gameday'],r['game']['gametime']) for r in rows)-dt.timedelta(minutes=80)
for row in rows:
 row['actual_points']=None
 for key in ('away_score','home_score'):row['game'][key]=None
with tempfile.TemporaryDirectory(prefix='projection-publisher-parity-') as folder:
 fixture=Path(folder);work=fixture/'work/projection-v3';work.mkdir(parents=True)
 (work/'current-features.json.gz').write_bytes(gzip.compress(json.dumps(rows).encode(),mtime=0))
 (work/'current-ref.json').write_text(json.dumps({'elo_hfa':artifact.get('elo_hfa')}))
 (fixture/'config').mkdir();(fixture/'config/game_card_team_colors.json').write_bytes((ROOT/'config/game_card_team_colors.json').read_bytes())
 with patch.multiple(prior,ROOT=fixture,WORK=work,OUT=fixture/'outputs/projection-v3'):
  fresh_old,ow=run(prior)
 with patch.multiple(current,ROOT=fixture,WORK=work,OUT=fixture/'outputs/projection-v3'):
  fresh_new,nw=run(current)
 assert len(fresh_new['games'])==32
 assert all(g['status']=='UPCOMING' and g['fit_artifact_ref']==ref and g['calibration_ref']==artifact['shapes'] for g in fresh_new['games'])
 assert normalize(fresh_old)==normalize(fresh_new)
 assert ow.keys()==nw.keys() and all(normalize(ow[k])==normalize(nw[k]) for k in ow)
 result['fresh_issuance_fixture']={'scope':'Synthetic pre-lock time with captured feature values, labels removed; not an as-issued replay','cards':len(fresh_new['games']),'numerical_card_parity':True,'all_exact_references_bound':True,'intercepted_paths':len(nw)}
(ROOT/'work/engine-rebuild/publisher-lineage-parity.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
