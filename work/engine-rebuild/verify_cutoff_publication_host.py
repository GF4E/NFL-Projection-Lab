"""Read-only source/legacy-publication follow-through after the candidate commit."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--candidate',default='work/engine-rebuild/host-cutoff-publisher-qualified-canary.json')
parser.add_argument('--output',default='work/engine-rebuild/host-cutoff-publication-followthrough.json')
args=parser.parse_args()
candidate=json.loads((ROOT/args.candidate).read_bytes())
consumer={'consumer_code':candidate['consumer_code']}
capture=json.loads((ROOT/'work/engine-rebuild/prepared-input-capture.json').read_bytes())
frozen={p:item['sha256'] for p,item in capture['files'].items()
        if p.startswith(('outputs/projection-v3/locks/','outputs/projection-v3/grades/'))}
program='CODE='+repr({**candidate['candidate_code'],**consumer['consumer_code']})+'\nFROZEN='+repr(frozen)+'\nFIT='+repr(candidate['fit_ref'])+'\n'+r'''
import datetime,hashlib,json,os,subprocess
from pathlib import Path
root=Path.cwd();commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
actual={p:hashlib.sha256((root/p).read_bytes()).hexdigest() if (root/p).exists() else None for p in CODE}
from engine.projection import prepared,bundle
from engine.projection.lineage import read_artifact
from engine.projection.scoring_process import score_batch
fit=prepared.active_fit(root);artifact=read_artifact(root,fit)
rows,manifest,raw=prepared.load(root)
assert manifest['fit']==fit==FIT,'Active/prepared fit changed; reconcile before claiming parity'
board=json.loads((root/'outputs/projection-v3/board.json').read_bytes())
current=json.loads((root/'outputs/projection-v3/current-release-ref.json').read_bytes())
release=bundle.resolve(root,current,'releases');cards=[];requests=[]
for card in board['games']:
 b=bundle.verify_card(root,card)
 if b and card.get('release_ref')==current:
  cards.append(card);requests.append(b['input'])
assert cards,'No current release cards'
values=score_batch(artifact,read_artifact(root,artifact['shapes']),requests)
for card in cards:assert values[card['game_id']]=={k:card[k] for k in ('projection','contributions','why')}
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==s for p,s in FROZEN.items())
assert not manifest.get('cutoff_mode'),'Unexpected cutoff activation'
fs=os.statvfs(root)
print(json.dumps({'status':'VERIFIED_SOURCE_ARRIVAL' if actual==CODE else 'WAITING_FOR_SOURCE',
 'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_commit':commit,
 'source_matches_final_candidate':actual==CODE,'source_differences':[p for p in CODE if actual[p]!=CODE[p]],
 'source_hashes':actual,'active_fit_ref':fit,'version':artifact['version'],
 'prepared_manifest_ref':manifest['prepared_manifest_ref'],'cutoff_mode':manifest.get('cutoff_mode'),
 'cutoff_activation':False,'issuing_code_commit':release['code']['commit'],'release_ref':current,
 'release_matches_installed_code':release['code']['files']=={p:actual[p] for p in bundle.CODE_PATHS},
 'exact_current_forecast_reproductions':len(cards),'frozen_records_preserved':len(FROZEN),
 'board_published_at':board['published_at'],'board_content_sha256':board['content_sha256'],
 'free_root_bytes':fs.f_bavail*fs.f_frsize,'provider_requests':0,'new_spending':0,
 'limitation':'Source arrival and unchanged legacy numerical publication; not activation, public-site verification or a full operational cycle.'}))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
result=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10',
                       'root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=60)
if result.returncode:raise RuntimeError('Cutoff publication follow-through failed: '+result.stderr[-2000:])
body=json.loads(result.stdout)
if body['status']=='VERIFIED_SOURCE_ARRIVAL':
 (ROOT/args.output).write_text(json.dumps(body,indent=2)+'\n')
print(json.dumps({k:v for k,v in body.items() if k!='source_hashes'},indent=2))
