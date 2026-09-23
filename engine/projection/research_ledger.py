"""Append-only trial/exposure evidence; never fits, gates, approves or releases."""
import datetime as dt
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from . import storage

BASE='work/projection-research-ledger-v1'
KINDS={'DOCUMENT_IMPORTED','CONFIGURATION_RETAINED','ATTEMPT_STARTED','ATTEMPT_RECEIPT',
       'NUMERICAL_RESULT_RETAINED','REPORT_GENERATED','EVALUATION_VIEWED','CORRECTION_RETAINED'}


def raw(value):return (json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def sha(data):return hashlib.sha256(data).hexdigest()
def now():return dt.datetime.now(dt.timezone.utc)


def path(root,name):
    p=PurePosixPath(name);root=Path(root).resolve()
    if p.is_absolute() or '..' in p.parts or str(p)!=name:raise ValueError('Unsafe ledger evidence path')
    result=root/name
    if result.is_symlink() or not result.resolve().is_relative_to(root):raise ValueError('Evidence escapes repository')
    return result


def reference(root,name):
    return {'path':name,'sha256':sha(path(root,name).read_bytes())}


def request(key,kind,experiment,evidence,context):
    if not isinstance(key,str) or not 1<=len(key)<=240:raise ValueError('Explicit bounded operation key required')
    if kind not in KINDS or not isinstance(experiment,str) or not experiment:raise ValueError('Named event kind/experiment required')
    if context is not None and not isinstance(context,dict):raise ValueError('Context must be an object')
    refs=[]
    for r in evidence:
        if set(r)!={'path','sha256'} or not re.fullmatch('[0-9a-f]{64}',r['sha256']):raise ValueError('Exact source reference required')
        name=PurePosixPath(r['path'])
        if (name.is_absolute() or '..' in name.parts or str(name)!=r['path']
                or name.parts[0] not in ('work','outputs')):raise ValueError('Research evidence must be a safe work/output path')
        refs.append(dict(r))
    refs=sorted(refs,key=lambda r:(r['path'],r['sha256']))
    if not refs or len({r['path'] for r in refs})!=len(refs):raise ValueError('Unique evidence paths required')
    value={'key':key,'kind':kind,'experiment':experiment,'evidence':refs,'context':context or {}}
    raw(value)
    return value


def read_event(root,name):
    value=json.loads(path(root,name).read_bytes())
    if set(value)!={'body','sha256'} or sha(raw(value['body']))!=value['sha256']:raise ValueError('Ledger envelope changed')
    b=value['body'];r=b['request']
    if b['schema']!='research-trial-event-v1' or r!=request(**r):raise ValueError('Ledger event schema differs')
    expected=f'{BASE}/events/{sha(r["key"].encode())}.json'
    if name!=expected or b['activates_method'] is not False:raise ValueError('Event identity differs')
    if dt.datetime.fromisoformat(b['recorded_at']).utcoffset() is None:raise ValueError('Observation clock lacks timezone')
    if len(b['snapshots'])!=len(r['evidence']):raise ValueError('Evidence snapshot count differs')
    for source,snapshot in zip(r['evidence'],b['snapshots']):
        if snapshot!={'path':f'{BASE}/evidence/{source["sha256"]}.bin','sha256':source['sha256']}:
            raise ValueError('Snapshot binding differs')
        if sha(path(root,snapshot['path']).read_bytes())!=snapshot['sha256']:raise ValueError('Snapshot changed')
    return value


def record(root,*,key,kind,experiment,evidence,context=None):
    req=request(key,kind,experiment,evidence,context)
    name=f'{BASE}/events/{sha(key.encode())}.json';target=path(root,name)
    if target.exists():
        existing=read_event(root,name)
        if existing['body']['request']!=req:raise ValueError('Changed payload under ledger operation key')
        storage.save(target,existing,immutable=True)
        return reference(root,name)
    snapshots=[]
    for r in req['evidence']:
        data=path(root,r['path']).read_bytes()
        if sha(data)!=r['sha256']:raise ValueError('Source evidence hash differs')
        snapshot={'path':f'{BASE}/evidence/{r["sha256"]}.bin','sha256':r['sha256']}
        storage.write_bytes(path(root,snapshot['path']),data,immutable=True);snapshots.append(snapshot)
    stamp=now()
    if stamp.utcoffset() is None:raise ValueError('Observation clock lacks timezone')
    body={'schema':'research-trial-event-v1','request':req,'recorded_at':stamp.isoformat(),
          'history_claim':'Observation only; source dates do not prove predeclaration or past human viewing',
          'snapshots':snapshots,'activates_method':False}
    value={'body':body,'sha256':sha(raw(body))}
    try:storage.save(target,value,immutable=True)
    except ValueError:
        # Another same-key writer may have won with an earlier observation clock.
        if not target.exists():raise
        existing=read_event(root,name)
        if existing['body']['request']!=req:raise
        storage.save(target,existing,immutable=True)
    return reference(root,name)


def inventory(root):
    folder=path(root,BASE+'/events');events=[];pending=[]
    for p in sorted(folder.glob('*')):
        if p.name.startswith('.') and p.name.endswith('.pending'):pending.append(p.name);continue
        if not re.fullmatch(r'[0-9a-f]{64}\.json',p.name):raise ValueError('Unexpected ledger member')
        events.append(read_event(root,str(p.relative_to(Path(root).resolve()))))
    events.sort(key=lambda v:(v['body']['recorded_at'],v['sha256']))
    return {'schema':'research-ledger-inventory-v1','events':events,'uncommitted_staging':pending,
            'past_unlogged_views':'UNKNOWN','exhaustive_historical_trial_count':False,'activates_method':False}


def sync_calibration(root,key,saved):
    """Index all native durable attempts, including failed or unsealed attempts.

    Native execution records remain authoritative. This mirror does not infer
    failure from a missing receipt and cannot start, retry or recover a worker.
    """
    from . import calibration_execute as execution
    root=Path(root).resolve();folder=execution.directory(root,key);refs=[]
    context={'registration_sha256':key,'evidence_class':'RETAINED_EXECUTION_RECORD',
             'independent_confirmation':False}
    for name,kind in [('request.json','CONFIGURATION_RETAINED')]:
        refs.append(record(root,key=f'{key}/{name}',kind=kind,experiment='E-CAL-LINEAGE',
             evidence=[reference(root,str((folder/name).relative_to(root)))],context=context))
    for attempt in saved['attempts']:
        for name,kind,present in [('start.json','ATTEMPT_STARTED',True),
              ('receipt.json','ATTEMPT_RECEIPT',attempt['receipt'] is not None),
              ('result.json','NUMERICAL_RESULT_RETAINED',attempt['result'] is not None)]:
            if present:
                source=str(Path(attempt['path'])/name)
                refs.append(record(root,key=f'{key}/{attempt["start"]["attempt"]}/{name}',kind=kind,
                    experiment='E-CAL-LINEAGE',evidence=[reference(root,source)],context=context))
    return refs


def run_calibration(root,registration_ref,*,retry=False):
    """Keep native attempts authoritative and index success/failure before return."""
    from . import calibration_execute as execution, calibration_admission as admission
    registration=admission.read(root,registration_ref);key=registration['sha256']
    try:
        saved=execution.run(root,registration_ref,retry=retry)
    except Exception:
        if (execution.directory(root,key)/'request.json').exists():
            sync_calibration(root,key,execution.read(root,key))
        raise
    sync_calibration(root,key,saved)
    return saved
