"""STRICT TUESDAY-ONLY sensitivity, not production daily catch-up qualification.

Historical final/statistic availability is explicitly assumed at kickoff + 4h.
Current calibration is never carried backward. Outputs cannot become live locks.
"""
import collections
import copy
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import resource
import statistics
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from engine.projection import cutoff_pipeline as pipeline, cutoff_features as features, observations
from engine.projection_v3.model import predict
from engine.forecast_system.calendar import schedule_kickoff,timestamp,PACIFIC
from engine.forecast_system.cadence import cutoff_before,next_cutoff
from scripts.projection_learning import due_week


def raw(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def sha(value):return hashlib.sha256(value).hexdigest()
def reference(path):return {'path':path,'sha256':sha((ROOT/path).read_bytes())}
def read(ref):
    data=(ROOT/ref['path']).read_bytes()
    if sha(data)!=ref['sha256']:raise ValueError('Source hash differs: '+ref['path'])
    return json.loads(gzip.decompress(data) if ref['path'].endswith('.gz') else data)


def run():
    start=time.monotonic()
    code_paths=sorted(set(pipeline.cutoff_state.CODE)|{
        'engine/projection/cutoff_pipeline.py','engine/projection/scoring.py','engine/projection/scoring_process.py',
        'engine/projection_v3/card.py','scripts/projection_learning.py',str(Path(__file__).resolve().relative_to(ROOT))})
    code=[reference(p) for p in code_paths]
    checkout=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    if os.environ.get('OPENBLAS_NUM_THREADS')!='1':raise ValueError('One worker required')
    def budget():
        rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)
        if time.monotonic()-start>2700:raise TimeoutError('45-minute replay ceiling')
        if rss>4*1024**3:raise MemoryError('4-GiB replay ceiling')
        return rss
    catalog=json.loads((ROOT/'work/series-registry/catalog.json').read_bytes())
    control_ref=next(r for r in catalog['series'] if r['path']==catalog['authoritative_control'] and r['authoritative'])
    control=read(control_ref);by_control={r['game_id']:r for r in control}
    if len(control)!=len(by_control) or len(control)!=2639:raise ValueError('Registered population differs')
    active_ref=json.loads((ROOT/'work/in-season-learning-v1/active-fit-ref.json').read_bytes())
    active=pipeline.settings(read(active_ref))
    manifest_ref=reference('work/projection-v1/source-manifest.json');manifest=read(manifest_ref)
    schedule=[g for g in read(manifest['schedule']) if g['game_type']=='REG' and int(g['season'])<=2025]
    team_games=[r for r in read(manifest['team_games']) if int(r['season'])<=2025]
    stadium_ref=reference('config/stadiums.json');stadiums=read(stadium_ref)
    # Sanitize both source adapters; only these fields can reach common preparation.
    schedule=[{k:g.get(k) for k in (*observations.GAME_KEYS,'source_hash')} for g in schedule]
    stats=collections.defaultdict(list)
    for row in team_games:
        stats[row['game_id']].append({k:row.get(k) for k in (*observations.STAT_FIELDS,'source_hash')})
    schedule.sort(key=lambda g:(schedule_kickoff(g['gameday'],g['gametime']),g['game_id']))
    bygame={g['game_id']:g for g in schedule}
    previous_ref=json.loads((ROOT/'work/engine-rebuild/numerical-cutoff/current-ref.json').read_bytes())
    previous=read(previous_ref);previous_games={r['game_id']:r for r in previous['games']}
    if previous['control']['sha256']!=control_ref['sha256'] or previous['control_point_max_difference']>1e-9:
        raise ValueError('Prior control reproduction is not compatible')
    for row in control:
        if any(abs(row[s]-previous_games[row['game_id']][s+'_control'])>1e-9 for s in ('home','away')):
            raise ValueError('Preserved control reproduction differs')
    cache=ROOT/'.cloud-private/cutoff-replay'/('features-'+previous['feature_signature']+'.json.gz')
    if sha(cache.read_bytes())!=previous['feature_cache_sha256']:raise ValueError('Prior feature cache differs')
    earlier_features={r['row_id']:r['features'] for r in json.loads(gzip.decompress(cache.read_bytes()))['result']['rows']}
    cuts={};issues=collections.defaultdict(list);eligible=collections.defaultdict(list)
    for year in sorted({int(g['season']) for g in schedule}):
        season_games=[g for g in schedule if int(g['season'])==year]
        first=min(cutoff_before(pipeline.time_of(g)) for g in season_games)
        last=max(next_cutoff(schedule_kickoff(g['gameday'],g['gametime'])+dt.timedelta(hours=4)) for g in season_games)
        cursor=first
        while cursor<=last:cuts[cursor]=year;cursor=next_cutoff(cursor)
    for game in schedule:
        issues[pipeline.time_of(game)].append(game)
        if game.get('home_score') is not None and game.get('away_score') is not None:
            eligible[next_cutoff(schedule_kickoff(game['gameday'],game['gametime'])+dt.timedelta(hours=4))].append(game)
    state=features.State(active['elo_hfa']);labels={};history=[];forecasts=[];fits=[];cutoffs=[];waiting=[]
    current=None;current_year=None;last_through=-1;last_cutoff=None;max_feature_difference=0.;forecast_state_checks=0
    template={k:copy.deepcopy(active[k]) for k in ('groups','selected','inactive','elo_hfa')}
    template.update(fit={'training_hash':sha(raw([]))},role='HISTORICAL_ROOT_NOT_FITTED',shapes=None)

    def refit(year,through,cut,initial=False):
        nonlocal current,current_year,last_through
        selected_season=year-1 if initial else year
        selected_week=max(int(g['week']) for g in schedule if int(g['season'])==selected_season) if initial else through
        closed={'state':'PUBLISHED','season':selected_season,'week':selected_week,
                'published_at':cut.isoformat(),'evidence':'SIMULATED_HISTORICAL_CLOSEOUT'}
        current=pipeline.refit(history,labels,template if initial else current,cutoff=cut,
            through_season=selected_season,through_week=selected_week,closeout=closed)
        current.update(issued_at=cut.isoformat(),role='HISTORICAL_WEIGHT_ONLY')
        current_year=year;last_through=0 if initial else through
        fits.append({'season':year,'through_week':last_through,'at':cut.isoformat(),
            'kind':'OUTER_SEASON_INITIAL_FIT' if initial else 'TUESDAY_WEIGHT_REFIT',
            'fit_sha256':sha(raw(current['fit'])),'fit':current['fit'],
            'training_games':current['training_games'],'training_exclusions':current['training_exclusions'],
            'closeout_evidence':closed})
        budget()

    for event in sorted(set(cuts)|set(issues)|set(eligible)):
        budget()
        if event in cuts or event in eligible:
            added=[]
            for game in sorted(eligible[event],key=lambda g:(schedule_kickoff(g['gameday'],g['gametime']),g['game_id'])):
                gid=game['game_id'];proxy=schedule_kickoff(game['gameday'],game['gametime'])+dt.timedelta(hours=4)
                if proxy>=event or gid in state.seen:raise ValueError('Early or duplicate state update')
                state.observe(game,stats.get(gid,[]));added.append(gid)
                labels[gid]={'home_points':float(game['home_score']),'away_points':float(game['away_score']),
                    'kickoff_at':schedule_kickoff(game['gameday'],game['gametime']).isoformat(),
                    'available_at':proxy.isoformat()}
            last_cutoff=event
            year=cuts.get(event)
            cutoffs.append({'cutoff_at':event.isoformat(),'added_games':added,'state_sha256':state.identity(),
                            'incorporated_count':len(state.seen),'incorporated_sha256':sha(raw(sorted(state.seen)))})
            if year is not None and year>=2016:
                if current_year!=year:
                    if event.astimezone(PACIFIC).weekday()!=1:raise ValueError('Outer initial fit requires prior Tuesday')
                    refit(year,0,event,initial=True)
                    print('outer season',year,'training',len(current['training_games']),flush=True)
                elif event.astimezone(PACIFIC).weekday()==1:
                    season_games=[g for g in schedule if int(g['season'])==year]
                    through=due_week([{'game_id':g['game_id'],'week':int(g['week']),'game':g} for g in season_games],event)
                    if through is not None and through>last_through and through<18:
                        required={g['game_id'] for g in season_games if int(g['week'])<=through}
                        missing=sorted(gid for gid in required if gid not in labels or len(stats.get(gid,[]))!=2)
                        if missing:waiting.append({'at':event.isoformat(),'season':year,'through_week':through,'missing_games':missing})
                        else:refit(year,through,event)
        for issue_season in sorted({int(g['season']) for g in issues[event]}):
            games=[g for g in issues[event] if int(g['season'])==issue_season]
            if last_cutoff!=cutoff_before(event):raise ValueError('Wrong issuing state cutoff')
            expected={g['game_id'] for g in schedule if g.get('home_score') is not None and g.get('away_score') is not None
                      and schedule_kickoff(g['gameday'],g['gametime'])+dt.timedelta(hours=4)<last_cutoff}
            if state.seen!=expected:raise ValueError('Common state population differs from chronological source set')
            context={'cutoff_at':last_cutoff.isoformat(),'state_sha256':state.identity(),
                     'source_availability':'HISTORICAL_AVAILABILITY_ASSUMED'}
            slate=[{k:g.get(k) for k in features.GAME_FIELDS} for g in games]
            prepared=pipeline.prepare(state,context,slate,stadiums,at=event,role='HISTORICAL_RECONSTRUCTION')
            valid=[]
            for gid in sorted({r['game_id'] for r in prepared['rows']}):
                pair=[r for r in prepared['rows'] if r['game_id']==gid]
                if issue_season<2015:continue  # 2014 is source warmup, matching the qualified training population.
                if any(r['features']['baseline'] is None for r in pair):raise ValueError('Missing baseline after warmup: '+gid)
                for row in pair:
                    before=earlier_features[row['row_id']]
                    for key in row['features']:
                        left,right=row['features'][key],before[key]
                        if left is None or right is None:
                            if left!=right:raise ValueError('Feature availability differs: '+row['row_id']+':'+key)
                        else:max_feature_difference=max(max_feature_difference,abs(float(left)-float(right)))
                valid.extend(pair)
            if max_feature_difference>1e-9:raise ValueError('Common preparation differs from prior cutoff arithmetic')
            history.extend(copy.deepcopy(valid))
            if issue_season>=2016:
                scored=pipeline.score({**prepared,'rows':valid},current)
                for gid,value in scored.items():
                    if gid not in by_control:raise ValueError('Unregistered forecast population')
                    forecast_state_checks+=1;actual=by_control[gid]
                    if timestamp(current['issued_at'])>=event:raise ValueError('Future fit at forecast')
                    if any(float(bygame[gid][s+'_score'])!=actual['actual_'+s] for s in ('home','away')):
                        raise ValueError('Control/source labels differ')
                    forecasts.append({'game_id':gid,'season':issue_season,'week':int(bygame[gid]['week']),
                        'issuance_at':event.isoformat(),'state_cutoff':last_cutoff.isoformat(),
                        'fit_sha256':sha(raw(current['fit'])),'fit_at':current['issued_at'],
                        'training_hash':current['fit']['training_hash'],'through_week':last_through,
                        'home':value['projection']['home_points'],'away':value['projection']['away_points'],
                        'actual_home':actual['actual_home'],'actual_away':actual['actual_away']})
    if {r['game_id'] for r in forecasts}!=set(by_control) or len(forecasts)!=2639:raise ValueError('Incomplete replay')
    annual={}
    for year in range(2016,2026):
        rows=[r for r in forecasts if r['season']==year]
        annual[str(year)]={'games':len(rows),
            'changed_from_authoritative_control':sum(any(abs(r[s]-by_control[r['game_id']][s])>1e-9 for s in ('home','away')) for r in rows),
            'changed_from_prior_fixed_membership_diagnostic':sum(any(abs(r[s]-previous_games[r['game_id']][s+'_changed_inputs_and_refits'])>1e-9 for s in ('home','away')) for r in rows),
            'team_mae':statistics.mean(abs(r[s]-r['actual_'+s]) for r in rows for s in ('home','away')),
            'team_bias_projection_minus_actual':statistics.mean(r[s]-r['actual_'+s] for r in rows for s in ('home','away')),
            'tuesday_refits':sum(f['season']==year and f['kind']=='TUESDAY_WEIGHT_REFIT' for f in fits)}
    if code!=[reference(p) for p in code_paths]:raise ValueError('Replay code changed during execution; run invalidated')
    result={'status':'STRICT_TUESDAY_SENSITIVITY_NOT_AUTHORITATIVE','authoritative':False,
        'scope':'Strict Tuesday-only refit sensitivity. Does not reproduce production daily catch-up. Historical availability and closeout execution simulated. Not a gate or activation.',
        'historical_availability':'UNKNOWN; final and paired statistics assumed available at kickoff plus four hours',
        'uncertainty':'NOT_SCORED; no qualified own-lineage historical calibration',
        'control':{k:control_ref[k] for k in ('path','sha256','date_added')},'prior_diagnostic':previous_ref,
        'sources':{'active_method':active_ref,'manifest':manifest_ref,'schedule':manifest['schedule'],'team_games':manifest['team_games'],'stadiums':stadium_ref},
        'code':code,'checkout_commit':checkout,
        'common_feature_max_difference':max_feature_difference,'calendar_forecasts_checked':forecast_state_checks,
        'early_or_duplicate_observations':0,'training_rows':len(history),'by_season':annual,
        'games':sorted(forecasts,key=lambda r:r['game_id']),'fits':fits,'cutoffs':cutoffs,'waiting_refits':waiting,
        'elapsed_seconds':time.monotonic()-start,'peak_rss_bytes':budget()}
    cache_dir=ROOT/'.cloud-private/cutoff-replay';cache_dir.mkdir(exist_ok=True)
    body=gzip.compress(raw({'schema':'retained-pregame-training-v1','rows':history}),mtime=0)
    training_path=cache_dir/('common-training-'+sha(body)+'.json.gz');training_path.write_bytes(body)
    result['retained_training_cache']={'path':str(training_path.relative_to(ROOT)),'sha256':sha(body)}
    return result


if __name__=='__main__':
    result=run();folder=ROOT/'work/engine-rebuild/common-pipeline';folder.mkdir(exist_ok=True)
    data=gzip.compress(raw(result),mtime=0);digest=sha(data);path=folder/f'replay-{digest}.json.gz'
    if path.exists() and path.read_bytes()!=data:raise ValueError('Immutable replay collision')
    path.write_bytes(data)
    (folder/'current-ref.json').write_text(json.dumps({'path':str(path.relative_to(ROOT)),'sha256':digest},indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ('games','fits','cutoffs','sources','code')},indent=2),flush=True)
