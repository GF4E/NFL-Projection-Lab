"""Read-only E-CAL admission before fitting; no registration, release or network IO."""
import datetime as dt
import gzip
import hashlib
import json
import math
import platform
from importlib.metadata import version
from pathlib import Path
from engine.forecast_system.calendar import PACIFIC, timestamp
from engine.projection_experiments import digest, CALIBRATION_GATE, POINT_TOLERANCE
from scripts.experiment_premise import verify as verify_premise
from scripts.closeout_publish import require_published
from .public_closeout import require_visible
from . import refit_release, pipeline_release

GATE={'primary':'team_points_CRPS','minimum_relative_improvement':.01,
      'coverage_tolerance':.03,'coverage_targets':['team','margin','total'],
      'levels':[50,80],'interval_score':'NO_WORSENING_EACH_TARGET_LEVEL'}
SETTINGS={'family':'EXISTING_EMPIRICAL_INTEGER','window':'PRIOR_COMPLETED_SEASONS',
          'residual_location':'RAW','dependence':'PAIRED_GAME_RESIDUALS',
          'rounding':'HALF_AWAY_FROM_ZERO','quantile':'LEFT_INVERSE',
          'ties':'HALF_TIE','negative_mass':'RETAIN_AND_REPORT','cadence':['OFFSEASON','WEEK9']}
UNCERTAINTY={'replicates':10000,'seed':9132026,'block_weeks':3,'interval':.95,
             'estimand':'mean_game_paired_team_CRPS_control_minus_candidate',
             'sensitivities':['within_season_moving_blocks','whole_seasons','leave_one_season_out']}
EXECUTION={'maximum_explicit_attempts':3,'lock_scope':'LOCAL_REPOSITORY',
           'retries':'EXPLICIT_ONLY','recovery':'SEAL_RETAINED_RESULT_ONLY'}
EVALUATOR_CODE=('engine/projection/calibration_admission.py','engine/projection/calibration_evaluate.py',
                'engine/projection/calibration_history.py','engine/projection/distribution.py',
                'engine/projection/model.py','engine/scoring.py','engine/projection_v3/qualify.py',
                'engine/projection_experiments.py','engine/forecast_system/calendar.py',
                'engine/projection/calibration_execute.py','engine/projection/storage.py',
                'scripts/projection_calibration.py','engine/projection/research_ledger.py',
                'engine/projection/calibration_report.py','engine/projection/calibration_json.py')


def environment():
    return {'python':platform.python_version(),'numpy':version('numpy'),'scoringrules':version('scoringrules')}


def checked_bytes(root,ref):
    if set(ref)!={'path','sha256'}: raise ValueError('Exact file reference required')
    root=Path(root).resolve();path=(root/ref['path']).resolve()
    if not path.is_relative_to(root): raise ValueError('Reference outside repository')
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=ref['sha256']: raise ValueError('Referenced bytes changed')
    return raw


def read(root,ref):
    raw=checked_bytes(root,ref)
    return json.loads(gzip.decompress(raw) if Path(ref['path']).suffix=='.gz' else raw)


def finite(value):
    return type(value) in (int,float) and math.isfinite(value)


def envelope(value):
    if set(value)!={'body','sha256'} or digest(value['body'])!=value['sha256']:
        raise ValueError('Weekly evidence envelope differs')
    return value['body']


