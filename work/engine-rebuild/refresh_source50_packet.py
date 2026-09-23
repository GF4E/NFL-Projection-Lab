"""Bind observed recovery evidence, without asserting review or activation."""
import argparse,copy,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0,str(ROOT))
from engine.projection.storage import save,write_bytes
from engine.projection import release_preflight
p=argparse.ArgumentParser();p.add_argument('phase',choices=['preoperator','complete']);a=p.parse_args()
folder=ROOT/'work/engine-rebuild/release-review'
parent=json.loads((folder/('current-ref.json' if a.phase=='preoperator' else 'source50-preoperator-ref.json')).read_bytes())
value=copy.deepcopy(release_preflight.read(ROOT,parent))
def ref(name):
 data=(ROOT/name).read_bytes();return {'path':name,'sha256':hashlib.sha256(data).hexdigest()}
value['evidence']['restored_consumer']=ref('work/engine-rebuild/source-recovery-50/consumer.json')
value['evidence']['recovery_acceptance']=ref('work/engine-rebuild/source-recovery-50/accepted-journal.json')
release_preflight.recovery(ROOT,value['evidence']['recovery_acceptance'],value['evidence']['restored_consumer'])
old={'INITIAL-SOURCE-RECOVERY.md','INITIAL-OPERATOR-RESULT.md','initial-operator-result.json','initial-operator-host-after.json','initial-recovery-job-verification.json'}
remove={path for path,origin in value['document_origins'].items() if Path(origin).name in old}
value['documents']=[r for r in value['documents'] if r['path'] not in remove]
value['document_origins']={k:v for k,v in value['document_origins'].items() if k not in remove}
names=['SOURCE-RECOVERY-50-PLAN.md','SOURCE-RECOVERY-50.md','PROSPECTIVE-COLLECTOR.md','source-cache-retirement.json',
       'source-recovery-50/source-restored.json','source-recovery-50/source-terminal.json','source-recovery-50/runtime-reverified.json']
if a.phase=='complete':names+=['source-recovery-50/initial-operator.json','source-recovery-50/initial-operator-accepted.json']
for name in names:
    origin='work/engine-rebuild/'+name;data=(ROOT/origin).read_bytes();digest=hashlib.sha256(data).hexdigest()
    superseded={path for path,source in value['document_origins'].items() if source==origin}
    value['documents']=[r for r in value['documents'] if r['path'] not in superseded]
    value['document_origins']={k:v for k,v in value['document_origins'].items() if k not in superseded}
    path='work/engine-rebuild/release-review/documents/'+digest+Path(name).suffix
    write_bytes(ROOT/path,data,immutable=True);r={'path':path,'sha256':digest}
    if r not in value['documents']:value['documents'].append(r)
    value['document_origins'][path]=origin
value['supersedes_packet_ref']=parent
value['recovery_addendum']='Fifty-file source ec239e0c restored independently; issuing code 5fd477b27. Fresh same-host restored-runtime consumer supersedes older source proof. Earlier historical records remain preserved. No model, gate, control authority or reviewer decision changes.'
value['terminal_evidence_correction']='Every new job has actual loaded resource limits and terminal success bound to its invocation. No unloaded defaults used as evidence.'
value['initial_operator_status']='CAPTURED_RESTORED_SOURCE_VERIFIED; live activation remains unverified' if a.phase=='complete' else 'PENDING_ON_THIS_SOURCE; earlier operator evidence is historical'
raw=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode();digest=hashlib.sha256(raw).hexdigest()
result={'path':f'work/engine-rebuild/release-review/packets/{digest}.json','sha256':digest}
write_bytes(ROOT/result['path'],raw,immutable=True)
save(folder/('source50-preoperator-ref.json' if a.phase=='preoperator' else 'current-ref.json'),result)
print(json.dumps(result))
