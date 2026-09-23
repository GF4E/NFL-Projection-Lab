"""Durable local E-CAL execution. Numerical completion never activates a method."""
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import socket
from pathlib import Path
from engine.forecast_system.calendar import timestamp
from engine.projection_experiments import digest
from . import calibration_admission as admission, calibration_evaluate as evaluator, storage

BASE='work/e-cal-lineage/executions'
MAX_ATTEMPTS=admission.EXECUTION['maximum_explicit_attempts']


class WorkerBusy(RuntimeError):pass


def now_utc():return dt.datetime.now(dt.timezone.utc)


def directory(root,key=None):
    root=Path(root).resolve();base=(root/BASE).resolve()
    if not base.is_relative_to(root):raise ValueError('Execution path outside repository')
    if key is None:return base
    if not re.fullmatch('[0-9a-f]{64}',key):raise ValueError('Registration digest required')
    path=(base/key).resolve()
    if not path.is_relative_to(base):raise ValueError('Execution path outside repository')
    return path


def seal(body):return {'body':body,'sha256':digest(body)}


def read_envelope(path):
    value=json.loads(Path(path).read_bytes())
    if set(value)!={'body','sha256'} or digest(value['body'])!=value['sha256']:
        raise ValueError('Execution envelope changed')
    return value['body']


def ref(root,path):
    return {'path':str(path.relative_to(Path(root).resolve())),
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}


def verify_result(value,request):
    r=request['registration'];body={k:v for k,v in value.items() if k!='sha256'}
    if (value.get('sha256')!=digest(body) or value.get('schema')!='calibration-numerics-v1'
            or value.get('registration_sha256')!=r['sha256'] or value.get('input_ref')!=r['inputs']
            or value.get('baseline_hash')!=r['baseline_hash'] or value.get('activates_method') is not False
            or value.get('release_eligibility')!='NOT_ASSESSED'
            or [x['game_id'] for x in value.get('records',[])]!=r['population_game_ids']):
        raise ValueError('Retained numerical result differs from request')
    if not timestamp(r['registered_at'])<=timestamp(value['started_at'])<=timestamp(value['completed_at'])<timestamp(r['deadline_at']):
        raise ValueError('Numerical completion outside registered clock')
    control={g['game_id']:g for g in request['control_rows']}
    for row in value['records']:
        g=control[row['game_id']]
        points={'home_points':g['home'],'away_points':g['away'],'margin':g['home']-g['away'],'total':g['home']+g['away']}
        for arm in ('control','candidate'):
            if any(not admission.finite(row['forecasts'][arm][k]) or abs(row['forecasts'][arm][k]-v)>r['point_tolerance'] for k,v in points.items()):
                raise ValueError('POINT_FORECAST_CHANGED_OUT_OF_SCOPE')
    return value


def read(root,key):
    """Historical read only: no current admission, lock, fitting or network calls."""
    root=Path(root).resolve();folder=directory(root,key)
    request=read_envelope(folder/'request.json')
    r=request['registration']
    if r['sha256']!=key or digest({k:v for k,v in r.items() if k!='sha256'})!=key:
        raise ValueError('Request registration differs')
    attempts=[];uncommitted=[]
    for path in sorted((folder/'attempts').glob('*')):
        if not path.is_dir() or not re.fullmatch('[0-9]{3}',path.name):raise ValueError('Unexpected attempt path')
        if not (path/'start.json').exists():
            if any(not (p.name.startswith('.') and p.name.endswith('.pending')) for p in path.iterdir()):
                raise ValueError('Attempt artifacts exist without durable start')
            uncommitted.append(int(path.name));continue
        start=read_envelope(path/'start.json');number=int(path.name)
        if start['attempt']!=number or start['request_sha256']!=digest(request):raise ValueError('Attempt request differs')
        record={'start':start,'receipt':None,'result':None,'path':str(path.relative_to(root))}
        intent=read_envelope(path/'result-intent.json') if (path/'result-intent.json').exists() else None
        if intent and (intent['attempt']!=number or intent['start_sha256']!=digest(start)):
            raise ValueError('Result intent differs from attempt')
        if (path/'result.json').exists():
            if not intent or ref(root,path/'result.json')['sha256']!=intent['result_file_sha256']:
                raise ValueError('Retained result differs from durable result intent')
            record['result']=verify_result(json.loads((path/'result.json').read_bytes()),request)
            if timestamp(record['result']['started_at'])<timestamp(start['started_at']):raise ValueError('Result predates attempt')
        if (path/'receipt.json').exists():
            receipt=read_envelope(path/'receipt.json')
            if receipt['attempt']!=number or receipt['start_sha256']!=digest(start):raise ValueError('Attempt receipt differs')
            lower=(record['result'] or {}).get('completed_at',start['started_at'])
            if timestamp(receipt['recorded_at'])<timestamp(lower):raise ValueError('Receipt clock predates evidence')
            if receipt['state']=='COMPUTED_NOT_RELEASED':
                value=admission.read(root,receipt['result_ref'])
                if value!=record['result'] or receipt['result_ref']!=ref(root,path/'result.json'):
                    raise ValueError('Committed result differs')
            elif receipt['state'] not in ('FAILED','INTERRUPTED','OUT_OF_SCOPE') or record['result'] is not None:
                raise ValueError('Unexpected attempt disposition')
            record['receipt']=receipt
        attempts.append(record)
    if [a['start']['attempt'] for a in attempts]!=list(range(1,len(attempts)+1)):
        raise ValueError('Noncontiguous attempt history')
    if uncommitted not in ([],[len(attempts)+1]):raise ValueError('Unexpected uncommitted start directories')
    return {'request':request,'attempts':attempts,'key':key,'uncommitted_start':uncommitted,'activates_method':False}


