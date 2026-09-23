"""Historical E-CAL numerical worker. No publication or method activation.

Use run() for repository evidence. numerical() is a pure fixture-capable worker;
its outputs alone never constitute registration, authority or release evidence.
"""
import datetime as dt
import math
import time
import numpy as np

from engine import scoring
from engine.forecast_system.calendar import timestamp
from engine.projection_experiments import _calibration_reasons, digest, POINT_TOLERANCE
from engine.projection_v3.qualify import block_interval
from . import calibration_admission as admission, calibration_history as history
from .distribution import pmf

ARMS={'control':'legacy','candidate':'own'}
TARGETS=('team','margin','total')


def mean(values):return math.fsum(values)/len(values)


def scored(mass,point,actual,intervals):
    history.finite(point);history.finite(actual)
    pit=math.fsum(p for x,p in mass.items() if x<actual)+.5*mass.get(actual,0.)
    if not -1e-12<=pit<=1+1e-12:raise ValueError('Invalid PIT probability')
    result={'point':point,'actual':actual,'error':point-actual,'absolute_error':abs(point-actual),
            'crps':scoring.pmf_crps(mass,actual),
            'pit':min(1.,max(0.,pit))}
    for level in (50,80):
        lo,hi=intervals[str(level)]
        result[str(level)]={'lower':lo,'upper':hi,'hit':lo<=actual<=hi,'width':hi-lo,
            'interval_score':scoring.interval_score(lo,hi,actual,level/100)}
    return result


def score_game(game,forecast,bank):
    targets={}
    for side in ('home','away'):
        field=side+'_points'
        targets[side]=scored(pmf(bank['shapes']['team_points'],forecast[field]),forecast[field],
                            game['actual_'+side],forecast['intervals'][field])
    for target,actual in [('margin',game['actual_home']-game['actual_away']),
                          ('total',game['actual_home']+game['actual_away'])]:
        targets[target]=scored(pmf(bank['shapes'][target],forecast[target]),forecast[target],
                              actual,forecast['intervals'][target])
    probability=forecast['home_win_probability']
    outcome=1. if game['actual_home']>game['actual_away'] else 0. if game['actual_home']<game['actual_away'] else .5
    return {'team':[targets['home'],targets['away']], 'margin':[targets['margin']], 'total':[targets['total']],
            'winner':{'probability':probability,'outcome':outcome,'brier':scoring.brier(probability,outcome)}}


def summarize(records,arm):
    out={'games':len(records)}
    for target in TARGETS:
        rows=[row for r in records for row in r['scores'][arm][target]]
        out[target]={'n':len(rows),'mae':mean([r['absolute_error'] for r in rows]),
            'rmse':math.sqrt(mean([r['error']**2 for r in rows])), 'bias':mean([r['error'] for r in rows]),
            'crps':mean([r['crps'] for r in rows]),
            'projected_sd':float(np.std([r['point'] for r in rows])),
            'actual_sd':float(np.std([r['actual'] for r in rows])),
            'pit_counts':np.histogram([r['pit'] for r in rows],bins=np.linspace(0,1,11))[0].tolist()}
        for level in ('50','80'):
            hits=sum(r[level]['hit'] for r in rows)
            out[target][level]={'hits':hits,'n':len(rows),'coverage':hits/len(rows),
                'width':mean([r[level]['width'] for r in rows]),
                'interval_score':mean([r[level]['interval_score'] for r in rows])}
    winners=[r['scores'][arm]['winner'] for r in records]
    out['winner']={'n':len(winners),'brier':mean([r['brier'] for r in winners]),'reliability':[]}
    for i in range(10):
        rows=[r for r in winners if min(9,int(r['probability']*10))==i]
        out['winner']['reliability'].append({'bin':i,'n':len(rows),
            'forecast':mean([r['probability'] for r in rows]) if rows else None,
            'observed':mean([r['outcome'] for r in rows]) if rows else None})
    return out


