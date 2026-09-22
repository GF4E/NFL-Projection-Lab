"""Owner-fenced caller's bounded inactive state job; no provider or issuance I/O."""
import datetime as dt
import json
from pathlib import Path

from . import cutoff_state as state, observations as obs
from .storage import save
from engine.forecast_system.calendar import timestamp
from engine.forecast_system.cadence import next_cutoff

CONFIG=state.BASE+'/worker-config.json'
POLICY={'schema':'cutoff-shadow-worker-v1','mode':'NUMERICAL_SHADOW',
        'operation_seconds':600,'max_attempts':3,'cutoff_policy':'Fri/Mon/Tue 06:00 America/Los_Angeles'}


def now():return dt.datetime.now(dt.timezone.utc)


def configure(root,owner,fit_ref):
    root=Path(root)
    if (root/CONFIG).exists():
        configured=configuration(root,owner)
        if configured['fit_ref']!=fit_ref:raise ValueError('Configured method reference differs')
        return configured
    if not owner or state.current(root):raise ValueError('Worker requires owner and uninitialized state')
    at=timestamp(now());ref=obs.current(root)
    selected,_,transaction=state.snapshot_before(root,ref,at+dt.timedelta(microseconds=1))
    if selected!=ref or timestamp(transaction['collected_at'])>at:raise ValueError('Observation clock is in the future')
    body={'policy':POLICY,'owner':owner,'created_at':at.isoformat(),'first_cutoff':next_cutoff(at).isoformat(),
          'fit_ref':fit_ref,'method':state.method(root,fit_ref),'bootstrap_observation_ref':ref}
    save(root/CONFIG,{'body':body,'sha256':state.sha(body)},immutable=True)
    return body


def configuration(root,owner):
    value=json.loads((Path(root)/CONFIG).read_bytes());body=value['body']
    if state.sha(body)!=value['sha256']:raise ValueError('Worker configuration hash mismatch')
    if body['owner']!=owner or body['policy']!=POLICY:raise ValueError('Worker owner/policy differs')
    if body['method']!=state.method(root,body['fit_ref']):raise ValueError('Worker method migration requires qualification')
    if next_cutoff(body['created_at'])!=timestamp(body['first_cutoff']):raise ValueError('Invalid first cutoff')
    return body


def operation_path(root,cutoff):
    return Path(root)/state.BASE/'operations'/(cutoff.strftime('%Y%m%dT%H%M%SZ')+'.json')


def persist(root,path,body):
    envelope={'body':body,'sha256':state.sha(body)}
    save(Path(root)/state.BASE/'operation-history'/(envelope['sha256']+'.json'),envelope,immutable=True)
    save(path,envelope)


def read_operation(path):
    if not path.exists():return None
    envelope=json.loads(path.read_bytes());body=envelope['body']
    if state.sha(body)!=envelope['sha256']:raise ValueError('Worker operation hash mismatch')
    return body


def finish(root,path,operation,ref,at):
    _,body=state.restore(root,ref)
    if body['cutoff_at']!=operation['cutoff_at'] or body['fit_ref']!=operation['fit_ref']:
        raise ValueError('Committed state differs from operation')
    result={**operation,'state':'COMMITTED','state_ref':ref,'completed_at':at.isoformat(),
            'completeness':'DEGRADED' if body['missing'] else 'COMPLETE',
            'missing':body['missing'],'added_games':body['added_games'],
            'added_statistics':body['added_statistics'],'revised_finals':body['revised_finals'],
            'revised_statistics':body['revised_statistics'],'incorporated_games':len(body['incorporated'])}
    persist(root,path,result)
    return result


