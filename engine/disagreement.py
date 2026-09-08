"""Frozen-population disagreement diagnostics and prior-season market/Elo regression."""
import argparse,hashlib,json,math,statistics
from collections import defaultdict
from pathlib import Path
import numpy as np
from scipy.stats import t
from engine.elo import Elo
from engine.harvest import ROOT,BASE,read,canonical,digest
from engine.qb_history import put,encoded
OUT=ROOT/'work/harvest-disagreement-v1'
LABELS=['<1','1–<2','2–<3','3–4','>4']

def bucket(x):
    x=abs(x)
    return 0 if x<1 else 1 if x<2 else 2 if x<3 else 3 if x<=4 else 4

def bucket_study(rows,key,seed=20260908,reps=5000):
    groups=defaultdict(list)
    for r in rows:groups[int(r['season'])].append(r)
    observed=np.zeros((5,6));boot=np.zeros((reps,5,2));rng=np.random.default_rng(seed)
    for season,games in sorted(groups.items()):
        weeks=sorted({int(r['week']) for r in games});sums=np.zeros((len(weeks),5,6))
        for r in games:
            difference=float(r[key])-float(r['market_margin_location']);b=bucket(difference)
            signed=(float(r['margin'])-float(r['market_margin_location']))*np.sign(difference)
            vector=sums[weeks.index(int(r['week'])),b];vector[0]+=1
            if difference==0:vector[4]+=1
            else:
                vector[1 if signed>0 else 2 if signed<0 else 3]+=1
                vector[5]+=signed
        observed+=sums.sum(axis=0)
        sample=rng.integers(0,len(weeks),size=(reps,len(weeks)))
        boot+=sums[sample][:,:,:,1:3].sum(axis=1)
    result=[]
    for i,label in enumerate(LABELS):
        n,w,l,p,no_side,residual=observed[i];denom=boot[:,i,0]+boot[:,i,1]
        rates=np.divide(boot[:,i,0],denom,out=np.full(reps,np.nan),where=denom>0)
        interval=np.nanquantile(rates,[.025,.975]).tolist() if np.isfinite(rates).any() else [None,None]
        result.append({'bucket':label,'games':int(n),'wins':int(w),'losses':int(l),'pushes':int(p),'no_side':int(no_side),'ats_n':int(w+l),'ats_rate':w/(w+l) if w+l else None,'ats_lower95':interval[0],'ats_upper95':interval[1],'mean_residual_toward_model':residual/(n-no_side) if n>no_side else None})
    return result

def regression(rows):
    market=np.array([float(r['market_margin_location']) for r in rows]);elo=np.array([float(r['anya_margin_location']) for r in rows]);y=np.array([float(r['margin']) for r in rows])
    X=np.column_stack([np.ones(len(rows)),market,elo-market])
    if np.linalg.matrix_rank(X)<3:raise ValueError('Regression rank deficient')
    beta=np.linalg.lstsq(X,y,rcond=None)[0];residual=y-X@beta
    groups=defaultdict(list)
    for i,r in enumerate(rows):groups[(int(r['season']),int(r['week']))].append(i)
    if len(groups)<2:raise ValueError('Too few week clusters')
    meat=np.zeros((3,3))
    for indexes in groups.values():
        score=X[indexes].T@residual[indexes];meat+=np.outer(score,score)
    bread=np.linalg.inv(X.T@X);g=len(groups);n=len(y)
    cov=bread@meat@bread*g/(g-1)*(n-1)/(n-3)
    se=math.sqrt(max(0.,cov[2,2]));critical=t.ppf(.975,g-1)
    return {'n':n,'week_clusters':g,'a':float(beta[0]),'b':float(beta[1]-beta[2]),'c':float(beta[2]),'c_se':se,'c_lower95':float(beta[2]-critical*se),'c_upper95':float(beta[2]+critical*se)}

