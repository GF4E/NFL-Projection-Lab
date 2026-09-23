"""Staged, fenced initial chronology handoff; no fitting or control promotion."""
import datetime as dt
import json
from pathlib import Path

from . import pipeline_release as release, prepared, weekly_refit as weekly
from . import cutoff_pipeline as p, cutoff_state as cs, observations as obs
from . import training_ledger as ledger, release_preflight as preflight
from .storage import save, write_bytes
from engine.forecast_system.cadence import next_cutoff

BASE='work/projection-initial-release-v1'
REQUIRED={'RECOVERED_EXECUTABLE','ISSUING_SOURCE','FIT_AND_CALIBRATION',
          'TRAINING_HISTORY_BINDING','RETAINED_PUBLIC_CLOSEOUT','CURRENT_RUNTIME'}


def store(root,kind,body):
    raw=obs.raw(body);ref={'path':f'{BASE}/{kind}/{obs.sha(raw)}.json','sha256':obs.sha(raw)}
    write_bytes(Path(root)/ref['path'],raw,immutable=True)
    return ref


def read(root,ref,kind):
    if ref['path']!=f'{BASE}/{kind}/{ref["sha256"]}.json':raise ValueError('Initial handoff reference differs')
    return preflight.read(root,ref)


def runtime_path(root,digest):
    if len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest):
        raise ValueError('Runtime manifest digest differs')
    return Path(root)/'.cloud-private/projection-release/runtime-manifests'/f'{digest}.json'


def technical(root,packet_ref,runtime_manifest,*,require_active_fit=True):
    result=preflight.check(root,packet_ref,runtime_manifest=runtime_manifest,require_active_fit=require_active_fit)
    checks={c['name']:c['status'] for c in result['checks']}
    if any(checks.get(k)!='PASS' for k in REQUIRED):
        raise ValueError('Initial release technical evidence incomplete')
    return result


def admission(root,ref,manifest,owner,*,require_active_fit=True):
    """Recheck actual evidence; cross-fit rollback is separately linked by switch."""
    body=read(root,ref,'admissions')
    if (body.get('schema')!='initial-chronology-admission-v1' or body['owner']!=owner
            or body['fit_ref']!=manifest['fit_ref'] or body['code']!=manifest['code']
            or body['weekly_configuration']!=manifest.get('weekly_configuration')):
        raise ValueError('Initial release admission identity differs')
    packet=preflight.read(root,body['packet_ref'])
    retained=read(root,body['preflight_ref'],'preflights')
    if retained['packet_ref']!=body['packet_ref'] or any(
            {c['name']:c['status'] for c in retained['checks']}.get(k)!='PASS' for k in REQUIRED):
        raise ValueError('Initial retained preflight differs')
    training=p.load(root,body['weekly_configuration']['training_ref'],'training')
    boundary=training.get('migration_boundary')
    if (packet['fit_ref']!=body['fit_ref'] or not boundary
            or boundary['parent_ref']!=packet['training_ref'] or boundary['boundary_at']!=body['boundary_at']):
        raise ValueError('Initial release migration boundary differs')
    private=runtime_path(root,body['runtime_manifest_sha256'])
    if private.is_symlink() or obs.sha(private.read_bytes())!=body['runtime_manifest_sha256']:
        raise ValueError('Initial release private runtime evidence differs')
    technical(root,body['packet_ref'],private,require_active_fit=require_active_fit)
    return body


