"""Deterministic training-fold likelihood fitting. No file or provider access."""
from collections import defaultdict
import numpy as np
from scipy.optimize import minimize
from .state_space import stationary, predict, update, observation, observation_noise, preseason

STARTS=((.01,2.,.5),(.05,4.,.7),(.002,1.,.3))
BOUNDS=((.001,.5),(.5,10.),(0.,1.))


def replay(games, triple, rho, league, changes, initial=None, collect=True):
    q,r,retention=map(float,triple)
    p0,diagnostic=stationary(q,r,rho)
    if not diagnostic['converged']:
        raise ValueError('Reference covariance did not converge')
    x=np.zeros(64) if initial is None else initial[0].copy()
    p=p0.copy() if initial is None else initial[1].copy()
    noise=observation_noise(r,rho)
    weeks=defaultdict(list)
    for g in sorted(games,key=lambda g:(g['season'],g['week'],g['game_id'])):
        weeks[(g['season'],g['week'])].append(g)
    records=[];loss=0.;last_season=None;last_week=0
    for (year,week),slate in sorted(weeks.items()):
        if year==2013 and last_season!=2013:
            x=np.zeros(64);p=p0.copy();last_week=0
        elif last_season is not None and year!=last_season:
            x,p=preseason(x,p,p0,retention,changes.get(year,[False]*32))
            last_week=0
        for _ in range(week-last_week):
            x,p=predict(x,p,q)
        # All forecasts use the same pre-slate state; updates become next week's state.
        for g in slate:
            h=observation(g['home_index'],g['away_index'])
            predicted=(league+h@x)*g['drives']+g['offset']
            if collect:
                records.append(dict(game_id=g['game_id'],season=year,week=week,
                                    points=predicted.tolist(),errors=((g['actual']-predicted)/g['drives']).tolist()))
        for g in slate:
            if not np.isfinite(g['actual']).all():
                continue
            h=observation(g['home_index'],g['away_index'])
            normalized=(g['actual']-g['offset'])/g['drives']-league
            x,p,ll,*_=update(x,p,h,normalized,noise)
            loss-=ll
        last_season,last_week=year,week
    return float(loss),records,(x,p),diagnostic


def fit(games, league, changes):
    """Plug-in rho from a fixed training-only pilot; only q/r/lambda searched.

    Pilot uses the first registered starting triple and rho=0. This breaks the
    rho/filter circularity without searching additional values or viewing OOF.
    """
    _,pilot,_,_=replay(games,STARTS[0],0.,league,changes)
    errors=np.array([g['errors'] for g in pilot])
    rho=float(np.corrcoef(errors.T)[0,1])
    if not np.isfinite(rho) or abs(rho)>=1:
        raise ValueError('Training-fold Pearson rho is undefined or singular')
    objective=lambda values:replay(games,values,rho,league,changes,collect=False)[0]
    results=[minimize(objective,start,method='L-BFGS-B',bounds=BOUNDS) for start in STARTS]
    if any(not np.isfinite(result.fun) for result in results):
        raise ValueError('Nonfinite likelihood fit')
    index=min(range(3),key=lambda i:(results[i].fun,i))
    selected=results[index]
    _,_,_,diagnostic=replay(games,selected.x,rho,league,changes,collect=False)
    return dict(q=float(selected.x[0]),r=float(selected.x[1]),retention=float(selected.x[2]),rho=rho,
                likelihood=-float(selected.fun),selected_start=index,
                starts=[dict(start=list(STARTS[i]),success=bool(v.success),message=str(v.message),iterations=int(v.nit),likelihood=-float(v.fun)) for i,v in enumerate(results)],
                bound_hits=[name for name,value,bound in zip(('q','r','lambda'),selected.x,BOUNDS) if min(abs(value-bound[0]),abs(value-bound[1]))<1e-7],
                stationary=diagnostic,optimized_parameters=3,estimated_nuisance_parameters=1,
                latent_state_dimension=63,training_games=len(games),games_per_optimized_parameter=len(games)/3,
                games_per_parameter_including_rho=len(games)/4,
                rho_definition='Pearson correlation of paired PPD one-step errors from fixed first-start pilot, rho=0, training fold only')
