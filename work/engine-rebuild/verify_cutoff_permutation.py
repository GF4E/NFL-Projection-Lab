"""Verify full replay input-order invariance without fitting a candidate."""
import copy
import gzip
import json
from pathlib import Path
import time
from replay_cutoff_features import ROOT, read, sha, raw, cutoff_build, fit, predict

start=time.monotonic()
reference=json.loads((ROOT/'work/engine-rebuild/numerical-cutoff/current-ref.json').read_bytes())
encoded=(ROOT/reference['path']).read_bytes()
assert sha(encoded)==reference['sha256']
receipt=json.loads(gzip.decompress(encoded))
assert sha(gzip.decompress(encoded))==reference['decoded_sha256']
for item in receipt['code']+[receipt['replay_driver']]:
    assert sha((ROOT/item['path']).read_bytes())==item['sha256']
source=receipt['sources'];manifest=read(source['manifest']);active=read(receipt['active_fit_ref'])
schedule=[g for g in read(source['schedule']) if int(g['season'])<=2025 and g['game_type']=='REG']
stats=[r for r in read(source['team_games']) if r['season']<=2025]
cache=ROOT/'.cloud-private/cutoff-replay'/('features-'+receipt['feature_signature']+'.json.gz')
assert sha(cache.read_bytes())==receipt['feature_cache_sha256']
original=json.loads(gzip.decompress(cache.read_bytes()))['result']
reversed_result=cutoff_build(list(reversed(stats)),list(reversed(schedule)),read(source['stadiums']),None,manifest['roster_source_hashes'],active['elo_hfa'],mode='HISTORICAL_RECONSTRUCTION')
assert raw(original)==raw(reversed_result),'Full feature/lineage permutation differs'
index={r['row_id']:r for r in reversed_result['rows']}
history=[]
for old in read(source['historical_features']):
    row=copy.deepcopy(index[old['row_id']]);row['actual_points']=old['actual_points'];history.append(row)
fits={};checked=0
for game in receipt['games']:
    year=game['season'];through=game['through_week'];key=(year,through)
    if key not in fits:
        rows=[r for r in history if (r['season']<year or r['season']==year and r['week']<=through) and r['actual_points'] is not None and r['features']['baseline'] is not None]
        forward=fit(rows,active['groups'],active['selected'][1])
        backward=fit(list(reversed(rows)),active['groups'],active['selected'][1])
        assert raw(forward)==raw(backward),'Fit permutation differs'
        fits[key]=backward
    fitted=fits[key]
    assert fitted['training_hash']==game['corrected_training_hash']
    for row in (r for r in reversed_result['rows'] if r['game_id']==game['game_id']):
        side='home' if row['home'] else 'away'
        assert predict(fitted,row['features'])['points']==game[side+'_changed_inputs_and_refits']
        checked+=1
result={'status':'PASS','reference':reference,'feature_rows':len(original['rows']),'cutoffs':len(original['lineage']),
        'feature_and_lineage_max_difference':0,'paired_games':checked//2,'point_forecasts':checked,
        'distinct_refits':len(fits),'fit_and_point_max_difference':0,'elapsed_seconds':time.monotonic()-start,
        'scope':'Reverse all schedule/statistics rows and every training population; exact deterministic equality. Same numerical implementation, not independent statistical replication.',
        'verification_code_sha256':sha(Path(__file__).read_bytes())}
(ROOT/'work/engine-rebuild/numerical-cutoff/permutation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
