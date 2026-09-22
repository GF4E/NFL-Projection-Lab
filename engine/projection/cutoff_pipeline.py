"""Common numerical preparation, fitting and scoring; activation is separate.

Clock roles are explicit. A provisional forecast is never lock-eligible, and a
historical reconstruction is never relabeled as physically issued beforehand.
"""
import copy
import datetime as dt
import math
from collections import defaultdict

from . import cutoff_features as features, cutoff_state
from .scoring import prepare_pair, artifact_payload
from .scoring_process import score_batch
from engine.projection_v3.model import fit as ridge_fit
from engine.forecast_system.calendar import timestamp,schedule_kickoff
from engine.forecast_system.cadence import cutoff_before

SCHEMA='cutoff-pipeline-v1'
ROLES=('PROVISIONAL','FINAL_ELIGIBLE','HISTORICAL_RECONSTRUCTION')
GROUPS=['calibration','elo']


def now():
    return dt.datetime.now(dt.timezone.utc)


def settings(artifact):
    if artifact.get('groups')!=GROUPS or artifact.get('selected')!=['none',10]:
        raise ValueError('Unqualified cutoff pipeline method')
    return artifact


def time_of(game):
    return schedule_kickoff(game['gameday'],game['gametime'])-dt.timedelta(minutes=75)


def prepare(state,context,slate,stadiums,*,at,role):
    """Pure renderer used by captured-state and historical replay adapters."""
    at=timestamp(at)
    if role not in ROLES:raise ValueError('Explicit preparation role required')
    if not slate or len({g['game_id'] for g in slate})!=len(slate):raise ValueError('Unique forecast games required')
    if any(set(g)-set(features.GAME_FIELDS) for g in slate):raise ValueError('Forecast DTO contains unapproved fields')
    cut=timestamp(context['cutoff_at'])
    if context['state_sha256']!=state.identity():raise ValueError('Preparation state identity differs')
    if cut>at:raise ValueError('State is not available at preparation time')
    if role!='HISTORICAL_RECONSTRUCTION':
        if context.get('source_availability')!='RECORDED' or not context.get('state_ref'):
            raise ValueError('Recorded state required for prospective preparation')
        if timestamp(context['committed_at'])>at:raise ValueError('State was committed after preparation time')
    elif context.get('source_availability') not in ('RECORDED','HISTORICAL_AVAILABILITY_ASSUMED'):
        raise ValueError('Historical availability must be disclosed')
    contexts=defaultdict(list)
    for game in slate:
        issuance=time_of(game);required=cutoff_before(issuance)
        if cut>required:raise ValueError('State includes a later assimilation interval')
        if role!='PROVISIONAL' and cut!=required:raise ValueError('Required assimilation cutoff differs')
        if role!='HISTORICAL_RECONSTRUCTION' and at>=issuance:raise ValueError('Cannot prepare a live forecast at or after lock')
        if role=='HISTORICAL_RECONSTRUCTION' and at!=issuance:raise ValueError('Replay uses the logical issuance boundary')
        contexts[(int(game['season']),int(game['week']))].append(game)
    rows=[]
    # Rendering must not mutate a reusable committed state (notably offseason Elo).
    working=copy.deepcopy(state)
    for (season,week),games in sorted(contexts.items()):
        working.prepare(season)
        produced=features.render(working,sorted(games,key=lambda g:g['game_id']),stadiums,None,())
        for row in produced:
            row['state_lineage']={**copy.deepcopy(context),'rendered_state_sha256':working.identity(),
                                  'weight_context_week':week,'role':role,'prepared_at':at.isoformat(),
                                  'required_cutoff':cutoff_before(time_of(row['game'])).isoformat()}
            row['personnel']={'status':'INACTIVE_IN_QUALIFIED_CORE','reason':'No qualified personnel vintage supplied to this preparation; no value inferred.'}
        rows.extend(produced)
    return {'schema':SCHEMA,'role':role,'prepared_at':at.isoformat(),'state':copy.deepcopy(context),
            'rows':sorted(rows,key=lambda r:r['row_id'])}


