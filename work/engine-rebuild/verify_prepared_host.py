"""Read installed prepared-state references and scheduled publication on the host."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
capture=json.loads((ROOT/'work/engine-rebuild/prepared-input-capture.json').read_bytes())
expected={path:item['sha256'] for path,item in capture['files'].items()
          if path.startswith(('outputs/projection-v3/locks/','outputs/projection-v3/grades/'))}
code=json.loads((ROOT/'work/engine-rebuild/host-prepared-candidate.json').read_bytes())['candidate_hashes']
program='EXPECTED='+repr(expected)+'\nCODE='+repr(code)+'\n'+r'''
import datetime,hashlib,json,os,subprocess
from pathlib import Path
root=Path.cwd();commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
if not (root/'engine/projection/prepared.py').exists():
 print(json.dumps({'state':'NOT_INSTALLED','host_commit':commit}));raise SystemExit()
from engine.projection import prepared,bundle
from engine.projection.lineage import read_artifact
from engine.projection.scoring_process import score_batch
pointer=prepared.current(root)
if not pointer.get('prepared_manifest_ref'):
 print(json.dumps({'state':'WAITING_FOR_SCHEDULED_PREPARATION','host_commit':commit}));raise SystemExit()
rows,manifest,raw=prepared.load(root);fit=prepared.active_fit(root);assert manifest['fit']==fit
artifact=read_artifact(root,fit);board=json.loads((root/'outputs/projection-v3/board.json').read_bytes())
current_ref=json.loads((root/'outputs/projection-v3/current-release-ref.json').read_bytes())
release=bundle.resolve(root,current_ref,'releases')
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in CODE}
source_matches=hashes==CODE
release_matches=release['code']['files']=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in bundle.CODE_PATHS}
requests=[];cards=[]
for card in board['games']:
 b=bundle.verify_card(root,card)
 if b and card.get('release_ref')==current_ref:
  prepared_body=bundle.resolve(root,b['prepared_manifest_ref'],'input-manifests')
  assert prepared_body.get('prepared_manifest_ref')==manifest['prepared_manifest_ref']
  assert prepared_body==manifest
  requests.append(b['input']);cards.append(card)
assert cards
values=score_batch(artifact,read_artifact(root,artifact['shapes']),requests)
for card in cards:assert values[card['game_id']]=={key:card[key] for key in ('projection','contributions','why')}
assert all(hashlib.sha256((root/path).read_bytes()).hexdigest()==value for path,value in EXPECTED.items())
resources=os.statvfs(root)
print(json.dumps({'state':'VERIFIED' if source_matches and release_matches else 'WAITING_FOR_CURRENT_CODE_PUBLICATION',
 'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_commit':commit,
 'scope':'Read-only installed-code, exact snapshot, active-fit and scheduled publication verification; no refit or provider call',
 'code_matches_tested_source':source_matches,'release_matches_installed_code':release_matches,
 'source_hashes':hashes,'fit_ref':fit,'version':artifact['version'],'release_ref':current_ref,
 'issuing_code_commit':release['code']['commit'],'prepared_manifest_ref':manifest['prepared_manifest_ref'],
 'features_ref':manifest['features_ref'],'prepared_sha256':hashlib.sha256(raw).hexdigest(),
 'legacy_alias_sha256':hashlib.sha256((root/prepared.LEGACY).read_bytes()).hexdigest(),
 'prepared_rows':len(rows),'prepared_bytes':len(raw),'board_cards':len(board['games']),
 'exact_forecast_reproductions':len(cards),'frozen_record_hashes_unchanged':len(EXPECTED),
 'board_content_sha256':board['content_sha256'],'board_published_at':board['published_at'],
 'free_root_bytes':resources.f_bavail*resources.f_frsize,'provider_credits':0}))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
result=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10',
                       'root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=60)
if result.returncode:raise RuntimeError('Installed preparation verification failed: '+result.stderr[-1500:])
value=json.loads(result.stdout)
if value['state']=='VERIFIED':
    previous=json.loads((ROOT/'work/engine-rebuild/prepared-parity.json').read_bytes())
    value['matches_pre_migration_prepared_bytes']=value['prepared_sha256']==previous['prepared_features_ref']['sha256']
    (ROOT/'work/engine-rebuild/host-prepared-verification.json').write_text(json.dumps(value,indent=2)+'\n')
print(json.dumps({k:v for k,v in value.items() if k!='source_hashes'},indent=2))