def uncertainty(records,settings):
    if settings!=admission.UNCERTAINTY:raise ValueError('Unregistered uncertainty procedure')
    # Each observation is a paired game, never an independently resampled team.
    delta=np.array([mean([s['crps'] for s in r['scores']['control']['team']])-
                    mean([s['crps'] for s in r['scores']['candidate']['team']]) for r in records])
    reps=settings['replicates'];seed=settings['seed'];rng=np.random.default_rng(seed)
    draws=np.array([delta[rng.integers(0,len(delta),len(delta))].mean() for _ in range(reps)])
    years=sorted({r['season'] for r in records})
    annual=[delta[[r['season']==year for r in records]] for year in years]
    sums=np.array([x.sum() for x in annual]);counts=np.array([len(x) for x in annual])
    rng=np.random.default_rng(seed);idx=rng.integers(0,len(years),(reps,len(years)))
    season_draws=sums[idx].sum(axis=1)/counts[idx].sum(axis=1)
    def bounds(values):return {'lower95':float(np.quantile(values,.025)), 'upper95':float(np.quantile(values,.975))}
    return {'estimand':settings['estimand'],'difference':float(delta.mean()),'settings':settings,
        'paired_games':bounds(draws),'three_week_blocks':block_interval(records,delta,seed=seed,reps=reps),
        'whole_seasons':{**bounds(season_draws),'seasons':len(years),'limited_season_count':True},
        'leave_one_season_out':{str(y):float(delta[[r['season']!=y for r in records]].mean())
                               if len(years)>1 else None for y in years},
        'interpretation':'Descriptive historical development uncertainty; no additional release gate.'}