def from_recorded(root,state_ref,slate,stadiums,*,at,role):
    if role=='HISTORICAL_RECONSTRUCTION':raise ValueError('Use explicit replay adapter for reconstruction')
    state,body=cutoff_state.restore(root,state_ref)
    context={'cutoff_at':body['cutoff_at'],'state_sha256':body['state_sha256'],
             'committed_at':body['created_at'],'state_ref':state_ref,'source_availability':'RECORDED',
             'observation_ref':body['observation_ref'],'method':body['method'],'missing':body['missing']}
    return prepare(state,context,slate,stadiums,at=at,role=role)


def validate_preparation(prepared):
    if prepared.get('schema')!=SCHEMA or prepared.get('role') not in ROLES:raise ValueError('Unsupported preparation')
    at=timestamp(prepared['prepared_at']);context=prepared['state'];cut=timestamp(context['cutoff_at'])
    if cut>at:raise ValueError('State unavailable at preparation time')
    if prepared['role']!='HISTORICAL_RECONSTRUCTION':
        if context.get('source_availability')!='RECORDED' or not context.get('state_ref'):
            raise ValueError('Recorded preparation state required')
        if timestamp(context['committed_at'])>at:raise ValueError('State committed after preparation')
    elif context.get('source_availability') not in ('RECORDED','HISTORICAL_AVAILABILITY_ASSUMED'):
        raise ValueError('Historical availability must be disclosed')
    rows=prepared['rows'];pairs=defaultdict(dict)
    for row in rows:
        gid=row['game_id'];side='home' if row['home'] else 'away';lineage=row['state_lineage']
        if row.get('actual_points') is not None:raise ValueError('Target labels cannot enter forecast preparation')
        if set(row['game'])-set(features.GAME_FIELDS):raise ValueError('Unapproved forecast game fields')
        if row['game']['game_id']!=gid or row['team']!=row['game'][side+'_team']:raise ValueError('Forecast team/game identity differs')
        if row['row_id']!=gid+':'+row['team'] or row['opponent']!=row['game'][('away' if row['home'] else 'home')+'_team']:
            raise ValueError('Forecast row identity differs')
        if row['season']!=int(row['game']['season']) or row['week']!=int(row['game']['week']):raise ValueError('Forecast season/week differs')
        deadline=time_of(row['game'])
        if prepared['role']=='HISTORICAL_RECONSTRUCTION' and at!=deadline:raise ValueError('Replay issuance differs')
        if prepared['role']!='HISTORICAL_RECONSTRUCTION' and at>=deadline:raise ValueError('Preparation at or after lock')
        if side in pairs[gid]:raise ValueError('Duplicate team row')
        if lineage['role']!=prepared['role'] or lineage['prepared_at']!=prepared['prepared_at']:
            raise ValueError('Preparation row role/time differs')
        if any(lineage[k]!=prepared['state'][k] for k in prepared['state']):raise ValueError('Preparation state differs')
        if lineage['required_cutoff']!=cutoff_before(time_of(row['game'])).isoformat():raise ValueError('Preparation calendar differs')
        if timestamp(lineage['cutoff_at'])>timestamp(lineage['required_cutoff']):raise ValueError('Early source use')
        if prepared['role']!='PROVISIONAL' and lineage['cutoff_at']!=lineage['required_cutoff']:raise ValueError('Wrong final cutoff')
        pairs[gid][side]=row
    if not pairs or any(set(p)!={'home','away'} for p in pairs.values()):raise ValueError('Both teams of each game required')
    if any(pair['home']['game']!=pair['away']['game'] for pair in pairs.values()):raise ValueError('Paired game snapshots differ')
    return pairs


