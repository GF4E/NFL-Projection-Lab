"""Read-only host capture into ignored local storage; no provider requests."""
import base64
import argparse
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[2]
SSH=['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88']
root=subprocess.check_output(SSH+['systemctl show nfl-engine-capture.service --value -p WorkingDirectory'],text=True).strip()
if root!=str(ROOT):raise ValueError('Unexpected host checkout')
remote=r'''
import base64,gzip,hashlib,json,subprocess
from pathlib import Path
root=Path.cwd()
paths=['work/projection-v3/current-features.json.gz','work/projection-v3/current-ref.json',
       'work/in-season-learning-v1/active-fit-ref.json','work/engine-rebuild/legacy-calibration-map.json',
       'config/game_card_team_colors.json','outputs/projection-v3/board.json','outputs/projection-v3/final-feed.json',
       'outputs/projection-v2/board.json','outputs/projection-v1/forecast.json',
       'work/in-season-learning-v1/trajectory-history.json']
prepared=json.loads((root/'work/projection-v3/current-ref.json').read_bytes())
for key in ('features_ref','prepared_manifest_ref'):
 if prepared.get(key):paths.append(prepared[key]['path'])
for kind in ('bundles','releases','input-manifests'):
 paths += [str(p.relative_to(root)) for p in (root/'outputs/projection-v3'/kind).glob('*') if p.is_file()]
ref=json.loads((root/paths[2]).read_bytes());a=json.loads((root/ref['path']).read_bytes())
paths += [ref['path'],a['shapes']['path']]
registry=json.loads((root/'work/engine-rebuild/legacy-calibration-map.json').read_bytes())
for refs in registry['versions'].values():
 for r in refs:
  paths.append(r['path']);paths.append(json.loads((root/r['path']).read_bytes())['shapes']['path'])
for folder in ('locks','grades','live'):
 paths += [str(p.relative_to(root)) for p in (root/'outputs/projection-v3'/folder).glob('*.json')]
files={p:(root/p).read_bytes() for p in sorted(set(paths)) if (root/p).exists()}
manifest=json.loads(files['work/projection-v3/current-ref.json'])
feature_path=manifest.get('features_ref',{}).get('path','work/projection-v3/current-features.json.gz')
assert hashlib.sha256(files[feature_path]).hexdigest()==manifest['sha256']
assert manifest['fit']==ref
assert files['work/projection-v3/current-ref.json']==(root/'work/projection-v3/current-ref.json').read_bytes()
assert files[ref['path']]==(root/ref['path']).read_bytes()
assert files['outputs/projection-v3/board.json']==(root/'outputs/projection-v3/board.json').read_bytes()
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
print(base64.b64encode(gzip.compress(json.dumps({'commit':commit,'files':{p:base64.b64encode(b).decode() for p,b in files.items()}}).encode())).decode())
'''
command='cd '+shlex.quote(root)+' && runuser -u nflengine -- /opt/nfl-runtime/env/bin/python -B -'
encoded=subprocess.check_output(SSH+[command],input=remote.encode(),timeout=60)
data=json.loads(gzip.decompress(base64.b64decode(encoded)))
when=dt.datetime.now(dt.timezone.utc).isoformat();folder=ROOT/'.cloud-private/rebuild-captured-inputs'/when.replace(':','')
manifest={}
for name,encoded in data['files'].items():
 path=folder/name
 if not path.resolve().is_relative_to(folder.resolve()):raise ValueError('Capture path escapes folder')
 raw=base64.b64decode(encoded);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
 manifest[name]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
result={'captured_at':when,'host_commit':data['commit'],'folder':str(folder.relative_to(ROOT)),
        'scope':'Read-only host files; human entries and credentials excluded. Captured snapshot, not public rendering.',
        'files':manifest,'total_bytes':sum(x['bytes'] for x in manifest.values()),'provider_credits':0}
parser=argparse.ArgumentParser();parser.add_argument('--receipt',default='work/engine-rebuild/bundle-input-capture.json');args=parser.parse_args()
(ROOT/args.receipt).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='files'}))
