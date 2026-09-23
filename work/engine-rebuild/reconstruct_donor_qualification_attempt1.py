"""Research-only reproduction of legacy adaptive selection on corrected inputs."""
import bisect, collections, datetime as dt, gc, gzip, hashlib, json, os
from pathlib import Path
import resource, signal, sys, time
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from engine.projection import cutoff_features, observations
from engine.projection.model import hash_value
from engine.projection.storage import write_bytes
from engine.projection_v3.qualify import Study, paired
from engine.projection_v3.model import fit, predict
from engine.projection_v3.personnel import NAMES
from engine.forecast_system.calendar import schedule_kickoff, timestamp
from engine.forecast_system.cadence import cutoff_before
from check_calibration_sources import load, ref
from check_legacy_donor import independent, before_only
OUT=ROOT/'work/engine-rebuild/donor-qualification'

def save(name,value):
    payload=gzip.compress(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode(),mtime=0)
    p=OUT/(name+'-'+hashlib.sha256(payload).hexdigest()+'.json.gz')
    write_bytes(p,payload,immutable=True)
    return ref(str(p.relative_to(ROOT)))

def select(prepared,role,expected=None):
    study=Study(prepared); decisions=[]; forecasts=[]; fits=[]; annual=[]
    for year in range(2016,2026):
        q=study.qualify(year); before_only(q,year)
        selected=study.evaluate(q['selected_groups'])['settings'][str(year)]
        if expected:
            a=expected[year]
            assert q['selected_groups']==a['selected_groups'],(role,year,'groups')
            assert selected==a['settings'],(role,year,'settings')
        training=study.train_rows(selected['decay'],year)
        test=study.test_rows(selected['decay'],year)
        f=fit(training,q['selected_groups'],selected['penalty'])
        independent_delta=independent(training,f)
        assert fit(list(reversed(training)),q['selected_groups'],selected['penalty'])==f
        assert not ({r['game_id'] for r in training}&{r['game_id'] for r in test})
        pp=paired(test,[predict(f,r['features'])['points'] for r in test])
        cached=[r for r in study.evaluate(q['selected_groups'])['predictions'] if r['season']==year]
        assert pp==cached
        decisions.append(q); forecasts+=pp
        fits.append({'season':year,'fit':f,'training_game_ids':sorted({r['game_id'] for r in training}),
                     'training_feature_hash':hash_value(training),'settings':selected})
        annual.append({'season':year,'games':len(pp),'groups':q['selected_groups'],'settings':selected,
                       'independent_fit_max_difference':independent_delta})
        checkpoint=save(role+'-'+str(year),{'decision':q,'annual':annual[-1],'fit':fits[-1],'forecasts':pp})
        print(role,year,q['selected_groups'],selected,checkpoint['sha256'],flush=True)
    return {'decisions':decisions,'forecasts':forecasts,'fits':fits,'annual':annual}