def stage(root,packet_ref,*,owner,runtime_manifest):
    """Retain a reviewable plan without changing any live configuration/pointer."""
    from scripts import projection_v3_prepare as preparer, cloud_scheduler as scheduler
    root=Path(root)
    if preparer.ROOT.resolve()!=root.resolve() or scheduler.ROOT.resolve()!=root.resolve():
        raise ValueError('Initial preparer/scheduler repository differs')
    started=p.now()
    with release.dispatch(root),prepared.writer(root):
        fence=release.pointer(root,release.OWNER)
        if not fence or fence.get('state')!='ACTIVE' or fence.get('owner')!=owner:
            raise ValueError('Initial release owner differs')
        active=release.guard(root)
        if (active and active['mode']!='LEGACY') or release.mode(prepared.current(root))!='LEGACY':
            raise ValueError('Initial release already activated or not in legacy preparation')
        if weekly.load(root,weekly.CONFIG) is not None or release.pointer(root,weekly.TRAINING) is not None:
            raise ValueError('Initial release cannot replace existing weekly configuration')
        result=technical(root,packet_ref,runtime_manifest)
        packet=preflight.read(root,packet_ref)
        private_raw=Path(runtime_manifest).read_bytes();digest=obs.sha(private_raw)
        accepted=preflight.recovery(root,packet['evidence']['recovery_acceptance'],packet['evidence']['restored_consumer'])
        if digest!=accepted['runtime_manifest_sha256']:raise ValueError('Runtime changed after preflight')
        private=runtime_path(root,digest);write_bytes(private,private_raw,immutable=True);private.chmod(0o600)
        boundary_at=p.now()
        observation_ref=obs.current(root)
        _,_,transaction=cs.snapshot_before(root,observation_ref,boundary_at)
        schedule=obs.read_source(root,transaction['sources']['schedule'],'schedule')
        deadlines=[next_cutoff(boundary_at)]
        capture=scheduler.next_capture_boundary(boundary_at)
        if capture is not None:deadlines.append(capture)
        deadlines.extend(p.time_of(g)-dt.timedelta(minutes=11) for g in schedule
                         if g['game_type']=='REG' and p.time_of(g)>boundary_at)
        if (scheduler.capture_window() or scheduler.weekly_capture_window(boundary_at)
                or min(deadlines)<=boundary_at+dt.timedelta(seconds=570)):
            raise ValueError('Initial handoff deferred for capture/cutoff window')
        stadiums=store(root,'stadiums',json.loads((root/'config/stadiums.json').read_bytes()))
        training_ref=ledger.extend_migration(root,packet['training_ref'],observation_ref=observation_ref,
                                              stadiums_ref=stadiums,at=boundary_at)
        config={'schema':'recorded-weekly-refit-v1','owner':owner,'training_ref':training_ref,
                'method_fit_ref':packet['fit_ref'],'method':cs.method(root,packet['fit_ref'])}
        before=prepared.current(root);expected=release.pointer(root,release.ACTIVE)
        rollback=release.checkpoint(root,label='INITIAL_CHRONOLOGY_ROLLBACK',weekly_configuration=None)
        proof=store(root,'preflights',result)
        admission_body={'schema':'initial-chronology-admission-v1','owner':owner,'packet_ref':packet_ref,
            'fit_ref':packet['fit_ref'],'code':release.source(root),'weekly_configuration':config,
            'boundary_at':boundary_at.isoformat(),'runtime_manifest_sha256':digest,'preflight_ref':proof}
        admission_ref=store(root,'admissions',admission_body)
        # Pure staging path: neither prepared.commit nor a fit is invoked.
        metadata=preparer._prepare_scheduled(stage=True)
        target=release.checkpoint(root,label='INITIAL_CHRONOLOGY_STAGED',prepared_ref=metadata['prepared_manifest_ref'],
                                  weekly_configuration=config,initial_admission_ref=admission_ref)
        if prepared.current(root)!=before or release.pointer(root,release.OWNER)!=fence:
            raise ValueError('Initial release ownership/preparation changed during staging')
        finished=p.now()
        if finished>=started+dt.timedelta(seconds=570):raise TimeoutError('Initial staging budget exhausted')
        expires=min(boundary_at+dt.timedelta(seconds=570),min(deadlines))
        if finished>=expires:raise TimeoutError('Initial staged plan already expired')
        plan={'schema':'initial-chronology-plan-v1','owner':owner,'owner_fence':fence,
            'packet_ref':packet_ref,'admission_ref':admission_ref,'target':target,'rollback':rollback,
            'expected_active':expected,'prepared_before':before,'fit_ref':packet['fit_ref'],
            'created_at':finished.isoformat(),'expires_at':expires.isoformat(),
            'operation_id':'initial-'+target['sha256'][:40]}
        ref=store(root,'plans',plan)
        save(root/BASE/'target-plans'/f'{target["sha256"]}.json',ref,immutable=True)
        return {'state':'STAGED_NOT_ACTIVATED','plan_ref':ref,'target':target,'rollback':rollback,
                'training_ref':training_ref,'expires_at':plan['expires_at']}