def run(root,registration_ref,*,clock=now_utc,retry=False):
    root=Path(root).resolve();r=admission.read(root,registration_ref)
    key=r.get('sha256','')
    if key!=digest({k:v for k,v in r.items() if k!='sha256'}):raise ValueError('Registration body changed')
    control=admission.read(root,{'path':r['control'],'sha256':r['baseline_hash']})
    control=control['games'] if isinstance(control,dict) else control
    folder=directory(root,key);request={'schema':'calibration-execution-request-v1',
        'registration_ref':registration_ref,'registration':r,'control_rows':control,
        'maximum_explicit_attempts':MAX_ATTEMPTS}
    # Invalid new requests leave no experimental or lock artifacts.
    if not (folder/'request.json').exists():admission.preflight(root,registration_ref,at=clock())
    lockpath=directory(root)/'.worker.lock';storage.write_bytes(lockpath,b'',immutable=True)
    with lockpath.open('r+') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise WorkerBusy('Another local calibration worker owns the lock')
        existing=None
        if (folder/'request.json').exists():
            if read_envelope(folder/'request.json')!=request:raise ValueError('Changed request under registration key')
            existing=read(root,key)
        attempts=(existing or {}).get('attempts',[])
        if attempts:
            previous=attempts[-1];path=root/previous['path'];start=previous['start'];receipt=previous['receipt']
            if receipt is None:
                if previous['result'] is not None:
                    # Same payload completes any ambiguous result-directory sync.
                    storage.save(path/'result.json',previous['result'],immutable=True)
                    receipt={'schema':'calibration-attempt-receipt-v1','attempt':start['attempt'],
                        'start_sha256':digest(start),'state':'COMPUTED_NOT_RELEASED',
                        'result_ref':ref(root,path/'result.json'),'recorded_at':clock().isoformat(),
                        'recovered_after_lost_response':True,'activates_method':False}
                else:
                    receipt={'schema':'calibration-attempt-receipt-v1','attempt':start['attempt'],
                        'start_sha256':digest(start),'state':'INTERRUPTED','recorded_at':clock().isoformat(),
                        'reason':'Exclusive local lock reacquired; no durable numerical result',
                        'activates_method':False}
                if timestamp(receipt['recorded_at'])<timestamp((previous['result'] or {}).get('completed_at',start['started_at'])):
                    raise ValueError('Receipt clock predates evidence')
                storage.save(path/'receipt.json',seal(receipt),immutable=True)
            else:
                if timestamp(receipt['recorded_at'])<timestamp((previous['result'] or {}).get('completed_at',start['started_at'])):
                    raise ValueError('Receipt clock predates evidence')
                storage.save(path/'receipt.json',seal(receipt),immutable=True)
            if receipt['state']=='COMPUTED_NOT_RELEASED' or not retry:return read(root,key)
            if len(attempts)>=MAX_ATTEMPTS:raise ValueError('Explicit attempt limit reached')
        # Fresh admission is required for every new computation, including retry.
        admitted=admission.preflight(root,registration_ref,at=clock())
        storage.save(folder/'request.json',seal(request),immutable=True)
        number=len(attempts)+1;path=folder/'attempts'/f'{number:03d}'
        start={'schema':'calibration-attempt-start-v1','attempt':number,'request_sha256':digest(request),
               'started_at':clock().isoformat(),'pid':os.getpid(),'hostname':socket.gethostname(),
               'prerequisites':admitted['prerequisites'],'activates_method':False}
        storage.save(path/'start.json',seal(start),immutable=True)
        try:
            value=verify_result(evaluator.run(root,registration_ref,clock=clock),request)
            if timestamp(value['started_at'])<timestamp(start['started_at']):raise ValueError('Result predates attempt')
            admission.preflight(root,registration_ref,at=clock())
            raw=(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
            intent={'schema':'calibration-result-intent-v1','attempt':number,'start_sha256':digest(start),
                    'result_file_sha256':hashlib.sha256(raw).hexdigest()}
            storage.save(path/'result-intent.json',seal(intent),immutable=True)
            storage.save(path/'result.json',value,immutable=True)
        except Exception as error:
            if (path/'result.json').exists():
                # Do not turn an uncertain durable result into a false failure.
                raise
            receipt={'schema':'calibration-attempt-receipt-v1','attempt':number,'start_sha256':digest(start),
                'state':'OUT_OF_SCOPE' if 'POINT_FORECAST_CHANGED_OUT_OF_SCOPE' in str(error) else 'FAILED',
                'error_type':type(error).__name__,'reason':str(error)[:300],
                'recorded_at':clock().isoformat(),'activates_method':False}
            storage.save(path/'receipt.json',seal(receipt),immutable=True)
            raise
        receipt={'schema':'calibration-attempt-receipt-v1','attempt':number,'start_sha256':digest(start),
            'state':'COMPUTED_NOT_RELEASED','result_ref':ref(root,path/'result.json'),
            'recorded_at':clock().isoformat(),'recovered_after_lost_response':False,'activates_method':False}
        if timestamp(receipt['recorded_at'])<timestamp(value['completed_at']):raise ValueError('Receipt clock predates evidence')
        storage.save(path/'receipt.json',seal(receipt),immutable=True)
        return read(root,key)