def score(prepared,artifact,shapes=None):
    """Same point entry point in live preparation and historical evaluation.

    Missing historical calibration produces point-only evidence, never a current
    residual table transplanted backward. Full distributions use the strict scorer.
    """
    settings(artifact);pairs=validate_preparation(prepared)
    if prepared['role']=='HISTORICAL_RECONSTRUCTION' and shapes is not None:
        raise ValueError('Historical calibration needs its own qualified earlier-error adapter')
    artifact_payload(artifact);results={}
    requests={gid:prepare_pair(pair) for gid,pair in sorted(pairs.items())}
    # One isolated child for the entire slate, with no credential/file access.
    calculated=score_batch(artifact,shapes,list(requests.values())) if shapes is not None else {}
    from engine.projection_v3.model import predict
    for gid,pair in sorted(pairs.items()):
        request=requests[gid]
        if shapes is None:
            values={s:predict(artifact['fit'],r['features']) for s,r in request['rows'].items()}
            points={s:values[s]['points'] for s in ('home','away')}
            result={'projection':{'home_points':points['home'],'away_points':points['away'],
                                  'margin':points['home']-points['away'],'total':points['home']+points['away']},
                    'contributions':{s:values[s]['contributions'] for s in values},
                    'uncertainty_status':'NOT_SCORED_NO_QUALIFIED_HISTORICAL_CALIBRATION'}
        else:result=calculated[gid]
        for side in ('home','away'):
            if not math.isclose(math.fsum(t['points'] for t in result['contributions'][side]),result['projection'][side+'_points'],abs_tol=1e-10):
                raise ValueError('Point contributions do not reconcile')
        results[gid]={'schema':SCHEMA,'game_id':gid,'game':copy.deepcopy(pair['home']['game']),
                      'role':prepared['role'],'prepared_at':prepared['prepared_at'],
                      'state_lineage':copy.deepcopy(pair['home']['state_lineage']),
                      'point_semantics':'LEGACY_RIDGE_CENTER','fit_sha256':cutoff_state.sha(artifact['fit']),
                      'training_hash':artifact['fit']['training_hash'],'calibration_ref':artifact.get('shapes') if shapes is not None else None,
                      'input':request,**result}
    return results


def lockable(forecast,deadline):
    """Logical T75 lock eligibility; physical immutable commit remains the caller's job."""
    deadline=timestamp(deadline)
    if forecast.get('role')!='FINAL_ELIGIBLE':raise ValueError('Only a final-eligible forecast can lock')
    if time_of(forecast['game'])!=deadline:raise ValueError('Lock deadline differs from game')
    if timestamp(forecast['prepared_at'])>=deadline:raise ValueError('Forecast was not prepared before lock')
    lineage=forecast['state_lineage']
    if timestamp(lineage['cutoff_at'])!=cutoff_before(deadline) or lineage.get('source_availability')!='RECORDED':
        raise ValueError('Lock lacks its recorded required state')
    if not lineage.get('state_ref') or timestamp(lineage['committed_at'])>timestamp(forecast['prepared_at']):
        raise ValueError('State was unavailable to issuer')
    return True


