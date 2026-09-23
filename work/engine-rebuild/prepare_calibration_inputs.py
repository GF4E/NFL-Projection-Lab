"""Assemble previously computed histories; never fit or score a calibration arm."""
import collections, datetime as dt, gzip, hashlib, json, os
from pathlib import Path
import resource, signal, subprocess, sys, time
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from engine.projection.model import hash_value
from engine.projection.storage import write_bytes
from engine.forecast_system.calendar import schedule_kickoff, timestamp, PACIFIC
from engine.forecast_system.cadence import cutoff_before
from check_calibration_sources import load, ref

EARLY='work/engine-rebuild/early-forecasts/4222f29cde17fc765fe4370404205589d8df0b9205cfd00b6b00d5dc97c51129.json.gz'
OUT=ROOT/'work/engine-rebuild/calibration-inputs'

def availability(game):
    return schedule_kickoff(game['gameday'],game['gametime'])+dt.timedelta(hours=4)

def manifest(method,training,at,schedule):
    ids=sorted(training)
    if not ids or len(ids)!=len(set(ids)): raise ValueError('Unique nonempty support population required')
    latest=max(availability(schedule[gid]) for gid in ids)
    if latest>=timestamp(at): raise ValueError('Training result unavailable at method availability')
    return {'method_sha256':method,'available_at':timestamp(at).isoformat(),
            'training_game_ids':ids,'last_label_available_at':latest.isoformat()}

def history_row(game,record,evidence,schedule):
    g=schedule[game['game_id']]; issue=schedule_kickoff(g['gameday'],g['gametime'])-dt.timedelta(minutes=75)
    if timestamp(record['available_at'])>=issue: raise ValueError('Method unavailable at issuance')
    if game['game_id'] in record['training_game_ids']: raise ValueError('Target in its own training population')
    if game.get('issuance_at') and timestamp(game['issuance_at'])!=issue: raise ValueError('Saved issuance differs')
    row={k:game[k] for k in ('game_id','season','home','away','actual_home','actual_away')}
    for side in ('home','away'):
        actual=float(g[side+'_score'])
        if actual<0 or actual!=int(actual) or row['actual_'+side]!=actual: raise ValueError('Actual score mismatch')
    row.update(issuance_at=issue.isoformat(),label_available_at=availability(g).isoformat(),fit_evidence_sha256=evidence)
    return row

def own_history(bundles,method,schedule):
    history=[]; fits={}; parents={}; seen=set()
    for bundle_ref,bundle in bundles:
        index={}
        for f in bundle['fits']:
            if hash_value(f['fit'])!=f['fit_sha256']: raise ValueError('Coefficient hash mismatch')
            if f['fit']['groups']!=['calibration','elo'] or f['fit']['penalty']!=10: raise ValueError('Point method settings changed')
            m=manifest(method,f['training_games'],f['available_at'],schedule); identity=hash_value(m)
            key=(f['fit_sha256'],f['available_at'])
            if key in index: raise ValueError('Ambiguous fit execution')
            index[key]=(identity,m)
            fits[identity]=m
            parents[identity]={'kind':'FITTED_RIDGE','coefficient_sha256':f['fit_sha256'],
                               'training_hash':f['fit']['training_hash'],'source':bundle_ref,
                               'execution_at':f['at'],'availability_evidence':'RECONSTRUCTED_TEN_MINUTE_ASSUMPTION'}
        for g in bundle['games']:
            key=(g['fit_sha256'],g.get('fit_available_at',g.get('fit_at')))
            if key not in index: raise ValueError('Missing exact saved fit execution')
            identity,m=index[key]
            if g['training_hash']!=parents[identity]['training_hash']: raise ValueError('Game training identity differs')
            if g['game_id'] in seen: raise ValueError('Duplicate historical game')
            seen.add(g['game_id']);history.append(history_row(g,m,identity,schedule))
    return {'history':sorted(history,key=lambda r:r['game_id']),'fits':fits,'parents':parents}

