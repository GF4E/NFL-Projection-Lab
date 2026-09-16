"""Registered E1 chronological replay. One worker, no activation or live writes."""
import datetime as dt
import gzip,hashlib,json,os,resource,signal,sys,time
from collections import defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import numpy as np
from engine.projection_v3.model import fit as ridge_fit,predict as ridge_predict
from engine.forecast_system.state_fit import fit as state_fit,replay
from engine.forecast_system.verification import verify,skill,reliability
from engine.projection.features import DIV
from scripts.e1_protocol import validate_population,influence
OUT=ROOT/'work/projection-governance-v2/e1'
NAMES=('linear','k4','k8','state_space')

def save(name,value):
    (OUT/name).write_text(json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n')

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def load_inputs():
    registration=json.loads((OUT/'registration.json').read_text())
    assert registration['sha256']==digest({k:v for k,v in registration.items() if k!='sha256'})
    for path,sha in registration['file_hashes'].items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha,path
    payload=(OUT/'features.json.gz').read_bytes()
    data=json.loads(gzip.decompress(payload))
    for rows in data.values():
        assert all(r['season']<=2025 for r in rows)
        rows.sort(key=lambda r:(r['season'],r['week'],r['row_id']))
    return registration,data

def paired_games(rows):
    by=defaultdict(dict);teams=sorted(DIV)
    for row in rows:by[row['game_id']][row['home']]=row
    result=[]
    for gid,pair in sorted(by.items()):
        if len(pair)!=2:continue
        h,a=pair[True],pair[False];f=h['features']
        if any(r['actual_points'] is None or r['features']['baseline'] is None for r in (h,a)):continue
        d=(f['drives']+f['opponent_drives'])/2
        result.append(dict(game_id=gid,season=h['season'],week=h['week'],home_index=teams.index(h['team']),away_index=teams.index(a['team']),
                           drives=np.array([d,d]),offset=np.zeros(2),actual=np.array([h['actual_points'],a['actual_points']]),
                           issuance_at=h['issuance_at'],assimilation_available_at=h['assimilation_available_at']))
    return result

def summary(records):
    out={}
    for target in ('team','margin','total'):
        rows=[r for r in records if r['target']==target]
        p=np.array([r['point'] for r in rows]);y=np.array([r['actual'] for r in rows])
        if not len(rows):continue
        out[target]=dict(n=len(rows),mae=float(np.mean(np.abs(y-p))),sigma=float(np.std(y-p,ddof=1)),bias=float(np.mean(y-p)),
            projected_sd=float(np.std(p)),actual_sd=float(np.std(y)),
            crps=float(np.mean([r['crps'] for r in rows])),pit_histogram=np.histogram([r['pit'] for r in rows],np.linspace(0,1,11))[0].tolist(),
            skill_climatology=skill(p,y,[r['climatology'] for r in rows]),
            skill_persistence=skill(p,y,[r['persistence'] for r in rows]),
            skill_last_season_team=skill(p,y,[r['prior_team'] for r in rows]),
            **{f'coverage_{level}':float(np.mean([r[str(level)]['covered'] for r in rows])) for level in (50,80)},
            **{f'interval_score_{level}':float(np.mean([r[str(level)]['interval_score'] for r in rows])) for level in (50,80)})
    rr=[r for r in records if r['target']=='margin']
    if rr:out['winner']=reliability([r['winner_probability'] for r in rr],[int(r['actual']>0) for r in rr])
    return out

def run():
    started=time.monotonic();signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(TimeoutError('45 minute E1 budget exceeded')));signal.alarm(2700)
    if os.environ.get('OPENBLAS_NUM_THREADS')!='1':raise ValueError('One BLAS worker required')
    if sys.platform.startswith('linux'):resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
    registration,data=load_inputs();base=data['linear'];staff=json.loads((ROOT/'config/staff_history.json').read_text());teams=sorted(DIV)
    changes={y:[next(r['preseason_variance_doubled'] for r in staff['records'] if r['season']==y and r['team']==t) for t in teams] for y in range(2013,2027)}
    games=paired_games(base);oof={name:[] for name in NAMES};fits=[];state_history=[dict(r,features=dict(r['features'])) for r in base if r['season']==2012]
    for year in range(2013,2026):
        train=[r for r in base if r['season']<year and r['actual_points'] is not None and r['features']['baseline'] is not None]
        league=sum(r['actual_points'] for r in train)/sum(r['actual_drives'] for r in train)
        train_games=[g for g in games if g['season']<year]
        print('E1 likelihood fold',year,'training games',len(train_games),flush=True)
        artifact=state_fit(train_games,league,changes)
        if not artifact['starts'][artifact['selected_start']]['success']:
            raise ValueError('Selected L-BFGS-B fit did not converge')
        artifact.update(season=year,league_ppd=league,trained_through_season=year-1)
        save(f'state-fit-{year}.json',artifact);fits.append(artifact)
        values=(artifact['q'],artifact['r'],artifact['retention'])
        _,state_predictions,_,_=replay([g for g in games if g['season']<=year],values,artifact['rho'],league,changes)
        prediction_by={r['game_id']:r for r in state_predictions if r['season']==year}
        state_rows=[]
        for row in base:
            if row['season']!=year or row['game_id'] not in prediction_by:continue
            modified=dict(row,features=dict(row['features']))
            modified['features']['baseline']=prediction_by[row['game_id']]['points'][0 if row['home'] else 1]
            state_rows.append(modified)
        populations={name:data[name] for name in ('linear','k4','k8')};populations['state_space']=state_history+state_rows
        for name,rows in populations.items():
            tr=[r for r in rows if r['season']<year and r['actual_points'] is not None and r['features']['baseline'] is not None]
            te=[r for r in rows if r['season']==year and r['actual_points'] is not None and r['features']['baseline'] is not None]
            fitted=ridge_fit(tr,['calibration','elo'],10)
            save(f'core-{name}-{year}.json',fitted)
            for row in te:
                p=ridge_predict(fitted,row['features'])['points']
                oof[name].append(dict(game_id=row['game_id'],row_id=row['row_id'],season=year,week=row['week'],home=row['home'],team=row['team'],point=p,actual=row['actual_points'],state_cutoff=row['state_cutoff'],issuance_at=row['issuance_at']))
        state_history+=state_rows
        print('E1 fold cached',year,flush=True)
    # Save every forecast before producing any comparative result.
    save('oof.json',oof);save('state-fits.json',fits)
    first=dt.datetime.now(dt.timezone.utc).isoformat();records={name:[] for name in NAMES}
    eligibility={name:{r['game_id'] for r in oof[name] if 2016<=r['season']<=2025} for name in NAMES}
    eligible=set.intersection(*eligibility.values())
    if any(ids!=eligible for ids in eligibility.values()):raise ValueError('Candidate game eligibility differs')
    population_path=OUT/'registered-population.json'
    if population_path.exists():
        expected=json.loads(population_path.read_text())['game_ids']
        for rows in oof.values():validate_population(rows,expected)
    chronology_sorted=sorted(base,key=lambda r:(r.get('assimilation_available_at','9999'),r['row_id']))
    for name in NAMES:
        for year in range(2016,2026):
            calibration=[r for r in oof[name] if year-3<=r['season']<year]
            pairs=defaultdict(dict)
            for r in calibration:pairs[r['game_id']][r['home']]=r['actual']-r['point']
            paired=[v for _,v in sorted(pairs.items()) if len(v)==2]
            he=np.array([p[True] for p in paired]);ae=np.array([p[False] for p in paired])
            assert len(paired)>0
            earlier=[r for r in base if r['season']<year and r['actual_points'] is not None]
            league_points=float(np.mean([r['actual_points'] for r in earlier]))
            test=defaultdict(dict)
            for r in oof[name]:
                if r['season']==year and r['game_id'] in eligible:test[r['game_id']][r['home']]=r
            for gid,pair in sorted(test.items()):
                h,a=pair[True],pair[False];baselines={}
                for side,row in pair.items():
                    prior=[r['actual_points'] for r in earlier if r['team']==row['team'] and r['season']==year-1]
                    previous=[r['actual_points'] for r in chronology_sorted if r['team']==row['team'] and r.get('assimilation_available_at','9999')<row.get('state_cutoff','0000') and r['actual_points'] is not None]
                    baselines[side]=dict(prior_team=float(np.mean(prior)),persistence=float(np.mean(previous[-4:])))
                entries=[('team',h['point']+he,h['point'],h['actual'],True),('team',a['point']+ae,a['point'],a['actual'],False),
                         ('margin',h['point']-a['point']+he-ae,h['point']-a['point'],h['actual']-a['actual'],None),
                         ('total',h['point']+a['point']+he+ae,h['point']+a['point'],h['actual']+a['actual'],None)]
                for target,samples,point,actual,side in entries:
                    r=dict(game_id=gid,season=year,week=h['week'],target=target,point=point,actual=actual,**verify(samples,actual))
                    r['climatology']=league_points if target=='team' else 0 if target=='margin' else 2*league_points
                    for key in ('persistence','prior_team'):
                        r[key]=baselines[side][key] if side is not None else baselines[True][key]+(-1 if target=='margin' else 1)*baselines[False][key]
                    if target=='margin':r['winner_probability']=float(np.mean(samples>0))
                    records[name].append(r)
    pooled={name:summary(rr) for name,rr in records.items()};annual={name:{str(y):summary([r for r in rr if r['season']==y]) for y in range(2016,2026)} for name,rr in records.items()}
    weekly={name:{f'{y}-w{w}':summary([r for r in rr if r['season']==y and r['week']==w]) for y,w in sorted({(r['season'],r['week']) for r in rr})} for name,rr in records.items()}
    early={name:summary([r for r in rr if r['week']<=4]) for name,rr in records.items()}
    # Pair at game level; resample contiguous four-week blocks within each season.
    losses={}
    for name in NAMES:
        by=defaultdict(list)
        for r in records[name]:
            if r['target']=='team':by[(r['season'],r['week'],r['game_id'])].append(abs(r['actual']-r['point']))
        losses[name]={key:float(np.mean(value)) for key,value in by.items()}
    keys=sorted(losses['linear']);rng=np.random.default_rng(20260916);indices=[]
    for _ in range(2000):
        selected=[]
        for year in range(2016,2026):
            weeks=sorted({k[1] for k in keys if k[0]==year});draw=[]
            while len(draw)<len(weeks):
                start=int(rng.integers(len(weeks)));draw.extend(weeks[(start+j)%len(weeks)] for j in range(4))
            for week in draw[:len(weeks)]:selected.extend(i for i,k in enumerate(keys) if k[0]==year and k[1]==week)
        indices.append(np.array(selected))
    control=np.array([losses['linear'][k] for k in keys]);gate={}
    for name in NAMES[1:]:
        challenger=np.array([losses[name][k] for k in keys]);delta=control-challenger
        improvement=1-pooled[name]['team']['mae']/pooled['linear']['team']['mae']
        coverage={t:{str(level):pooled[name][t][f'coverage_{level}'] for level in (50,80)} for t in ('margin','total')}
        coverage_ok=all(abs(coverage[t][str(level)]-level/100)<=.03 for t in coverage for level in (50,80))
        gate[name]=dict(relative_team_mae_improvement=improvement,coverage=coverage,coverage_pass=coverage_ok,mae_pass=improvement>=.01,
                        numeric_gate_pass=improvement>=.01 and coverage_ok,
                        paired_mae_improvement_interval_95=np.quantile([delta[i].mean() for i in indices],[.025,.975]).tolist())
    sensitivity={name:influence(control,[losses[name][k] for k in keys],[k[2] for k in keys]) for name in NAMES[1:]}
    ranked=sorted(NAMES[1:],key=lambda name:(pooled[name]['team']['mae'],NAMES.index(name)))
    eligible_candidates=[name for name in ranked if gate[name]['numeric_gate_pass']]
    selected=eligible_candidates[0] if eligible_candidates else None
    if selected:
        for simpler in ('k4','k8','state_space'):
            if simpler not in eligible_candidates or NAMES.index(simpler)>=NAMES.index(selected):continue
            difference=np.array([losses[simpler][k]-losses[selected][k] for k in keys])
            lo,hi=np.quantile([difference[i].mean() for i in indices],[.025,.975])
            if lo<=0<=hi:selected=simpler
    decision='NO_CHALLENGER_CLEARS_GATE' if not eligible_candidates else 'NUMERIC_PASS_PENDING_REVIEWS_AND_RELEASE_AUDIT'
    report=dict(registration_sha256=registration['sha256'],first_comparative_result_at=first,population='HISTORICAL_DEVELOPMENT',
                games=len(eligible),extreme_game_sensitivity=sensitivity,pooled=pooled,annual=annual,weekly=weekly,weeks_1_to_4=early,gate=gate,decision=decision,
                selected_candidate=selected,promoted=False,retained='linear',review_answers_received=0,
                limitations=['All coaching fields unknown; coach flags false independently, known QB1 changes still activate variance injection.','Historical results are reused development evidence, not untouched holdout.'],
                runtime_seconds=time.monotonic()-started,peak_rss_mib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/(1024**2 if sys.platform=='darwin' else 1024))
    save('verification.json',report);save('verified-games.json',records)
    print(json.dumps(dict(decision=decision,gate=gate,runtime_seconds=report['runtime_seconds']),indent=2),flush=True)

if __name__=='__main__':run()