def refit(history,labels,parent,*,cutoff,through_season,through_week,closeout,fit_at=None):
    """Weight-only arithmetic after a validated closeout; no active pointer writes.

    Adapters verify the closeout publication receipt and source-label hashes before
    constructing these typed inputs. Both historical/live adapters use this join.
    """
    settings(parent);cutoff=timestamp(cutoff)
    fit_at=timestamp(fit_at if fit_at is not None else closeout['published_at'])
    from engine.forecast_system.calendar import PACIFIC
    local=cutoff.astimezone(PACIFIC)
    if local.weekday()!=1 or (local.hour,local.minute,local.second,local.microsecond)!=(6,0,0,0):
        raise ValueError('Refit requires Tuesday assimilation cutoff')
    if closeout.get('state')!='PUBLISHED' or closeout.get('season')!=through_season or closeout.get('week')!=through_week:
        raise ValueError('Matching published closeout required')
    if timestamp(closeout['published_at'])<cutoff:raise ValueError('Closeout must follow Tuesday assimilation')
    if fit_at<timestamp(closeout['published_at']) or fit_at<cutoff or timestamp(closeout.get('confirmed_at',closeout['published_at']))>fit_at:
        raise ValueError('Refit predates published closeout')
    role=closeout.get('evidence')
    if role not in ('VERIFIED_SOURCE_PUBLICATION','SIMULATED_HISTORICAL_CLOSEOUT'):raise ValueError('Explicit closeout evidence required')
    pairs=defaultdict(dict);excluded=[];seen=set()
    for row in history:
        if row.get('actual_points') is not None:raise ValueError('Join labels only from qualifying state')
        gid=row['game_id'];side='home' if row['home'] else 'away'
        if (gid,side) in seen:raise ValueError('Duplicate training team')
        seen.add((gid,side))
        if row['game']['game_id']!=gid or row['team']!=row['game'][side+'_team']:raise ValueError('Training team/game identity differs')
        if row['season']>through_season or row['season']==through_season and row['week']>through_week:continue
        if gid not in labels:raise ValueError('Missing eligible training final: '+gid)
        issuance=time_of(row['game']);lineage=row['state_lineage']
        if timestamp(lineage['cutoff_at'])!=cutoff_before(issuance):raise ValueError('Training feature cutoff differs')
        if lineage['role'] not in ('FINAL_ELIGIBLE','HISTORICAL_RECONSTRUCTION'):raise ValueError('Provisional or unknown training feature rejected')
        prepared_at=timestamp(lineage['prepared_at'])
        if prepared_at<timestamp(lineage['cutoff_at']) or prepared_at>issuance or lineage['role']=='FINAL_ELIGIBLE' and prepared_at==issuance:
            raise ValueError('Training preparation chronology differs')
        label=labels[gid]
        if timestamp(label['kickoff_at'])!=issuance+dt.timedelta(minutes=75):raise ValueError('Training label kickoff differs')
        if timestamp(label['available_at'])>=fit_at or timestamp(label['kickoff_at'])+dt.timedelta(hours=4)>=fit_at:
            raise ValueError('Training label unavailable at actual refit time')
        if issuance>=fit_at:raise ValueError('Future training game')
        if any(not math.isfinite(float(label[s+'_points'])) or float(label[s+'_points'])<0 for s in ('home','away')):
            raise ValueError('Invalid training final')
        if row['features'].get('baseline') is None:
            excluded.append({'row_id':row['row_id'],'reason':'BASELINE_UNAVAILABLE'});continue
        pairs[gid][side]={**copy.deepcopy(row),'actual_points':float(label[side+'_points'])}
    if not pairs or any(set(p)!={'home','away'} for p in pairs.values()):raise ValueError('Paired eligible training games required')
    rows=[p[s] for _,p in sorted(pairs.items()) for s in ('away','home')]
    fitted=ridge_fit(rows,parent['groups'],parent['selected'][1])
    return {**copy.deepcopy(parent),'fit':fitted,'role':'SHADOW_WEIGHT_ONLY',
            'scheduled_cutoff':cutoff.isoformat(),'training_cutoff':fit_at.isoformat(),'through_week':through_week,'training_games':sorted(pairs),
            'training_exclusions':excluded,
            'closeout_evidence':copy.deepcopy(closeout),'parent_training_hash':parent['fit']['training_hash']}


BASE='work/projection-cutoff-pipeline-v1'
KINDS={'preparations','forecasts','training','shadow-fits'}


def store(root,kind,body):
    import gzip
    from pathlib import Path
    from .storage import write_bytes
    if kind not in KINDS:raise ValueError('Unapproved pipeline artifact kind')
    data=gzip.compress(cutoff_state.raw(body),mtime=0);digest=cutoff_state.obs.sha(data)
    ref={'path':f'{BASE}/{kind}/{digest}.json.gz','sha256':digest}
    write_bytes(Path(root)/ref['path'],data,immutable=True)
    return ref


def load(root,ref,kind):
    import gzip,json,re
    from pathlib import Path
    if kind not in KINDS or set(ref)!={'path','sha256'} or not re.fullmatch('[0-9a-f]{64}',str(ref['sha256'])) or ref['path']!=f'{BASE}/{kind}/{ref["sha256"]}.json.gz':
        raise ValueError('Unapproved pipeline artifact reference')
    path=Path(root)/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):raise ValueError('Pipeline artifact escapes repository')
    data=path.read_bytes()
    if cutoff_state.obs.sha(data)!=ref['sha256']:raise ValueError('Pipeline artifact hash mismatch')
    return json.loads(gzip.decompress(data))