def run():
    if os.environ.get('OPENBLAS_NUM_THREADS')!='1': raise ValueError('Single worker required')
    start=time.monotonic();signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(TimeoutError('45 minute limit')));signal.alarm(2700)
    plan=ref('work/engine-rebuild/CALIBRATION-INPUTS-PLAN.md')
    code=[ref(p) for p in ('work/engine-rebuild/prepare_calibration_inputs.py','engine/projection/calibration_history.py',
                          'engine/projection/cutoff_pipeline.py','engine/projection_v3/model.py','engine/projection_v3/qualify.py',
                          'engine/projection/cutoff_features.py','engine/elo.py','engine/elo_hfa.py',
                          'engine/forecast_system/calendar.py','engine/forecast_system/cadence.py')]
    er=ref(EARLY);early=load(er); rr=load(ref('work/engine-rebuild/hourly-catchup/current-ref.json')); replay=load(rr)
    dsr=load(ref('work/engine-rebuild/donor-qualification-current.json'));ds=load(dsr); dr=ds['corrected'];donor=load(dr)
    inputs=load(early['sources']['inputs']);schedule={}
    for g in inputs['schedule']+load(replay['sources']['schedule']):
        if g['game_id'] in schedule:
            old=schedule[g['game_id']]
            if any(old[k]!=g[k] for k in ('gameday','gametime')): raise ValueError('Conflicting played schedule')
            if any(float(old[s+'_score'])!=float(g[s+'_score']) for s in ('home','away')): raise ValueError('Conflicting finals')
        schedule[g['game_id']]=g
    active=load(early['sources']['active_fit']); other=load(replay['sources']['active_method'])
    if active['groups']!=other['groups'] or active['selected']!=other['selected']: raise ValueError('Warmup/main method mismatch')
    own_descriptor={'family':'fixed_calibration_elo_ridge','groups':active['groups'],'selected':active['selected'],
                    'calendar':'Friday Monday Tuesday 06 Pacific; strict kickoff+4h; hourly refit catch-up',
                    'elo':'qualified prior-season HFA policy','feature_code':[r for r in code if r['path'].startswith('engine/')],
                    'epochs':{'warmup':'2011 initialization / 2012 first training; forecasts 2013-2015',
                              'main':'2014 initialization / 2015 first training; forecasts 2016-2025'},
                    'status':'NON_AUTHORITATIVE_RECONSTRUCTION'}
    legacy_descriptor={'family':'legacy_adaptive_donor','qualification':dsr,'policy':'unchanged prior-season group/settings selection',
                       'calendar':'corrected three-cutoff base features; conservative personnel history cap',
                       'warmup':'parameter-free baseline 2013-2015, not included in later qualification selection',
                       'status':'NON_AUTHORITATIVE_RECONSTRUCTION'}
    descriptors={'own':own_descriptor,'legacy':legacy_descriptor};methods={k:hash_value(v) for k,v in descriptors.items()}
    own=own_history([(er,early),(rr,replay)],methods['own'],schedule)
    initial={f['season']:f for b in (early,replay) for f in b['fits'] if f['through_week']==0}
    legacy={'history':[],'fits':{},'parents':{}}
    for year in range(2013,2026):
        if year<2016:
            support=initial[year]['training_games']; origin=er; coefficient=None
            rows=[{**g,'home':g['legacy_donor_home'],'away':g['legacy_donor_away']} for g in early['games'] if g['season']==year]
            kind='PARAMETER_FREE_BASELINE_WITH_PRIOR_INITIALIZATION_SUPPORT'
        else:
            f=next(f for f in donor['fits'] if f['season']==year);support=f['training_game_ids'];origin=dr;coefficient=hash_value(f['fit'])
            rows=[g for g in donor['forecasts'] if g['season']==year];kind='RECONSTRUCTED_ANNUAL_RIDGE'
        m=manifest(methods['legacy'],support,initial[year]['available_at'],schedule);identity=hash_value(m)
        legacy['fits'][identity]=m
        legacy['parents'][identity]={'kind':kind,'coefficient_sha256':coefficient,'source':origin,
                                    'availability_evidence':'ASSUMED_SEASON_INITIAL_TUESDAY_PLUS_TEN_MINUTES; NOT_ORIGINAL_RECEIPT'}
        legacy['history'] += [history_row(g,m,identity,schedule) for g in rows]
    legacy['history'].sort(key=lambda r:r['game_id'])
    if [r['game_id'] for r in own['history']]!=[r['game_id'] for r in legacy['history']]: raise ValueError('History population mismatch')
    reg=load(ref('work/series-registry/catalog.json')); control=next(r for r in reg['series'] if r['path']==reg['authoritative_control'] and r['authoritative']);ids={r['game_id'] for r in load(control)}
    if {g['game_id'] for g in replay['games']}!=ids: raise ValueError('Evaluation game population differs')
    folds=[]
    for year in range(2016,2026):
        prior=[r['game_id'] for r in own['history'] if r['season']<year]
        week9=[g for g in replay['games'] if g['season']==year and int(schedule[g['game_id']]['week'])==9]
        at=cutoff_before(min(timestamp(g['issuance_at']) for g in week9))+dt.timedelta(minutes=10)
        if at.astimezone(PACIFIC).weekday()!=1: raise ValueError('Week9 plan not Tuesday')
        folds.append({'season':year,'expected_game_ids':prior,'offseason_planned_at':initial[year]['available_at'],
                      'week9_planned_at':at.isoformat(),'current_season_excluded':True})
    # Preparing evidence is not permission to call calibration_history.build on these real inputs.
    result={'schema':'calibration-history-inputs-v1','status':'PREPARATION_NOT_AUTHORITY_OR_CALIBRATION_FIT',
            'methods':{k:{'sha256':methods[k],'descriptor':v} for k,v in descriptors.items()},
            'roles':{'own':own,'legacy':legacy},'folds':folds,
            'evaluation_game_ids':sorted(ids),'sources':{'early':er,'point_replay':rr,'legacy_summary':dsr,
                'legacy_donor':dr,'schedule':replay['sources']['schedule'],'early_inputs':early['sources']['inputs']},
            'authoritative_control_unchanged':control,'plan':plan,'code':code,
            'limitations':['Historical availability assumed; not AS_ISSUED','No calibration estimated or comparative metric viewed',
                          'Warmup/method availability/personnel window Tier2 flags retained','Parameter-free warmup has no coefficient fit'],
            'elapsed_seconds':time.monotonic()-start,'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)}
    if result['peak_rss_bytes']>4*1024**3: raise MemoryError('4 GiB limit')
    if code!=[ref(r['path']) for r in code] or plan!=ref(plan['path']): raise ValueError('Preparation code changed')
    raw=gzip.compress(json.dumps(result,sort_keys=True,separators=(',',':'),allow_nan=False).encode(),mtime=0)
    path=OUT/(hashlib.sha256(raw).hexdigest()+'.json.gz');write_bytes(path,raw,immutable=True)
    output=ref(str(path.relative_to(ROOT)));(ROOT/'work/engine-rebuild/calibration-inputs-current.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({'artifact':output,'games_per_history':len(own['history']),'own_fits':len(own['fits']),
                      'legacy_method_records':len(legacy['fits']),'planned_fold_counts':{f['season']:len(f['expected_game_ids']) for f in folds},
                      'elapsed_seconds':result['elapsed_seconds'],'peak_rss_bytes':result['peak_rss_bytes']},indent=2));signal.alarm(0)

if __name__=='__main__':run()
