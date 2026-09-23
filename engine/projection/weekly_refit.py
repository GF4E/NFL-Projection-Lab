"""Weekly recorded refit orchestration; configuration is explicitly installed."""
import datetime as dt
import json
import urllib.error
from pathlib import Path

from . import prepared, cutoff_pipeline as p, cutoff_state as cs, cutoff_selection as selection
from . import training_ledger as ledger, pipeline_release as release
from .storage import save
from engine.forecast_system.calendar import PACIFIC, timestamp

BASE='work/projection-weekly-refit-v1'
CONFIG=BASE+'/configuration.json'
CURRENT=BASE+'/current-operation.json'
TRAINING=BASE+'/training-ref.json'


def load(root,path):
    value=release.pointer(root,path)
    if value is None:return None
    if set(value)!={'body','sha256'} or cs.sha(value['body'])!=value['sha256']:
        raise ValueError('Weekly record hash differs')
    return value['body']


def record(root,path,body,immutable=False):
    save(Path(root)/path,{'body':body,'sha256':cs.sha(body)},immutable=immutable)


def configuration(root,owner):
    config=load(root,CONFIG)
    if not config:raise ValueError('Activated pipeline weekly refit requires qualified release handoff configuration')
    return validate_configuration(root,config,owner)


def validate_configuration(root,config,owner):
    """Check staged configuration without installing it or advancing training."""
    if config['schema']!='recorded-weekly-refit-v1' or config['owner']!=owner:
        raise ValueError('Weekly owner or schema differs')
    if p.load(root,config['training_ref'],'training')['schema']!=ledger.SCHEMA:
        raise ValueError('Weekly training migration ledger required')
    if config['method']!=cs.method(root,config['method_fit_ref']):
        raise ValueError('Weekly method changed')
    return config


def closeout_path(root,at):
    local=timestamp(at).astimezone(PACIFIC)
    day=local.date()-dt.timedelta(days=(local.weekday()-1)%7)
    return Path(root)/f'outputs/cadence-v2/closeouts/{day}.json'


def check_public(root,path,at):
    from scripts.closeout_publish import require_published
    from .public_closeout import require_visible, proof_path, confirm
    closed=require_published(Path(root),path,timestamp(at))
    if not proof_path(path).exists():confirm(root,path)
    proof=require_visible(root,path,max(timestamp(at),p.now()))
    return closed,proof


def complete(root,request,target,receipt):
    manifest=release.read(root,target,'manifests')
    artifact=p.read_fit(root,manifest['fit_ref'])
    result={'state':'REFIT_COMPLETE','version':artifact['version'],'fit':manifest['fit_ref'],
            'parent_version':artifact['parent_version'],'through_week':request['week'],
            'issued_at':artifact['issued_at'],'release_ref':target,'release_receipt':receipt,
            'training_ref':request['training_ref'],'request_sha256':cs.sha(request)}
    # The result is durable before the next-week training pointer; retry resumes.
    record(root,request['operation_path']+'/result.json',result,immutable=True)
    save(Path(root)/TRAINING,request['training_ref'])
    return result


def recover(root,owner,dispatch_handle):
    """Only finish the exact weekly switch already prepared by this caller."""
    current=load(root,CURRENT)
    if not current:return None
    request=load(root,current['operation_path']+'/request.json')
    staged=load(root,current['operation_path']+'/staged.json')
    if not request or not staged:return None
    op=release.pointer(root,release.OPERATION)
    if not op:return None
    intent=release.read(root,op['intent_ref'],'intents')
    if intent['operation_id']!=request['operation_id']:return None
    if owner!=request['owner'] or intent['target']!=staged['target'] or intent['expected_active']!=request['parent_release']:
        raise ValueError('Weekly recovery identity differs')
    if load(root,current['operation_path']+'/result.json'):return None
    path=Path(root)/request['closeout_ref']['path']
    _,proof=check_public(root,path,p.now())
    if (cs.obs.sha(path.read_bytes())!=request['closeout_ref']['sha256']
            or cs.sha(proof)!=request['public_proof_sha256']):
        raise ValueError('Weekly recovery publication evidence changed')
    switched=release.switch(root,staged['target'],owner=owner,operation_id=request['operation_id'],
        expected_active=request['parent_release'],dispatch_handle=dispatch_handle)
    return complete(root,request,staged['target'],switched['receipt_ref'])