def recorded_scores(root,preparation_ref,fit_ref):
    from .lineage import read_artifact
    from pathlib import Path
    import json
    from .storage import save
    key=cutoff_state.sha({'preparation_ref':preparation_ref,'fit_ref':fit_ref})
    operation_path=Path(root)/BASE/'score-operations'/(key+'.json')
    if operation_path.exists():
        saved=json.loads(operation_path.read_bytes())
        if saved.get('preparation_ref')!=preparation_ref or saved.get('fit_ref')!=fit_ref or saved.get('state')!='SCORING_COMMITTED':
            raise ValueError('Scoring operation identity differs')
        prepared=load(root,preparation_ref,'preparations')
        if set(saved['forecasts'])!={r['game_id'] for r in prepared['rows']}:raise ValueError('Incomplete scoring operation')
        for ref in saved['forecasts'].values():load(root,ref,'forecasts')
        return saved['forecasts']
    prepared=load(root,preparation_ref,'preparations');artifact=read_fit(root,fit_ref)
    if prepared['role']=='HISTORICAL_RECONSTRUCTION':raise ValueError('Recorded adapter cannot relabel reconstruction')
    started=now()
    if timestamp(prepared['prepared_at'])>started:raise ValueError('Preparation is in the future')
    if any(started>=time_of(r['game']) for r in prepared['rows']):raise ValueError('Cannot score at or after lock')
    if fit_available_at(root,fit_ref,artifact)>timestamp(prepared['prepared_at']):raise ValueError('Fit unavailable at preparation time')
    if prepared['state']['method']['elo_hfa']!=artifact.get('elo_hfa'):raise ValueError('Prepared state/fit method differs')
    shapes=read_artifact(root,artifact['shapes'])
    forecasts=score(prepared,artifact,shapes)
    refs={}
    for gid,f in forecasts.items():
        ref=store(root,'forecasts',{**f,'fit_ref':fit_ref,'preparation_ref':preparation_ref,
               'status':'SHADOW_NOT_ISSUED','uncertainty_provenance':'UNCHANGED_LEGACY_CALIBRATION'})
        # This clock is read after the immutable forecast is durably stored.
        completed=now()
        receipt={'forecast_ref':ref,'started_at':started.isoformat(),'completed_at':completed.isoformat(),
                 'status':'COMMITTED_PREDEADLINE' if completed<time_of(f['game']) else 'LATE_NOT_LOCKABLE'}
        receipt_path=Path(root)/BASE/'scoring-receipts'/(ref['sha256']+'.json')
        if not receipt_path.exists():save(receipt_path,receipt,immutable=True)
        refs[gid]=ref
    save(operation_path,{'state':'SCORING_COMMITTED','preparation_ref':preparation_ref,'fit_ref':fit_ref,'forecasts':refs},immutable=True)
    return refs


def read_fit(root,ref):
    from .lineage import read_artifact
    if ref['path'].startswith(BASE+'/shadow-fits/'):
        artifact=load(root,ref,'shadow-fits')
        if artifact.get('role')!='SHADOW_WEIGHT_ONLY':raise ValueError('Unqualified shadow fit')
        return settings(artifact)
    return read_artifact(root,ref)


def fit_available_at(root,ref,artifact=None):
    """New fits require a clock read after the fit's durable write.

    Legacy artifacts retain their declared issuance convention, explicitly; this
    cannot manufacture physical availability evidence for historical releases.
    """
    import json
    from pathlib import Path
    artifact=read_fit(root,ref) if artifact is None else artifact
    if not ref['path'].startswith(BASE+'/shadow-fits/'):
        return timestamp(artifact['issued_at'])
    receipt=json.loads((Path(root)/BASE/'fit-availability'/(ref['sha256']+'.json')).read_bytes())
    if receipt.get('fit_ref')!=ref or receipt.get('status')!='DURABLY_STORED_NOT_ACTIVATED':
        raise ValueError('Fit lacks matching durable availability')
    completed=timestamp(receipt['available_at'])
    if (completed<timestamp(artifact['fit_started_at'])
            or completed<timestamp(artifact['computation_completed_at'])
            or receipt.get('intent_sha256')!=artifact.get('intent_sha256')):
        raise ValueError('Fit availability chronology or identity differs')
    return completed


