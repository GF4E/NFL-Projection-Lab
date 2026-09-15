"""Single-worker Phase A replay. Reports load cached results, never refit."""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import numpy as np
from engine.projection_v3.model import GROUPS, fit as core_fit, predict
from engine.forecast_system.postprocess import fit as emos_fit, distribution
from engine.forecast_system.verification import verify, skill, reliability

OUT = ROOT/'work/projection-v2/phase-a'


def save(name, value):
    p = OUT/name
    p.write_text(json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n')


def correlation(x, y):
    return float(np.corrcoef(x,y)[0,1]) if len(x)>1 and np.std(x)>0 and np.std(y)>0 else None


def aggregate(records):
    result = {}
    for target in ('team','margin','total'):
        rows = [r for r in records if r['target']==target]
        y = [r['actual'] for r in rows]
        p = [r['median'] for r in rows]
        raw = [r['raw'] for r in rows]
        c = [r['climatology'] for r in rows]
        item = dict(n=len(rows), mae=float(np.mean(np.abs(np.array(y)-p))),
                    raw_mae=float(np.mean(np.abs(np.array(y)-raw))),
                    climatology_mae=float(np.mean(np.abs(np.array(y)-c))),
                    skill=skill(p,y,c), raw_skill=skill(raw,y,c),
                    dispersion=float(np.std(p)), crps=float(np.mean([r['crps'] for r in rows])),
                    bias=float(np.mean(np.array(y)-p)),
                    spread_skill=correlation([r['spread'] for r in rows], np.abs(np.array(y)-p)),
                    pit_histogram=np.histogram([r['pit'] for r in rows], bins=np.linspace(0,1,11))[0].tolist())
        for baseline in ('team_prior','persistence','v1'):
            usable=[r for r in rows if r.get(baseline) is not None]
            item[baseline]=dict(n=len(usable),mae=float(np.mean([abs(r['actual']-r[baseline]) for r in usable])),
                                skill=skill([r[baseline] for r in usable],[r['actual'] for r in usable],[r['climatology'] for r in usable])) if usable else dict(n=0,mae=None,skill=None)
        for level in ('50','80'):
            item['coverage_'+level] = float(np.mean([r[level]['covered'] for r in rows]))
            item['width_'+level] = float(np.mean([r[level]['width'] for r in rows]))
            item['interval_score_'+level] = float(np.mean([r[level]['interval_score'] for r in rows]))
        result[target]=item
    games=[r for r in records if r['target']=='margin']
    result['winner']=reliability([r['home_win_probability'] for r in games], [int(r['actual']>0) for r in games])
    result['winner']['target']='home margin > 0; ties count as event false'
    return result


def run():
    started=time.monotonic()
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('45-minute gate budget exceeded')))
    signal.alarm(45*60)
    if os.environ.get('OPENBLAS_NUM_THREADS')!='1':
        raise ValueError('Run with OPENBLAS_NUM_THREADS=1')
    # RLIMIT_AS is supported on the Linux gate host; macOS resident usage is audited below.
    if sys.platform.startswith('linux'):
        resource.setrlimit(resource.RLIMIT_AS, (4*1024**3,4*1024**3))
    ref=json.loads((OUT/'features-ref.json').read_text())
    raw=(ROOT/ref['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=ref['sha256']:
        raise ValueError('Feature checksum mismatch')
    features=sorted(json.loads(gzip.decompress(raw)),key=lambda r:(r['season'],r['week'],r['row_id']))
    if any(r['season']>2025 for r in features):
        raise ValueError('Current season forbidden in Phase A fitting')
    usable=[r for r in features if r['features']['baseline'] is not None and r['actual_points'] is not None]
    groups=sorted(set(GROUPS)-{'calibration','wind'})
    histories={a:[] for a in (1,10,100)}
    oof=[]; manifests=[]
    for year in range(2013,2026):
        train=[r for r in usable if r['season']<year]
        test=[r for r in usable if r['season']==year]
        selected=min(histories,key=lambda a:(np.mean(histories[a]),a)) if histories[1] else 10
        for penalty in (1,10,100):
            model=core_fit(train,groups,penalty)
            predictions=[predict(model,r['features'])['points'] for r in test]
            histories[penalty].extend(abs(r['actual_points']-p) for r,p in zip(test,predictions))
            if penalty==selected:
                manifests.append(dict(season=year,penalty=penalty,trained_through_season=year-1,
                                      training_rows=len(train),fit=model))
                for r,p in zip(test,predictions):
                    oof.append(dict(row_id=r['row_id'],game_id=r['game_id'],season=year,week=r['week'],
                                    home=r['home'],team=r['team'],core_median=p,actual=r['actual_points'],
                                    trained_through_season=year-1))
        print('core OOF',year,'penalty',selected,'games',len(test)//2,flush=True)
    save('core-oof.json',oof)
    future_penalty=min(histories,key=lambda a:(np.mean(histories[a]),a))
    save('core-future-fit.json',dict(selected_penalty=future_penalty,fit=core_fit(usable,groups,future_penalty),
                                   version='forecast-system-v2-a-experiment',state='NOT_DEPLOYED'))
    save('core-manifest.json',dict(groups=groups,folds=manifests,feature_ref=ref,
                                 parameters=len(manifests[-1]['fit']['names']),
                                 weather='No forecast-qualified wind weights in Phase A'))
    v1ref=json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text())
    v1fit=json.loads((ROOT/v1ref['path']).read_text())
    v1shape=json.loads((ROOT/v1fit['shapes']['path']).read_text())
    v1hash=v1shape['team_points']['source_hash']
    v1raw=(ROOT/f'work/projection-v1/oof-predictions-{v1hash}.json').read_bytes()
    if hashlib.sha256(v1raw).hexdigest()!=v1hash:raise ValueError('V1 baseline hash mismatch')
    v1={r['row_id']:r for r in json.loads(v1raw)}
    records=[]; fits=[]
    byid={r['row_id']:r for r in usable}
    for year in range(2016,2026):
        artifact=emos_fit(year, lambda y:[r for r in oof if r['season']==y])
        save(f'emos-{year}.json',artifact)
        fits.append({k:v for k,v in artifact.items() if k!='residuals'})
        calibration=[r for r in oof if year-3<=r['season']<year]
        median_error=np.median([r['actual']-r['core_median'] for r in calibration])
        paired=defaultdict(dict)
        for r in calibration:paired[r['game_id']][r['home']]=r['actual']-r['core_median']-median_error
        pairs=[v for k,v in sorted(paired.items()) if len(v)==2]
        he=np.array([v[True] for v in pairs]);ae=np.array([v[False] for v in pairs])
        earlier=[r for r in usable if r['season']<year]
        league=float(np.mean([r['actual_points'] for r in earlier]))
        test=defaultdict(dict)
        for r in oof:
            if r['season']==year:test[r['game_id']][r['home']]=r
        for gid,pair in sorted(test.items()):
            if len(pair)!=2:raise ValueError('Unpaired test game')
            h,a=pair[True],pair[False]
            hd=distribution(artifact,h['core_median']);ad=distribution(artifact,a['core_median'])
            hm,am=float(np.median(hd)),float(np.median(ad))
            margins=hm-am+artifact['c']*(he-ae)
            totals=hm+am+artifact['c']*(he+ae)
            team_baselines={}
            for r in (h,a):
                prior=[z['actual_points'] for z in earlier if z['team']==r['team'] and z['season']==year-1]
                last=[z['actual_points'] for z in usable if z['team']==r['team'] and (z['season'],z['week'])<(year,r['week'])][-4:]
                previous=v1[r['row_id']]
                if previous['actual_points']!=r['actual']:raise ValueError('V1 baseline outcome mismatch')
                team_baselines[r['home']]={'team_prior':float(np.mean(prior)), 'persistence':float(np.mean(last)),
                                          'v1':previous['projected_points']}
            entries=[('team',hd,h['actual'],h['core_median'],league,True),('team',ad,a['actual'],a['core_median'],league,False),
                     ('margin',margins,h['actual']-a['actual'],h['core_median']-a['core_median'],0,None),
                     ('total',totals,h['actual']+a['actual'],h['core_median']+a['core_median'],2*league,None)]
            for target,samples,actual,rawpoint,climate,side in entries:
                r=dict(game_id=gid,season=year,week=h['week'],target=target,actual=actual,raw=rawpoint,
                       climatology=climate,**verify(samples,actual))
                for key in ('team_prior','persistence','v1'):
                    r[key]=team_baselines[side][key] if side is not None else team_baselines[True][key]+(-1 if target=='margin' else 1)*team_baselines[False][key]
                if target=='margin':r['home_win_probability']=float(np.mean(samples>0))
                records.append(r)
        print('EMOS evaluated',year,'b',round(artifact['b'],4),'c',round(artifact['c'],4),flush=True)
    seasons={str(y):aggregate([r for r in records if r['season']==y]) for y in range(2016,2026)}
    weeks={f'{y}-w{w}':aggregate([r for r in records if r['season']==y and r['week']==w]) for y,w in sorted({(r['season'],r['week']) for r in records})}
    pooled=aggregate(records)
    metrics=[]
    for year,s in seasons.items():
        metrics.append(dict(requirement='positive climatology skill',season=year,pass_=all(s[t]['skill']>0 for t in ('team','margin','total'))))
        metrics.append(dict(requirement='team projection SD >=4',season=year,value=s['team']['dispersion'],pass_=s['team']['dispersion']>=4))
        metrics.append(dict(requirement='coverage within 3 percentage points',season=year,pass_=all(abs(s[t]['coverage_'+str(l)]-l/100)<=.03 for t in ('team','margin','total') for l in (50,80))))
    metrics.append(dict(requirement='postprocessed team MAE improves raw core',pass_=pooled['team']['mae']<pooled['team']['raw_mae']))
    rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/(1024**2 if sys.platform=='darwin' else 1024)
    elapsed=time.monotonic()-started
    metrics.append(dict(requirement='one worker 4GiB 45minutes',pass_=rss<=4096 and elapsed<=2700))
    save('compute.json',dict(seconds=elapsed,peak_rss_mib=rss,workers=1,blas_threads=1))
    save('verification.json',dict(seasons=seasons,weeks=weeks,pooled=pooled,emos=fits))
    save('verified-games.json',records)
    # A failure is conclusive; success still requires full requirement review.
    save('gate.json',dict(state='FAIL' if not all(r['pass_'] for r in metrics) else 'REVIEW_REQUIRED',tests=metrics,
                          phase_b_authorized=False,version='forecast-system-v2-a-experiment'))
    signal.alarm(0)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--report',action='store_true')
    args=parser.parse_args()
    if args.report:
        print((OUT/'gate.json').read_text())
    else:
        run()