def preflight(root,registration_ref,*,at):
    """Require bound historical inputs and operational prerequisites before fit.

    Caller must retain this proof and recheck before committing results. This
    function never estimates a residual table and never writes an artifact.
    """
    root=Path(root).resolve();now=timestamp(at);r=read(root,registration_ref)
    if r.get('sha256')!=digest({k:v for k,v in r.items() if k!='sha256'}): raise ValueError('Registration body changed')
    if (r.get('experiment')!='E-CAL-LINEAGE' or r.get('gate_policy')!=CALIBRATION_GATE
            or r.get('point_tolerance')!=POINT_TOLERANCE or r.get('candidates')!=['own_lineage_empirical']
            or r.get('gate')!=GATE or r.get('calibration_settings')!=SETTINGS
            or r.get('uncertainty')!=UNCERTAINTY or r.get('execution_policy')!=EXECUTION):
        raise ValueError('Registration changes adopted calibration contract')
    if r.get('evaluation_environment')!=environment():raise ValueError('Evaluator environment changed')
    refs=r.get('evaluation_code',[])
    if sorted(x['path'] for x in refs)!=sorted(EVALUATOR_CODE):raise ValueError('Complete evaluator code identity required')
    running_root=Path(__file__).resolve().parents[2]
    for ref in refs:
        checked_bytes(root,ref)
        checked_bytes(running_root,ref)
    for field in ('training_window','tuning','tie_break','disproving_conditions','baseline_hash','week'):
        if not r.get(field):raise ValueError('Incomplete preregistration')
    began=timestamp(r['registered_at']);local=began.astimezone(PACIFIC)
    if local.weekday()!=1 or local.hour<6 or began>=now:raise ValueError('Registration must precede execution on its Tuesday clock')
    deadline=dt.datetime.combine(local.date()+dt.timedelta(days=7),dt.time(6),PACIFIC)
    if timestamp(r['deadline_at'])!=deadline or now>=deadline:raise ValueError('Experiment clock expired or changed')
    checked_bytes(root,{'path':r['control'],'sha256':r['baseline_hash']})
    premise=verify_premise(r,root)
    catalog=json.loads((root/'work/series-registry/catalog.json').read_bytes())
    entries=[e for e in catalog['series'] if e['path']==r['control'] and e.get('authoritative') is True]
    if len(entries)!=1:raise ValueError('Ambiguous authoritative control')
    entry=entries[0]
    if entry['sha256']!=r['baseline_hash'] or entry.get('generated_at',entry.get('date_added'))!=r['generated_at']:
        raise ValueError('Control hash or generation date differs')
    inputs=read(root,r['inputs'])
    if inputs['schema']!='calibration-history-inputs-v1':raise ValueError('Unsupported history schema')
    if (entry.get('point_method_sha256')!=inputs['methods']['own']['sha256']
            or entry.get('source_history')!=inputs['sources']['point_replay']):
        raise ValueError('Corrected control authority not qualified for prepared method/history')
    for role in ('own','legacy'):
        m=inputs['methods'][role]
        if digest(m['descriptor'])!=m['sha256'] or r['method_hashes'][role]!=m['sha256']:
            raise ValueError('Calibration method identity differs')
    for ref in inputs['code']+[inputs['plan']]+list(inputs['sources'].values()):
        checked_bytes(root,ref)
    control=read(root,{'path':r['control'],'sha256':r['baseline_hash']})
    control=control['games'] if isinstance(control,dict) else control
    ids=sorted(g['game_id'] for g in control)
    if (not ids or len(ids)!=len(set(ids)) or ids!=r['population_game_ids'] or ids!=inputs['evaluation_game_ids']):
        raise ValueError('Unpaired or changed evaluation population')
    own={g['game_id']:g for g in inputs['roles']['own']['history']}
    if len(own)!=len(inputs['roles']['own']['history']):raise ValueError('Duplicate own history')
    for g in control:
        h=own[g['game_id']]
        for row in (g,h):
            for side in ('home','away'):
                actual=row['actual_'+side]
                if not finite(row[side]) or not finite(actual) or actual<0 or int(actual)!=actual:
                    raise ValueError('Finite points and nonnegative integer finals required')
        if h['season']!=g['season'] or any(h['actual_'+s]!=g['actual_'+s] for s in ('home','away')):
            raise ValueError('Control outcomes differ')
        if any(abs(h[s]-g[s])>POINT_TOLERANCE for s in ('home','away')):
            raise ValueError('Control points differ from prepared point history')
    seasons=sorted({g['season'] for g in control})
    if r['seasons']!=seasons or [f['season'] for f in inputs['folds']]!=seasons:raise ValueError('Evaluation seasons differ')
    # Closeout must be this Tuesday's completed and publicly verified release.
    expected=f'outputs/cadence-v2/closeouts/{local.date().isoformat()}.json'
    if r['closeout']['path']!=expected:raise ValueError('Stale or wrong weekly closeout')
    read(root,r['closeout'])
    closed=require_published(root,root/expected,began)
    proof=require_visible(root,root/expected,began)
    cutoff=dt.datetime.combine(local.date(),dt.time(6),PACIFIC)
    if closed.get('schema')!='closeout-publication-v2' or timestamp(closed['published_at'])<cutoff:
        raise ValueError('Verified post-cutoff Tuesday closeout required')
    if closed['week']!=r['week'] or not closed['all_games_graded']:raise ValueError('Closeout week incomplete or different')
    names={f"outputs/cadence-v2/weeks/{closed['season']}-w{closed['week']}/{n}.json" for n in ('scorecard','trend','season')}
    if set(closed['artifacts'])!=names:raise ValueError('All closeout surfaces required')
    op=f"work/projection-weekly-refit-v1/operations/{closed['season']}-w{closed['week']}"
    if (r['weekly_request']['path']!=op+'/request.json' or r['weekly_result']['path']!=op+'/result.json'):
        raise ValueError('Wrong weekly operation')
    request=envelope(read(root,r['weekly_request']));result=envelope(read(root,r['weekly_result']))
    if (request['closeout_ref']!=r['closeout'] or request['public_proof_sha256']!=digest(proof)
            or result['state']!='REFIT_COMPLETE' or result['request_sha256']!=digest(request)
            or result['through_week']!=closed['week']):raise ValueError('Weekly refit not bound to published closeout')
    fit=read(root,result['fit'])
    parent=read(root,request['parent_fit'])
    descriptor=inputs['methods']['own']['descriptor']
    if (any(fit.get(k)!=parent.get(k) or fit.get(k)!=descriptor.get(k) for k in ('groups','selected'))
            or not fit.get('elo_hfa') or fit['elo_hfa']!=parent.get('elo_hfa')
            or not all(finite(v) for v in fit['elo_hfa'].values())):
        raise ValueError('Weekly weight-only refit changes qualified point method')
    if (timestamp(request['fit_at'])<timestamp(proof['observed_at'])
            or timestamp(result['issued_at'])<timestamp(request['fit_at'])
            or timestamp(result['issued_at'])>=began or fit['issued_at']!=result['issued_at']):
        raise ValueError('Closeout/refit/registration order differs')
    if fit['through_week']!=closed['week'] or request['season']!=closed['season'] or request['week']!=closed['week']:
        raise ValueError('Weekly fit season/week differs')
    if fit.get('parent_fit_ref')!=request['parent_fit']:
        raise ValueError('Weekly fit parent differs from request')
    refit_release.verify(root,result['fit'])
    refit_release.compatible(root,request['parent_fit'],result['fit'])
    manifest=pipeline_release.read(root,result['release_ref'],'manifests')
    receipt=pipeline_release.read(root,result['release_receipt'],'receipts')
    intent=pipeline_release.read(root,receipt['intent_ref'],'intents')
    if (manifest.get('schema')!='projection-pipeline-release-v1' or manifest.get('mode')!='SCHEDULED'
            or manifest['fit_ref']!=result['fit']
            or receipt!={'intent_ref':receipt['intent_ref'],'state':'COMMITTED','target':result['release_ref']}
            or intent['target']!=result['release_ref'] or intent['expected_active']!=request['parent_release']
            or intent['fit_before']!=request['parent_fit'] or intent['operation_id']!=request['operation_id']
            or not timestamp(result['issued_at'])<=timestamp(intent['started_at'])<began):
        raise ValueError('Weekly release receipt or chronology differs')
    return {'state':'ADMITTED_TO_CALIBRATION_FITTING','premise':premise,'registration':r,'inputs':inputs,
            'control':control,'checked_at':now.isoformat(),'deadline_at':deadline.isoformat(),
            'prerequisites':{'registration':registration_ref,'closeout':r['closeout'],
                            'public_proof_sha256':digest(proof),'weekly_result':r['weekly_result']},
            'activates_method':False}


def evaluate(root,registration_ref,*,at,worker):
    """Single guarded entry; numerical worker is never called on failed admission."""
    admission=preflight(root,registration_ref,at=at)
    return worker(admission)
