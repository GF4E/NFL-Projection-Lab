"""Captured-source common pipeline canary; only simulated shadow locks are written."""
import collections
import datetime as dt
import json
from pathlib import Path
import resource
import sys
import tempfile
import time
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection import cutoff_pipeline as p, cutoff_state as cs, observations as obs
from engine.projection.lineage import read_artifact
from engine.projection.features import build as legacy_build
from engine.projection.scoring import prepare_pair
from engine.projection.scoring_process import score_batch
from engine.forecast_system.calendar import timestamp
from engine.forecast_system.cadence import cutoff_before,next_cutoff


def verify(source_root=ROOT,temp_parent=None):
    source_root=Path(source_root);started=time.monotonic()
    frozen={str(path.relative_to(source_root)):obs.sha(path.read_bytes()) for kind in ('locks','grades')
            for path in (source_root/'outputs/projection-v3'/kind).glob('*.json')}
    latest=obs.current(source_root);paths={obs.POINTER};cursor=latest
    while cursor:
        paths.add(cursor['path']);snapshot,records=obs.load(source_root,cursor)
        transaction_path=f'{obs.BASE}/transactions/{snapshot["transaction"]}.json';paths.add(transaction_path)
        transaction=json.loads((source_root/transaction_path).read_bytes())
        assert transaction['sha256']==obs.sha(obs.raw(transaction['body']))
        for ref in transaction['body']['sources'].values():paths.add(ref['path'])
        for record in records.values():
            paths.add(record['reference']['batch']['path'])
            for ref in record['sources'].values():paths.add(ref['path'])
        cursor=snapshot['parent']
    snapshot,_=obs.load(source_root,latest)
    transaction=json.loads((source_root/f'{obs.BASE}/transactions/{snapshot["transaction"]}.json').read_bytes())['body']
    collected=timestamp(transaction['collected_at']);first=next_cutoff(collected)
    fit_ref=json.loads((source_root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes())
    artifact=read_artifact(source_root,fit_ref);paths.update((fit_ref['path'],artifact['shapes']['path']))
    schedule=obs.read_source(source_root,transaction['sources']['schedule'],'schedule')
    stats=obs.read_source(source_root,transaction['sources']['team_games'],'team-games')
    slate=[{k:g.get(k) for k in cs.features.GAME_FIELDS} for g in schedule
           if g['game_type']=='REG' and cutoff_before(p.time_of(g))==first]
    assert slate,'Captured next-cutoff slate required'
    for game in slate:game['source_hash']=transaction['sources']['schedule']['sha256']
    at=min(p.time_of(g) for g in slate)-dt.timedelta(minutes=5)
    assert at>first+dt.timedelta(seconds=1)
    stadiums=json.loads((source_root/'config/stadiums.json').read_bytes())
    with tempfile.TemporaryDirectory(prefix='common-pipeline-',dir=temp_parent) as directory:
        target=Path(directory)
        for name in sorted(paths):
            path=target/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes((source_root/name).read_bytes())
        with patch.object(cs,'now',return_value=first+dt.timedelta(seconds=1)):
            state_ref=cs.advance(target,first,fit_ref)
        with patch.object(p,'now',return_value=at-dt.timedelta(seconds=1)):
            schedule_ref=p.capture_schedule(target,transaction['sources']['schedule'])
        prepared=p.from_recorded(target,state_ref,slate,stadiums,at=at,role='FINAL_ELIGIBLE',schedule_ref=schedule_ref)
        assert p.verify_preparation(target,prepared)
        prep_ref=p.store(target,'preparations',prepared)
        legacy=legacy_build(stats,schedule,stadiums,elo_hfa=artifact['elo_hfa'])
        by_row={r['row_id']:r for r in legacy}
        assert all(row['features']==by_row[row['row_id']]['features'] for row in prepared['rows'])
        pairs=collections.defaultdict(dict)
        for row in prepared['rows']:pairs[row['game_id']]['home' if row['home'] else 'away']=by_row[row['row_id']]
        reference=score_batch(artifact,read_artifact(target,artifact['shapes']),[prepare_pair(pair) for pair in pairs.values()])
        with patch.object(p,'now',return_value=at+dt.timedelta(seconds=1)):
            forecasts=p.recorded_scores(target,prep_ref,fit_ref)
        source_metadata_changes=0
        for gid,ref in forecasts.items():
            value=p.load(target,ref,'forecasts')
            assert value['projection']==reference[gid]['projection']
            for side in ('home','away'):
                actual_terms=value['contributions'][side];old_terms=reference[gid]['contributions'][side]
                assert len(actual_terms)==len(old_terms)
                for actual,old in zip(actual_terms,old_terms):
                    # Recorded source receipts intentionally replace legacy source associations.
                    assert {k:v for k,v in actual.items() if k!='source_hashes'}=={k:v for k,v in old.items() if k!='source_hashes'}
                    source_metadata_changes+=actual['source_hashes']!=old['source_hashes']
            first_lock=p.commit_shadow_lock(target,ref,p.time_of(value['game']))
            assert first_lock==p.commit_shadow_lock(target,ref,p.time_of(value['game'])+dt.timedelta(minutes=1))
        # A successful batch whose response is lost remains recoverable after lock.
        with patch.object(p,'now',return_value=max(p.time_of(g) for g in slate)+dt.timedelta(minutes=1)):
            assert forecasts==p.recorded_scores(target,prep_ref,fit_ref)
        later=next_cutoff(first)
        with patch.object(cs,'now',return_value=later+dt.timedelta(seconds=1)):
            cs.advance(target,later,fit_ref)
        assert all(p.load(target,ref,'forecasts')['projection']==reference[gid]['projection'] for gid,ref in forecasts.items())
        assert not (target/'outputs/projection-v3/locks').exists()
        size=sum(path.stat().st_size for path in (target/p.BASE).rglob('*') if path.is_file())
    assert all(obs.sha((source_root/name).read_bytes())==digest for name,digest in frozen.items())
    return {'status':'PASS','scope':'Captured real sources; simulated future cutoff, preparation, scoring and shadow locks. No production activation.',
        'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'observation_ref':latest,'fit_ref':fit_ref,
        'actual_collection_at':collected.isoformat(),'simulated_cutoff':first.isoformat(),'simulated_preparation':at.isoformat(),
        'missing_at_simulated_cutoff':prepared['state']['missing'],
        'slate_games':len(slate),'feature_parity_rows':len(prepared['rows']),'point_and_contribution_parity_games':len(forecasts),
        'source_reconstructed_rows':len(prepared['rows']),'schedule_capture_ref':schedule_ref,
        'schedule_clock':'SIMULATED: source reread before simulated preparation; not historical first availability',
        'contribution_source_associations_changed':source_metadata_changes,
        'idempotent_shadow_locks':len(forecasts),'scoring_retry_after_deadline_preserved':True,
        'prior_forecasts_unchanged_after_later_cutoff':True,'frozen_source_records_unchanged':len(frozen),
        'pipeline_artifact_bytes':size,'elapsed_seconds':time.monotonic()-started,
        'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024),
        'candidate_code':{name:obs.sha((ROOT/name).read_bytes()) for name in (*cs.CODE,'engine/projection/cutoff_pipeline.py','engine/projection/scoring_process.py')},
        'provider_requests':0,'new_spending':0}


if __name__=='__main__':
    result=verify();(ROOT/'work/engine-rebuild/common-pipeline-canary.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='candidate_code'},indent=2))
