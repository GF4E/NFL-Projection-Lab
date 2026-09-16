"""E1 feature preparation from pinned football sources, without comparisons."""
import csv,gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.forecast_system import core_features
from scripts.projection_prepare import canonical
OUT=ROOT/'work/projection-governance-v2/e1'

def sample_weight(rows,season,week,half_life,k):
    current=[r for r in rows if r['season']==season]
    n=len(current);current_weight=n/(n+k)
    selected=[]
    for year,w in ((season-1,1-current_weight),(season,current_weight)):
        subset=[r for r in rows if r['season']==year]
        if subset and w: selected.extend(dict(r,_w=w/len(subset)) for r in subset)
    return selected

def run(calendar_evidence=None, output=None):
    target_dir=output or OUT
    evidence=json.loads((ROOT/'work/projection-v2/phase-a/features-ref.json').read_text())
    raw=(ROOT/evidence['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==evidence['sha256']
    controls=json.loads(gzip.decompress(raw))
    ref=evidence['source_manifest']['team_games'];raw=(ROOT/ref['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==ref['sha256']
    rows=[r for r in json.loads(raw) if r['season']<=2025]
    for ref in evidence['early_refs']:
        rows+=json.loads((ROOT/f'work/projection-v2/phase-a/aggregate-{ref["sha256"]}.json').read_text())
    schedule_ref=evidence['schedule_ref'];raw=Path(schedule_ref['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==schedule_ref['sha256']
    schedule=[]
    for r in csv.DictReader(raw.decode().splitlines()):
        if 2011<=int(r['season'])<=2025:
            item={k:r.get(k) for k in 'game_id season game_type week gameday gametime away_team home_team away_score home_score location roof stadium_id'.split()}
            for key in ('home_team','away_team'):item[key]=canonical(item[key])
            item['source_hash']=schedule_ref['sha256'];schedule.append(item)
    stadiums=json.loads((ROOT/'config/stadiums.json').read_text())
    batches=None
    if calendar_evidence is not None:
        from engine.forecast_system.calendar import plan,audit
        schedule=[g for g in schedule if g['game_type']=='REG' and g['home_score'] not in ('',None)]
        for g in schedule:
            g['season']=int(g['season']);g['week']=int(g['week'])
            g.update({k:calendar_evidence[g['game_id']][k] for k in ('issuance_at','assimilation_available_at')})
        batches=plan(schedule);audit(schedule,batches)
        built=core_features.build(rows,schedule,stadiums,calendar_batches=batches)
        controls=[{k:r[k] for k in ('actual_points','features','game_id','home','opponent','row_id','season','team','week')} for r in built]
        by_cutoff={g['game_id']:b['cutoff'] for b in batches for g in b['forecasts']}
        for r in controls:
            r.update({k:calendar_evidence[r['game_id']][k] for k in ('issuance_at','assimilation_available_at')})
            r['state_cutoff']=by_cutoff[r['game_id']]
    data={'linear':controls};original=core_features.weight
    try:
        for k in (4,8):
            core_features.weight=lambda rr,s,w,h,k=k:sample_weight(rr,s,w,h,k)
            built=core_features.build(rows,schedule,stadiums,calendar_batches=batches)
            # E1 modifies strength blending only: expected pace and all other
            # existing core inputs remain at the control's as-of values.
            by={r['row_id']:r for r in built};candidate=[]
            for r in controls:
                c=dict(r,features=dict(r['features']));b=by[r['row_id']]['features'];f=r['features']
                if b['off_off_ppd'] is not None and b['def_off_ppd'] is not None and f['drives'] is not None and f['opponent_drives'] is not None:
                    c['features']['baseline']=(b['off_off_ppd']+b['def_off_ppd'])/2*(f['drives']+f['opponent_drives'])/2
                candidate.append(c)
            data[f'k{k}']=candidate
            print('Prepared shrinkage',k,len(candidate),flush=True)
    finally:core_features.weight=original
    actual_drives={(r['game_id'],r['team']):r['drives'] for r in rows}
    for r in data['linear']:r['actual_drives']=actual_drives.get((r['game_id'],r['team']))
    payload=gzip.compress(json.dumps(data,sort_keys=True,allow_nan=False).encode(),mtime=0)
    target=target_dir/'features.json.gz';target.write_bytes(payload)
    (target_dir/'features-ref.json').write_text(json.dumps(dict(path=str(target.relative_to(ROOT)),sha256=hashlib.sha256(payload).hexdigest(),parent=evidence['sha256']),indent=2)+'\n')

if __name__=='__main__':run()