def activate(root,plan_ref,*,owner,dispatch_handle=None):
    root=Path(root);plan=read(root,plan_ref,'plans')
    if plan.get('schema')!='initial-chronology-plan-v1' or plan['owner']!=owner:
        raise ValueError('Initial plan owner/schema differs')
    with release.dispatch(root,dispatch_handle) as handle:
        if release.pointer(root,release.OWNER)!=plan['owner_fence']:
            raise ValueError('Initial release fence changed')
        target=release.read(root,plan['target'],'manifests')
        if target.get('initial_admission_ref')!=plan['admission_ref']:
            raise ValueError('Initial plan admission differs')
        request=release.pointer(root,f'{release.BASE}/operation-ids/{plan["operation_id"]}.json')
        pending=release.pointer(root,release.OPERATION)
        begun=False
        if request:
            intent=release.read(root,request,'intents')
            if (intent['target']!=plan['target'] or intent['expected_active']!=plan['expected_active']
                    or intent['owner']!=plan['owner_fence']):
                raise ValueError('Initial release payload differs')
            begun=bool(pending and pending['intent_ref']==request)
            if begun and pending.get('receipt_ref'):
                release.guard(root)
                return {'state':'COMMITTED','release_ref':plan['target'],'receipt_ref':pending['receipt_ref']}
        if not begun:
            if p.now()>=p.timestamp(plan['expires_at']):raise ValueError('Unused initial plan expired')
            if (release.pointer(root,release.ACTIVE)!=plan['expected_active']
                    or prepared.current(root)!=plan['prepared_before'] or prepared.active_fit(root)!=plan['fit_ref']):
                raise ValueError('Initial staged source state changed')
        attempts=root/BASE/'attempts'/plan_ref['sha256']
        existing=sorted(attempts.glob('*.json'))
        if len(existing)>=3:raise ValueError('Initial handoff attempts exhausted; reconcile before further work')
        save(attempts/f'{len(existing)+1}.json',{'plan_ref':plan_ref,'at':p.now().isoformat(),'resuming':begun},immutable=True)
        return release.switch(root,plan['target'],owner=owner,operation_id=plan['operation_id'],
                              expected_active=plan['expected_active'],dispatch_handle=handle)


def recover(root,owner,dispatch_handle):
    """Resume only a begun exact initial transaction; never start a staged plan."""
    pending=release.pointer(root,release.OPERATION)
    if not pending or pending.get('receipt_ref'):return None
    intent=release.read(root,pending['intent_ref'],'intents')
    manifest=release.read(root,intent['target'],'manifests')
    if not manifest.get('initial_admission_ref'):return None
    plan_ref=release.pointer(root,f'{BASE}/target-plans/{intent["target"]["sha256"]}.json')
    if plan_ref is None:raise ValueError('Pending initial release lacks its exact plan')
    plan=read(root,plan_ref,'plans')
    if plan['operation_id']!=intent['operation_id'] or plan['target']!=intent['target']:
        raise ValueError('Pending initial release plan differs')
    return activate(root,plan_ref,owner=owner,dispatch_handle=dispatch_handle)