def run(root,week,at,*,owner,dispatch_handle=None):
    root=Path(root)
    config=configuration(root,owner)
    at=timestamp(at)
    with release.dispatch(root,dispatch_handle) as handle:
        recover(root,owner,handle)
        fence=release.pointer(root,release.OWNER)
        if not fence or fence.get('state')!='ACTIVE' or fence.get('owner')!=owner:
            raise ValueError('Weekly ownership fence differs')
        current=load(root,CURRENT)
        if current:
            pending=load(root,current['operation_path']+'/request.json')
            if pending and pending['week']!=week and not load(root,current['operation_path']+'/result.json'):
                return {'state':'WAITING_FOR_PRIOR_WEEKLY_OPERATION','through_week':pending['week']}
        path=closeout_path(root,at)
        if not path.exists():return {'state':'WAITING_FOR_PUBLISHED_CLOSEOUT','through_week':week}
        try:closed,proof=check_public(root,path,at)
        except FileNotFoundError:return {'state':'WAITING_FOR_PUBLIC_CLOSEOUT','through_week':week}
        except (urllib.error.URLError,TimeoutError):return {'state':'WAITING_FOR_PUBLIC_CLOSEOUT_ACCESS','through_week':week}
        if closed['week']!=week:raise ValueError('Weekly closeout week differs')
        op_path=f"{BASE}/operations/{closed['season']}-w{week}"
        request=load(root,op_path+'/request.json')
        if request:
            if request['closeout_ref']!={'path':str(path.relative_to(root)),'sha256':cs.obs.sha(path.read_bytes())}:
                raise ValueError('Weekly closeout changed during retry')
            if request['configuration_sha256']!=cs.sha(config) or request['owner']!=owner or request['owner_fence']!=fence:
                raise ValueError('Weekly request configuration changed')
            result=load(root,op_path+'/result.json')
            if result:
                # A rolled-back completed week never silently reapplies its fit.
                if release.pointer(root,release.ACTIVE)!=result['release_ref']:
                    return {**result,'state':'REFIT_ALREADY_COMPLETED_RELEASE_CHANGED'}
                release.guard(root)
                save(root/TRAINING,result['training_ref'])
                return result
        else:
            manifest=release.guard(root)
            if not manifest or manifest['mode']!='SCHEDULED':raise ValueError('Scheduled pipeline release required')
            if config['method']!=cs.method(root,manifest['fit_ref']):raise ValueError('Weekly active method differs')
            cutoff=dt.datetime.combine(dt.date.fromisoformat(path.stem),dt.time(6),PACIFIC)
            # Cutoff filenames are UTC, including across DST.
            state_path=root/cs.BASE/'cutoffs'/(cutoff.astimezone(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
            state_ref=json.loads(state_path.read_bytes());body=cs.read(root,state_ref)
            config_ref,_=selection.retain_configuration(root)
            _,available=selection.acknowledgment(root,state_ref,body,config_ref)
            if timestamp(body['cutoff_at'])!=cutoff or available>timestamp(closed['published_at']):
                raise ValueError('Weekly closeout predates acknowledged Tuesday state')
            training_ref=release.pointer(root,TRAINING) or config['training_ref']
            training=p.load(root,training_ref,'training')
            _,finals,_,_=cs.available(root,cs.obs.current(root),at)
            expected={gid for gid,g in finals.items() if g['season']==closed['season'] and g['week']<=week}
            additions=[]
            for gid in sorted(expected-set(training['training_games'])):
                name=f'outputs/projection-v3/locks/{gid}.json';raw=(root/name).read_bytes()
                additions.append({'path':name,'sha256':cs.obs.sha(raw)})
            with prepared.writer(root):
                if additions:training_ref=ledger.append_locks(root,training_ref,additions,at=at)
                # New ledger must be durably available before frozen fit start.
                started=max(at,p.now())
                if timestamp(p.load(root,training_ref,'training')['created_at'])>=started:
                    raise ValueError('Weekly training ledger not available before fit start')
                request={'schema':'recorded-weekly-request-v1','owner':owner,'owner_fence':fence,'season':closed['season'],'week':week,
                    'operation_id':f"weekly-{closed['season']}-w{week}",'operation_path':op_path,
                    'parent_release':release.pointer(root,release.ACTIVE),'parent_fit':manifest['fit_ref'],
                    'state_ref':state_ref,'training_ref':training_ref,'fit_at':started.isoformat(),
                    'configuration_sha256':cs.sha(config),'public_proof_sha256':cs.sha(proof),
                    'closeout_ref':{'path':str(path.relative_to(root)),'sha256':cs.obs.sha(path.read_bytes())}}
                record(root,op_path+'/request.json',request,immutable=True)
        record(root,CURRENT,{'operation_path':op_path})
        if release.pointer(root,release.ACTIVE)!=request['parent_release'] or prepared.active_fit(root)!=request['parent_fit']:
            raise ValueError('Weekly parent release changed before handoff')
        if cs.sha(proof)!=request['public_proof_sha256']:raise ValueError('Weekly publication evidence changed')
        attempts=sorted((root/op_path/'attempts').glob('*.json'))
        if len(attempts)>=3:
            return {'state':'FAILED_CLOSED','reason':'WEEKLY_ATTEMPTS_EXHAUSTED','through_week':week}
        began=p.now()
        record(root,op_path+f'/attempts/{len(attempts)+1}.json',
               {'started_at':began.isoformat(),'request_sha256':cs.sha(request)},immutable=True)
        with prepared.writer(root):
            fit_ref=p.refit_recorded(root,request['state_ref'],request['training_ref'],request['parent_fit'],
                                     path,at=request['fit_at'])
        if p.now()>began+dt.timedelta(seconds=600):raise TimeoutError('Weekly refit deadline exhausted')
        if release.pointer(root,release.OWNER)!=request['owner_fence']:raise ValueError('Weekly ownership changed during fit')
        staged=load(root,op_path+'/staged.json')
        if not staged:
            from scripts import projection_v3_prepare as preparer
            if preparer.ROOT.resolve()!=root.resolve():raise ValueError('Weekly preparer repository differs')
            target=preparer.stage_refit(fit_ref)
            staged={'fit_ref':fit_ref,'target':target};record(root,op_path+'/staged.json',staged,immutable=True)
        elif staged['fit_ref']!=fit_ref:raise ValueError('Weekly staged fit differs')
        if p.now()>began+dt.timedelta(seconds=600):raise TimeoutError('Weekly handoff deadline exhausted')
        switched=release.switch(root,staged['target'],owner=owner,operation_id=request['operation_id'],
            expected_active=request['parent_release'],dispatch_handle=handle)
        return complete(root,request,staged['target'],switched['receipt_ref'])