def run_due(root,owner,*,safe_until=None):
    """One cutoff per owned invocation; interrupted jobs reconcile before retry."""
    root=Path(root);at=timestamp(now());config=configuration(root,owner)
    current=state.current(root);previous=state.read(root,current) if current else None
    if timestamp(config['created_at'])>at or (previous and timestamp(previous['cutoff_at'])>at):raise ValueError('Worker clock rollback')
    # A successful state commit may precede its operation acknowledgment.
    if previous:
        path=operation_path(root,timestamp(previous['cutoff_at']));pending=read_operation(path)
        if pending and (pending['configuration_sha256']!=state.sha(config) or pending['owner']!=owner):raise ValueError('Operation owner/configuration differs')
        if pending and pending['state']!='COMMITTED':
            return finish(root,path,pending,current,at)
    cutoff=next_cutoff(previous['cutoff_at']) if previous else timestamp(config['first_cutoff'])
    if at<cutoff:return {'state':'WAITING_FOR_CUTOFF','next_cutoff':cutoff.isoformat(),'mode':POLICY['mode']}
    if safe_until is not None and at+dt.timedelta(seconds=POLICY['operation_seconds'])>=timestamp(safe_until):
        return {'state':'DEFERRED_CAPTURE_WINDOW','cutoff_at':cutoff.isoformat(),'mode':POLICY['mode']}
    path=operation_path(root,cutoff);operation=read_operation(path);identity=state.sha(config)
    if operation:
        if operation['configuration_sha256']!=identity or operation['owner']!=owner:
            raise ValueError('Operation owner/configuration differs')
        if operation['state']=='FAILED_CLOSED':return operation
        receipt=root/state.BASE/'cutoffs'/(cutoff.strftime('%Y%m%dT%H%M%SZ')+'.json')
        if receipt.exists():
            # advance restores the original receipt and repairs its pointer only.
            ref=state.advance(root,cutoff,operation['fit_ref'],operation['observation_ref'])
            return finish(root,path,operation,ref,at)
        if at<timestamp(operation['started_at']):raise ValueError('Worker clock rollback')
        if operation['attempts']>=POLICY['max_attempts'] or at>=timestamp(operation['deadline']):
            operation={**operation,'state':'FAILED_CLOSED','reason':'RECOVERY_BUDGET_EXHAUSTED','failed_at':at.isoformat()}
            persist(root,path,operation);return operation
    else:
        operation={'schema':POLICY['schema'],'mode':POLICY['mode'],'owner':owner,
                   'configuration_sha256':identity,'cutoff_at':cutoff.isoformat(),
                   'fit_ref':config['fit_ref'],'observation_ref':obs.current(root),
                   'started_at':at.isoformat(),'deadline':(at+dt.timedelta(seconds=POLICY['operation_seconds'])).isoformat(),
                   'state':'RECOVERING','attempts':0}
    operation={**operation,'state':'RECOVERING','attempts':operation['attempts']+1,'attempt_at':at.isoformat()}
    persist(root,path,operation)
    try:
        ref=state.advance(root,cutoff,operation['fit_ref'],operation['observation_ref'])
        return finish(root,path,operation,ref,timestamp(now()))
    except (ValueError,OSError) as exc:
        # A failed acknowledgment may follow a valid immutable state commit.
        # Leave RECOVERING intent so next call first reconciles that receipt.
        receipt=root/state.BASE/'cutoffs'/(cutoff.strftime('%Y%m%dT%H%M%SZ')+'.json')
        if receipt.exists():raise
        failed={**operation,'state':'FAILED_CLOSED','reason':'LOCAL_IO' if isinstance(exc,OSError) else 'SOURCE_OR_METHOD_INTEGRITY',
                'error_type':type(exc).__name__,'failed_at':timestamp(now()).isoformat()}
        persist(root,path,failed);return failed


def health(root,at):
    """Read-only receipt health for the independent observer; never runs a job."""
    root=Path(root);at=timestamp(at)
    if not (root/CONFIG).exists():return {'state':'NOT_CONFIGURED','mode':POLICY['mode']}
    owner=json.loads((root/CONFIG).read_bytes())['body']['owner'];config=configuration(root,owner)
    current=state.current(root);body=state.read(root,current) if current else None
    due=next_cutoff(body['cutoff_at']) if body else timestamp(config['first_cutoff'])
    path=operation_path(root,due);operation=read_operation(path)
    if operation and operation['state']=='FAILED_CLOSED':
        return {'state':'FAILED_CLOSED','cutoff_at':due.isoformat(),'reason':operation['reason'],'mode':POLICY['mode']}
    if at>=due+dt.timedelta(seconds=661):
        return {'state':'OVERDUE','cutoff_at':due.isoformat(),'mode':POLICY['mode']}
    if body:
        completed=read_operation(operation_path(root,timestamp(body['cutoff_at'])))
        if (not completed or completed['state']!='COMMITTED') and at>=timestamp(body['cutoff_at'])+dt.timedelta(seconds=661):
            return {'state':'ACKNOWLEDGMENT_MISSING','cutoff_at':body['cutoff_at'],'mode':POLICY['mode']}
        if body['missing']:
            return {'state':'INPUTS_INCOMPLETE','cutoff_at':body['cutoff_at'],
                    'missing_games':sorted({r['game_id'] for r in body['missing']}),'mode':POLICY['mode']}
    return {'state':'WAITING_FOR_CUTOFF' if at<due else 'DUE','next_cutoff':due.isoformat(),
            'last_cutoff':body['cutoff_at'] if body else None,'mode':POLICY['mode']}