def verify_forecast(root,forecast_ref):
    """Reconcile stored values with exact retained inputs before first lock."""
    import json
    from pathlib import Path
    from .lineage import read_artifact
    forecast=load(root,forecast_ref,'forecasts')
    prepared=load(root,forecast['preparation_ref'],'preparations')
    artifact=read_fit(root,forecast['fit_ref'])
    expected=score(prepared,artifact,read_artifact(root,artifact['shapes']))[forecast['game_id']]
    if any(forecast.get(k)!=v for k,v in expected.items()):raise ValueError('Stored forecast differs from its preparation/fit')
    if prepared['state']['method']['elo_hfa']!=artifact.get('elo_hfa'):raise ValueError('Forecast state/fit differs')
    if fit_available_at(root,forecast['fit_ref'],artifact)>timestamp(prepared['prepared_at']):raise ValueError('Fit unavailable at preparation time')
    state,body=cutoff_state.restore(root,prepared['state']['state_ref'])
    if state.identity()!=prepared['state']['state_sha256'] or body['cutoff_at']!=prepared['state']['cutoff_at']:
        raise ValueError('Forecast retained state differs')
    if timestamp(body['created_at'])>timestamp(prepared['prepared_at']):raise ValueError('State unavailable at preparation time')
    receipt=json.loads((Path(root)/BASE/'scoring-receipts'/(forecast_ref['sha256']+'.json')).read_bytes())
    if (receipt['forecast_ref']!=forecast_ref or receipt['status']!='COMMITTED_PREDEADLINE'
            or timestamp(receipt['completed_at'])>=time_of(forecast['game'])
            or timestamp(receipt['started_at'])<timestamp(prepared['prepared_at'])
            or timestamp(receipt['completed_at'])<timestamp(receipt['started_at'])):
        raise ValueError('Forecast lacks predeadline scoring commit')
    return forecast


def commit_shadow_lock(root,forecast_ref,at):
    import json,re
    from pathlib import Path
    from .storage import save
    at=timestamp(at);forecast=load(root,forecast_ref,'forecasts');deadline=time_of(forecast['game'])
    if at<deadline:raise ValueError('Lock deadline not reached')
    lockable(forecast,deadline)
    gid=forecast['game_id']
    if not re.fullmatch('[A-Za-z0-9_]{1,80}',gid):raise ValueError('Invalid lock game id')
    path=Path(root)/BASE/'locks'/(gid+'.json')
    if path.exists():
        prior=json.loads(path.read_bytes())
        if prior['forecast_ref']!=forecast_ref:raise ValueError('Frozen shadow forecast differs')
        return prior
    verify_forecast(root,forecast_ref)
    result={'game_id':gid,'forecast_ref':forecast_ref,'logical_lock_at':deadline.isoformat(),
            'committed_at':at.isoformat(),'role':'SHADOW_LOCK','not_production':True}
    save(path,result,immutable=True)
    return result


