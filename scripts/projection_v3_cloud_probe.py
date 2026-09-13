"""Owner-locked projection-only deployment verification; no capture/provider worker."""
import datetime as dt,fcntl,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts.cloud_scheduler import OUT,ownership,permitted,synchronize,publish_artifacts
from scripts.projection_publish import sync
from scripts.projection_v3_prepare import prepare
from scripts.projection_v3_publish import run

def hashes():
 return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for version in ['v1','v2','v3'] for kind in ['locks','grades'] for p in (ROOT/f'outputs/projection-{version}'/kind).glob('*.json')}

def main():
 with (OUT/'.cloud-dispatch.lock').open('a+') as handle:
  fcntl.flock(handle,fcntl.LOCK_EX)
  record=ownership()
  if not permitted(record,'digitalocean:599707390'):raise RuntimeError('Not owner')
  synchronize();before=hashes();sync();rows=prepare();board=run(require_synced_entries=True);after=hashes()
  if any(after.get(k)!=v for k,v in before.items()):raise RuntimeError('Frozen record changed')
  result={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'version':board['version'],'games':len(board['games']),'team_rows':len(rows),'original_frozen_files_preserved':len(before),'entry_sync':True,'provider_calls':0,'odds_api_calls':0,'artifact_sha256':hashlib.sha256((ROOT/'outputs/projection-v3/board.json').read_bytes()).hexdigest()};path=ROOT/'work/projection-v3/verification/cloud.json';path.parent.mkdir(exist_ok=True);path.write_text(json.dumps(result,indent=2)+'\n');result['commit']=publish_artifacts();print(json.dumps(result))
if __name__=='__main__':main()
