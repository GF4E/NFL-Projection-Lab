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
parent=json.loads((folder/('current-ref.json' if a.phase=='preoperator' else 'qualified-preoperator-ref.json')).read_bytes())
value=copy.deepcopy(release_preflight.read(ROOT,parent))
def ref(name):
 data=(ROOT/name).read_bytes();return {'path':name,'sha256':hashlib.sha256(data).hexdigest()}
value['evidence']['restored_consumer']=ref('work/engine-rebuild/source-recovery-qualified/consumer.json')
value['evidence']['recovery_acceptance']=ref('work/engine-rebuild/source-recovery-qualified/accepted-journal.json')
release_preflight.recovery(ROOT,value['evidence']['recovery_acceptance'],value['evidence']['restored_consumer'])
old={'SOURCE-DIAGNOSTICS-RECOVERY-PLAN.md','SOURCE-DIAGNOSTICS-RECOVERY.md','SOURCE-RECOVERY-50-PLAN.md','SOURCE-RECOVERY-50.md','initial-operator.json','initial-operator-accepted.json','source-restored.json','source-terminal.json','runtime-reverified.json','INITIAL-SOURCE-RECOVERY.md','INITIAL-OPERATOR-RESULT.md','initial-operator-result.json','initial-operator-host-after.json','initial-recovery-job-verification.json'}
remove={path for path,origin in value['document_origins'].items() if Path(origin).name in old}
value['documents']=[r for r in value['documents'] if r['path'] not in remove]
value['document_origins']={k:v for k,v in value['document_origins'].items() if k not in remove}
names=['SOURCE-QUALIFIED-RECOVERY-PLAN.md','SOURCE-QUALIFIED-RECOVERY.md','DIAGNOSTIC-QUALIFICATION.md','source-recovery-qualified/cache-retirement.json',
       'source-recovery-qualified/source-restored.json','source-recovery-qualified/source-terminal.json','source-recovery-qualified/runtime-reverified.json']
if a.phase=='complete':names+=['source-recovery-qualified/initial-operator.json','source-recovery-qualified/initial-operator-accepted.json']
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
value['recovery_addendum']='Source e14390e56 restored independently; issuing code e2959f43d and qualified first-grade diagnostics verified. Fresh same-host restored-runtime consumer supersedes older source proof. Earlier historical records remain preserved. No model, gate, control authority or reviewer decision changes.'
value['terminal_evidence_correction']='Every new job has actual loaded resource limits and terminal success bound to its invocation. No unloaded defaults used as evidence.'
value['initial_operator_status']='CAPTURED_RESTORED_SOURCE_VERIFIED; live activation remains unverified' if a.phase=='complete' else 'PENDING_ON_THIS_SOURCE; earlier operator evidence is historical'
raw=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode();digest=hashlib.sha256(raw).hexdigest()
result={'path':f'work/engine-rebuild/release-review/packets/{digest}.json','sha256':digest}
write_bytes(ROOT/result['path'],raw,immutable=True)
save(folder/('qualified-preoperator-ref.json' if a.phase=='preoperator' else 'current-ref.json'),result)
print(json.dumps(result))
