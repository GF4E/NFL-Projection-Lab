"""Bounded synthetic profiling only; never imports/admit historical run inputs."""
import time
COMMAND_STARTED = time.monotonic()
from pathlib import Path
import hashlib
import json
import os
import resource
import subprocess
import sys

HERE = Path(__file__).resolve().parent
WORK = HERE.parent.parent
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
PINS = WORK / 'work/rf02f-controller-unit/controller-final-pins-20260905.json'
PYTHON = '/opt/anaconda3/bin/python3.12'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')


def source_map():
    expected = json.loads(PINS.read_text())['code_hashes']
    actual = {p: digest((ROOT / p).read_bytes()) for p in expected}
    assert len(actual) == 66 and actual == expected, 'frozen_source_drift'
    return actual


def parent():
    start = COMMAND_STARTED
    attempt = HERE / ('attempt-' + str(time.time_ns()))
    attempt.mkdir()
    (attempt / 'profile_callbacks.py').write_bytes(Path(__file__).read_bytes())
    (attempt / 'PROFILE-SCOPE.md').write_bytes((HERE / 'PROFILE-SCOPE.md').read_bytes())
    save(attempt / 'source-map-before.json', source_map())
    save(attempt / 'identity.json', {'script_sha256': digest(Path(__file__).read_bytes()),
         'scope_sha256': digest((HERE / 'PROFILE-SCOPE.md').read_bytes()),
         'pins_sha256': digest(PINS.read_bytes()), 'wall_limit_seconds': 60,
         'rss_limit_mib': 2048, 'command': [PYTHON, '-I', str(Path(__file__).resolve()), '--child', str(attempt)]})
    stopped = None
    samples = []
    with (attempt / 'process.log').open('wb') as log:
        child = subprocess.Popen([PYTHON, '-I', str(Path(__file__).resolve()), '--child', str(attempt)],
                                 stdout=log, stderr=subprocess.STDOUT)
        try:
            while child.poll() is None:
                elapsed = time.monotonic() - start
                if elapsed >= 60:
                    stopped = 'wall_limit'; child.kill(); break
                rss = subprocess.run(['/bin/ps', '-o', 'rss=', '-p', str(child.pid)],
                                     capture_output=True, timeout=min(.5, 60-elapsed))
                if rss.returncode == 0 and rss.stdout.strip():
                    mib = int(rss.stdout.strip()) / 1024
                    samples.append([elapsed, mib])
                    if mib > 2048:
                        stopped = 'rss_limit'; child.kill(); break
                time.sleep(min(.025, max(0, 60-(time.monotonic()-start))))
        except Exception as exc:
            stopped = 'observer_error:' + type(exc).__name__ + ':' + str(exc)
        finally:
            if child.poll() is None:
                child.kill()
            child.wait()
    # Darwin ru_maxrss is bytes. This includes child and tiny ps helper maxima.
    peak = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 2**20
    source_error = None
    after = {}
    try:
        after = source_map()
        save(attempt / 'source-map-after.json', after)
    except Exception as exc:
        source_error = type(exc).__name__ + ':' + str(exc)
    elapsed = time.monotonic() - start
    report = {'exit_code': child.returncode, 'stop': stopped, 'wall_seconds': elapsed,
              'peak_child_rss_mib': peak, 'rss_samples': samples,
              'source_files_unchanged': len(after), 'source_error': source_error, 'attempt': str(attempt)}
    save(attempt / 'process.json', report)
    print(json.dumps({k: v for k, v in report.items() if k != 'rss_samples'}), flush=True)
    assert child.returncode == 0 and stopped is None and source_error is None and elapsed <= 60 and peak <= 2048