def run():
    assert os.environ.get('OPENBLAS_NUM_THREADS')=='1'
    signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(TimeoutError('45 minute ceiling')))
    signal.alarm(2700); start=time.monotonic()
    plan=ref('work/engine-rebuild/DONOR-QUALIFICATION-PLAN.md')
    code=[ref(p) for p in ('work/engine-rebuild/reconstruct_donor_qualification.py','engine/projection_v3/qualify.py',
        'engine/projection_v3/model.py','engine/projection/cutoff_features.py','engine/projection/features.py',
        'engine/forecast_system/calendar.py','engine/forecast_system/cadence.py','engine/projection_v3/personnel.py',
        'work/engine-rebuild/check_legacy_donor.py','work/engine-rebuild/check_calibration_sources.py')]
    exp_ref=ref('work/projection-v3/experiment.json'); exp=load(exp_ref); source=exp['source_manifest']
    registry=load(ref('work/series-registry/catalog.json'))
    control_ref=next(r for r in registry['series'] if r['path']==registry['authoritative_control'] and r['authoritative'])
    control=load(control_ref); ids={r['game_id'] for r in control}
    allgames=load(source['schedule']); lookup={g['game_id']:g for g in allgames}
    personnel=load(source['personnel']); dates=sorted({g['date'] for g in personnel['games']})
    completion_by_date={}; old_dates=0
    for g in personnel['games']:
        if g['season']<2014:
            assert g['date']<'2014-01-01' or g['season']==2013
            old_dates+=1; continue
        schedule=lookup[g['game_id']]
        end=schedule_kickoff(schedule['gameday'],schedule['gametime'])+dt.timedelta(hours=4)
        completion_by_date[g['date']]=max(completion_by_date.get(g['date'],end),end)
    recent_dates=sorted(completion_by_date); prefix=[]
    for date in recent_dates: prefix.append(max(prefix[-1],completion_by_date[date]) if prefix else completion_by_date[date])
    del personnel; gc.collect()
    cache_refs={}; prepared={}; retained={}; chronology={'checked_rows':0,'timestamped_charts':0,'untimestamped_charts':0,'pre2014_personnel_games':old_dates}
    for key in ['none','8']:
        candidates=list((ROOT/'work/projection-v3').glob('features-'+key+'-*.json.gz'))
        # The exact archive filenames are pinned in the successful donor audit and original preparation.
        filename={'none':'features-none-cc3d318ef8315397675c47735cceeb093c9b06f4b16178ac8b33e58778bcad28.json.gz',
                  '8':'features-8-da18e1cbc8a01399a35e4bfa64f76964f12fd2fcfb53bb75dd9261389e6901db.json.gz'}[key]
        cache_refs[key]=ref('work/projection-v3/'+filename); full=load(cache_refs[key])
        assert hash_value(full)==exp['feature_hashes'][key]
        rows=[]; extra={}
        for r in full:
            if not 2015<=r['season']<=2025 or r['actual_points'] is None or r['features']['baseline'] is None: continue
            g=lookup[r['game_id']]; issue=schedule_kickoff(g['gameday'],g['gametime'])-dt.timedelta(minutes=75); cut=cutoff_before(issue)
            p=r['personnel']; idx=bisect.bisect_left(recent_dates,p['history_before'])-1
            assert p['history_before']<=g['gameday']
            if idx>=0: assert prefix[idx]<cut,(r['row_id'],'personnel history after cutoff',prefix[idx],cut)
            for name in ['qb_chart','kicker_chart']:
                chart=p.get(name)
                if chart:
                    if chart.get('at'):
                        assert timestamp(chart['at'])<issue; chronology['timestamped_charts']+=1
                    else: chronology['untimestamped_charts']+=1
            chronology['checked_rows']+=1
            rows.append({k:r[k] for k in ('row_id','game_id','team','home','season','week','features','actual_points')})
            extra[r['row_id']]={'values':{n:r['features'][n] for n in [*NAMES,'wind']},'personnel':p}
        prepared[key]=rows; retained[key]=extra
        del full; gc.collect()
    original=select(prepared,'original',{a['season']:a for a in exp['annual']})
    donor=load(exp['oof']); assert original['forecasts']==donor
    original_ref=save('original',original)
    del original; prepared.clear(); gc.collect()
    games=[{k:g.get(k) for k in (*observations.GAME_KEYS,'source_hash')} for g in allgames if g['game_type']=='REG' and int(g['season'])<=2025]
    stats=[{k:r.get(k) for k in (*observations.STAT_FIELDS,'source_hash')} for r in load(source['team_games']) if int(r['season'])<=2025]
    stadium_ref=ref('config/stadiums.json'); features={}; features_refs={}
    for key in ['none','8']:
        built=cutoff_features.build(stats,games,load(stadium_ref),half_life=None if key=='none' else 8,
                                   mode='HISTORICAL_RECONSTRUCTION',minimum_season=2015,elo_hfa=None)
        rows=[]
        for r in built['rows']:
            if r['row_id'] not in retained[key]: continue
            g=lookup[r['game_id']]; actual=float(g['home_score'] if r['home'] else g['away_score'])
            r['features'].update(retained[key][r['row_id']]['values'])
            rows.append({**{k:r[k] for k in ('row_id','game_id','team','home','season','week','features')},'actual_points':actual})
        assert {r['row_id'] for r in rows}==set(retained[key])
        features[key]=rows
        features_refs[key]=save('features-'+key,{'rows':rows,'retained_provenance':retained[key],
                                               'state_lineage':built['lineage'],'source_manifest':source})
        del built; retained[key].clear(); gc.collect()
    corrected=select(features,'corrected')
    assert len(corrected['forecasts'])==2639 and {r['game_id'] for r in corrected['forecasts']}==ids
    for r in corrected['forecasts']:
        g=lookup[r['game_id']]; assert r['actual_home']==float(g['home_score']) and r['actual_away']==float(g['away_score'])
    corrected_ref=save('corrected',corrected)
    assert code==[ref(r['path']) for r in code] and plan==ref(plan['path']); load(control_ref)
    rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)
    assert rss<=4*1024**3
    summary={'status':'RECONSTRUCTED_NOT_AUTHORITATIVE','original':original_ref,'corrected':corrected_ref,
             'annual':corrected['annual'],'feature_artifacts':features_refs,'original_caches':cache_refs,
             'chronology':chronology,'plan':plan,'code':code,'experiment':exp_ref,'control_unchanged':control_ref,
             'elapsed_seconds':time.monotonic()-start,'peak_rss_bytes':rss,
             'limits':['Historical source availability unknown','No release comparison or calibration gate','Legacy admission thresholds only reconstruct old donor','Personnel horizon remains weekly and conservative']}
    summary_ref=save('summary',summary)
    (ROOT/'work/engine-rebuild/donor-qualification-current.json').write_text(json.dumps(summary_ref,indent=2)+'\n')
    print(json.dumps(summary,indent=2),flush=True); signal.alarm(0)

if __name__=='__main__': run()