def numerical(admitted,weeks,*,checkpoint=lambda:None):
    if admitted.get('state')!='ADMITTED_TO_CALIBRATION_FITTING':raise ValueError('Admission required')
    r=admitted['registration'];inputs=admitted['inputs'];control=sorted(admitted['control'],key=lambda g:g['game_id'])
    if r.get('uncertainty')!=admission.UNCERTAINTY:raise ValueError('Unregistered uncertainty procedure')
    if not control or [g['game_id'] for g in control]!=inputs['evaluation_game_ids']:
        raise ValueError('Changed evaluation population')
    ids=[g['game_id'] for g in control]
    if len(ids)!=len(set(ids)) or any(type(weeks.get(gid)) is not int or not 1<=weeks[gid]<=22 for gid in ids):
        raise ValueError('Unique games and explicit NFL weeks required')
    own={g['game_id']:g for g in inputs['roles']['own']['history']}
    method=inputs['methods']['own']['sha256'];banks={};forecasts={arm:{} for arm in ARMS}
    folds=sorted(inputs['folds'],key=lambda f:f['season'])
    if [f['season'] for f in folds]!=sorted({g['season'] for g in control}):raise ValueError('Fold population differs')
    for fold in folds:
        checkpoint();year=fold['season']
        off=timestamp(fold['offseason_planned_at']);mid=timestamp(fold['week9_planned_at'])
        if off>=mid or fold.get('current_season_excluded') is not True:raise ValueError('Calibration cadence/window differs')
        for arm,role in ARMS.items():
            source=inputs['roles'][role]
            for cadence,at in [('OFFSEASON',off),('WEEK9',mid)]:
                checkpoint()
                bank=history.build(source['history'],source['fits'],expected_game_ids=fold['expected_game_ids'],
                    donor_method_sha256=inputs['methods'][role]['sha256'],point_method_sha256=method,
                    relation='OWN_LINEAGE' if role=='own' else 'DECLARED_LEGACY_DONOR',target_season=year,
                    fitted_at=at.isoformat(),cadence=cadence,source_refs=[r['inputs']])
                banks[bank['sha256']]=bank
                batch=[]
                for g in control:
                    if g['season']!=year:continue
                    issue=timestamp(own[g['game_id']]['issuance_at'])
                    if issue<=off:raise ValueError('Offseason bank unavailable at issuance')
                    if ('WEEK9' if issue>mid else 'OFFSEASON')!=cadence:continue
                    if any(not admission.finite(g[k]) for k in ('home','away','actual_home','actual_away')):
                        raise ValueError('Finite scores required')
                    if any(g['actual_'+s]<0 or int(g['actual_'+s])!=g['actual_'+s] for s in ('home','away')):
                        raise ValueError('Nonnegative integer finals required')
                    points={'home_points':g['home'],'away_points':g['away'],'margin':g['home']-g['away'],
                            'total':g['home']+g['away']}
                    batch.append({'game_id':g['game_id'],'season':year,'issuance_at':issue.isoformat(),'points':points})
                if batch:
                    attached=history.attach_many(batch,bank,expected_sha256=bank['sha256'],point_method_sha256=method)
                    for item in batch:
                        got=attached[item['game_id']]
                        if any(not admission.finite(got[k]) or abs(got[k]-v)>POINT_TOLERANCE for k,v in item['points'].items()):
                            raise ValueError('POINT_FORECAST_CHANGED_OUT_OF_SCOPE')
                    forecasts[arm].update(attached)
    if any(sorted(forecasts[a])!=ids for a in ARMS):raise ValueError('Incomplete calibrated population')
    # No target outcome is passed to attachment; it is used here for scoring.
    records=[]
    for g in control:
        checkpoint();pair={arm:forecasts[arm][g['game_id']] for arm in ARMS}
        records.append({'game_id':g['game_id'],'season':g['season'],'week':weeks[g['game_id']],
            'issuance_at':own[g['game_id']]['issuance_at'],'forecasts':pair,
            'scores':{arm:score_game(g,pair[arm],banks[pair[arm]['calibration_sha256']]) for arm in ARMS}})
    def summary(rows):return {arm:summarize(rows,arm) for arm in ARMS}
    pooled=summary(records);old,new=pooled['control'],pooled['candidate']
    evidence={'before_team_crps':old['team']['crps'],'after_team_crps':new['team']['crps'],
        'before_team_mae':old['team']['mae'],'after_team_mae':new['team']['mae'],
        'baseline_game_ids':ids,'candidate_game_ids':ids,'point_forecasts':[],
        'coverage':{t:{l:new[t][l]['coverage'] for l in ('50','80')} for t in TARGETS}}
    for name,values in [('before_interval_score',old),('after_interval_score',new)]:
        evidence[name]={t:{l:values[t][l]['interval_score'] for l in ('50','80')} for t in TARGETS}
    for rec in records:
        values={side:{name:rec['forecasts'][arm][name+'_points' if name in ('home','away') else name]
                      for name in ('home','away','margin','total')} for side,arm in [('before','control'),('after','candidate')]}
        evidence['point_forecasts'].append({'game_id':rec['game_id'],**values})
    checkpoint();uncertainty_result=uncertainty(records,r['uncertainty']);checkpoint()
    return {'schema':'calibration-numerics-v1','population':'HISTORICAL_DEVELOPMENT','activates_method':False,
        'registration_sha256':r['sha256'],'input_ref':r['inputs'],'baseline_hash':r['baseline_hash'],
        'banks':banks,'records':records,'pooled':pooled,
        'relative_team_crps_improvement':(old['team']['crps']-new['team']['crps'])/old['team']['crps']
                                        if old['team']['crps']>0 else None,
        'annual':{str(y):summary([g for g in records if g['season']==y]) for y in sorted({g['season'] for g in records})},
        'weekly':{f'{y}-w{w}':summary([g for g in records if g['season']==y and g['week']==w])
                  for y,w in sorted({(g['season'],g['week']) for g in records})},
        'uncertainty':uncertainty_result,'numerical_gate_evidence':evidence,
        'numerical_gate_reasons':sorted(set(_calibration_reasons(r,evidence))),
        'release_eligibility':'NOT_ASSESSED',
        'limitations':['Not an untouched test; historical provider availability remains assumed.',
            'Separate empirical marginals and legacy point centers; no coherent mean migration claimed.',
            'Current as-issued comparison, review packet, resource qualification and release evidence are still required.']}


def run(root,registration_ref,*,clock=lambda:dt.datetime.now(dt.timezone.utc)):
    """Read-only qualified entry. No output files or activated release pointers."""
    started=time.monotonic();before=clock()
    checked=admission.preflight(root,registration_ref,at=before)
    schedule=admission.read(root,checked['inputs']['sources']['schedule'])
    if len({g['game_id'] for g in schedule})!=len(schedule):raise ValueError('Duplicate schedule game')
    weeks={g['game_id']:int(g['week']) for g in schedule}
    def checkpoint():
        if time.monotonic()-started>=2700:raise TimeoutError('45 minute calibration deadline')
    result=numerical(checked,weeks,checkpoint=checkpoint)
    # Re-read hashes, authority and current clock after computation, before return.
    finished=clock();admission.preflight(root,registration_ref,at=finished)
    result.update(started_at=before.isoformat(),completed_at=finished.isoformat(),
                  elapsed_seconds=time.monotonic()-started,prerequisites=checked['prerequisites'])
    return {**result,'sha256':digest(result)}
