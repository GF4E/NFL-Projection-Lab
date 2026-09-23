"""Bounded, owner-fenced prospective collection inside the existing scheduler."""
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from . import prospective as p, pipeline_release, storage
from engine.forecast_system.calendar import timestamp

CONFIG=p.BASE+'/collector.json'
STATUS=p.BASE+'/collector-status.json'
POLICY={'schema':'prospective-collector-v1','pass_seconds':5,'lock_reserve_seconds':60,
        'maximum_attempts_per_bundle':3,'memory_bytes':4*1024**3}


def configure(root,plan_ref,scorer_root,owner):
    plan=p.plan(root,plan_ref);p.enrolled_at(root,plan_ref)
    fence=json.loads(p.path(root,pipeline_release.OWNER).read_bytes())
    if fence.get('state')!='ACTIVE' or fence.get('owner')!=owner:
        raise ValueError('Collector owner differs')
    source=Path(scorer_root).resolve()
    if p.scorer_code(source)!=plan['reference']['code'] or p.environment()!=plan['reference']['environment']:
        raise ValueError('Qualified frozen scorer required')
    value={'policy':POLICY,'owner':owner,'plan_ref':plan_ref,'scorer_root':str(source)}
    storage.save(p.path(root,CONFIG),value,immutable=True)
    return value


def configuration(root,owner):
    file=p.path(root,CONFIG)
    if not file.exists():return None
    value=json.loads(file.read_bytes())
    if value['policy']!=POLICY or value['owner']!=owner:raise ValueError('Collector configuration differs')
    p.plan(root,value['plan_ref']);p.enrolled_at(root,value['plan_ref'])
    return value


def status(root,value):
    file=p.path(root,STATUS)
    if file.exists():
        old=json.loads(file.read_bytes())
        if {k:v for k,v in old.items() if k!='observed_at'}==value:return old
    body={**value,'observed_at':p.now().isoformat()}
    ref=p.store(root,'collector-history',body)
    storage.save(file,body)
    return {**body,'history_ref':ref}


def check_owner(root,owner,handle):
    if handle is None:raise ValueError('Actual scheduler dispatch descriptor required')
    with pipeline_release.dispatch(root,handle):
        record=json.loads(p.path(root,pipeline_release.OWNER).read_bytes())
        if record.get('state')!='ACTIVE' or record.get('owner')!=owner:raise ValueError('Collector owner is fenced')


def bounded(command,handle):
    """GNU timeout kills the worker process group, including an in-flight scorer."""
    if not sys.platform.startswith('linux'):raise RuntimeError('Qualified Linux supervisor required')
    timeout=shutil.which('timeout');limit=shutil.which('prlimit')
    if not timeout or not limit:raise RuntimeError('Required resource supervisor missing')
    env={'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1',
         'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'}
    return subprocess.run([timeout,'--signal=KILL',str(POLICY['pass_seconds']),limit,
        f'--as={POLICY["memory_bytes"]}:{POLICY["memory_bytes"]}','--',*command],
        pass_fds=(handle.fileno(),),capture_output=True,text=True,env=env,check=False)


def collect(root,owner,handle):
    """Parent retains dispatch ownership until the bounded child has terminated."""
    check_owner(root,owner,handle)
    config=configuration(root,owner)
    if config is None:return {'state':'NOT_ENROLLED','activates_method':False}
    command=[sys.executable,'-B',str(Path(__file__).resolve().parents[2]/'scripts/projection_prospective_collect.py'),
             '--root',str(Path(root).resolve()),'--owner',owner,'--dispatch-fd',str(handle.fileno())]
    child=bounded(command,handle)
    if child.returncode:
        return status(root,{'state':'DEGRADED','reason':'PASS_TIME_LIMIT' if child.returncode in (-9,124,137) else 'WORKER_FAILED',
                            'plan_ref':config['plan_ref'],'activates_method':False})
    value=json.loads(child.stdout)
    if value.get('schema')!=POLICY['schema'] or value.get('plan_ref')!=config['plan_ref']:
        raise ValueError('Collector returned incompatible receipt')
    return status(root,value)


def seal_attempt(folder,value):
    storage.save(folder/'receipt.json',value,immutable=True)
    return value


