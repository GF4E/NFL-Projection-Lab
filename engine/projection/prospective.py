"""Pre-lock paired evidence against a frozen scorer; never fits or promotes.

Enrollment requires explicit control-to-production authority. Descriptive reads
never run a scorer. A fixed fit is an anchor, not an unchanged refitting method.
"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import platform
import re
import subprocess
import sys
import numpy as np
from engine.forecast_system.calendar import timestamp, schedule_kickoff, PACIFIC
from . import bundle, cutoff_publication, pipeline_release, storage
from .lineage import read_artifact
from .scoring import artifact_payload, validate_pair, validate_shapes
from .research_ledger import path, reference, raw, sha

BASE='work/projection-prospective-v1'
POLICY={'reference':'FROZEN_FIT_AND_CALIBRATION_NO_REFITS',
        'live':'GOVERNED_PRODUCTION_RELEASES_AND_WEIGHT_ONLY_REFITS',
        'population':'REMAINING_ENROLLED_REGULAR_SEASON_GAME_IDS',
        'inputs':'EXACT_SAME_LIVE_BUNDLE_FOOTBALL_DTO',
        'review':'TUESDAY_AFTER_PUBLISHED_CLOSEOUT_DESCRIPTIVE_ONLY',
        'selection':'EXACT_FINAL_LOCK_BUNDLE',
        'confirmation':'NONE_NO_PROMOTION_OR_SIGNIFICANCE_STOP',
        'semantics':'LEGACY_RIDGE_CENTER_UNTIL_QUALIFIED_MEAN_RELEASE'}
REVIEW=['Frozen-fit reference rather than separately refitting the reference method each week',
        'Remaining enrolled regular-season games rather than a fixed game-count horizon']


def now():return dt.datetime.now(dt.timezone.utc)
def environment():return {'python':platform.python_version(),'numpy':np.__version__,'system':platform.system(),'machine':platform.machine()}

def read(root,ref):
    if set(ref)!={'path','sha256'}:raise ValueError('Exact prospective reference required')
    data=path(root,ref['path']).read_bytes()
    if sha(data)!=ref['sha256']:raise ValueError('Prospective evidence hash differs')
    return json.loads(data)


def store(root,kind,value):
    data=raw(value);name=f'{BASE}/{kind}/{sha(data)}.json'
    storage.write_bytes(path(root,name),data,immutable=True)
    return reference(root,name)


def scorer_code(root):
    root=Path(root)
    names=sorted(str(p.relative_to(root)) for p in (root/'engine').rglob('*.py'))
    names+=['scripts/projection_score_worker.py']
    if not names or not (root/names[-1]).is_file():raise ValueError('Frozen scorer source required')
    return {n:sha((root/n).read_bytes()) for n in names}


def admission(root):
    """Fail closed until the registry binds a verified active production release."""
    active=pipeline_release.guard(root)
    if not active or active['mode']!='SCHEDULED':raise ValueError('Qualified scheduled issuing path required')
    active_ref=pipeline_release.pointer(root,pipeline_release.ACTIVE)
    catalog=json.loads(path(root,'work/series-registry/catalog.json').read_bytes())
    entries=[e for e in catalog['series'] if e.get('authoritative') and e['path']==catalog['authoritative_control']]
    if len(entries)!=1:raise ValueError('One authoritative control required')
    entry=entries[0];control={'path':entry['path'],'sha256':entry['sha256']};read(root,control)
    if entry.get('production_pipeline_ref')!=active_ref or not entry.get('production_verified_at'):
        raise ValueError('Control lacks exact verified production release association')
    if timestamp(entry['production_verified_at'])>=now():raise ValueError('Production verification must precede enrollment')
    generated=entry.get('generated_at',entry.get('date_added'))
    if not generated:raise ValueError('Control generation date required')
    return {'control':control,'generated_at':generated,'production_pipeline_ref':active_ref,
            'production_verified_at':entry['production_verified_at']},active


def enroll(root,schedule_ref,season):
    """No enrollment exists until its immutable plan is durably written."""
    enrollment=path(root,f'{BASE}/enrollments/{season}.json')
    if enrollment.exists():
        ref=json.loads(enrollment.read_bytes());saved=plan(root,ref)
        if saved['schedule_ref']!=schedule_ref:raise ValueError('Changed enrollment schedule')
        finish_enrollment(root,ref,saved)
        return ref
    authority,active=admission(root);at=now()
    artifact=read_artifact(root,active['fit_ref']);shapes=read_artifact(root,active['calibration_ref'])
    validate_shapes(shapes);schedule=read(root,schedule_ref);eligible=[]
    for g in schedule:
        if int(g['season'])!=season or g['game_type']!='REG':continue
        cutoff=schedule_kickoff(g['gameday'],g['gametime'])-dt.timedelta(minutes=75)
        if cutoff<=at:continue
        if not re.fullmatch('[A-Za-z0-9_]+',g['game_id']):raise ValueError('Invalid game identity')
        eligible.append({'game_id':g['game_id'],'season':season,'week':int(g['week']),
                         'home':g['home_team'],'away':g['away_team'],'enrolled_cutoff':cutoff.isoformat()})
    eligible.sort(key=lambda g:g['game_id'])
    if not eligible or len({g['game_id'] for g in eligible})!=len(eligible):raise ValueError('Unique nonempty prospective population required')
    source_root=Path(__file__).resolve().parents[2];code=scorer_code(source_root)
    source_ref=store(root,'scorer-sources',{'files':{n:(source_root/n).read_text() for n in code}})
    first_review=at.astimezone(PACIFIC).date()
    while first_review.weekday()!=1:first_review+=dt.timedelta(days=1)
    if dt.datetime.combine(first_review,dt.time(6),PACIFIC)<=at:first_review+=dt.timedelta(days=7)
    last_review=max(timestamp(g['enrolled_cutoff']).astimezone(PACIFIC).date() for g in eligible)+dt.timedelta(days=7)
    reviews=[]
    while first_review<=last_review:
        reviews.append(first_review.isoformat());first_review+=dt.timedelta(days=7)
    definition={'schema':'prospective-comparison-v1','enrolled_at':at.isoformat(),'policy':POLICY,
          'review_requested':REVIEW,'authority':authority,'schedule_ref':schedule_ref,'season':season,
          'eligible':eligible,'review_dates_pacific':reviews,'reference':{'fit_ref':active['fit_ref'],'calibration_ref':active['calibration_ref'],
          'artifact':artifact_payload(artifact),'shapes':shapes,'code':code,'source_snapshot':source_ref,'environment':environment()},
          'end_rule':'Last enrolled game final; postponed games remain enrolled',
          'activates_method':False}
    # Both source snapshots and exact references remain recoverable in the plan.
    ref=store(root,'plans',definition)
    storage.save(enrollment,ref,immutable=True)
    finish_enrollment(root,ref,definition)
    return ref


def finish_enrollment(root,ref,p):
    from .research_ledger import record
    record(root,key='prospective/enroll/'+ref['sha256'],kind='CONFIGURATION_RETAINED',
           experiment='PROSPECTIVE_DESCRIPTIVE',evidence=[ref,p['reference']['source_snapshot']],context={'confirmation':False})
    receipt=path(root,f'{BASE}/enrollment-receipts/{ref["sha256"]}.json')
    if receipt.exists():
        value=json.loads(receipt.read_bytes())
        if value['plan_ref']!=ref:raise ValueError('Enrollment receipt differs')
    else:value={'plan_ref':ref,'observed_durable_at':now().isoformat()}
    storage.save(receipt,value,immutable=True)


def enrolled_at(root,ref):
    value=json.loads(path(root,f'{BASE}/enrollment-receipts/{ref["sha256"]}.json').read_bytes())
    if value['plan_ref']!=ref:raise ValueError('Enrollment receipt differs')
    return timestamp(value['observed_durable_at'])


def plan(root,ref):
    p=read(root,ref)
    if p.get('schema')!='prospective-comparison-v1' or p['policy']!=POLICY or p.get('activates_method') is not False:
        raise ValueError('Unsupported prospective plan')
    timestamp(p['enrolled_at']);validate_shapes(p['reference']['shapes'])
    artifact_payload(p['reference']['artifact'])
    return p


def restore_scorer(root,plan_ref,destination):
    p=plan(root,plan_ref);snapshot=read(root,p['reference']['source_snapshot']);dest=Path(destination).resolve()
    if set(snapshot['files'])!=set(p['reference']['code']):raise ValueError('Incomplete frozen scorer source')
    # Validate every member before the first write. Never delete or overwrite a
    # different existing source; a restore must reproduce the declared bytes.
    for name,value in snapshot['files'].items():
        if not (name.startswith('engine/') and name.endswith('.py') or name=='scripts/projection_score_worker.py'):
            raise ValueError('Unapproved scorer source path')
        path(dest,name)
        if sha(value.encode())!=p['reference']['code'][name]:raise ValueError('Frozen source snapshot differs')
    for name,value in snapshot['files'].items():storage.write_bytes(path(dest,name),value.encode(),immutable=True)
    if scorer_code(dest)!=p['reference']['code']:raise ValueError('Restored scorer contains different code')
    return {'status':'SOURCE_RESTORED','files':len(snapshot['files']),'environment_compatible':environment()==p['reference']['environment']}


def frozen_score(p,request,scorer_root):
    """Run pinned code from current or separately restored source; no source reads."""
    validate_pair(request);root=Path(scorer_root).resolve()
    if environment()!=p['reference']['environment']:raise ValueError('Frozen scorer runtime differs')
    if scorer_code(root)!=p['reference']['code']:raise ValueError('Frozen scorer source differs')
    payload={'artifact':p['reference']['artifact'],'shapes':p['reference']['shapes'],'requests':[request]}
    proc=subprocess.run([sys.executable,'-I','-B',str(root/'scripts/projection_score_worker.py')],
        input=raw(payload),capture_output=True,timeout=60,cwd=root,
        env={'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
    if proc.returncode:raise ValueError('Frozen scoring failed; no fallback')
    result=json.loads(proc.stdout)
    if set(result)!={request['game_id']}:raise ValueError('Frozen scorer returned different games')
    return result[request['game_id']]


def acknowledge(root,target,ref,cutoff):
    receipt=target.with_suffix('.receipt.json')
    if receipt.exists():
        ack=json.loads(receipt.read_bytes())
        if ack['pair_ref']!=ref:raise ValueError('Changed pair after acknowledgment')
        storage.save(receipt,ack,immutable=True)
        return
    done=now()
    ack={'pair_ref':ref,'observed_durable_at':done.isoformat(),'state':'PRELOCK' if done<cutoff else 'LATE'}
    storage.save(receipt,ack,immutable=True)


def pair(root,plan_ref,card,scorer_root):
    p=plan(root,plan_ref);enrolled=enrolled_at(root,plan_ref);gid=card['game_id']
    eligible=next((g for g in p['eligible'] if g['game_id']==gid),None)
    if not eligible or any(card[k]!=eligible[k] for k in ('season','home','away')):
        raise ValueError('Game outside enrolled population')
    if card.get('status')!='UPCOMING' or card.get('evidence')!='AS_ISSUED' or card.get('forecast_role')!='FINAL_ELIGIBLE':
        raise ValueError('Final-eligible pre-lock production card required')
    b=bundle.verify_card(root,card)
    if not b or b.get('chronology',{}).get('status')!='RECORDED_CUTOFF_INPUTS':
        raise ValueError('Recorded input chronology required')
    cutoff_publication.verify_receipt(root,card)
    if timestamp(card['issued_at'])<enrolled:raise ValueError('Forecast predates enrollment')
    if timestamp(card['issued_at'])>now():raise ValueError('Future live issuance')
    if timestamp(card['kickoff_at'])-dt.timedelta(minutes=75)!=timestamp(card['cutoff_at']):
        raise ValueError('Game deadline differs from own kickoff')
    key=f'{BASE}/pairs/{plan_ref["sha256"]}/{gid}/{card["forecast_bundle_ref"]["sha256"]}.json'
    target=path(root,key)
    if target.exists():
        saved=read(root,reference(root,key))
        if saved['plan_ref']!=plan_ref or saved['live_bundle_ref']!=card['forecast_bundle_ref']:
            raise ValueError('Changed prospective operation payload')
        storage.save(target,saved,immutable=True)
        ref=reference(root,key);acknowledge(root,target,ref,timestamp(card['cutoff_at']))
        return ref
    if now()>=timestamp(card['cutoff_at']):raise ValueError('Prospective scoring missed lock; no backfill')
    reference_score=frozen_score(p,b['input'],scorer_root)
    live_shapes=read_artifact(root,card['calibration_ref']);validate_shapes(live_shapes)
    value={'schema':'prospective-pair-v1','plan_ref':plan_ref,'game_id':gid,'season':card['season'],'week':card['week'],
        'home':card['home'],'away':card['away'],'kickoff_at':card['kickoff_at'],'cutoff_at':card['cutoff_at'],
        'live_bundle_ref':card['forecast_bundle_ref'],'input':b['input'],'input_sha256':sha(raw(b['input'])),
        'live':card['projection'],'live_shapes':live_shapes,'reference':reference_score['projection'],
        'reference_contributions':reference_score['contributions'],'completed_at':now().isoformat(),
        'evidence':'PROSPECTIVE_SHADOW','activates_method':False}
    if timestamp(value['completed_at'])>=timestamp(card['cutoff_at']):raise ValueError('Shadow calculation crossed lock')
    # Durable pair is the committed effect. A separate acknowledgment below
    # establishes that this write completed before the deadline.
    storage.save(target,value,immutable=True)
    ref=reference(root,key);acknowledge(root,target,ref,timestamp(card['cutoff_at']))
    return ref


def selected(root,plan_ref,gid):
    """Only the actual first lock selects a pair. No best-result selection."""
    lock=path(root,f'outputs/projection-v3/locks/{gid}.json')
    if not lock.exists():return None,'LOCK_MISSING'
    card=json.loads(lock.read_bytes());bundle.verify_card(root,card)
    if card.get('status') not in ('LOCKED','FINAL') or card.get('freeze_time')!=card.get('cutoff_at'):
        raise ValueError('Actual frozen lock required')
    if not card.get('forecast_bundle_ref'):return None,'LEGACY_LOCK_UNPAIRED'
    file=path(root,f'{BASE}/pairs/{plan_ref["sha256"]}/{gid}/{card["forecast_bundle_ref"]["sha256"]}.json')
    if not file.exists():return None,'PAIR_MISSING'
    receipt=file.with_suffix('.receipt.json')
    if not receipt.exists():return None,'DURABLE_TIME_UNQUALIFIED'
    ack=json.loads(receipt.read_bytes());r=read(root,ack['pair_ref'])
    if ack['pair_ref']!=reference(root,str(file.relative_to(Path(root).resolve()))):raise ValueError('Pair receipt differs')
    p=plan(root,plan_ref)
    if (r['plan_ref']!=plan_ref or r['live_bundle_ref']!=card['forecast_bundle_ref']
            or r['game_id']!=gid or r['live']!=card['projection'] or r['input_sha256']!=sha(raw(r['input']))):
        raise ValueError('Selected pair differs from first lock')
    if not (enrolled_at(root,plan_ref)<=timestamp(r['completed_at'])<=timestamp(ack['observed_durable_at'])<timestamp(card['cutoff_at'])) or ack['state']!='PRELOCK':
        return None,'LATE_OR_UNQUALIFIED_PAIR'
    return r,None


def report(root,plan_ref):
    """Actual-score descriptive metrics; no fitting, scoring worker or gate."""
    from .calibration_evaluate import score_game,summarize
    from .distribution import pmf,quantile
    import copy
    p=plan(root,plan_ref);enrolled_at(root,plan_ref);rows=[];shortfalls=[]
    for g in p['eligible']:
        pair_value,reason=selected(root,plan_ref,g['game_id'])
        if reason:shortfalls.append({'game_id':g['game_id'],'reason':reason});continue
        grade_path=path(root,f'outputs/projection-v3/grades/{g["game_id"]}.json')
        if not grade_path.exists():shortfalls.append({'game_id':g['game_id'],'reason':'FIRST_GRADE_MISSING'});continue
        grade=json.loads(grade_path.read_bytes());bundle.verify_card(root,grade)
        if grade.get('forecast_bundle_ref')!=pair_value['live_bundle_ref']:raise ValueError('Grade is not original paired forecast')
        if grade.get('status')!='FINAL':raise ValueError('First grade is not final')
        actual={'actual_home':grade['final']['home_points'],'actual_away':grade['final']['away_points']}
        if any(type(v) not in (float,int) or v<0 or not float(v).is_integer() for v in actual.values()):raise ValueError('Invalid final points')
        scores={}
        for arm,shapes in [('live',pair_value['live_shapes']),('reference',p['reference']['shapes'])]:
            forecast=copy.deepcopy(pair_value[arm]);validate_shapes(shapes)
            for side in ('home_points','away_points'):
                mass=pmf(shapes['team_points'],forecast[side]);forecast['intervals'][side]={str(level):[quantile(mass,(1-level/100)/2),quantile(mass,1-(1-level/100)/2)] for level in (50,80)}
            scores[arm]=score_game(actual,forecast,{'shapes':shapes})
        rows.append({'game_id':g['game_id'],'season':g['season'],'week':pair_value['week'],'scores':scores,
                     'first_grade_ref':reference(root,str(grade_path.relative_to(Path(root).resolve())))})
    result={'schema':'prospective-description-v1','plan_ref':plan_ref,'eligible_games':len(p['eligible']),
        'paired_graded_games':len(rows),'shortfalls':shortfalls,'rows':rows,'review_requested':REVIEW,
        'interpretation':'Descriptive live-policy versus frozen-fit anchor; no confirmatory claim or feature attribution',
        'summary':{arm:summarize(rows,arm) if rows else None for arm in ('live','reference')},
        'by_week':{str(w):{arm:summarize([r for r in rows if r['week']==w],arm) for arm in ('live','reference')} for w in sorted({r['week'] for r in rows})},
        'activates_method':False,'gate':None}
    ref=store(root,'reports',result)
    from .research_ledger import record
    record(root,key='prospective/report/'+ref['sha256'],kind='REPORT_GENERATED',experiment='PROSPECTIVE_DESCRIPTIVE',
           evidence=[ref],context={'confirmation':False,'human_viewing':'NOT_ESTABLISHED'})
    return ref