def refit_recorded(root,state_ref,training_ref,parent_ref,closeout_path,*,at):
    """Verify source publication and state provenance before weight-only arithmetic."""
    from pathlib import Path
    import json
    from .storage import save
    from engine.forecast_system.calendar import PACIFIC
    from scripts.closeout_publish import require_published
    at=timestamp(at)
    path=Path(closeout_path).resolve();root=Path(root).resolve()
    if path.parent!=root/'outputs/cadence-v2/closeouts':raise ValueError('Unapproved closeout path')
    cut=dt.datetime.combine(dt.date.fromisoformat(path.stem),dt.time(6),PACIFIC)
    closed=require_published(root,path,at)
    if closed.get('schema')!='closeout-publication-v2':raise ValueError('Acknowledged closeout required')
    ack=json.loads((path.parent/'acknowledgments'/path.name).read_bytes())
    request={'state_ref':state_ref,'training_ref':training_ref,'parent_ref':parent_ref,
             'closeout_ref':{'path':str(path.relative_to(root)),'sha256':cutoff_state.obs.sha(path.read_bytes())}}
    intent_path=root/BASE/'refit-intents'/path.name
    operation_path=root/BASE/'refit-operations'/path.name
    calculation_path=root/BASE/'refit-calculations'/path.name
    if intent_path.exists():
        intent=json.loads(intent_path.read_bytes())
        if intent['request']!=request:raise ValueError('Refit operation payload changed')
        execution=timestamp(intent['fit_at'])
        if execution>at:raise ValueError('Refit intent is in the future')
    else:
        execution=at
        intent={'request':request,'fit_at':execution.isoformat(),'label_observation_ref':cutoff_state.obs.current(root)}
        save(intent_path,intent,immutable=True)
    if operation_path.exists():
        operation=json.loads(operation_path.read_bytes())
        if operation['intent_sha256']!=cutoff_state.sha(intent):raise ValueError('Refit operation identity differs')
        fit_available_at(root,operation['fit_ref'])
        return operation['fit_ref']
    if calculation_path.exists():
        calculation=json.loads(calculation_path.read_bytes())
        if calculation['intent_sha256']!=cutoff_state.sha(intent):raise ValueError('Refit calculation identity differs')
        artifact=read_fit(root,calculation['fit_ref'])
        if artifact.get('intent_sha256')!=cutoff_state.sha(intent):raise ValueError('Refit calculation fit differs')
        save(root/BASE/'fit-availability'/(calculation['fit_ref']['sha256']+'.json'),calculation,immutable=True)
        fit_available_at(root,calculation['fit_ref'],artifact)
        save(operation_path,{'intent_sha256':cutoff_state.sha(intent),'fit_ref':calculation['fit_ref']},immutable=True)
        return calculation['fit_ref']
    state,body=cutoff_state.restore(root,state_ref)
    if timestamp(body['created_at'])>execution:raise ValueError('Refit state not yet committed')
    if timestamp(closed['published_at'])<timestamp(body['created_at']):raise ValueError('Closeout predates assimilation completion')
    parent=read_fit(root,parent_ref);settings(parent)
    if fit_available_at(root,parent_ref,parent)>=execution:raise ValueError('Parent fit unavailable at refit')
    if parent.get('elo_hfa')!=body['method']['elo_hfa']:raise ValueError('Refit state method differs')
    training=load(root,training_ref,'training')
    if training.get('schema')!='retained-pregame-training-v1':raise ValueError('Retained pregame training ledger required')
    selected,finals,_,_=cutoff_state.available(root,intent['label_observation_ref'],execution)
    _,_,transaction=cutoff_state.snapshot_before(root,selected,execution)
    final_hashes,_=cutoff_state.fingerprints(finals,{})
    labels={gid:{'home_points':g['home_score'],'away_points':g['away_score'],
                 'kickoff_at':schedule_kickoff(g['gameday'],g['gametime']).isoformat(),
                 'available_at':transaction['collected_at'],'source_sha256':final_hashes[gid]} for gid,g in finals.items()}
    event={**closed,'evidence':'VERIFIED_SOURCE_PUBLICATION','confirmed_at':ack['confirmed_at'],
           'receipt_sha256':cutoff_state.obs.sha(path.read_bytes())}
    result=refit(training['rows'],labels,parent,cutoff=cut,fit_at=execution,through_season=closed['season'],through_week=closed['week'],closeout=event)
    computed=now()
    if computed<execution:raise ValueError('Refit completion precedes its start')
    result.update(parent_fit_ref=parent_ref,state_ref=state_ref,training_ref=training_ref,label_observation_ref=selected,
                  fit_started_at=execution.isoformat(),computation_completed_at=computed.isoformat(),
                  created_at=computed.isoformat(),issued_at=None,intent_sha256=cutoff_state.sha(intent),
                  publication_limit='Source-repository acknowledgment verified; public-surface qualification remains required before activation.')
    ref=store(root,'shadow-fits',result)
    completed=now()
    if completed<computed:raise ValueError('Refit durable clock precedes computation')
    calculation={'intent_sha256':cutoff_state.sha(intent),'fit_ref':ref,'available_at':completed.isoformat(),
                 'status':'DURABLY_STORED_NOT_ACTIVATED'}
    save(calculation_path,calculation,immutable=True)
    save(root/BASE/'fit-availability'/(ref['sha256']+'.json'),calculation,immutable=True)
    save(operation_path,{'intent_sha256':cutoff_state.sha(intent),'fit_ref':ref},immutable=True)
    return ref
