"""Reorder every retained training population and reproduce every common forecast."""
import collections
import copy
import datetime as dt
import gzip
import json
import math
from pathlib import Path
import resource
import sys
import time
import numpy as np

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection import cutoff_pipeline as p
from engine.forecast_system.calendar import schedule_kickoff,timestamp
from replay_hourly_catchup import raw,sha,read


def run():
    start=time.monotonic()
    ref=json.loads((ROOT/'work/engine-rebuild/hourly-catchup/current-ref.json').read_bytes())
    replay=read(ref)
    for code in replay['code']:read_bytes=(ROOT/code['path']).read_bytes();assert sha(read_bytes)==code['sha256'],code['path']
    history=read(replay['retained_training_cache'])['rows']
    games=read(replay['sources']['schedule'])
    labels={g['game_id']:{'home_points':float(g['home_score']),'away_points':float(g['away_score']),
        'kickoff_at':schedule_kickoff(g['gameday'],g['gametime']).isoformat(),
        'available_at':(schedule_kickoff(g['gameday'],g['gametime'])+dt.timedelta(hours=4)).isoformat()}
        for g in games if g['game_type']=='REG' and int(g['season'])<=2025 and g.get('home_score') is not None and g.get('away_score') is not None}
    active=read(replay['sources']['active_method']);fitted={};independent={};coefficient_difference=0.
    for record in replay['fits']:
        cutoff=timestamp(record['scheduled_cutoff']);execution=timestamp(record['at']);closed=record['closeout_evidence']
        available={gid:v for gid,v in labels.items() if timestamp(v['available_at'])<execution}
        value=p.refit(list(reversed(history)),available,active,cutoff=cutoff,
                      through_season=closed['season'],through_week=closed['week'],closeout=closed,fit_at=execution)
        assert value['fit']==record['fit'],(record['season'],record['through_week'])
        fitted[record['fit_sha256']]=value
        # Separate augmented least-squares solve, not the production normal-equation helper.
        selected=set(record['training_games'])
        training=sorted([r for r in history if r['game_id'] in selected],key=lambda r:r['row_id'])
        names=record['fit']['names'];columns=[[float(r['features'][n]) for r in training] for n in names]
        means=[math.fsum(c)/len(c) for c in columns]
        scales=[math.sqrt(math.fsum((v-m)**2 for v in c)/len(c)) or 1. for c,m in zip(columns,means)]
        z=np.asarray([[(r['features'][n]-m)/s for n,m,s in zip(names,means,scales)] for r in training])
        residual=[available[r['game_id']]['home_points' if r['home'] else 'away_points']-r['features']['baseline'] for r in training]
        intercept=math.fsum(residual)/len(residual)
        beta=np.linalg.lstsq(np.vstack([z,math.sqrt(10)*np.eye(len(names))]),
                            np.r_[np.asarray(residual)-intercept,np.zeros(len(names))],rcond=None)[0]
        independent[record['fit_sha256']]=(names,means,scales,intercept,beta)
        coefficient_difference=max(coefficient_difference,abs(intercept-record['fit']['intercept']),
                                   max(abs(float(b)-a) for b,a in zip(beta,record['fit']['coefficients'])))
        if time.monotonic()-start>2700:raise TimeoutError('45-minute permutation ceiling')
    pairs=collections.defaultdict(list)
    for row in reversed(history):pairs[row['game_id']].append(row)
    maximum=0.;independent_point_difference=0.
    for record in replay['games']:
        rows=pairs[record['game_id']];lineage=rows[0]['state_lineage']
        context={k:lineage[k] for k in ('cutoff_at','state_sha256','source_availability')}
        prepared={'schema':p.SCHEMA,'role':'HISTORICAL_RECONSTRUCTION','prepared_at':record['issuance_at'],'state':context,'rows':rows}
        forecast=p.score(prepared,fitted[record['fit_sha256']])[record['game_id']]
        for side in ('home','away'):maximum=max(maximum,abs(forecast['projection'][side+'_points']-record[side]))
        names,means,scales,intercept,beta=independent[record['fit_sha256']]
        for row in rows:
            point=math.fsum([row['features']['baseline'],intercept]+[
                float(b)*(row['features'][n]-m)/s for n,m,s,b in zip(names,means,scales,beta)])
            side='home' if row['home'] else 'away'
            independent_point_difference=max(independent_point_difference,abs(point-record[side]))
    assert maximum==0.
    assert coefficient_difference<1e-9 and independent_point_difference<1e-9
    result={'status':'PASS','scope':'All retained training rows reversed at every refit; both team rows reversed at every forecast',
        'replay_ref':ref,'fits_checked':len(replay['fits']),'training_rows':len(history),
        'games_checked':len(replay['games']),'team_forecasts_checked':2*len(replay['games']),
        'maximum_point_difference':maximum,'fit_bodies_identical':True,
        'independent_augmented_solve_max_coefficient_difference':coefficient_difference,
        'independent_augmented_solve_max_point_difference':independent_point_difference,
        'elapsed_seconds':time.monotonic()-start,
        'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)}
    (ROOT/'work/engine-rebuild/hourly-catchup/permutation.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__=='__main__':print(json.dumps(run(),indent=2))
