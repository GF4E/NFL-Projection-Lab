"""Captured inputs through the actual publisher; final scores are test fixtures."""
import copy,csv,datetime as dt,io,json,resource,sys,tempfile,time
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection import cutoff_pipeline as p,cutoff_state as cs,cutoff_worker as worker,observations as obs,prepared,bundle
from engine.projection.lineage import read_artifact
from engine.projection.scoring import prepare_pair
from engine.projection.scoring_process import score_batch
from engine.projection.features import build as legacy_build
from engine.projection.storage import save
from engine.projection.source_archive import store_source,read_source
from engine.forecast_system.calendar import timestamp
from engine.forecast_system.cadence import cutoff_before,next_cutoff
from scripts import projection_v3_prepare as preparer,projection_v3_publish as publisher,projection_learning,board_v7_publish,board_v9_publish
from engine.projection_v3 import qualify


def verify(source_root=ROOT,temp_parent=None,scheduled=False,release_transitions=False):
    if release_transitions and not scheduled:raise ValueError('Release canary requires scheduled selection')
    from engine.projection import pipeline_release
    source_root=Path(source_root);started=time.monotonic();timings={}
    def elapsed(name,start):
        timings[name]=time.monotonic()-start
        print('CANARY_STAGE '+json.dumps({name:timings[name]}),file=sys.stderr,flush=True)
    frozen={str(f.relative_to(source_root)):obs.sha(f.read_bytes()) for kind in ('locks','grades')
            for f in (source_root/'outputs/projection-v3'/kind).glob('*.json')}
    latest=obs.current(source_root);paths={obs.POINTER};cursor=latest
    while cursor:
        paths.add(cursor['path']);snapshot,records=obs.load(source_root,cursor)
        name=f'{obs.BASE}/transactions/{snapshot["transaction"]}.json';paths.add(name)
        envelope=json.loads((source_root/name).read_bytes());transaction=envelope['body']
        assert envelope['sha256']==obs.sha(obs.raw(transaction))
        for ref in transaction['sources'].values():paths.add(ref['path'])
        for record in records.values():
            paths.add(record['reference']['batch']['path'])
            for ref in record['sources'].values():paths.add(ref['path'])
        cursor=snapshot['parent']
    _,_,transaction=cs.snapshot_before(source_root,latest,dt.datetime.now(dt.timezone.utc)+dt.timedelta(seconds=1))
    collected=timestamp(transaction['collected_at']);first=next_cutoff(collected)
    fit_ref=prepared.active_fit(source_root);artifact=read_artifact(source_root,fit_ref)
    paths.update((fit_ref['path'],artifact['shapes']['path'],'config/stadiums.json','config/game_card_team_colors.json',
                  'work/in-season-learning-v1/reference.json','work/in-season-learning-v1/historical-ref.json',
                  'work/projection-v1/fit-ref.json'))
    reference=json.loads((source_root/'work/in-season-learning-v1/reference.json').read_bytes())
    historical=json.loads((source_root/'work/in-season-learning-v1/historical-ref.json').read_bytes())
    v1_ref=json.loads((source_root/'work/projection-v1/fit-ref.json').read_bytes())
    v1=read_artifact(source_root,v1_ref)
    paths.update((reference['oof']['path'],historical['path'],v1_ref['path'],v1['source_manifest']['schedule']['path']))
    schedule=obs.read_source(source_root,transaction['sources']['schedule'],'schedule')
    ids={g['game_id'] for g in schedule if g['game_type']=='REG' and cutoff_before(p.time_of(g))==first}
    if scheduled:ids.update(g['game_id'] for g in schedule if g['game_type']=='REG' and cutoff_before(p.time_of(g))==next_cutoff(first))
    original_rows,original_metadata,_=prepared.load(source_root)
    publication_week=original_metadata.get('publication_week',min(18,max([int(r['week']) for r in original_rows if r.get('actual_points') is not None]+[1])+1))
    rows=[r for r in original_rows if r['game_id'] in ids]
    assert len(rows)==2*len(ids)>0
    at=min(p.time_of(r['game']) for r in rows)-dt.timedelta(minutes=5)
    pairs={gid:{'home' if r['home'] else 'away':r for r in rows if r['game_id']==gid} for gid in sorted(ids)}
    cached=score_batch(artifact,read_artifact(source_root,artifact['shapes']),[prepare_pair(pair) for pair in pairs.values()])
    legacy=legacy_build(obs.read_source(source_root,transaction['sources']['team_games'],'team-games'),schedule,
                        json.loads((source_root/'config/stadiums.json').read_bytes()),elo_hfa=artifact['elo_hfa'])
    old_pairs={gid:{'home' if r['home'] else 'away':r for r in legacy if r['game_id']==gid} for gid in sorted(ids)}
    expected=score_batch(artifact,read_artifact(source_root,artifact['shapes']),[prepare_pair(pair) for pair in old_pairs.values()])
    cache_delta=max(abs(expected[g]['projection'][key]-cached[g]['projection'][key])
                    for g in ids for key in ('home_points','away_points','margin','total'))
    final_feed=json.loads((source_root/'outputs/projection-v3/final-feed.json').read_bytes())
    final_raw=read_source(source_root,final_feed)
    with tempfile.TemporaryDirectory(prefix='cutoff-publisher-',dir=temp_parent) as folder,ExitStack() as stack:
        target=Path(folder)
        for name in paths:
            path=target/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes((source_root/name).read_bytes())
        save(target/'work/in-season-learning-v1/active-fit-ref.json',fit_ref)
        save(target/'work/projection-v1/source-manifest.json',transaction['sources'])
        import gzip
        data=gzip.compress(prepared.raw(rows),mtime=0)
        prepared.commit(target,data,{'fit':fit_ref,'elo_hfa':artifact['elo_hfa'],'sha256':prepared.sha(data),'signature':'captured-slate-subset','publication_week':publication_week})
        feed_ref=store_source(target,final_raw)
        save(target/'outputs/projection-v3/final-feed.json',{**final_feed,'source_ref':feed_ref})
        phase=time.monotonic()
        with patch.object(cs,'now',return_value=first+dt.timedelta(seconds=1)):
            if scheduled:
                with patch.object(worker,'now',return_value=first-dt.timedelta(hours=1)):worker.configure(target,'canary',fit_ref)
                with patch.object(worker,'now',side_effect=[first+dt.timedelta(seconds=1),first+dt.timedelta(seconds=2)]):
                    state_ref=worker.run_due(target,'canary')['state_ref']
            else:state_ref=cs.advance(target,first,fit_ref)
        elapsed('state_update',phase)
        stack.enter_context(patch.multiple(preparer,ROOT=target))
        stack.enter_context(patch.multiple(publisher,ROOT=target,OUT=target/'outputs/projection-v3',WORK=target/'work/projection-v3'))
        stack.enter_context(patch.object(qualify,'ROOT',target))
        stack.enter_context(patch.object(projection_learning,'active_artifact_with_ref',return_value=(fit_ref,artifact)))
        for module in (board_v7_publish,board_v9_publish):
            stack.enter_context(patch.object(module,'ROOT',target))
        # Candidate code is not committed in this isolated directory. Retain its
        # exact bytes' identities; this does not impersonate a deployed source commit.
        code={'commit':'UNCOMMITTED_CAPTURED_CANDIDATE','files':{n:obs.sha((ROOT/n).read_bytes()) for n in bundle.CODE_PATHS},
              'environment':{'python':sys.version,'scope':'actual canary interpreter'}}
        stack.enter_context(patch.object(bundle,'capture_code',return_value=code))
        release_receipts=[]
        if release_transitions:
            stack.enter_context(patch.object(pipeline_release,'source',return_value=code))
            save(target/pipeline_release.OWNER,{'state':'ACTIVE','owner':'canary','scope':'ISOLATED_SIMULATION'})
            legacy_release=pipeline_release.checkpoint(target,label='captured legacy rollback checkpoint')
        phase=time.monotonic()
        with patch.object(p,'now',return_value=at-dt.timedelta(seconds=1)):
            if scheduled:preparer.prepare(select_scheduled=True,at=at)
            else:preparer.prepare(cutoff_state_ref=state_ref,game_ids=sorted(ids),role='FINAL_ELIGIBLE',at=at)
        elapsed('prepare',phase);phase=time.monotonic()
        if release_transitions:
            scheduled_release=pipeline_release.checkpoint(target,label='scheduled preparation canary')
            release_receipts.append(pipeline_release.switch(target,scheduled_release,owner='canary',operation_id='canary-activate',expected_active=None))
            assert pipeline_release.guard(target)['mode']=='SCHEDULED'
            elapsed('release_switch',phase);phase=time.monotonic()
        with patch.object(p,'now',return_value=at+dt.timedelta(seconds=1)):
            upcoming=publisher.run(at+dt.timedelta(seconds=1))
        elapsed('upcoming_publish_including_board',phase)
        assert len(upcoming['games'])==len(ids)
        differences=[{'game_id':c['game_id'],'actual':c['projection'],'reference':expected[c['game_id']]['projection']}
                     for c in upcoming['games'] if c['projection']!=expected[c['game_id']]['projection']]
        if differences:raise ValueError('Captured parity differs: '+json.dumps(differences[:2]))
        assert all(bundle.verify_card(target,c)['chronology']['status']=='RECORDED_CUTOFF_INPUTS' for c in upcoming['games'])
        if release_transitions:
            assert all(bundle.resolve(target,c['release_ref'],'releases')['pipeline_release_ref']==scheduled_release for c in upcoming['games'])
        final_ids={c['game_id'] for c in upcoming['games'] if c['forecast_role']=='FINAL_ELIGIBLE'}
        preview_ids=ids-final_ids
        if scheduled:
            assert final_ids and preview_ids
            assert all('availability_ref' in bundle.verify_card(target,c)['chronology']['state_lineage'] for c in upcoming['games'])
        deadline=max(timestamp(c['cutoff_at']) for c in upcoming['games'] if c['game_id'] in final_ids)
        phase=time.monotonic();locked=publisher.run(deadline);elapsed('first_lock_publish_including_board',phase)
        assert all(c['status']=='LOCKED' for c in locked['games'] if c['game_id'] in final_ids)
        assert all(c['forecast_role']=='PROVISIONAL' for c in locked['games'] if c['game_id'] in preview_ids)
        original_locks={f.name:obs.sha(f.read_bytes()) for f in (target/'outputs/projection-v3/locks').glob('*.json')}
        if release_transitions:
            phase=time.monotonic()
            release_receipts.append(pipeline_release.switch(target,legacy_release,owner='canary',operation_id='canary-rollback',expected_active=scheduled_release))
            assert pipeline_release.guard(target)['mode']=='LEGACY'
            assert original_locks=={f.name:obs.sha(f.read_bytes()) for f in (target/'outputs/projection-v3/locks').glob('*.json')}
            elapsed('release_rollback_before_grade',phase)
        # These future games have no actual final. Deliberately synthetic scores
        # exercise the real grader and board evidence, never an accuracy claim.
        records=list(csv.DictReader(io.StringIO(final_raw.decode())));finals={}
        for row in records:
            if row['game_id'] not in final_ids:continue
            row.update(away_score='20',home_score='27',result='7',total='47')
            finals[row['game_id']]={'away_score':20.,'home_score':27.}
        assert set(finals)==final_ids
        stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=list(records[0]));writer.writeheader();writer.writerows(records)
        raw=stream.getvalue().encode();ref=store_source(target,raw)
        grade_time=next_cutoff(first)-dt.timedelta(hours=1) if scheduled else deadline+dt.timedelta(days=1)
        save(target/'outputs/projection-v3/final-feed.json',{'games':{**final_feed['games'],**finals},'source_ref':ref,
             'source_sha256':obs.sha(raw),'received_at':grade_time.isoformat(),'simulation':True})
        phase=time.monotonic();graded=publisher.run(grade_time);elapsed('first_grade_publish_including_board',phase)
        assert all(c['status']=='FINAL' and c['grades'] and c['forecast_bundle_ref']==old['forecast_bundle_ref']
                   for c,old in zip(graded['games'],upcoming['games']) if c['game_id'] in final_ids)
        if release_transitions:
            for card in graded['games']:
                bundle.verify_card(target,card)
                original=bundle.resolve(target,card['release_ref'],'releases')['pipeline_release_ref']
                assert original==(scheduled_release if card['game_id'] in final_ids else legacy_release)
        grades={f.name:obs.sha(f.read_bytes()) for f in (target/'outputs/projection-v3/grades').glob('*.json')}
        phase=time.monotonic();publisher.run(grade_time+dt.timedelta(minutes=1));elapsed('duplicate_grade_publish_including_board',phase)
        assert grades=={f.name:obs.sha(f.read_bytes()) for f in (target/'outputs/projection-v3/grades').glob('*.json')}
        assert original_locks=={f.name:obs.sha(f.read_bytes()) for f in (target/'outputs/projection-v3/locks').glob('*.json')}
        evidence=json.loads((target/'outputs/board-v7/evidence.json').read_bytes())
        context=json.loads((target/'outputs/board-v7/context-v9.json').read_bytes())
        assert set(context['games'])==ids and set(evidence['games'])==ids
        artifact_bytes=sum(f.stat().st_size for base in (p.BASE,'outputs/projection-v3','outputs/board-v7') for f in (target/base).rglob('*') if f.is_file())
    assert all(obs.sha((source_root/name).read_bytes())==sha for name,sha in frozen.items())
    return {'status':'PASS','scope':'Actual preparer/publisher/bundle/lock/grader/board-evidence code; captured inputs, simulated future clocks and explicitly synthetic final scores. No activation or public website publish.',
            'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'fit_ref':fit_ref,'observation_ref':latest,
            'slate_games':len(ids),'scheduled_selection':scheduled,'release_transition_simulation':release_transitions,
            'release_transition_receipts':release_receipts,'final_eligible_games':len(final_ids),'provisional_games':len(preview_ids),'point_probability_interval_parity_games':len(ids),'source_frozen_records_preserved':len(frozen),
            'reference':'Legacy builder independently rerun on identical captured sources in this runtime; exact projection equality required.',
            'original_cache_max_point_difference':cache_delta,
            'synthetic_first_grades':len(grades),'idempotent_grades':len(grades),'preserved_canary_locks':len(original_locks),
            'board_evidence_games':len(evidence['games']),'board_context_games':len(context['games']),
            'simulated_cutoff':first.isoformat(),'simulated_preparation':at.isoformat(),'synthetic_final':{'away':20,'home':27},
            'candidate_code':code['files'],
            'consumer_code':{n:obs.sha((ROOT/n).read_bytes()) for n in ('engine/projection/finals.py','engine/projection/source_archive.py','scripts/cloud_scheduler.py','scripts/board_v7_publish.py','scripts/board_v9_publish.py','work/engine-rebuild/check_cutoff_publisher.py')},'stage_seconds':timings,'elapsed_seconds':time.monotonic()-started,
            'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024),
            'artifact_bytes':artifact_bytes,'reference_limit':'Board references still use the retained SUPERSEDED adaptive series; current-reference migration remains required.',
            'provider_requests':0,'new_spending':0}
