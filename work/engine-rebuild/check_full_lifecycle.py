"""Captured full-population operational canary. All mutations are isolated.

Source first-seen/cutoff and closeout evidence, future clocks and final scores
are simulation fixtures. This is never historical availability or accuracy proof.
"""
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

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from engine.projection import cutoff_pipeline as p, cutoff_state as cs, cutoff_worker as worker
from engine.projection import observations as obs, prepared, bundle, training_ledger as ledger
from engine.projection import pipeline_release as release, weekly_refit as weekly, public_closeout as public
from engine.projection.storage import save
from engine.projection.lineage import read_artifact
from engine.projection.source_archive import read_source, store_source
from engine.forecast_system.calendar import timestamp
from scripts import projection_v3_prepare as preparer, projection_v3_publish as publisher
from scripts import projection_learning, board_v7_publish, board_v9_publish
from engine.projection_v3 import qualify


def verify(source_root=ROOT, temp_parent=None, on_phase=None):
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
    source_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source_root, text=True).strip()
    code = {'commit': source_commit, 'files': {n: obs.sha((ROOT/n).read_bytes()) for n in bundle.CODE_PATHS},
            'environment': {'python': sys.version, 'scope': 'isolated actual interpreter; source bytes captured'}}
    simulated_cutoff = timestamp('2026-09-22T13:00:00Z')
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
        # Original input bytes stay exact; only isolated availability receipts are simulated.
        with patch.object(obs, 'now', return_value=simulated_cutoff-dt.timedelta(minutes=2)):
            observed = obs.capture(root, sources)
        with patch.object(worker, 'now', return_value=simulated_cutoff-dt.timedelta(minutes=1)):
            worker.configure(root, 'canary', fit_ref)
        with patch.object(cs, 'now', return_value=simulated_cutoff+dt.timedelta(seconds=1)), \
             patch.object(worker, 'now', side_effect=[simulated_cutoff+dt.timedelta(seconds=1), simulated_cutoff+dt.timedelta(seconds=2)]):
            state = worker.run_due(root, 'canary')
        if state['state'] != 'COMMITTED': raise ValueError(state)
        phase('CAPTURED_STATE_READY')
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
        preparer.prepare(select_scheduled=True)
        configuration = {'schema': 'recorded-weekly-refit-v1', 'owner': 'canary',
            'training_ref': training_ref, 'method_fit_ref': fit_ref, 'method': cs.method(root, fit_ref)}
        parent = release.checkpoint(root, label='captured scheduled parent',weekly_configuration=configuration)
        release.switch(root, parent, owner='canary', operation_id='canary-parent', expected_active=None)
        # Exercise the public verifier on a disclosed response fixture, not the live website.
        closed = root/'outputs/cadence-v2/closeouts/2026-09-22.json'
        evidence = root/'outputs/cadence-v2/weeks/2026-w2/scorecard.json'
        save(evidence, {'simulation': True, 'games': training['reconstructed_games']}, immutable=True)
        save(closed, {'schema': 'closeout-publication-v2', 'state': 'PUBLISHED', 'all_games_graded': True,
            'season': 2026, 'week': 2, 'published_at': (p.now()-dt.timedelta(seconds=1)).isoformat(),
            'source_commit': source_commit, 'publication_surface': 'SIMULATED_CLOSEOUT_RESPONSE',
            'artifacts': {str(evidence.relative_to(root)): obs.sha(evidence.read_bytes())}}, immutable=True)
        save(closed.parent/'acknowledgments'/closed.name, {'receipt_sha256': obs.sha(closed.read_bytes()),
            'verified_remote_commit': source_commit, 'confirmed_at': p.now().isoformat(),
            'publication_surface': 'SIMULATED_CLOSEOUT_RESPONSE'}, immutable=True)
        save(root/public.CONFIG, {'schema': 'public-closeout-endpoints-v1', 'base_url': 'https://fixture.invalid'})
        response = io.BytesIO(evidence.read_bytes()); response.status = 200
        with patch.object(public.urllib.request, 'urlopen', return_value=response): public.confirm(root, closed)
        phase('SIMULATED_CLOSEOUT_VERIFIED')
        with release.dispatch(root) as handle:
            result = projection_learning.weekly_refit([], 2, p.now(), owner='canary', dispatch_handle=handle)
        if result['state'] != 'REFIT_COMPLETE': raise ValueError(result)
        fitted = p.read_fit(root, result['fit'])
        shadow = p.read_fit(root, fitted['recorded_refit_ref'])
        if len(shadow['training_games']) != len(training['training_games']): raise ValueError('Training population changed')
        if fitted['shapes'] != artifact['shapes']: raise ValueError('Weight-only refit changed calibration')
        phase('FULL_RECORDED_REFIT_AND_RELEASE')
        with patch.object(p, 'refit', side_effect=AssertionError('Repeated numerical fitting')):
            if projection_learning.weekly_refit([], 2, p.now(), owner='canary') != result: raise ValueError('Retry identity differs')
        cards = publisher.run(p.now())['games']
        if {c['game_id'] for c in cards} != ids: raise ValueError('Publication lost a game')
        simulated_time = [p.now()]
        stack.enter_context(patch.object(p, 'now', side_effect=lambda: simulated_time[0]))
        cutoff_counts = {}; original_bundles = {}
        for cutoff in sorted({p.cutoff_before(p.time_of(r['game'])) for r in rows}):
            if cutoff > simulated_cutoff:
                simulated_time[0] = cutoff+dt.timedelta(seconds=3)
                with patch.object(cs, 'now', return_value=cutoff+dt.timedelta(seconds=1)), \
                     patch.object(worker, 'now', side_effect=[cutoff+dt.timedelta(seconds=1), cutoff+dt.timedelta(seconds=2)]):
                    state = worker.run_due(root, 'canary')
                if state['state'] != 'COMMITTED' or timestamp(state['cutoff_at']) != cutoff: raise ValueError('Wrong state cutoff')
                preparer.prepare(select_scheduled=True)
            cards = publisher.run(simulated_time[0])['games']
            group = {r['game_id'] for r in rows if p.cutoff_before(p.time_of(r['game'])) == cutoff}
            cutoff_counts[cutoff.isoformat()] = len(group)
            for c in cards:
                if c['game_id'] not in group: continue
                if c['forecast_role'] != 'FINAL_ELIGIBLE': raise ValueError('Required state not selected')
                body = bundle.verify_card(root, c)
                if timestamp(body['chronology']['state_lineage']['cutoff_at']) != cutoff: raise ValueError('Forecast cutoff mismatch')
                original_bundles[c['game_id']] = c['forecast_bundle_ref']
            simulated_time[0] = max(timestamp(c['cutoff_at']) for c in cards if c['game_id'] in group)
            locked = publisher.run(simulated_time[0])['games']
            if not all(c['status'] == 'LOCKED' for c in locked if c['game_id'] in group): raise ValueError('Expected locks absent')
        phase('FULL_SLATE_LOCKED')
        lock_hashes = {f.name: obs.sha(f.read_bytes()) for f in (root/'outputs/projection-v3/locks').glob('*.json')}
        if len(lock_hashes) != len(ids): raise ValueError('Full-slate lock population differs')
        release.switch(root, parent, owner='canary', operation_id='canary-rollback', expected_active=result['release_ref'])
        if prepared.active_fit(root) != fit_ref: raise ValueError('Rollback fit differs')
        records = list(csv.DictReader(io.StringIO(final_raw.decode())))
        finals = {}
        for row in records:
            if row['game_id'] in ids:
                row.update(away_score='20', home_score='27', result='7', total='47')
                finals[row['game_id']] = {'away_score': 20., 'home_score': 27.}
        if set(finals) != ids: raise ValueError('Synthetic final population differs')
        stream = io.StringIO(); writer = csv.DictWriter(stream, fieldnames=list(records[0])); writer.writeheader(); writer.writerows(records)
        raw = stream.getvalue().encode(); ref = store_source(root, raw)
        simulated_time[0] += dt.timedelta(days=1)
        save(root/'outputs/projection-v3/final-feed.json', {'games': {**final_feed['games'], **finals}, 'source_ref': ref,
            'source_sha256': obs.sha(raw), 'received_at': simulated_time[0].isoformat(), 'simulation': True})
        graded = publisher.run(simulated_time[0])['games']
        for card in graded:
            if card['status'] != 'FINAL' or not card['grades'] or card['forecast_bundle_ref'] != original_bundles[card['game_id']]:
                raise ValueError('Grade lost original forecast')
            bundle.verify_card(root, card)
        grade_hashes = {f.name: obs.sha(f.read_bytes()) for f in (root/'outputs/projection-v3/grades').glob('*.json')}
        publisher.run(simulated_time[0]+dt.timedelta(minutes=1))
        if lock_hashes != {f.name: obs.sha(f.read_bytes()) for f in (root/'outputs/projection-v3/locks').glob('*.json')}: raise ValueError('Lock rewritten')
        if grade_hashes != {f.name: obs.sha(f.read_bytes()) for f in (root/'outputs/projection-v3/grades').glob('*.json')}: raise ValueError('First grade rewritten')
        phase('ROLLBACK_AND_IDEMPOTENT_GRADES')
        evidence = json.loads((root/'outputs/board-v7/evidence.json').read_bytes())
        context = json.loads((root/'outputs/board-v7/context-v9.json').read_bytes())
        if set(evidence['games']) != ids or set(context['games']) != ids: raise ValueError('Board derivative population differs')
        size = sum(f.stat().st_size for f in root.rglob('*') if f.is_file())
    if any(obs.sha((source_root/name).read_bytes()) != sha for name, sha in frozen.items()): raise ValueError('Source record changed')
    return {'status': 'PASS', 'scope': 'Full captured training ledger and production refit/prepare/score/release/lock/grader/board code. Isolated simulated source availability, closeout HTTP response, cutoff/issuance clocks and finals. No live activation or accuracy claim.',
        'source_commit': source_commit, 'code': code, 'training_ref': training_ref, 'parent_fit': fit_ref,
        'refitted_fit': result['fit'], 'training_games': len(shadow['training_games']), 'training_rows': 2*len(shadow['training_games']),
        'slate_games': len(ids), 'locks': len(lock_hashes), 'synthetic_grades': len(grade_hashes),
        'cutoff_counts': cutoff_counts, 'original_source_records_preserved': len(frozen),
        'numerical_retry_skipped': True, 'original_bundles_graded_after_rollback': True,
        'elapsed_seconds': time.monotonic()-started, 'phase_seconds': phases, 'isolated_bytes': size,
        'peak_rss_bytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform == 'darwin' else 1024),
        'limitations': ['Source availability and closeout/HTTP evidence are explicit fixtures, not a verified live closeout.',
                        'Future finals are synthetic and enter only grading after every lock; future football statistics remain unavailable.',
                        'Training migration remains subject to review; inherited calibration/reference series remain unchanged.',
                        'This checks same-code fit/preparation rollback, not executable/runtime rollback.'],
        'provider_requests': 0, 'new_spending': 0}


if __name__ == '__main__':
    print(json.dumps(verify()))
