"""Captured-source state restoration canary; simulated future clock, no issuance."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection import cutoff_state as cs, observations as obs
from engine.projection.features import build as legacy_build
from engine.projection.lineage import read_artifact
from engine.forecast_system.calendar import timestamp,schedule_kickoff
from engine.forecast_system.cadence import next_cutoff,cutoff_before


def verify(source_root=ROOT,temp_parent=None,verify_remote=True):
    source_root=Path(source_root);started=time.monotonic()
    frozen={str(p.relative_to(source_root)):obs.sha(p.read_bytes()) for kind in ('locks','grades') for p in (source_root/'outputs/projection-v3'/kind).glob('*.json')}
    latest=obs.current(source_root);paths={obs.POINTER};cursor=latest;snapshots=0
    while cursor:
        paths.add(cursor['path']);snapshot,records=obs.load(source_root,cursor);snapshots+=1
        tx=f'{obs.BASE}/transactions/{snapshot["transaction"]}.json';paths.add(tx)
        transaction=json.loads((source_root/tx).read_bytes())
        assert obs.sha(obs.raw(transaction['body']))==transaction['sha256']
        for ref in transaction['body']['sources'].values():paths.add(ref['path'])
        for record in records.values():
            paths.add(record['reference']['batch']['path'])
            for ref in record['sources'].values():paths.add(ref['path'])
        # Empty revision batches are still records of this transaction.
        for p in (source_root/obs.BASE/'batches').glob('*.json.gz'):paths.add(str(p.relative_to(source_root)))
        cursor=snapshot['parent']
    remote_commit=None
    if verify_remote:
        remote_commit=subprocess.check_output(['git','rev-parse','origin/engine-v2'],cwd=source_root,text=True).strip()
        for name in sorted(paths):
            assert subprocess.check_output(['git','show',remote_commit+':'+name],cwd=source_root)==(source_root/name).read_bytes(),name
    snapshot,records=obs.load(source_root,latest)
    transaction=json.loads((source_root/f'{obs.BASE}/transactions/{snapshot["transaction"]}.json').read_bytes())['body']
    collected=timestamp(transaction['collected_at']);first=next_cutoff(collected)
    # Real existing bytes and clocks; only execution time advances in the canary.
    later=next_cutoff(first);last=next_cutoff(later)
    fit_ref=json.loads((source_root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes());paths.add(fit_ref['path'])
    fit=read_artifact(source_root,fit_ref)
    schedule=obs.read_source(source_root,transaction['sources']['schedule'],'schedule')
    stats=obs.read_source(source_root,transaction['sources']['team_games'],'team-games')
    expected,_=obs.material(schedule,stats,collected)
    assert set(expected)==set(records)
    assert all(expected[g]['input_sha256']==records[g]['input_sha256'] for g in expected)
    with tempfile.TemporaryDirectory(prefix='cutoff-state-',dir=temp_parent) as folder:
        target=Path(folder)
        for name in sorted(paths):
            p=target/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((source_root/name).read_bytes())
        with patch.object(cs,'now',return_value=last+dt.timedelta(seconds=1)):
            refs=[cs.advance(target,t,fit_ref) for t in (first,later,last)]
            bodies=[cs.restore(target,r)[1] for r in refs]
            assert all(b['incorporated']==bodies[0]['incorporated'] for b in bodies)
            assert bodies[1]['added_games']==bodies[2]['added_games']==[]
            assert len(bodies[0]['incorporated'])==len(set(bodies[0]['incorporated']))==len(records)
            assert cs.advance(target,first,fit_ref)==refs[0] and cs.current(target)==refs[-1]
        slate=[{k:g.get(k) for k in cs.features.GAME_FIELDS} for g in schedule
               if g['game_type']=='REG' and cutoff_before(schedule_kickoff(g['gameday'],g['gametime'])-dt.timedelta(minutes=75))==first]
        for g in slate:g['source_hash']=transaction['sources']['schedule']['sha256']
        stadiums=json.loads((source_root/'config/stadiums.json').read_bytes())
        rows=cs.forecast_rows(target,refs[0],slate,stadiums)
        # Existing weekly implementation is a separate path for this all-prior-week snapshot.
        legacy=legacy_build(stats,schedule,stadiums,elo_hfa=fit['elo_hfa'])
        index={r['row_id']:r for r in legacy}
        assert rows and all(r['features']==index[r['row_id']]['features'] for r in rows),'Legacy feature parity differs'
        canary_bytes=sum(p.stat().st_size for p in (target/cs.BASE).rglob('*') if p.is_file())
        state_count=len(bodies[0]['incorporated'])
    assert all(obs.sha((source_root/p).read_bytes())==s for p,s in frozen.items())
    assert not (source_root/cs.POINTER).exists(),'Canary must not create active source state'
    return {'status':'PASS','checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),
            'scope':'Captured source restoration; simulated three future cutoffs only, no production state or issuance.',
            'source_remote_commit':remote_commit,'remote_graph_verified':verify_remote,'graph_files':len(paths)-1,
            'graph_snapshots':snapshots,'observation_ref':latest,'actual_collection_clock':collected.isoformat(),
            'simulated_cutoffs':[t.isoformat() for t in (first,later,last)],'fit_ref':fit_ref,
            'games_reproduced_from_sources':len(records),'state_games':state_count,'additional_duplicate_effects':0,
            'restored_states':len(refs),'same_state_after_empty_cutoffs':True,'state_bytes':canary_bytes,
            'legacy_feature_parity_rows':len(rows),'max_feature_difference':0,'frozen_records_unchanged':len(frozen),
            'candidate_code':{p:obs.sha((ROOT/p).read_bytes()) for p in cs.CODE},
            'elapsed_seconds':time.monotonic()-started,'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024),
            'provider_requests':0,'new_spending':0}


if __name__=='__main__':
    if os.environ.get('OPENBLAS_NUM_THREADS')!='1':raise ValueError('One worker required')
    result=verify();(ROOT/'work/engine-rebuild/cutoff-state-canary.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='candidate_code'},indent=2))
