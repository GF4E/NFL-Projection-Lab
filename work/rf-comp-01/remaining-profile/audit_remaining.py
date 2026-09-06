"""Read retained metadata only; never import scientific code or run callbacks."""
from pathlib import Path
import hashlib
import json
import math
import pstats

HERE = Path(__file__).resolve().parent
ATTEMPT = HERE / 'attempt-1788647908631104000'
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def read(name):
    return json.loads((ATTEMPT / name).read_bytes())


def pointer(path):
    raw = path.read_bytes()
    return {'path': str(path), 'sha256': sha(raw), 'bytes': len(raw)}


def check_pointer(value):
    assert pointer(Path(value['path'])) == value


pins = read('INPUT-PINS.json')
assert pins == read('source-map-before.json') == read('source-map-after.json')
assert len(pins['files']) == 20 and len(pins['frozen']) == 66
for name, expected in pins['files'].items():
    assert sha(Path(name).read_bytes()) == expected, name
for name, expected in pins['frozen'].items():
    assert sha((ROOT / name).read_bytes()) == expected, name
for name in ('profile_remaining.py', 'SCOPE.md', 'INPUT-PINS.json'):
    assert (HERE / name).read_bytes() == (ATTEMPT / name).read_bytes()

result, process = read('result.json'), read('process.json')
assert result['status'] == 'complete_exact_synthetic_remaining_profile'
assert result['fit_callbacks'] == result['score_callbacks'] == 16
assert result['shared_binding_restored'] is True
assert process['exit_code'] == 0 and process['stop'] is process['source_error'] is None
assert 0 < process['wall_seconds'] < 30 and 0 < process['peak_child_rss_mib'] < 1024
assert len(result['cases']) == 8
expected = [(support, variant) for support in ('control3', 'synthetic700')
            for variant in ('full', 'independent_marginals', 'zero_strength_update',
                            'zero_scoring_level_update')]
assert [(c['support'], c['variant']) for c in result['cases']] == expected
attribution, profile_count, entry_count = [], 0, 0
for case in result['cases']:
    check_pointer(case['reference'])
    original_path = Path(case['reference']['path'])
    reference = json.loads(original_path.read_bytes())
    assert (ATTEMPT / 'references' / original_path.name).read_bytes() == original_path.read_bytes()
    assert [m['mode'] for m in case['modes']] == ['original', 'both']
    assert case == read('case-' + case['support'] + '-' + case['variant'] + '.json')
    for mode in case['modes']:
        check_pointer(mode['output'])
        output = json.loads(Path(mode['output']['path']).read_bytes())
        assert mode['equal_to_accepted_original'] is output['shared_binding_restored'] is True
        for key in ('descriptor', 'metrics'):
            assert canonical(output[key]) == canonical(reference[key])
            assert sha(canonical(output[key])) == output[key + '_sha256'] == reference[key + '_sha256']
        assert output['law_sha256'] == reference['law_sha256']
        assert output['callbacks'] == mode['callbacks']
        assert [c['kind'] for c in mode['callbacks']] == ['fit', 'score']
        for callback in mode['callbacks']:
            profile_count += 1
            assert callback['error'] is None
            assert math.isfinite(callback['instrumented_seconds']) and callback['instrumented_seconds'] > 0
            metadata = callback['metadata']
            assert metadata['game_id'] == 'z-target' and metadata['setting'] == case['setting']
            assert metadata['variant'] == case['variant'] and metadata['stage'] == case['stage']
            assert metadata['operation'] == callback['kind']
            if callback['kind'] == 'score':
                assert metadata['double_grid'] is metadata['diagnostics'] is True
            for key in ('binary_profile', 'json_profile'):
                check_pointer(callback[key])
            path = Path(callback['json_profile']['path'])
            assert json.loads(path.with_name(path.stem + '-record.json').read_bytes()) == callback
            complete = json.loads(path.read_bytes())
            stats = pstats.Stats(callback['binary_profile']['path'])
            assert complete['total_calls'] == stats.total_calls
            assert complete['primitive_calls'] == stats.prim_calls
            assert complete['total_self_seconds'] == stats.total_tt
            entries = []
            for function, data in sorted(stats.stats.items()):
                cc, nc, tt, ct, callers = data
                entries.append({'function': list(function), 'primitive_calls': cc, 'calls': nc,
                    'self_seconds': tt, 'cumulative_seconds': ct,
                    'callers': [{'function': list(k), 'statistics': list(v) if isinstance(v, tuple) else v}
                                for k, v in sorted(callers.items())]})
            assert complete['entries'] == entries
            entry_count += len(entries)
            assert callback['top_self'] == sorted(entries, key=lambda x: x['self_seconds'], reverse=True)[:8]
            assert callback['top_cumulative'] == sorted(entries, key=lambda x: x['cumulative_seconds'], reverse=True)[:8]
            selected = []
            for row in entries:
                source, line, name = row['function']
                if name in ('encode_flat_floats', 'components', 'moments', '_marginal_atoms',
                            'quantile', 'energy_score', 'grid', 'distribution_descriptor',
                            'recover_distribution') or (name == 'fit' and 'successor' in source) or (
                            name == 'cdf' and '_distn_infrastructure' in source):
                    selected.append({**row, 'self_fraction': row['self_seconds'] / stats.total_tt,
                                     'inclusive_fraction': row['cumulative_seconds'] / stats.total_tt})
            attribution.append({'support': case['support'], 'variant': case['variant'], 'mode': mode['mode'],
                                'kind': callback['kind'], 'profile': callback['json_profile'],
                                'denominator_seconds': stats.total_tt, 'selected_functions': selected})

