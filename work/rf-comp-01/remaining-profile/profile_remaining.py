"""One registered synthetic attribution pass; no historical entry point."""
import time
STARTED = time.monotonic()
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import resource
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
PYTHON = '/opt/anaconda3/bin/python3.12'
sys.dont_write_bytecode = True


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def save(path, value):
    with path.open('xb') as output:
        output.write(encoded(value)); output.flush(); os.fsync(output.fileno())


def pointer(path):
    raw = path.read_bytes()
    return {'path': str(path), 'sha256': digest(raw), 'bytes': len(raw)}


def authenticate():
    pins = json.loads((HERE / 'INPUT-PINS.json').read_bytes())
    assert len(pins['frozen']) == 66
    for name, expected in pins['files'].items():
        assert digest(Path(name).read_bytes()) == expected, ('input_changed', name)
    for name, expected in pins['frozen'].items():
        assert digest((ROOT / name).read_bytes()) == expected, ('frozen_source_changed', name)
    return pins


def parent():
    attempt = HERE / ('attempt-' + str(time.time_ns()))
    attempt.mkdir()
    stop = source_error = None
    samples = []
    process = None
    before = after = None
    try:
        before = authenticate()
        save(attempt / 'source-map-before.json', before)
        for name in ('profile_remaining.py', 'SCOPE.md', 'INPUT-PINS.json'):
            (attempt / name).write_bytes((HERE / name).read_bytes())
        with (attempt / 'process.log').open('xb') as log:
            assert time.monotonic() - STARTED < 30., 'setup_exceeded_deadline'
            process = subprocess.Popen([PYTHON, '-I', str(Path(__file__).resolve()), '--child', str(attempt)],
                                       stdout=log, stderr=subprocess.STDOUT)
            while process.poll() is None:
                elapsed = time.monotonic() - STARTED
                if elapsed >= 30.:
                    stop = 'wall_limit'; process.kill(); break
                sample = subprocess.run(['/bin/ps', '-o', 'rss=', '-p', str(process.pid)],
                                        capture_output=True, timeout=min(.5, 30. - elapsed))
                if sample.returncode == 0 and sample.stdout.strip():
                    rss = int(sample.stdout.strip()) / 1024
                    samples.append([elapsed, rss])
                    if rss > 1024.:
                        stop = 'rss_limit'; process.kill(); break
                time.sleep(min(.025, max(0., 30. - (time.monotonic() - STARTED))))
    except BaseException as error:
        stop = type(error).__name__ + ':' + str(error)
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.wait()
    try:
        after = authenticate()
        save(attempt / 'source-map-after.json', after)
        assert after == before, 'input_map_changed'
    except BaseException as error:
        source_error = type(error).__name__ + ':' + str(error)
    report = {'attempt': str(attempt), 'exit_code': None if process is None else process.returncode,
              'stop': stop, 'source_error': source_error, 'wall_seconds': time.monotonic() - STARTED,
              'peak_child_rss_mib': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 2**20,
              'wall_limit_seconds': 30, 'rss_limit_mib': 1024, 'rss_samples': samples}
    save(attempt / 'process.json', report)
    print(json.dumps({k: v for k, v in report.items() if k != 'rss_samples'}), flush=True)
    assert report['exit_code'] == 0 and stop is source_error is None
    assert report['wall_seconds'] < 30. and report['peak_child_rss_mib'] < 1024.


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def child(attempt):
    import cProfile
    import pstats
    from unittest.mock import patch
    sys.path.insert(0, str(ROOT / 'scripts'))
    import numpy as np
    import scipy
    import research_score_probability_compute as candidate
    import research_score_split_forecast as assembly_module
    import research_score_run as saved
    from research_score_compute_distribution import score_forecast as original_score
    from research_score_split_run import strict, CallbackResult
    assert sys.version_info[:3] == (3, 12, 2) and np.__version__ == '1.26.4' and scipy.__version__ == '1.13.1'
    assert sys.platform == 'darwin' and sys.flags.isolated and sys.executable == PYTHON
    pins = authenticate()
    profile_dir = attempt / 'profiles'; profile_dir.mkdir()
    output_dir = attempt / 'outputs'; output_dir.mkdir()
    reference_dir = attempt / 'references'; reference_dir.mkdir()
    fixture = load('remaining_callback_fixture', ROOT / 'tests/research-score-split/test_forecast_unit.py')
    view, bank, outputs, _ = fixture.fixture(2013)
    pairs = np.array([(h, a) for h in range(63) for a in range(h)], dtype=float)
    scores = pairs[np.linspace(0, len(pairs) - 1, 350, dtype=int)]
    supports = [('control3', assembly_module.JointBase.from_scores([[0,62],[22,22],[62,0]], [1,4,1])),
                ('synthetic700', assembly_module.JointBase.from_scores(scores, np.exp(-np.sum((scores-22.)**2, axis=1)/(2*12.**2))))]
    assert [len(mapper.atoms) for _, mapper in supports] == [3, 700]
    variants = [(10, 'full', 'inner'), (10, 'independent_marginals', 'outer'),
                (6, 'zero_strength_update', 'outer'), (6, 'zero_scoring_level_update', 'outer')]
    original_encoded = saved.encoded
    report = {'status': 'running', 'scope': 'single_pass_callback_attribution_only', 'cases': [],
              'runtime': {'python': sys.version, 'numpy': np.__version__, 'scipy': scipy.__version__,
                          'executable': sys.executable, 'isolated': bool(sys.flags.isolated)},
              'fit_callbacks': 0, 'score_callbacks': 0,
              'limitations': ['Instrumented single-pass costs are not speedup measurements or capacity estimates.',
                  'Only callback operations are profiled; selection, setup, hashing and persistence are outside cProfile.',
                  'Fixture setup computations are included in process resources but excluded from callback counts.',
                  'Partial assembly constructor/archive admission is intentionally bypassed; no historical data is used.']}

    class Accounting:
        def __init__(self, prefix):
            self.prefix = prefix
            self.rows = []

        def callback(self, kind, function, **metadata):
            profile = cProfile.Profile()
            error = None
            start = time.perf_counter()
            profile.enable()
            try:
                value = function()
            except BaseException as exc:
                error = exc
                raise
            finally:
                profile.disable()
                elapsed = time.perf_counter() - start
                binary = profile_dir / f'{self.prefix}-{kind}.pstats'
                profile.dump_stats(str(binary))
                stats = pstats.Stats(profile)
                entries = []
                for function_key, data in sorted(stats.stats.items()):
                    cc, nc, tt, ct, callers = data
                    entries.append({'function': list(function_key), 'primitive_calls': cc, 'calls': nc,
                        'self_seconds': tt, 'cumulative_seconds': ct,
                        'callers': [{'function': list(key), 'statistics': list(values) if isinstance(values, tuple) else values}
                                    for key, values in sorted(callers.items())]})
                complete = {'entries': entries, 'total_calls': stats.total_calls,
                            'primitive_calls': stats.prim_calls, 'total_self_seconds': stats.total_tt}
                json_path = profile_dir / f'{self.prefix}-{kind}.json'
                save(json_path, complete)
                record = {'kind': kind, 'metadata': metadata, 'instrumented_seconds': elapsed,
                    'error': None if error is None else {'type': type(error).__name__, 'reason': str(error)},
                    'binary_profile': pointer(binary), 'json_profile': pointer(json_path),
                    'top_self': sorted(entries, key=lambda row: row['self_seconds'], reverse=True)[:8],
                    'top_cumulative': sorted(entries, key=lambda row: row['cumulative_seconds'], reverse=True)[:8]}
                self.rows.append(record)
                save(profile_dir / f'{self.prefix}-{kind}-record.json', record)
            assert type(value) is CallbackResult and value.native_failure is None and not value.used_fallback
            report[kind + '_callbacks'] += 1
            return value.value

    try:
        for support, mapper in supports:
            pointer_sha = digest(strict({'atoms': mapper.atoms, 'weights': mapper.weights, 'b': mapper.b}))
            mapper_pointer = {'name': 'object-' + pointer_sha + '.json', 'sha256': pointer_sha}
            for selected, variant, stage in variants:
                ref_path = Path(pins['references'][support + '-' + variant])
                raw_reference = ref_path.read_bytes()
                (reference_dir / ref_path.name).write_bytes(raw_reference)
                reference = json.loads(raw_reference)
                case = {'support': support, 'atoms': len(mapper.atoms), 'setting': selected,
                        'variant': variant, 'stage': stage, 'modes': [], 'reference': pointer(ref_path)}
                for mode in ('original', 'both'):
                    prefix = support + '-' + variant + '-' + mode
                    accounting = Accounting(prefix)
                    obj = object.__new__(assembly_module._Assembly)
                    obj.bank, obj.outputs, obj.origin = bank, outputs, view['origin']
                    obj.view = {'mappers': {12: mapper, 24: mapper}}
                    obj.pointers = {12: mapper_pointer, 24: mapper_pointer}
                    obj.accounting = accounting
                    obj.full = obj.outer = {}
                    scorer = candidate.score_forecast if mode == 'both' else original_score
                    encoder = candidate.encode_flat_floats if mode == 'both' else original_encoded
                    score_calls = {'count': 0}
                    with patch.object(saved, 'encoded', encoder):
                        law, descriptor, reason, work = obj.resolve(selected, variant, 'z-target', stage)
                        def score():
                            score_calls['count'] += 1
                            metrics = scorer(law, [21,17], 'z-target', double_grid=True, diagnostics=True)
                            return CallbackResult(metrics, reason, reason is not None)
                        metrics = accounting.callback('score', score, game_id='z-target', setting=selected,
                            variant=variant, stage=stage, operation='score', double_grid=True, diagnostics=True)
                    assert saved.encoded is original_encoded and reason is None and score_calls['count'] == 1
                    assert work['fit_calls'] == work['descriptor_recoveries'] == 1
                    law_bytes = strict({key: getattr(law, key) for key in
                        ('atoms','alpha','rates','theta','beta','independent','iterations')})
                    descriptor_bytes, metric_bytes = strict(descriptor), strict(metrics)
                    observation = {'mode': mode, 'descriptor': json.loads(descriptor_bytes),
                        'metrics': json.loads(metric_bytes), 'descriptor_sha256': digest(descriptor_bytes),
                        'metrics_sha256': digest(metric_bytes), 'law_sha256': digest(law_bytes),
                        'shared_binding_restored': saved.encoded is original_encoded, 'callbacks': accounting.rows}
                    path = output_dir / (prefix + '.json')
                    save(path, observation)
                    for key in ('descriptor_sha256','metrics_sha256','law_sha256'):
                        assert observation[key] == reference[key], ('accepted_reference_mismatch', prefix, key)
                    assert descriptor_bytes == strict(reference['descriptor']) and metric_bytes == strict(reference['metrics'])
                    case['modes'].append({'mode': mode, 'output': pointer(path), 'equal_to_accepted_original': True,
                                          'callbacks': accounting.rows})
                report['cases'].append(case)
                save(attempt / (f'case-{support}-{variant}.json'), case)
                print('PROFILE', support, variant, 'original/both outputs equal accepted original', flush=True)
        assert len(report['cases']) == 8 and report['fit_callbacks'] == report['score_callbacks'] == 16
        assert saved.encoded is original_encoded
        authenticate()
        report['status'] = 'complete_exact_synthetic_remaining_profile'
        report['shared_binding_restored'] = True
        save(attempt / 'result.json', report)
    finally:
        assert saved.encoded is original_encoded


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--child':
        child(Path(sys.argv[2]))
    else:
        parent()
