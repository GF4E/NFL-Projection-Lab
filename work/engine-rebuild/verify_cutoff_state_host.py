"""Verify deployed collection parity; numerical state remains inactive."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
paths=['engine/projection/observations.py','scripts/projection_v3_prepare.py','engine/projection/bundle.py','engine/projection/cutoff_features.py','engine/forecast_system/cadence.py']
code={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}
capture=json.loads((ROOT/'work/engine-rebuild/prepared-input-capture.json').read_bytes())
frozen={p:item['sha256'] for p,item in capture['files'].items() if p.startswith(('outputs/projection-v3/locks/','outputs/projection-v3/grades/'))}
state_hash=hashlib.sha256((ROOT/'engine/projection/cutoff_state.py').read_bytes()).hexdigest()
program='EXPECTED='+repr(code)+'\nFROZEN='+repr(frozen)+'\nSTATE_HASH='+repr(state_hash)+'\n'+r'''
import datetime,hashlib,json,os,subprocess
from pathlib import Path
root=Path.cwd();commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
if any(not (root/p).exists() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=digest for p,digest in EXPECTED.items()):
 print(json.dumps({'state':'WAITING_FOR_SOURCE','host_commit':commit}));raise SystemExit()
assert hashlib.sha256((root/'engine/projection/cutoff_state.py').read_bytes()).hexdigest()==STATE_HASH
assert not (root/'work/projection-cutoff-state-v1/current-ref.json').exists(),'Unexpected numerical activation'
from engine.projection import observations,prepared,bundle
from engine.projection.lineage import read_artifact
from engine.projection.scoring_process import score_batch
rows,manifest,data=prepared.load(root)
if not manifest.get('observation_snapshot_ref'):
 print(json.dumps({'state':'WAITING_FOR_SCHEDULED_COLLECTION','host_commit':commit}));raise SystemExit()
ref=manifest['observation_snapshot_ref'];snapshot,records=observations.load(root,ref)
# Every batch's exact sanitized sources must still reproduce its stored body.
source_cache={}
for record in records.values():
 signature=json.dumps(record['sources'],sort_keys=True)
 if signature not in source_cache:
  sources=record['sources']
  games=observations.read_source(root,sources['schedule'],'schedule');stats=observations.read_source(root,sources['team_games'],'team-games')
  source_cache[signature]=observations.material(games,stats,datetime.datetime.fromisoformat(record['collected_at']))[0]
 gid=record['game']['game_id'];original=source_cache[signature][gid]
 assert original['input_sha256']==record['input_sha256']
 assert original['game']==record['game'] and original['statistics']==record['statistics']
fit=prepared.active_fit(root);artifact=read_artifact(root,fit);assert manifest['fit']==fit
release_ref=json.loads((root/'outputs/projection-v3/current-release-ref.json').read_bytes())
release=bundle.resolve(root,release_ref,'releases')
source_matches=all(release['code']['files'].get(p)==digest for p,digest in EXPECTED.items())
board=json.loads((root/'outputs/projection-v3/board.json').read_bytes());cards=[];requests=[]
for card in board['games']:
 b=bundle.verify_card(root,card)
 if b and card.get('release_ref')==release_ref:
  body=bundle.resolve(root,b['prepared_manifest_ref'],'input-manifests')
  if body.get('observation_snapshot_ref')!=ref:continue
  cards.append(card);requests.append(b['input'])
scored=score_batch(artifact,read_artifact(root,artifact['shapes']),requests) if requests else {}
for card in cards:assert scored[card['game_id']]=={k:card[k] for k in ('projection','contributions','why')}
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==digest for p,digest in FROZEN.items())
stat=os.statvfs(root)
print(json.dumps({'state':'VERIFIED' if source_matches and cards else 'WAITING_FOR_MATCHING_PUBLICATION','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_commit':commit,'source_hashes':EXPECTED,'fit_ref':fit,'version':artifact['version'],'release_ref':release_ref,'issuing_code_commit':release['code']['commit'],'observation_snapshot_ref':ref,'collected_games':len(records),'unknown':snapshot['unknown'],'collected_at':sorted({r['collected_at'] for r in records.values()}),'prepared_rows':len(rows),'prepared_bytes':len(data),'prepared_sha256':hashlib.sha256(data).hexdigest(),'exact_source_body_reproductions':len(records),'frozen_records_unchanged':len(FROZEN),'exact_forecast_reproductions':len(cards),'release_binds_collector_code':source_matches,'inactive_state_code_sha256':STATE_HASH,'numerical_state_active':False,'free_root_bytes':stat.f_bavail*stat.f_frsize,'provider_credits':0,'scope':'Installed source and scheduled receipt/prepared/bundle linkage; no state-model activation, refit or public-browser equality claim'}))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=90)
if r.returncode:raise RuntimeError('Host receipt verification failed: '+r.stderr[-1500:])
v=json.loads(r.stdout)
if v['state']=='VERIFIED':(ROOT/'work/engine-rebuild/host-cutoff-state-verification.json').write_text(json.dumps(v,indent=2)+'\n')
print(json.dumps({k:x for k,x in v.items() if k!='source_hashes'},indent=2))
