"""Verify scheduled bundle publication on the actual host, without publication writes."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[2]
capture=json.loads((ROOT/'work/engine-rebuild/bundle-input-capture.json').read_text())
original={name:item['sha256'] for name,item in capture['files'].items() if name.startswith(('outputs/projection-v3/locks/','outputs/projection-v3/grades/'))}
program='ORIGINAL='+repr(original)+'\n'+'''
import datetime,hashlib,json,os,subprocess
from pathlib import Path
from engine.projection.bundle import CODE_PATHS,resolve,verify_card
from engine.projection.lineage import read_artifact
from engine.projection.scoring_process import score_batch
root=Path.cwd();ref=json.loads((root/'work/in-season-learning-v1/active-fit-ref.json').read_text())
a=read_artifact(root,ref);path=root/'outputs/projection-v3/board.json';board=json.loads(path.read_bytes())
body={k:v for k,v in board.items() if k!='content_sha256'}
assert hashlib.sha256(json.dumps(body,sort_keys=True,separators=(',',':')).encode()).hexdigest()==board['content_sha256']
groups={};verified=[];releases={}
for card in board['games']:
 b=verify_card(root,card)
 if b:
  sha=card['release_ref']['sha256'];release=resolve(root,card['release_ref'],'releases');releases[sha]=release
  groups.setdefault(sha,[]).append((card,b))
for sha,pairs in groups.items():
 release=releases[sha];artifact=read_artifact(root,release['fit_artifact_ref']);shapes=read_artifact(root,release['calibration_ref'])
 values=score_batch(artifact,shapes,[b['input'] for _,b in pairs])
 for card,b in pairs:
  result=values[card['game_id']];assert result=={key:card[key] for key in result}
  verified.append(card['game_id'])
original_unchanged={name:hashlib.sha256((root/name).read_bytes()).hexdigest()==sha for name,sha in ORIGINAL.items()}
assert all(original_unchanged.values())
current_ref=json.loads((root/'outputs/projection-v3/current-release-ref.json').read_text()) if (root/'outputs/projection-v3/current-release-ref.json').exists() else None
current=resolve(root,current_ref,'releases') if current_ref else None
source={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in CODE_PATHS}
code_matches=current['code']['files']==source if current else False
stat=os.statvfs(root)
result={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only host verification; reproduces actual scheduled bundle-backed cards; no source refresh, fit, publication or public-site claim',
'host_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),
'active_fit_ref':ref,'version':a['version'],'current_release_ref':current_ref,
'issuing_code_commit':current['code']['commit'] if current else None,'source_hashes':source,
'code_matches_manifest':code_matches,'release_fit_matches_active':current['fit_artifact_ref']==ref if current else False,
'board_cards':len(board['games']),'board_content_sha256':board['content_sha256'],'board_published_at':board['published_at'],
'bundle_cards':len(verified),'exact_reproductions':len(verified),'history_hashes_unchanged':len(original_unchanged),
'free_bytes':stat.f_bavail*stat.f_frsize,'free_inodes':stat.f_favail,
'provider_credits':0}
print(json.dumps(result))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=60)
if r.returncode:raise RuntimeError('Host bundle verification failed: '+r.stderr[-1600:])
value=json.loads(r.stdout);(ROOT/'work/engine-rebuild/host-bundle-verification.json').write_text(json.dumps(value,indent=2)+'\n')
print(json.dumps({k:v for k,v in value.items() if k!='source_hashes'},indent=2))