assert profile_count == 32
assert len(list((ATTEMPT / 'profiles').glob('*.pstats'))) == 32
assert len(list((ATTEMPT / 'profiles').glob('*.json'))) == 64
assert len(list((ATTEMPT / 'outputs').glob('*.json'))) == 16
assert len(list((ATTEMPT / 'references').glob('*.json'))) == 8
assert (ATTEMPT / 'process.log').read_text().splitlines() == [
    'PROFILE ' + support + ' ' + variant + ' original/both outputs equal accepted original'
    for support, variant in expected]
files = [pointer(p) for p in sorted(ATTEMPT.rglob('*')) if p.is_file()]
report = {
    'status': 'complete_verified_retained_synthetic_attribution_only',
    'reviewer_role': 'Profile harness and prior focused-test author; this is self-verification, not independent acceptance.',
    'scope': pointer(ATTEMPT / 'SCOPE.md'), 'script': pointer(ATTEMPT / 'profile_remaining.py'),
    'input_pins': pointer(ATTEMPT / 'INPUT-PINS.json'), 'result': pointer(ATTEMPT / 'result.json'),
    'process': pointer(ATTEMPT / 'process.json'), 'audit_script': pointer(Path(__file__).resolve()),
    'frozen_source_hashes': pins['frozen'], 'additional_input_hashes': pins['files'],
    'checks': {'current_before_after_sources_equal': True, 'cases': 8, 'outputs_exact': 16,
               'fit_callbacks': 16, 'score_callbacks': 16, 'complete_binary_json_profiles': profile_count,
               'profile_entries_binary_json_exact': entry_count, 'restoration_reported_each_mode': True,
               'process_log_exact': True, 'retained_files_before_this_report': len(files)},
    'resources': {k: process[k] for k in ('exit_code', 'wall_seconds', 'peak_child_rss_mib',
                                        'wall_limit_seconds', 'rss_limit_mib', 'stop', 'source_error')},
    'findings': [
        'For the 700-atom composed candidate, three flat-array encodings remain 34.40–37.76% inclusive; the actual fitter remains 29.65–32.39%. These nested values are not additive.',
        'Every 700-atom fit still has ten components calls, six moments calls, two descriptor calls, one recovery and one validation grid. The encoder shortcut does not remove those obligations.',
        'For the 3-atom candidate fits, the fitter is 66.37–72.55% inclusive and flat encoding only 1.36–1.65%; whole-fit benefit is therefore case dependent.',
        'In the 700-atom full score, 34 generic SciPy CDF calls remain at 33.16% inclusive, identified by the retained backend line as Skellam; quantile search is 49.74%, exact grids 12.33%, and energy scoring 18.99%, all overlapping where nested.',
        'In the 700-atom independent score, 144 _marginal_atoms calls consume 18.62% inclusive. The unchanged threshold calculation repeatedly derives the two empirical marginals; this is a concrete dependency for a future narrowly qualified question, not an approved optimization.',
        'The observed call structure explains remaining work. It does not establish a counterfactual speedup or prove any implementation can meet the historical budget.'
    ],
    'limitations': result['limitations'] + [
        'Single original-then-both order, no warmup or overhead calibration; cProfile disproportionately perturbs Python-heavy paths. Fractions describe instrumented attribution only.',
        'Cumulative fractions include callees and must not be added across nested functions or read as attainable savings.',
        'Canonical law equality is against a previously retained hash; full law bodies and grids are not newly persisted here. Descriptor and metric bodies are persisted and verified exactly.',
        'Resource clock starts immediately after importing time; interpreter startup and final process-report write tail are excluded. Child resource peak is observed through wait/reap accounting and sampled ps; no historical-capacity guarantee follows.',
        'No callback rerun, unit-test rerun, historical source admission, bootstrap, new implementation or change to previous run evidence occurred during this metadata verification.'
    ],
    'attribution': attribution,
    'retained_evidence_index': files,
    'blockers': []
}
target = ATTEMPT / 'attribution-summary.json'
with target.open('xb') as output:
    output.write(canonical(report))
print(json.dumps({'report': pointer(target), 'retained_files': len(files), 'bytes': sum(x['bytes'] for x in files),
                  'verified_profile_entries': entry_count, 'status': report['status']}))
