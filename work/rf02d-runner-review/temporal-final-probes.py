"""Independent synthetic runner probes; all source/data callbacks are synthetic."""
import copy
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import sys
import tempfile
import time
from unittest.mock import patch

START = time.monotonic()
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OUT = Path(__file__).resolve().parent
code = json.loads((OUT / 'source-hashes-candidate.json').read_bytes())
assert len(code) == 43
for name, pin in code.items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == pin, name
sys.path.insert(0, str(ROOT / 'scripts'))
import research_score_conditional_run as unit

probes = {}
with tempfile.TemporaryDirectory(prefix='temporal-synthetic-', dir=OUT) as scratch:
    parent = Path(scratch).resolve()
    store = unit.Store(parent, 'annual-spy-only')
    try:
        by_year = {year: [f'synthetic-{year}-{i}' for i in range(count)] for year, count in zip(unit.YEARS, unit.YEAR_COUNTS)}
        origins = [{'season': year, 'week': 1, 'originAt': f'{year}-09-01T00:00:00+00:00', 'targetGameIds': by_year[year][:2]}
                   for year in unit.YEARS]
        sources = {key: [{'season': year, 'game_id': game} for year in unit.YEARS if year <= 2024 for game in by_year[year]]
                   + [{'season': 2025, 'unreadable_future_payload': object()}] for key in unit.ORDINARY}
        cases = {key: list(value) for key, value in sources.items()}
        collection = {'case_chunks': []}
        store.write('case-collection.json', collection)
        manifest = 'a' * 64
        calls = []
        def annual_spy(family, variant, year, cutoff, prior, prior_sources, prior_cases):
            assert cutoff == next(row['originAt'] for row in origins if row['season'] == year)
            expected = [game for old in unit.YEARS if old < year for game in by_year[old]]
            assert list(prior) == [old for old in unit.YEARS if old < year]
            assert [row['game_id'] for row in prior_sources] == expected
            assert [row['game_id'] for row in prior_cases] == expected
            assert all(row['season'] < year and row['season'] <= 2024 for row in prior_sources + prior_cases)
            calls.append((year, family, variant, len(expected)))
            # Explicit spy metadata: this does not call or claim to test estimation.
            body = {'family': family, 'variant': variant, 'target_season': year, 'cutoff': cutoff,
                    'scale': 1.0, 'status': 'identity_no_prior_outer_support' if year == 2013 else 'synthetic_spy_only',
                    'estimator': None if year == 2013 else {'synthetic_spy_only': True}}
            body['sha256'] = unit.fingerprint(body)
            return body
        with patch.object(unit, 'annual_receipt', side_effect=annual_spy):
            index = unit.fit_annual_receipts(store, manifest, origins, by_year, sources, cases, collection, unit.Budget())
        assert [(year, family, variant) for year, family, variant, _ in calls] == [
            (year, family, variant) for year in unit.YEARS for family, variant in unit.ORDINARY]
        assert len(calls) == 234 and index['cold_starts'] == 18 and index['estimated_receipts'] == 216
        assert [count for _, family, variant, count in calls if (family, variant) == ('N0', 'full')] == [
            0, 256, 512, 768, 1024, 1280, 1536, 1792, 2048, 2320, 2591, 2863, 3135]
        sealed = store.read_bound(store.pointer('annual-index.json'))
        annual = unit.load_annual(store, sealed, manifest, 2014, origins[1]['originAt'], collection)
        assert list(annual[0]) == list(unit.ORDINARY)
        envelope = copy.deepcopy(annual[1]['N0', 'full'])
        envelope['pure_receipt']['cutoff'] = '2014-09-02T00:00:00+00:00'
        envelope['pure_receipt']['sha256'] = unit.fingerprint({k: v for k, v in envelope['pure_receipt'].items() if k != 'sha256'})
        envelope['pure_receipt_sha256'] = envelope['pure_receipt']['sha256']
        raw = unit.strict(envelope)
        pointer = dict(annual[2]['N0', 'full'], sha256=unit.sha(raw), bytes=len(raw))
        try:
            unit.verify_envelope(envelope, pointer, manifest, ('N0', 'full'), 2014, origins[1]['originAt'], [])
        except unit.RunFailure as exc:
            assert str(exc) == 'annual_receipt_binding_mismatch'
        else:
            raise AssertionError('fully rehashed false first-origin cutoff accepted')
        probes['annual_sequence_and_prior_only_call_boundary'] = {
            'calls': 234, 'cold_start_calls': 18, 'estimated_spy_calls': 216,
            'exact_prior_counts': True, 'first_origin_cutoffs': True, 'opaque_2025_payload_excluded': True,
            'all_234_artifacts_persisted_and_selected_year_reloaded': True,
            'fully_rehashed_wrong_same_year_cutoff_rejected': True,
            'numerical_estimator_invocations': 0}
    finally:
        store.close()

    store = unit.Store(parent, 'truncated-artifact')
    try:
        partial = b'{"unfinished":'
        def interrupted_write(instance, name, raw):
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=instance.fd)
            try:
                os.write(fd, partial)
            finally:
                os.close(fd)
            raise OSError('synthetic-short-write-stop')
        with patch.object(unit.ImmutableRun, 'write', new=interrupted_write):
            try:
                store.write('forecasts-partial.json', {'more': 'bytes'})
            except OSError:
                pass
            else:
                raise AssertionError('interrupted write returned success')
        assert 'forecasts-partial.json' not in store.index
        try:
            store.finish({'status': 'reject_all'})
        except unit.RunFailure as exc:
            assert str(exc) == 'uncommitted_prefix_requires_invalid_terminal'
        else:
            raise AssertionError('partial bytes admitted as successful completion')
        store.finish({'status': 'protocol_invalid'})
        index = unit.parse((store.path / 'completion/artifact-index.json').read_bytes())
        assert set(index) == {'files', 'uncommitted_artifacts', 'uncommitted_staging'}
        assert index['uncommitted_artifacts'] == ['forecasts-partial.json']
        assert index['files']['forecasts-partial.json'] == {'sha256': unit.sha(partial), 'bytes': len(partial)}
        assert (store.path / 'forecasts-partial.json').read_bytes() == partial
        probes['truncated_ordinary_artifact_retention'] = {'retained_bytes': len(partial), 'opaque_bytes_indexed': True,
            'successful_completion_rejected': True, 'only_completion_terminal_authoritative': True}
    finally:
        store.close()

    store = unit.Store(parent, 'half-staging')
    try:
        real_fsync = unit.os.fsync
        first = [True]
        def fail_first(fd):
            if first[0]:
                first[0] = False
                raise OSError('synthetic-first-stage-file-fsync')
            return real_fsync(fd)
        with patch.object(unit.os, 'fsync', side_effect=fail_first):
            try:
                store.finish({'status': 'reject_all'})
            except OSError:
                pass
            else:
                raise AssertionError('first stage fsync failure hidden')
        prior_stage = store.uncommitted_staging[0]
        assert (store.path / prior_stage / 'terminal.json').exists()
        assert not (store.path / prior_stage / 'artifact-index.json').exists()
        assert not (store.path / 'completion').exists()
        store.finish({'status': 'protocol_invalid'})
        index = unit.parse((store.path / 'completion/artifact-index.json').read_bytes())
        assert index['uncommitted_staging'] == [prior_stage]
        assert prior_stage + '/terminal.json' in index['files']
        assert prior_stage + '/artifact-index.json' not in index['files']
        assert unit.parse((store.path / 'completion/terminal.json').read_bytes())['status'] == 'protocol_invalid'
        probes['half_written_terminal_staging_retention'] = {'prior_terminal_bytes_indexed_as_uncommitted': True,
            'missing_prior_index_not_fabricated': True, 'only_final_invalid_completion_authoritative': True}
    finally:
        store.close()

    # Test actual SIGALRM delivery quickly while asserting that run requests 30s.
    # Only the test's timer installation shortens delivery to 0.02s.
    timers, events = [], []
    real_setitimer = unit.signal.setitimer
    old_handler = unit.signal.getsignal(unit.signal.SIGALRM)
    assert unit.signal.getitimer(unit.signal.ITIMER_REAL) == (0.0, 0.0)
    def timer(which, seconds, interval=0):
        timers.append(seconds)
        return real_setitimer(which, .02 if seconds == 30 else seconds, interval)
    def stop(*args):
        events.append('scientific-stop')
        raise RuntimeError('synthetic-scientific-stop')
    def finalization_only(store, terminal, budget=None):
        assert terminal['status'] == 'protocol_invalid'
        assert terminal['invalid_finalization_only_cap_seconds'] == 30
        events.append('finalization-only')
        signal.pause()
        raise AssertionError('grace signal failed to interrupt finalization')
    fake_manifest = {'version': 'independent-synthetic-grace-only'}
    with patch.object(unit, 'OUTPUT_PARENT', parent), \
         patch.object(unit, 'preflight', return_value=(None, {}, {}, {}, fake_manifest)), \
         patch.object(unit, 'admit_archive', side_effect=stop), \
         patch.object(unit, 'collect_cases') as collect, patch.object(unit, 'fit_annual_receipts') as fit, \
         patch.object(unit, 'publish_origin') as publish, patch.object(unit, 'grade_origin') as grade, \
         patch.object(unit, 'evaluate') as evaluate, patch.object(unit.Store, 'finish', new=finalization_only), \
         patch.object(unit.signal, 'setitimer', side_effect=timer):
        try:
            unit.run(ROOT, 'synthetic-only-no-acceptance-file', '0' * 64)
        except unit.RunFailure as exc:
            assert str(exc) == 'invalid_finalization_only_deadline_exceeded'
        else:
            raise AssertionError('grace expiration did not propagate failure')
        for callback in (collect, fit, publish, grade, evaluate):
            callback.assert_not_called()
    assert events == ['scientific-stop', 'finalization-only'] and 30 in timers
    assert unit.signal.getitimer(unit.signal.ITIMER_REAL) == (0.0, 0.0)
    assert unit.signal.getsignal(unit.signal.SIGALRM) == old_handler
    grace_path = parent / ('rf02d-v1-' + unit.sha(unit.strict(fake_manifest))[:16])
    assert (grace_path / 'manifest.json').exists() and not (grace_path / 'completion').exists()
    probes['real_signal_delivery_in_finalization_only'] = {'requested_cap_seconds': 30,
        'synthetic_delivery_seconds': .02, 'signal_raised_expected_failure': True,
        'no_scientific_callbacks_after_stop': True, 'prefix_retained_without_completion': True,
        'previous_handler_restored_and_timer_cleared': True,
        'limitation': 'Actual signal mechanism tested with shortened delivery; no claim of a measured 30-second wait.'}

for name, pin in code.items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == pin, name
elapsed = time.monotonic() - START
rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 2 if sys.platform == 'darwin' else 1024)
assert elapsed <= 120 and rss <= 4096, (elapsed, rss)
report = {'status': 'passed_independent_synthetic_probes', 'probes': probes,
          'seconds': elapsed, 'peak_rss_mib': rss, 'all_43_hashes_reverified': True,
          'historical_inputs_read': 0, 'historical_fits_or_scores': 0,
          'probe_script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
payload = (json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()
path = OUT / 'temporal-final-probes.json'
with path.open('xb') as stream:
    stream.write(payload)
print(json.dumps({'path': str(path), 'sha256': hashlib.sha256(payload).hexdigest(), 'seconds': elapsed,
                  'peak_rss_mib': rss, 'status': report['status']}))
