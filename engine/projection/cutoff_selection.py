"""Scheduled preparation selection from durable worker acknowledgments.

Selection itself neither assimilates results nor activates production issuance.
"""
import datetime as dt
import json
from pathlib import Path
import re

from . import cutoff_state as state, cutoff_worker as worker
from .storage import write_bytes
from engine.forecast_system.calendar import timestamp,schedule_kickoff
from engine.forecast_system.cadence import cutoff_before

CONFIGS=state.BASE+'/selection-configurations'


def retain_configuration(root):
    root=Path(root);raw=(root/worker.CONFIG).read_bytes();envelope=json.loads(raw)
    body=worker.configuration(root,envelope['body']['owner'])
    if body!=envelope['body']:raise ValueError('Selection configuration changed during read')
    digest=state.obs.sha(raw);ref={'path':f'{CONFIGS}/{digest}.json','sha256':digest}
    write_bytes(root/ref['path'],raw,immutable=True)
    return ref,body


def configuration(root,ref):
    if set(ref)!={'path','sha256'} or not re.fullmatch('[0-9a-f]{64}',ref['sha256']) or ref['path']!=f'{CONFIGS}/{ref["sha256"]}.json':
        raise ValueError('Invalid selection configuration reference')
    path=Path(root)/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):raise ValueError('Selection configuration escapes repository')
    raw=path.read_bytes()
    if state.obs.sha(raw)!=ref['sha256']:raise ValueError('Selection configuration hash mismatch')
    envelope=json.loads(raw);body=envelope['body']
    if state.sha(body)!=envelope['sha256'] or body['policy']!=worker.POLICY:
        raise ValueError('Selection configuration policy differs')
    return body


def committed_at(root,state_ref,body,evidence):
    """Read original immutable acknowledgment, never a refreshed pointer clock."""
    if set(evidence)!={'operation','configuration'}:raise ValueError('Invalid state availability evidence')
    config=configuration(root,evidence['configuration']);ref=evidence['operation']
    if (set(ref)!={'path','body_sha256'} or not re.fullmatch('[0-9a-f]{64}',ref['body_sha256'])
            or ref['path']!=f'{state.BASE}/operation-history/{ref["body_sha256"]}.json'):
        raise ValueError('Invalid state operation reference')
    path=Path(root)/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):raise ValueError('State operation escapes repository')
    operation=worker.read_operation(path)
    if not operation or state.sha(operation)!=ref['body_sha256']:raise ValueError('State operation history differs')
    if (operation['state']!='COMMITTED' or operation['state_ref']!=state_ref
            or operation['configuration_sha256']!=state.sha(config) or operation['owner']!=config['owner']
            or operation['fit_ref']!=body['fit_ref'] or operation['cutoff_at']!=body['cutoff_at']
            or config['fit_ref']!=body['fit_ref'] or config['method']!=body['method']):
        raise ValueError('State acknowledgment identity differs')
    at=timestamp(operation['completed_at'])
    if (at<timestamp(operation['started_at']) or at<timestamp(body['created_at'])
            or timestamp(operation['started_at'])<timestamp(body['cutoff_at'])
            or timestamp(config['created_at'])>timestamp(operation['started_at'])):
        raise ValueError('State acknowledgment clock differs')
    return at


def acknowledgment(root,ref,body,config_ref):
    operation=worker.read_operation(worker.operation_path(root,timestamp(body['cutoff_at'])))
    if not operation or operation['state']!='COMMITTED':raise ValueError('State acknowledgment unavailable')
    evidence={'operation':{'path':f'{state.BASE}/operation-history/{state.sha(operation)}.json',
                           'body_sha256':state.sha(operation)},'configuration':config_ref}
    return evidence,committed_at(root,ref,body,evidence)


def select(root,games,at):
    root=Path(root);at=timestamp(at);config_ref,_=retain_configuration(root)
    groups={};selected={};skipped=[]
    for game in sorted(games,key=lambda g:g['game_id']):
        deadline=schedule_kickoff(game['gameday'],game['gametime'])-dt.timedelta(minutes=75)
        if at>=deadline:skipped.append(game['game_id']);continue
        required=cutoff_before(deadline)
        if required<=at:
            path=root/state.BASE/'cutoffs'/(required.strftime('%Y%m%dT%H%M%SZ')+'.json')
            if not path.exists():raise ValueError('Required cutoff unavailable: '+game['game_id']+' '+required.isoformat())
            ref=json.loads(path.read_bytes());body=state.read(root,ref)
            if timestamp(body['cutoff_at'])!=required:raise ValueError('Required cutoff receipt differs')
            evidence,available=acknowledgment(root,ref,body,config_ref)
            if available>at:raise ValueError('Required state acknowledged after preparation: '+game['game_id'])
            role='FINAL_ELIGIBLE'
        else:
            ref=state.current(root);seen=set();found=None
            while ref:
                if ref['sha256'] in seen:raise ValueError('Selection state cycle')
                seen.add(ref['sha256']);body=state.read(root,ref)
                operation=worker.read_operation(worker.operation_path(root,timestamp(body['cutoff_at'])))
                if timestamp(body['cutoff_at'])<=at and operation and operation['state']=='COMMITTED':
                    evidence,available=acknowledgment(root,ref,body,config_ref)
                    if available<=at:found=(ref,evidence);break
                ref=body['parent']
            if not found:raise ValueError('No completed state for provisional forecast: '+game['game_id'])
            ref,evidence=found;role='PROVISIONAL'
        key=(ref['sha256'],role)
        groups.setdefault(key,{'state_ref':ref,'role':role,'availability_ref':evidence,'game_ids':[]})['game_ids'].append(game['game_id'])
        selected[game['game_id']]={'required_cutoff':required.isoformat(),'state_ref':ref,'role':role,'availability_ref':evidence}
    return {'schema':'scheduled-cutoff-selection-v1','selected_at':at.isoformat(),
            'groups':list(groups.values()),'games':selected,'closed_games':skipped}