def warmup_2015():
    old=json.loads((BASE/'protocol.json').read_text())
    for p,sha in old['inputs'].items():
        if digest(ROOT/p)!=sha:raise ValueError('Warmup source hash changed')
    initial={r['team']:float(r['elo']) for r in read(BASE/'sources/538-initial_elos.csv')};model=Elo(initial)
    for r in read(BASE/'sources/538-nfl_games.csv'):
        year=int(r['season'])
        if year>=2015:continue
        h,a=r['team1'],r['team2'];model.prepare(h,year);model.prepare(a,year)
        pred=model.forecast(h,a,r['neutral']=='1',0.,0.);model.update(h,a,float(r['score1']),float(r['score2']),pred)
    qpath=ROOT/'work/harvest-elo-v2/qb/qb-history.csv'
    receipt=json.loads((qpath.parent/'receipt.json').read_text())
    if digest(qpath)!=receipt['qb_history_sha256']:raise ValueError('QB hash changed')
    qbs={(r['game_id'],r['team']):r for r in read(qpath)}
    games=[r for r in read(ROOT/old['schedules']) if r['season']=='2015' and r['home_score'] and r['away_score']]
    groups=defaultdict(list)
    for g in sorted(games,key=lambda r:(int(r['week']),r['gameday'],r['gametime'],r['game_id'])):groups[int(g['week'])].append(g)
    output=[]
    for week,group in groups.items():
        pending=[]
        for r in group:
            h,a=canonical(r['home_team']),canonical(r['away_team']);model.prepare(h,2015);model.prepare(a,2015)
            base=model.forecast(h,a,r['location']=='Neutral',0.,0.)
            qs=[qbs[(r['game_id'],team)] for team in (h,a)]
            if any((int(q['training_season']),int(q['training_week']))>=(2015,week) for q in qs):raise ValueError('QB target-week leakage')
            pred=model.forecast(h,a,r['location']=='Neutral',*[float(q['qb_adjustment_elo']) for q in qs])
            pending.append((r,h,a,base,pred))
        for r,h,a,base,pred in pending:
            if r['game_type']=='REG':output.append({'game_id':r['game_id'],'season':2015,'week':week,'margin':float(r['home_score'])-float(r['away_score']),'anya_margin_location':pred['margin_location'],'market_margin_location':float(r['spread_line']),'total':float(r['home_score'])+float(r['away_score']),'market_total_location':float(r['total_line'])})
            model.update(h,a,float(r['home_score']),float(r['away_score']),base)
    return output

def run(output):
    protocol=json.loads((OUT/'protocol.json').read_text());source=ROOT/protocol['input']
    if digest(source)!=protocol['sha256']:raise ValueError('Saved scorecard hash changed')
    rows=read(source)
    if len(rows)!=2639 or len({r['game_id'] for r in rows})!=2639:raise ValueError('Fixed population changed')
    reference=[r for r in rows if r['nfelo_margin_crps']!='']
    if len(reference)!=946:raise ValueError('nfelo fixed population changed')
    buckets={'ANYA':bucket_study(rows,'anya_margin_location'),'nfelo':bucket_study(reference,'nfelo_margin_location',20260909)}
    warm=warmup_2015();allrows=warm+rows;regressions=[]
    for year in range(2016,2026):
        train=[r for r in allrows if int(r['season'])<year]
        fit=regression(train);fit.update(evaluation_season=year,training_max_season=max(int(r['season']) for r in train));regressions.append(fit)
    stable=all(r['c']>0 for r in regressions) and sum(r['c_lower95']>0 for r in regressions)>=8
    result={'experiment_id':'harvest-disagreement-v1','input_sha256':digest(source),'protocol_sha256':digest(OUT/'protocol.json'),'buckets':buckets,'regressions':regressions,'positive_stable':stable,'stability':{'positive_c_count':sum(r['c']>0 for r in regressions),'positive_lower95_count':sum(r['c_lower95']>0 for r in regressions),'required':'10 positive point estimates and at least 8 positive lower bounds'},'blend_status':'CONDITION_NOT_MET_NOT_FITTED' if not stable else 'ELIGIBLE_PENDING_BLEND','promotion_eligible':False,'live_location':'empirical_market_unchanged','credits_spent':0,'code_sha256':digest(Path(__file__)),'nfelo_label':'DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST','evidence':'Reconstructed retrospective starter identities; pointwise intervals, overlapping regression fits, no causal or prospective edge claim'}
    if stable:
        raise RuntimeError('Stability condition met: complete the registered blend evaluation before reporting this run')
    output=Path(output);put(output/'warmup-2015.csv',encoded(warm));put(output/'regression.csv',encoded(regressions))
    flat=[{'series':series,**r} for series,data in buckets.items() for r in data];put(output/'buckets.csv',encoded(flat))
    put(output/'experiment.json',(json.dumps(result,indent=2,sort_keys=True)+'\n').encode())
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();r=run(a.output);print(json.dumps({'stability':r['stability'],'blend_status':r['blend_status'],'buckets':r['buckets'],'regressions':r['regressions']},indent=2))