def child(attempt):
    started = time.perf_counter()
    import cProfile
    import inspect
    import pstats
    import statistics
    import textwrap
    import importlib.util
    sys.path.insert(0, str(ROOT / 'scripts'))
    import numpy as np
    import scipy
    import research_score_split_forecast as f
    from research_score_distribution import JointDistribution
    from research_score_compute_distribution import score_forecast
    from research_score_split_run import CallbackResult, strict
    spec = importlib.util.spec_from_file_location('tiny_forecast', ROOT / 'tests/research-score-split/test_forecast_unit.py')
    fixture_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture_module)
    view, bank, outputs, _ = fixture_module.fixture(2013)
    original = JointDistribution.grid
    source = textwrap.dedent(inspect.getsource(original))
    anchor = '    for atom, mass in zip(self.atoms.astype(int), self.alpha):\n        p[atom[0], atom[1]] += mass\n'
    assert source.count(anchor) == 1
    active = {'grids': [], 'deposit_seconds': 0., 'grid_seconds': 0.}

    def deposit(p, atoms, alpha):
        start = time.perf_counter()
        for atom, mass in zip(atoms.astype(int), alpha):
            p[atom[0], atom[1]] += mass
        active['deposit_seconds'] += time.perf_counter() - start

    namespace = dict(original.__globals__, _profile_deposit=deposit)
    exec(compile(source.replace(anchor, '    _profile_deposit(p, self.atoms, self.alpha)\n'),
                 '<in-memory-grid-deposition-profile>', 'exec'), namespace)
    clone = namespace['grid']

    def timed_grid(self, *args, **kwargs):
        start = time.perf_counter()
        value = clone(self, *args, **kwargs)
        active['grid_seconds'] += time.perf_counter() - start
        active['grids'].append(value)
        return value

    def capture_grid(self, *args, **kwargs):
        value = original(self, *args, **kwargs)
        active['grids'].append(value)
        return value

    def grids_signature():
        return [{'shape': list(g.probability.shape), 'dtype': str(g.probability.dtype),
                 'sha256': digest(g.probability.tobytes()),
                 'omitted_probability_bound': g.omitted_probability_bound,
                 'score_error_bound': g.score_error_bound} for g in active['grids']]

    class Accounting:
        def __init__(self):
            self.rows = []
            self.profiler = None

        def callback(self, kind, function, **metadata):
            if self.profiler is not None:
                self.profiler.enable()
            start = time.perf_counter()
            try:
                result = function()
                elapsed = time.perf_counter() - start
            finally:
                if self.profiler is not None:
                    self.profiler.disable()
            assert type(result) is CallbackResult and result.native_failure is None and not result.used_fallback
            self.rows.append({'kind': kind, 'seconds': elapsed, 'metadata': metadata})
            return result.value

    pairs = np.array([(h, a) for h in range(63) for a in range(h)], dtype=float)
    scores = pairs[np.linspace(0, len(pairs)-1, 350, dtype=int)]
    support_cases = [
        ('control3', f.JointBase.from_scores([[0, 62], [22, 22], [62, 0]], [1, 4, 1])),
        ('synthetic700', f.JointBase.from_scores(scores, np.exp(-np.sum((scores-22.)**2, axis=1)/(2*12.**2))))]
    assert [len(m.atoms) for _, m in support_cases] == [3, 700]
    variants = [(10, 'full', 'inner'), (10, 'independent_marginals', 'outer'),
                (6, 'zero_strength_update', 'outer'), (6, 'zero_scoring_level_update', 'outer')]
    report = {'status': 'running', 'runtime': {'python': sys.version, 'executable': sys.executable,
              'isolated': bool(sys.flags.isolated), 'numpy': np.__version__, 'scipy': scipy.__version__},
              'scope': 'synthetic_callbacks_only_not_historical_capacity',
              'assembly': 'partial synthetic object; actual selected_native and resolve; constructor/archive admission bypass explicitly excluded',
              'score': 'actual frozen scorer plus exact grader increment/CallbackResult closure; no post-callback mass CDFs',
              'baseline_grid_evidence': 'capture-only warmup original grids; measured baseline method has no grid wrapper; instrumented actual grids match warmup byte hashes; every measured descriptor and metric equals warmup canonical bytes',
              'required_combined_reduction_fraction': 0.524680169716677,
              'original_fixture_atoms': {str(d): len(m.atoms) for d, m in view['mappers'].items()}, 'cases': []}

    try:
        for label, mapper in support_cases:
            pointer_sha = digest(strict({'atoms': mapper.atoms, 'weights': mapper.weights, 'b': mapper.b}))
            pointer = {'name': 'object-' + pointer_sha + '.json', 'sha256': pointer_sha}
            for selected, variant, stage in variants:
                accounting = Accounting()
                assembly = object.__new__(f._Assembly)
                assembly.bank, assembly.outputs, assembly.origin = bank, outputs, view['origin']
                assembly.view = {'mappers': {12: mapper, 24: mapper}}
                assembly.pointers = {12: pointer, 24: pointer}
                assembly.accounting = accounting
                # Unexpected fallback stops this profile instead of supplying a favorable law.
                assembly.full = assembly.outer = {}
                game = 'z-target'
                counts = {'actual_score_calls': 0}

                def run(mode):
                    JointDistribution.grid = {'original': original, 'capture': capture_grid, 'instrumented': timed_grid}[mode]
                    active.update(grids=[], deposit_seconds=0., grid_seconds=0.)
                    law, descriptor, reason, work = assembly.resolve(selected, variant, game, stage)
                    fit = dict(accounting.rows[-1], deposition_seconds=active['deposit_seconds'],
                               inclusive_grid_seconds=active['grid_seconds'])
                    fit_grids = grids_signature()  # after complete callback timer
                    active.update(grids=[], deposit_seconds=0., grid_seconds=0.)
                    def score():
                        counts['actual_score_calls'] += 1
                        metrics = score_forecast(law, [21, 17], game,
                                                 double_grid=True, diagnostics=True)
                        return CallbackResult(metrics, reason, reason is not None)
                    metrics = accounting.callback('score', score, game_id=game, setting=selected,
                                                  variant=variant, stage=stage, operation='score',
                                                  double_grid=True, diagnostics=True)
                    score_row = dict(accounting.rows[-1], deposition_seconds=active['deposit_seconds'],
                                     inclusive_grid_seconds=active['grid_seconds'])
                    score_grids = grids_signature()
                    assert reason is None and work['fit_calls'] == work['descriptor_recoveries'] == 1
                    return {'mode': mode, 'fit': fit, 'score': score_row, 'fit_grids': fit_grids,
                            'score_grids': score_grids, 'descriptor_sha256': digest(strict(descriptor)),
                            'metrics_sha256': digest(strict(metrics)), 'iterations': law.iterations,
                            'mean': descriptor['mean']}

                reference = run('capture')
                warm = run('instrumented')
                def equal(row):
                    assert row['descriptor_sha256'] == reference['descriptor_sha256']
                    assert row['metrics_sha256'] == reference['metrics_sha256']
                    if row['mode'] != 'original':
                        assert row['fit_grids'] == reference['fit_grids']
                        assert row['score_grids'] == reference['score_grids']
                equal(warm)
                rows = []
                for repeat in range(8):
                    modes = ['original', 'instrumented'] if repeat % 2 == 0 else ['instrumented', 'original']
                    pair = {mode: run(mode) for mode in modes}
                    for row in pair.values():
                        equal(row)
                    base, inst = pair['original'], pair['instrumented']
                    whole = base['fit']['seconds'] + base['score']['seconds']
                    ins_whole = inst['fit']['seconds'] + inst['score']['seconds']
                    deposit_total = inst['fit']['deposition_seconds'] + inst['score']['deposition_seconds']
                    grid_total = inst['fit']['inclusive_grid_seconds'] + inst['score']['inclusive_grid_seconds']
                    rows.append({'repeat': repeat, 'order': modes, 'baseline': base, 'instrumented': inst,
                                 'combined_overhead_fraction': ins_whole / whole - 1,
                                 'deposition_over_baseline': deposit_total / whole,
                                 'deposition_over_instrumented': deposit_total / ins_whole,
                                 'inclusive_grid_over_baseline': grid_total / whole})
                # One additional unchanged pass; cProfile timing is attribution only.
                profiler = cProfile.Profile()
                accounting.profiler = profiler
                profiled = run('original')
                accounting.profiler = None
                equal(profiled)
                stats = pstats.Stats(profiler)
                def top(index):
                    return [{'file': k[0], 'line': k[1], 'function': k[2], 'primitive_calls': v[0],
                             'calls': v[1], 'self_seconds': v[2], 'cumulative_seconds': v[3]}
                            for k, v in sorted(stats.stats.items(), key=lambda kv: kv[1][index], reverse=True)[:25]]
                case = {'support': label, 'atoms': len(mapper.atoms), 'coordinate_min': mapper.atoms.min(axis=0).tolist(),
                        'coordinate_max': mapper.atoms.max(axis=0).tolist(), 'setting': selected, 'variant': variant,
                        'stage': stage, 'requested_native_mean': json.loads(strict(assembly.selected_native(selected, variant, game)['mean'])),
                        'reference': reference, 'warmup': warm, 'pairs': rows, 'profiled': profiled,
                        'actual_score_calls': counts['actual_score_calls'], 'all_equal': True,
                        'cprofile_top_cumulative': top(3), 'cprofile_top_self': top(2)}
                for field in ('deposition_over_baseline', 'deposition_over_instrumented',
                              'inclusive_grid_over_baseline', 'combined_overhead_fraction'):
                    values = [row[field] for row in rows]
                    case[field] = {'minimum': min(values), 'median': statistics.median(values), 'maximum': max(values)}
                report['cases'].append(case)
                save(attempt / 'result.json', report)
                print(label, variant, case['deposition_over_baseline'], flush=True)
        report['status'] = 'complete_synthetic_profile'
        report['insertion_only_decision'] = ('retire_for_this_workload' if all(
            c['deposition_over_baseline']['maximum'] < report['required_combined_reduction_fraction']
            for c in report['cases'] if c['support'] == 'synthetic700') else 'unresolved')
        report['child_setup_inclusive_seconds'] = time.perf_counter() - started
        report['source_files_after'] = len(source_map())
        save(attempt / 'result.json', report)
    finally:
        JointDistribution.grid = original


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--child':
        child(Path(sys.argv[2]))
    else:
        parent()