def collect_one(root,config,card):
    """One bundle operation. Reconcile retained effects before numerical retry."""
    ref=config['plan_ref'];gid=card['game_id'];bundle_hash=card['forecast_bundle_ref']['sha256']
    folder=p.path(root,f'{p.BASE}/collection/{ref["sha256"]}/{gid}/{bundle_hash}')
    pair_file=p.path(root,f'{p.BASE}/pairs/{ref["sha256"]}/{gid}/{bundle_hash}.json')
    attempts=sorted(folder.glob('attempt-*/start.json'))
    latest=attempts[-1].parent if attempts else None
    if latest and (latest/'receipt.json').exists():
        terminal=latest/('recovery.json' if (latest/'recovery.json').exists() else 'receipt.json')
        receipt=json.loads(terminal.read_bytes())
        if receipt['state'] in ('PAIRED','LATE'):
            saved=p.read(root,receipt['pair_ref'])
            ack=json.loads(pair_file.with_suffix('.receipt.json').read_bytes())
            if (saved['plan_ref']!=ref or saved['live_bundle_ref']!=card['forecast_bundle_ref']
                or ack['pair_ref']!=receipt['pair_ref']
                or receipt['state']!=('PAIRED' if ack['state']=='PRELOCK' else 'LATE')):
                raise ValueError('Collector pair acknowledgment differs')
            if receipt['state']=='PAIRED' and not (
                p.enrolled_at(root,ref)<=timestamp(saved['completed_at'])
                <=timestamp(ack['observed_durable_at'])<timestamp(card['cutoff_at'])):
                raise ValueError('Collector pair acknowledgment time is unqualified')
            return receipt
        if receipt['state'] in ('FAILED_CLOSED','EXPIRED'):return receipt
    # A committed pair can survive a killed worker before its acknowledgment.
    if pair_file.exists():
        pair_ref=p.pair(root,ref,card,config['scorer_root'])
        ack=json.loads(pair_file.with_suffix('.receipt.json').read_bytes())
        value={'state':'PAIRED' if ack['state']=='PRELOCK' else 'LATE','pair_ref':pair_ref}
        if latest:
            if (latest/'receipt.json').exists():
                storage.save(latest/'recovery.json',value,immutable=True)
                return value
            return seal_attempt(latest,value)
        raise ValueError('Pair exists without collector attempt evidence')
    if latest and not (latest/'receipt.json').exists():
        seal_attempt(latest,{'state':'INTERRUPTED','reason':'No pair committed before previous worker stopped'})
    at=p.now();cutoff=timestamp(card['cutoff_at'])
    if at>=cutoff:return {'state':'EXPIRED'}
    if at+dt.timedelta(seconds=POLICY['lock_reserve_seconds'])>=cutoff:return {'state':'DEFERRED_LOCK_RESERVE'}
    if len(attempts)>=POLICY['maximum_attempts_per_bundle']:return {'state':'FAILED_CLOSED','reason':'ATTEMPTS_EXHAUSTED'}
    attempt=folder/f'attempt-{len(attempts)+1:04d}'
    snapshot={k:card[k] for k in (*p.bundle.PROTECTED,*p.cutoff_publication.FIELDS,
                                'forecast_bundle_ref','release_ref','status')}
    card_ref=p.store(root,'collector-inputs',snapshot)
    storage.save(attempt/'start.json',{'card_ref':card_ref,'started_at':at.isoformat(),
        'plan_ref':ref,'owner':config['owner'],'attempt':len(attempts)+1},immutable=True)
    try:
        pair_ref=p.pair(root,ref,snapshot,config['scorer_root'])
        ack=json.loads(pair_file.with_suffix('.receipt.json').read_bytes())
        result={'state':'PAIRED' if ack['state']=='PRELOCK' else 'LATE','pair_ref':pair_ref}
    except (ValueError,KeyError,TypeError) as error:
        result={'state':'FAILED_CLOSED','reason':'CONFIGURATION_OR_INTEGRITY','error_type':type(error).__name__}
    except (OSError,subprocess.TimeoutExpired) as error:
        result={'state':'INTERRUPTED','reason':'LOCAL_IO_OR_TIMEOUT','error_type':type(error).__name__}
    return seal_attempt(attempt,result)


def worker(root,owner,handle):
    check_owner(root,owner,handle);config=configuration(root,owner)
    if config is None:raise ValueError('Collector cannot enroll itself')
    definition=p.plan(root,config['plan_ref']);games=[]
    for game in definition['eligible']:
        file=p.path(root,f'outputs/projection-v3/live/{game["game_id"]}.json')
        if file.exists():
            card=json.loads(file.read_bytes())
            if card.get('forecast_role')=='FINAL_ELIGIBLE' and card.get('evidence')=='AS_ISSUED':games.append(card)
    results=[]
    for card in sorted(games,key=lambda c:(c['cutoff_at'],c['game_id'])):
        results.append({'game_id':card['game_id'],'bundle':card['forecast_bundle_ref']['sha256'],
                        **collect_one(root,config,card)})
    failures=[r for r in results if r['state'] in ('FAILED_CLOSED','INTERRUPTED','LATE','EXPIRED')]
    return {'schema':POLICY['schema'],'plan_ref':config['plan_ref'],'state':'DEGRADED' if failures else 'COLLECTED',
            'results':results,'waiting_for_qualified_live':len(definition['eligible'])-len(games),
            'activates_method':False}


def health(root):
    file=p.path(root,CONFIG)
    if not file.exists():return {'state':'NOT_ENROLLED'}
    value=json.loads(file.read_bytes());configuration(root,value['owner'])
    status_file=p.path(root,STATUS)
    if not status_file.exists():return {'state':'UNOBSERVED'}
    result=json.loads(status_file.read_bytes())
    if result.get('plan_ref')!=value['plan_ref']:raise ValueError('Collector status belongs to another plan')
    return {k:result[k] for k in ('state','observed_at','reason') if k in result}
