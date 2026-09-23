"""Independent comparisons of saved donor decisions, chronology and values."""
import collections, gc, gzip, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def load(ref):
    raw=(ROOT/ref['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==ref['sha256'],ref['path']
    return json.loads(gzip.decompress(raw) if ref['path'].endswith('.gz') else raw)

def compare(a,b):
    if isinstance(a,dict):
        assert set(a)==set(b)
        return max([compare(a[k],b[k]) for k in a]+[0.])
    if isinstance(a,list):
        assert len(a)==len(b)
        return max([compare(x,y) for x,y in zip(a,b)]+[0.])
    if isinstance(a,(int,float)) and not isinstance(a,bool):
        assert abs(a-b)<1e-10
        return abs(a-b)
    assert a==b,(a,b)
    return 0.

def run():
    ref=json.loads((ROOT/'work/engine-rebuild/donor-qualification-current.json').read_text()); summary=load(ref)
    original=load(summary['original']); corrected=load(summary['corrected'])
    exp=load(summary['experiment']); old_q={q['before_season']:q for q in load(exp['qualification'])}
    delta=max(compare(q,old_q[q['before_season']]) for q in original['decisions'])
    before={r['game_id']:r for r in original['forecasts']}; after={r['game_id']:r for r in corrected['forecasts']}
    assert set(before)==set(after)=={r['game_id'] for r in load(summary['control_unchanged'])}
    changed=collections.Counter(); largest=0.; changes=[]
    for gid,a in after.items():
        b=before[gid]; assert a['actual_home']==b['actual_home'] and a['actual_away']==b['actual_away']
        d=max(abs(a['home']-b['home']),abs(a['away']-b['away'])); largest=max(largest,d)
        if d>1e-10: changed[str(a['season'])]+=1
    for key,cache in summary['original_caches'].items():
        features=load(summary['feature_artifacts'][key]); old=load(cache)
        originals={r['row_id']:r for r in old}
        for row_id,info in features['retained_provenance'].items():
            for name,v in info['values'].items():
                oldv=originals[row_id]['features'][name]
                if oldv!=v and not (oldv is not None and v is not None and abs(oldv-v)<=1e-10):
                    changes.append({'decay':key,'row_id':row_id,'field':name,'original':oldv,'corrected':v})
        for fit in corrected['fits']:
            year=fit['season']; te=[r for r in features['rows'] if r['season']==year]
            assert not {r['game_id'] for r in te}&set(fit['training_game_ids'])
            assert all(int(gid.split('_')[0])<year for gid in fit['training_game_ids'])
        del features,old,originals; gc.collect()
    for bound in summary['code']+[summary['plan']]:
        assert hashlib.sha256((ROOT/bound['path']).read_bytes()).hexdigest()==bound['sha256']
    result={'status':'PASS','summary':ref,'original_qualification_max_numeric_difference':delta,
            'changed_forecasts_by_season':dict(changed),'largest_team_point_difference':largest,
            'personnel_or_wind_value_changes':changes,
            'unsafe_window_games':sorted({r['row_id'].rsplit(':',1)[0] for r in summary['chronology']['unsafe_windows']}),
            'scope':'Saved decisions, paired populations, prior-season training, archive bindings and field changes. No new fit or accuracy gate.'}
    p=ROOT/'work/engine-rebuild/donor-qualification-independent-check.json';p.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
if __name__=='__main__':run()
