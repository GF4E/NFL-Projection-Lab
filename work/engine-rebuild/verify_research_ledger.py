"""Independent standard-library/Git recomputation of the declared import scope."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess

root=Path(__file__).resolve().parents[2]
folder=root/'work/engine-rebuild/research-ledger'
sha=lambda b:hashlib.sha256(b).hexdigest()
raw=lambda v:(json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
ref=json.loads((folder/'import-ref.json').read_bytes());data=(root/ref['path']).read_bytes()
assert sha(data)==ref['sha256'];manifest=json.loads(data)
expected={(r['path'],r['sha256']) for r in manifest['documents']};found=set();snapshot_bytes=0
for path in sorted((root/'work/projection-research-ledger-v1/events').glob('*.json')):
 v=json.loads(path.read_bytes());b=v['body'];r=b['request']
 assert sha(raw(b))==v['sha256'] and path.stem==sha(r['key'].encode())
 assert r['kind']=='DOCUMENT_IMPORTED' and r['context']['source_commit']==manifest['source_commit']
 assert r['context']['original_predeclaration']=='NOT_ESTABLISHED_BY_IMPORT'
 assert r['context']['past_human_viewing']=='UNKNOWN' and b['activates_method'] is False
 assert dt.datetime.fromisoformat(b['recorded_at']).utcoffset() is not None
 for source,snapshot in zip(r['evidence'],b['snapshots'],strict=True):
  original=subprocess.check_output(['git','-C',str(root),'show',manifest['source_commit']+':'+source['path']])
  retained=(root/snapshot['path']).read_bytes()
  assert retained==original and sha(retained)==source['sha256']==snapshot['sha256']
  found.add((source['path'],source['sha256']));snapshot_bytes+=len(retained)
assert found==expected
result={'status':'PASS','source_commit':manifest['source_commit'],'import_manifest_sha256':ref['sha256'],
 'documents_verified':len(found),'snapshot_bytes_verified':snapshot_bytes,
 'scope':'Declared import only, not exhaustive historical trials or past human views','independent_implementation':'stdlib and Git; no research ledger imports',
 'activates_method':False}
print(json.dumps(result,sort_keys=True,indent=2))
