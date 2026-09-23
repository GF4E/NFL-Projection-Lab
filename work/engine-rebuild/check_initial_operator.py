"""Captured initial-operator canary. All mutations are isolated.

Source first-seen/cutoff and closeout evidence, future clocks and final scores
are simulation fixtures. This is never historical availability or accuracy proof.
"""
import argparse
import csv
import datetime as dt
import gzip
import io
import json
from pathlib import Path
import resource
import subprocess
import sys
import tempfile
import time
from contextlib import ExitStack
from unittest.mock import patch

ROOT = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
sys.path.insert(0, str(ROOT))
from engine.projection import cutoff_pipeline as p, cutoff_state as cs, cutoff_worker as worker
from engine.projection import observations as obs, prepared, bundle, training_ledger as ledger
from engine.projection import pipeline_release as release, weekly_refit as weekly, public_closeout as public, initial_release as initial, release_preflight as preflight
from engine.projection.storage import save
from engine.projection.lineage import read_artifact
from engine.projection.source_archive import read_source, store_source
from engine.forecast_system.calendar import timestamp
from scripts import projection_v3_prepare as preparer, projection_v3_publish as publisher
from scripts import projection_learning, board_v7_publish, board_v9_publish, cloud_scheduler as scheduler
from engine.projection_v3 import qualify


