"""Numerical chronology diagnostic on the registered population; no activation.

Reproduce the authoritative HFA control before applying cutoff features. Keep its
recorded weekly refit memberships to isolate feature timing and propagated fit
changes. This does not qualify a new production refit scheduler or source vintages.
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
import sys
import time

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection.cutoff_features import build as cutoff_build
from engine.projection.features import build as legacy_build
from engine.projection_v3.model import fit,predict
from engine.forecast_system.calendar import schedule_kickoff,timestamp
from engine.forecast_system.cadence import cutoff_before


def sha(raw):return hashlib.sha256(raw).hexdigest()
def raw(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def read(ref):
    data=(ROOT/ref['path']).read_bytes()
    if sha(data)!=ref['sha256']:raise ValueError('Pinned input hash mismatch')
    return json.loads(data)
def ref(path):return {'path':path,'sha256':sha((ROOT/path).read_bytes())}


def run():
    start=time.monotonic()
    def budget():
        if time.monotonic()-start>2700:raise TimeoutError('45-minute phase ceiling')
        rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)
        if rss>4*1024**3:raise MemoryError('4-GiB budget exceeded')
        return rss
    if os.environ.get('OPENBLAS_NUM_THREADS')!='1':raise ValueError('One BLAS worker required')
    catalog=json.loads((ROOT/'work/series-registry/catalog.json').read_bytes())
    control_ref=next(x for x in catalog['series'] if x['path']==catalog['authoritative_control'] and x['authoritative'])
    control=read(control_ref);population={r['game_id'] for r in control}
    if len(control)!=2639 or len(population)!=2639:raise ValueError('Registered population differs')
    active_ref=json.loads((ROOT/'work/in-season-learning-v1/active-fit-ref.json').read_bytes());a=read(active_ref)
    if a['groups']!=['calibration','elo'] or a['selected']!=['none',10]:raise ValueError('Unexpected production method')
    manifest_ref=ref('work/projection-v1/source-manifest.json');m=read(manifest_ref)
    schedule=[g for g in read(m['schedule']) if int(g['season'])<=2025 and g['game_type']=='REG']
    team_games=[r for r in read(m['team_games']) if r['season']<=2025]
    stadium_ref=ref('config/stadiums.json');stadiums=read(stadium_ref)
    history=read(a['historical_features']);bygame={g['game_id']:g for g in schedule}
    lineage_ref=ref('work/projection-v2w/replay-receipt.json');legacy_receipt=read(lineage_ref)
    dependencies=[ref(p) for p in ('engine/projection/cutoff_features.py','engine/projection/features.py',
                   'engine/projection/model.py','engine/projection_v3/model.py','engine/elo.py','engine/elo_hfa.py',
                   'engine/forecast_system/calendar.py','engine/forecast_system/cadence.py')]
    signature=sha(raw({'source':m,'hfa':a['elo_hfa'],'stadiums':stadium_ref,'code':dependencies}))
    cache=ROOT/'.cloud-private/cutoff-replay'/f'features-{signature}.json.gz';cache.parent.mkdir(parents=True,exist_ok=True)
    if cache.exists():
        saved=json.loads(gzip.decompress(cache.read_bytes()))
        if saved['signature']!=signature or sha(raw(saved['result']))!=saved['body_sha256']:raise ValueError('Feature cache mismatch')
        corrected=saved['result']
    else:
        corrected=cutoff_build(team_games,schedule,stadiums,None,m['roster_source_hashes'],a['elo_hfa'],mode='HISTORICAL_RECONSTRUCTION')
        cache.write_bytes(gzip.compress(raw({'signature':signature,'body_sha256':sha(raw(corrected)),'result':corrected}),mtime=0))
    budget();print('cutoff features',len(corrected['rows']),len(corrected['lineage']),flush=True)
    old=legacy_build(team_games,schedule,stadiums,None,m['roster_source_hashes'],elo_hfa=a['elo_hfa'])
    old_index={r['row_id']:r for r in old};new_index={r['row_id']:r for r in corrected['rows']}
    max_feature_difference=max(abs(r['features'][k]-old_index[r['row_id']]['features'][k]) for r in history for k in ('baseline','elo','elo_difference') if r['features'][k] is not None)
    if max_feature_difference>1e-9:raise ValueError('Legacy source/history parity failed')
    repaired={}
    for repair in legacy_receipt['calendar_repairs']:
        gid=repair['game_id'];year=int(bygame[gid]['season']);excluded=set(repair['withheld'])
        filtered=[dict(g,home_score=None,away_score=None) if g['game_id'] in excluded else g for g in schedule if int(g['season'])<=year]
        values=legacy_build([r for r in team_games if r['game_id'] not in excluded],filtered,stadiums,None,m['roster_source_hashes'],elo_hfa=a['elo_hfa'])
        repaired.update({r['row_id']:r for r in values if r['game_id']==gid});budget()
    # Labels join only in the training/evaluation layer, never in cutoff rows.
    new_history=[]
    for row in history:
        newrow=copy.deepcopy(new_index[row['row_id']]);newrow['actual_points']=row['actual_points'];new_history.append(newrow)
    old_pairs=collections.defaultdict(list);new_pairs=collections.defaultdict(list)
    for row in history:old_pairs[row['game_id']].append(repaired.get(row['row_id'],row))
    for row in new_history:new_pairs[row['game_id']].append(row)
    original_cache={};new_cache={};outputs=[];max_reproduction=0.;control_by={r['game_id']:r for r in control}
    repair_withheld={r['game_id']:set(r['withheld']) for r in legacy_receipt['calendar_repairs']}
    completed=[g for g in schedule if g.get('home_score') not in ('',None) and g.get('away_score') not in ('',None)]
    played_order=sorted(completed,key=lambda g:(schedule_kickoff(g['gameday'],g['gametime']),g['game_id']))
    week_order=sorted(completed,key=lambda g:(int(g['season']),int(g['week']),g['game_id']))
    for issuance in legacy_receipt['lineage']:
        gid=issuance['game_id']
        if gid not in population:continue
        year=control_by[gid]['season'];through=issuance['through_week'];key=(year,through)
        if key not in original_cache:
            eligible=lambda r:(r['season']<year or r['season']==year and r['week']<=through) and r['actual_points'] is not None and r['features']['baseline'] is not None
            original_cache[key]=fit([r for r in history if eligible(r)],a['groups'],a['selected'][1])
            new_cache[key]=fit([r for r in new_history if eligible(r)],a['groups'],a['selected'][1])
            budget()
        row={'game_id':gid,'season':year,'week':control_by[gid]['week'],'through_week':through,
             'legacy_training_hash':original_cache[key]['training_hash'],'corrected_training_hash':new_cache[key]['training_hash'],
             'state_cutoff':new_pairs[gid][0]['state_lineage']['cutoff_at']}
        for side in ('home','away'):
            oldrow=next(r for r in old_pairs[gid] if r['home']==(side=='home'))
            newrow=next(r for r in new_pairs[gid] if r['home']==(side=='home'))
            baseline=predict(original_cache[key],oldrow['features'])['points']
            error=abs(baseline-control_by[gid][side]);max_reproduction=max(max_reproduction,error)
            if error>1e-9:raise ValueError('Authoritative point reproduction failed: '+gid)
            row[side+'_control']=baseline
            row[side+'_changed_inputs_fixed_fit']=predict(original_cache[key],newrow['features'])['points']
            row[side+'_changed_inputs_and_refits']=predict(new_cache[key],newrow['features'])['points']
            row[side+'_actual']=control_by[gid]['actual_'+side]
        old_ids={g['game_id'] for g in completed if int(g['season'])<year or int(g['season'])==year and int(g['week'])<row['week']}-repair_withheld.get(gid,set())
        cut=timestamp(row['state_cutoff'])
        new_ids={g['game_id'] for g in completed if schedule_kickoff(g['gameday'],g['gametime'])+dt.timedelta(hours=4)<cut}
        common=old_ids&new_ids;teams={t for g in completed for t in (g['home_team'],g['away_team'])}
        order_changed=[]
        for team in sorted(teams):
            old_order=[g['game_id'] for g in week_order if g['game_id'] in common and team in (g['home_team'],g['away_team'])]
            new_order=[g['game_id'] for g in played_order if g['game_id'] in common and team in (g['home_team'],g['away_team'])]
            if old_order!=new_order:order_changed.append(team)
        row['earlier_available_games']=sorted(new_ids-old_ids)
        row['withheld_until_later_cutoff']=sorted(old_ids-new_ids)
        row['teams_with_changed_prior_game_order']=order_changed
        direct=any(abs(row[s+'_changed_inputs_fixed_fit']-row[s+'_control'])>1e-9 for s in ('home','away'))
        if direct and not (new_ids!=old_ids or order_changed):
            raise ValueError('Unexplained direct forecast difference: '+gid)
        outputs.append(row)
    if {r['game_id'] for r in outputs}!=population or len(outputs)!=len(population):raise ValueError('Output population differs')
    # Independent calendar inclusion check across the full numerical replay.
    seen=set();checks=0
    for batch in corrected['lineage']:
        cut=timestamp(batch['cutoff_at'])
        for gid in batch['added_games']:
            if gid in seen:raise ValueError('Duplicate assimilation')
            seen.add(gid)
            if schedule_kickoff(bygame[gid]['gameday'],bygame[gid]['gametime'])+dt.timedelta(hours=4)>=cut:raise ValueError('Early numerical assimilation')
        for context in batch['forecast_contexts']:
            for gid in context['forecast_games']:
                if gid not in population:continue
                issuance=schedule_kickoff(bygame[gid]['gameday'],bygame[gid]['gametime'])-dt.timedelta(minutes=75)
                if cutoff_before(issuance)!=cut:raise ValueError('Wrong forecast state cutoff')
                expected={g['game_id'] for g in schedule if g.get('home_score') not in ('',None) and g.get('away_score') not in ('',None) and schedule_kickoff(g['gameday'],g['gametime'])+dt.timedelta(hours=4)<cut}
                if seen!=expected:raise ValueError('Missing/extra incorporated result')
                checks+=1
    annual={}
    for year in range(2016,2026):
        selected=[r for r in outputs if r['season']==year]
        annual[str(year)]={'games':len(selected),
          'direct_input_changed_games':sum(any(abs(r[s+'_changed_inputs_fixed_fit']-r[s+'_control'])>1e-9 for s in ('home','away')) for r in selected),
          'input_and_refit_changed_games':sum(any(abs(r[s+'_changed_inputs_and_refits']-r[s+'_control'])>1e-9 for s in ('home','away')) for r in selected),
          'mean_absolute_point_change':statistics.mean(abs(r[s+'_changed_inputs_and_refits']-r[s+'_control']) for r in selected for s in ('home','away'))}
    return {'status':'INACTIVE_NUMERICAL_CHRONOLOGY_DIAGNOSTIC','authoritative':False,
            'scope':'All registered games; legacy refit memberships retained to isolate feature timing and propagated refits. Not a gate or qualified new live scheduler.',
            'control':{k:control_ref[k] for k in ('path','sha256','date_added')},'active_fit_ref':active_ref,
            'sources':{'manifest':manifest_ref,'schedule':m['schedule'],'team_games':m['team_games'],'historical_features':a['historical_features'],'stadiums':stadium_ref,'legacy_refit_memberships':lineage_ref},
            'code':dependencies,'feature_cache_sha256':sha(cache.read_bytes()),'feature_signature':signature,
            'replay_driver':ref(str(Path(__file__).resolve().relative_to(ROOT))),
            'historical_source_availability':'UNKNOWN; kickoff+4h is an explicit reconstruction assumption, not a source receipt',
            'legacy_active_feature_max_difference':max_feature_difference,'control_point_max_difference':max_reproduction,
            'calendar_forecasts_checked':checks,'early_or_duplicate_observations':0,'cutoffs':len(corrected['lineage']),
            'by_season':annual,'games':sorted(outputs,key=lambda r:r['game_id']),
            'lineage':corrected['lineage'],'elapsed_seconds':time.monotonic()-start,'peak_rss_bytes':budget()}


if __name__=='__main__':
    result=run();folder=ROOT/'work/engine-rebuild/numerical-cutoff';folder.mkdir(exist_ok=True)
    decoded=raw(result)+b'\n';data=gzip.compress(decoded,mtime=0);identity=sha(data);path=folder/f'replay-{identity}.json.gz'
    if path.exists() and path.read_bytes()!=data:raise ValueError('Immutable replay collision')
    path.write_bytes(data)
    (folder/'current-ref.json').write_text(json.dumps({'path':str(path.relative_to(ROOT)),'sha256':identity,'encoding':'gzip','decoded_sha256':sha(decoded)},indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ('games','lineage','code','sources')},indent=2),flush=True)