def verify(source_root=ROOT, temp_parent=None, *, packet_ref, runtime_manifest):
    on_phase=None;code_commit=None
    source_root = Path(source_root)
    started = time.monotonic()
    phases = {}
    def phase(name):
        phases[name] = time.monotonic() - started
        print(json.dumps({'phase': name, 'elapsed_seconds': phases[name]}), file=sys.stderr, flush=True)
        if on_phase is not None:on_phase(name, phases[name])
    frozen = {str(f.relative_to(source_root)): obs.sha(f.read_bytes())
              for kind in ('locks', 'grades') for f in (source_root/'outputs/projection-v3'/kind).glob('*.json')}
    ledger_name = 'linux-current-ref.json' if sys.platform == 'linux' else 'current-ref.json'
    training_ref = json.loads((source_root/'work/engine-rebuild/training-transition'/ledger_name).read_bytes())
    training = p.load(source_root, training_ref, 'training')
    fit_ref = prepared.active_fit(source_root)
    fit_before=(source_root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes()
    artifact = read_artifact(source_root, fit_ref)
    if cs.method(source_root, fit_ref) != training['method']:
        raise ValueError('Captured training method and active fit differ')
    replay = ledger.read(source_root, training['replay_ref'])
    paths = set()
    def add_ref(ref):
        if obs.sha((source_root/ref['path']).read_bytes()) != ref['sha256']:
            raise ValueError('Source reference hash differs')
        paths.add(ref['path'])
    for ref in (training_ref, training['base_ref'], *training['preparations'], training['replay_ref'],
                training['legacy_audit_ref'], training['method_fit_ref'], *training['sources'].values(),
                replay['sources']['active_method'], fit_ref, artifact['shapes']):
        add_ref(ref)
    for name in ('config/stadiums.json', 'config/game_card_team_colors.json',
                 'work/in-season-learning-v1/reference.json', 'work/in-season-learning-v1/historical-ref.json',
                 'work/projection-v1/fit-ref.json'):
        paths.add(name)
    reference = json.loads((source_root/'work/in-season-learning-v1/reference.json').read_bytes())
    historical = json.loads((source_root/'work/in-season-learning-v1/historical-ref.json').read_bytes())
    v1_ref = json.loads((source_root/'work/projection-v1/fit-ref.json').read_bytes())
    v1 = read_artifact(source_root, v1_ref)
    for ref in (reference['oof'], historical, v1_ref, v1['source_manifest']['schedule']): add_ref(ref)
    original_rows, original_metadata, _ = prepared.load(source_root)
    week = original_metadata.get('publication_week', min(18, max(
        [int(r['week']) for r in original_rows if r.get('actual_points') is not None] + [1]) + 1))
    rows = [r for r in original_rows if int(r['week']) == week]
    ids = {r['game_id'] for r in rows}
    if len(rows) != len(ids)*2 or not ids: raise ValueError('Full current slate required')
    final_feed = json.loads((source_root/'outputs/projection-v3/final-feed.json').read_bytes())
    final_raw = read_source(source_root, final_feed)
    captured_source_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source_root, text=True).strip()
    source_commit = code_commit or captured_source_commit
    code = {'commit': source_commit, 'files': {n: obs.sha((ROOT/n).read_bytes()) for n in bundle.CODE_PATHS},
            'environment': {'python': sys.version, 'scope': 'isolated actual interpreter; source bytes captured'}}
    packet=preflight.read(source_root,packet_ref)
    add_ref(packet_ref)
    for ref in [*packet['documents'],*packet['evidence'].values()]:add_ref(ref)
    closeout=preflight.read(source_root,packet['evidence']['public_closeout'])
    for name,digest in closeout['artifacts'].items():add_ref({'path':name,'sha256':digest})
    paths.update(bundle.CODE_PATHS)
    simulated_cutoff = timestamp('2026-09-25T13:00:00Z')
    with tempfile.TemporaryDirectory(prefix='full-lifecycle-', dir=temp_parent) as folder, ExitStack() as stack:
        root = Path(folder)
        for name in paths:
            dest = root/name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes((source_root/name).read_bytes())
        save(root/'work/in-season-learning-v1/active-fit-ref.json', fit_ref)
        sources = {k: training['sources'][k] for k in ('schedule', 'team_games')}
        save(root/'work/projection-v1/source-manifest.json', sources)
        raw = gzip.compress(prepared.raw(rows), mtime=0)
        prepared.commit(root, raw, {'fit': fit_ref, 'elo_hfa': artifact['elo_hfa'], 'sha256': prepared.sha(raw),
                                   'signature': 'captured-full-slate-isolated-simulation', 'publication_week': week})
        feed_ref = store_source(root, final_raw)
        save(root/'outputs/projection-v3/final-feed.json', {**final_feed, 'source_ref': feed_ref})
        stack.enter_context(patch.object(preparer, 'ROOT', root))
        stack.enter_context(patch.multiple(publisher, ROOT=root, OUT=root/'outputs/projection-v3', WORK=root/'work/projection-v3'))
        stack.enter_context(patch.object(projection_learning, 'ROOT', root))
        stack.enter_context(patch.object(qualify, 'ROOT', root))
        for module in (board_v7_publish, board_v9_publish): stack.enter_context(patch.object(module, 'ROOT', root))
        def active():
            ref = prepared.active_fit(root)
            return ref, read_artifact(root, ref)
        stack.enter_context(patch.object(projection_learning, 'active_artifact_with_ref', side_effect=active))
        stack.enter_context(patch.object(bundle, 'capture_code', return_value=code))
        stack.enter_context(patch.object(release, 'source', return_value=code))
        save(root/release.OWNER, {'state': 'ACTIVE', 'owner': 'canary', 'scope': 'ISOLATED_SIMULATION'})
        stack.enter_context(patch.object(scheduler,'ROOT',root))
        # Simulated Thursday issuance through actual publisher, before first Friday state.
        early={r['game_id'] for r in rows if p.time_of(r['game'])<simulated_cutoff}
        if len(early)!=1:raise ValueError('Expected one preactivation Thursday fixture')
        early_time=max(p.time_of(r['game']) for r in rows if r['game_id'] in early)
        with patch.object(p,'now',return_value=early_time-dt.timedelta(seconds=1)):
            publisher.run(early_time-dt.timedelta(seconds=1))
        with patch.object(p,'now',return_value=early_time):
            cards=publisher.run(early_time)['games']
        legacy_hashes={gid:obs.sha((root/'outputs/projection-v3/locks'/f'{gid}.json').read_bytes()) for gid in early}
        # Original input bytes stay exact; only isolated availability receipts are simulated.
        with patch.object(obs, 'now', return_value=simulated_cutoff-dt.timedelta(minutes=2)):
            observed = obs.capture(root, sources)
        with patch.object(worker, 'now', return_value=simulated_cutoff-dt.timedelta(minutes=1)):
            worker.configure(root, 'canary', fit_ref)
        with patch.object(cs, 'now', return_value=simulated_cutoff+dt.timedelta(seconds=1)), \
             patch.object(worker, 'now', side_effect=[simulated_cutoff+dt.timedelta(seconds=1), simulated_cutoff+dt.timedelta(seconds=2)]):
            state=worker.run_due(root,'canary')
        if state['state']!='COMMITTED':raise ValueError(state)
        phase('CAPTURED_FRIDAY_STATE_READY')
        # The clock advances with actual execution time; stage/activation expiry is exercised.
        clock_start=time.monotonic()
        def clock():return simulated_cutoff+dt.timedelta(hours=2,seconds=time.monotonic()-clock_start)
        stack.enter_context(patch.object(p,'now',side_effect=clock))
        # Capture-window calculations use real production functions against the fixture clock.
        capture_window=scheduler.capture_window
        stack.enter_context(patch.object(scheduler,'capture_window',side_effect=lambda: capture_window(clock())))
        before=prepared.current(root)
        staged=initial.stage(root,packet_ref,owner='canary',runtime_manifest=runtime_manifest)
        if prepared.current(root)!=before or release.pointer(root,release.ACTIVE) is not None or weekly.load(root,weekly.CONFIG) is not None:
            raise ValueError('Staging changed live fixture pointers')
        phase('INITIAL_PLAN_STAGED')
        extended=p.load(root,staged['training_ref'],'training')
        if set(extended['migration_boundary']['reconstructed_games'])!=early:raise ValueError('Thursday migration population differs')
        if any(r['status']!='RETAINED_ORIGINAL' for r in extended['migration_boundary']['original_records']):
            raise ValueError('Thursday original lock not bound')
        result=initial.activate(root,staged['plan_ref'],owner='canary')
        if result['state']!='COMMITTED' or release.guard(root)['mode']!='SCHEDULED':raise ValueError('Activation did not commit')
        if initial.activate(root,staged['plan_ref'],owner='canary')!=result:raise ValueError('Activation retry differs')
        if weekly.load(root,weekly.CONFIG)['training_ref']!=staged['training_ref']:raise ValueError('Weekly configuration unbound')
        phase('INITIAL_PLAN_ACTIVATED_AND_RETRIED')
        cards=publisher.run(clock())['games']
        if {c['game_id'] for c in cards}!=ids:raise ValueError('Handoff changed slate population')
        eligible=[]
        for card in cards:
            bundle.verify_card(root,card)
            if card['game_id'] in early:continue
            body=bundle.verify_card(root,card)
            if card.get('forecast_role')=='FINAL_ELIGIBLE':
                if timestamp(body['chronology']['state_lineage']['cutoff_at'])!=simulated_cutoff:
                    raise ValueError('Upcoming forecast did not use Friday state')
                eligible.append(card['game_id'])
        if not eligible:raise ValueError('No Friday-state forecasts')
        phase('UPCOMING_FRIDAY_STATE_FORECASTS_VERIFIED')
        release.switch(root,staged['rollback'],owner='canary',operation_id='initial-canary-rollback',expected_active=staged['target'])
        if prepared.current(root)!=before or weekly.load(root,weekly.CONFIG) is not None or prepared.active_fit(root)!=fit_ref:
            raise ValueError('Initial rollback differs')
        if legacy_hashes!={gid:obs.sha((root/'outputs/projection-v3/locks'/f'{gid}.json').read_bytes()) for gid in early}:
            raise ValueError('Thursday legacy lock changed')
        phase('INITIAL_ROLLBACK_PRESERVED_THURSDAY')
    if any(obs.sha((source_root/name).read_bytes())!=sha for name,sha in frozen.items()):raise ValueError('Source records changed')
    if (source_root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes()!=fit_before:raise ValueError('Source fit pointer changed')
    return {'status':'PASS','source_commit':source_commit,'code':code,'packet_ref':packet_ref,
        'training_ref':training_ref,'extended_training_ref':staged['training_ref'],
        'training_games':len(extended['training_games']),'slate_games':len(ids),
        'legacy_thursday_games':sorted(early),'friday_state_games':sorted(eligible),
        'original_source_records_preserved':len(frozen),'elapsed_seconds':time.monotonic()-started,
        'phase_seconds':phases,'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
        'provider_requests':0,'new_spending':0,'live_activation':False,
        'scope':'Real technical preflight, runtime verification, migration, stage, activate, retry, forecast and rollback on captured inputs in an isolated temporary root. Availability, Thursday lock, Friday cutoff and operator clock are explicit fixtures. No production activation or historical availability claim.'}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--packet-ref',required=True)
    parser.add_argument('--runtime-manifest',required=True)
    parser.add_argument('--temp-parent',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
    result=verify(temp_parent=Path(args.temp_parent),packet_ref=json.loads(Path(args.packet_ref).read_bytes()),runtime_manifest=args.runtime_manifest)
    if result['elapsed_seconds']>=570:raise TimeoutError('Initial operator canary exceeded hard budget')
    save(Path(args.output),result,immutable=True)
    print(json.dumps(result),flush=True)
