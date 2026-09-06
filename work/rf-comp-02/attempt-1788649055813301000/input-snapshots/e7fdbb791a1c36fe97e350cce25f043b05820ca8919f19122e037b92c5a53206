"""One registered RF-COMP-02 synthetic qualification; no historical entry point."""
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
TEST = ROOT / 'tests/research-score-skellam-compute/test_skellam_compute.py'


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
        for name in ('qualify.py', 'QUALIFICATION-SCOPE.md', 'INPUT-PINS.json'):
            (attempt / name).write_bytes((HERE / name).read_bytes())
        snapshots = attempt / 'input-snapshots'; snapshots.mkdir()
        for name, expected in before['files'].items():
            snapshot = snapshots / expected
            if not snapshot.exists():
                snapshot.write_bytes(Path(name).read_bytes())
        with (attempt / 'process.log').open('xb') as log:
            assert time.monotonic() - STARTED < 60., 'setup_exceeded_deadline'
            process = subprocess.Popen([PYTHON, '-I', str(Path(__file__).resolve()), '--child', str(attempt)],
                                       stdout=log, stderr=subprocess.STDOUT)
            while process.poll() is None:
                elapsed = time.monotonic() - STARTED
                if elapsed >= 60.:
                    stop = 'wall_limit'; process.kill(); break
                sample = subprocess.run(['/bin/ps', '-o', 'rss=', '-p', str(process.pid)],
                                        capture_output=True, timeout=min(.5, 60. - elapsed))
                if sample.returncode == 0 and sample.stdout.strip():
                    rss = int(sample.stdout.strip()) / 1024
                    samples.append([elapsed, rss])
                    if rss > 1024.:
                        stop = 'rss_limit'; process.kill(); break
                time.sleep(min(.025, max(0., 60. - (time.monotonic() - STARTED))))
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
              'wall_limit_seconds': 60, 'rss_limit_mib': 1024, 'rss_samples': samples}
    save(attempt / 'process.json', report)
    print(json.dumps({k: v for k, v in report.items() if k != 'rss_samples'}), flush=True)
    assert report['exit_code'] == 0 and stop is source_error is None
    assert report['wall_seconds'] < 60. and report['peak_child_rss_mib'] < 1024.


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def child(attempt):
    import unittest
    sys.path.insert(0, str(ROOT / 'scripts'))
    import numpy as np
    import scipy
    assert sys.version_info[:3] == (3, 12, 2) and np.__version__ == '1.26.4' and scipy.__version__ == '1.13.1'
    assert sys.platform == 'darwin' and sys.flags.isolated and sys.executable == PYTHON
    authenticate()
    module = load('skellam_compute_tests', TEST)
    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
    began = time.perf_counter()
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2, failfast=True).run(suite)
    save(attempt / 'unit-tests.json', {'tests_run': result.testsRun, 'success': result.wasSuccessful(),
         'failures': [t.id() for t, _ in result.failures], 'errors': [t.id() for t, _ in result.errors],
         'skipped': [(t.id(), reason) for t, reason in result.skipped], 'wall_seconds': time.perf_counter()-began})
    assert result.wasSuccessful() and not result.skipped, 'unit_qualification_failed'
    benchmark(attempt)
    authenticate()


def benchmark(attempt):
    from contextlib import nullcontext
    import numpy as np
    import research_score_probability_compute as prior
    import research_score_skellam_compute as candidate
    import research_score_split_forecast as f
    import research_score_run as saved
    from research_score_compute_distribution import score_forecast as original_score
    from research_score_split_run import strict, CallbackResult
    original_encoded = saved.encoded
    (attempt / 'observations').mkdir()
    fixture = load('callback_fixture', ROOT / 'tests/research-score-split/test_forecast_unit.py')
    view, bank, outputs, _ = fixture.fixture(2013)
    pairs = np.array([(h, a) for h in range(63) for a in range(h)], dtype=float)
    scores = pairs[np.linspace(0, len(pairs)-1, 350, dtype=int)]
    supports = [('control3', f.JointBase.from_scores([[0,62],[22,22],[62,0]], [1,4,1])),
                ('synthetic700', f.JointBase.from_scores(scores, np.exp(-np.sum((scores-22.)**2, axis=1)/(2*12.**2))))]
    assert [len(m.atoms) for _, m in supports] == [3,700]
    modes = ['original','poisson','skellam']
    variants = [(10,'full','inner'),(10,'independent_marginals','outer'),
                (6,'zero_strength_update','outer'),(6,'zero_scoring_level_update','outer')]

    class Accounting:
        def __init__(self):
            self.rows = []

        def callback(self, kind, function, **metadata):
            start = time.perf_counter(); value = function(); elapsed = time.perf_counter()-start
            assert type(value) is CallbackResult and value.native_failure is None and not value.used_fallback
            self.rows.append({'kind': kind,'seconds': elapsed,'metadata':metadata})
            return value.value

    report = {'status':'running','scope':'synthetic_complete_callbacks_only','cases':[],
              'modes':modes,'full_flags':{'double_grid':True,'diagnostics':True},
              'runtime':{'python':sys.version,'numpy':np.__version__,'executable':sys.executable,'isolated':True},
              'historical_target_F_plus_S':0.007461491790146312}
    for support, mapper in supports:
        pointer_sha = hashlib.sha256(strict({'atoms':mapper.atoms,'weights':mapper.weights,'b':mapper.b})).hexdigest()
        pointer = {'name':'object-'+pointer_sha+'.json','sha256':pointer_sha}
        for selected,variant,stage in variants:
            acc = Accounting(); obj = object.__new__(f._Assembly)
            obj.bank,obj.outputs,obj.origin = bank,outputs,view['origin']
            obj.view={'mappers':{12:mapper,24:mapper}};obj.pointers={12:pointer,24:pointer}
            obj.accounting=acc;obj.full=obj.outer={}
            counts={'actual_score_calls':0}

            def run(mode, tag):
                scorer = {'original': original_score, 'poisson': prior.score_forecast,
                          'skellam': candidate.score_forecast}[mode]
                with nullcontext():
                    law, descriptor, reason, work = obj.resolve(selected,variant,'z-target',stage)
                    fit = acc.rows[-1]
                    def score():
                        counts['actual_score_calls'] += 1
                        metrics = scorer(law,[21,17],'z-target',double_grid=True,diagnostics=True)
                        return CallbackResult(metrics,reason,reason is not None)
                    metrics = acc.callback('score',score,game_id='z-target',setting=selected,variant=variant,
                                           stage=stage,operation='score',double_grid=True,diagnostics=True)
                assert saved.encoded is original_encoded and reason is None
                assert work['fit_calls']==work['descriptor_recoveries']==1
                law_bytes = strict({k:getattr(law,k) for k in ['atoms','alpha','rates','theta','beta','independent','iterations']})
                descriptor_bytes,metric_bytes=strict(descriptor),strict(metrics)
                observation = {'mode':mode,'fit':fit,'score':acc.rows[-1],
                        'descriptor':json.loads(descriptor_bytes),'metrics':json.loads(metric_bytes),
                        'descriptor_sha256':hashlib.sha256(descriptor_bytes).hexdigest(),
                        'metrics_sha256':hashlib.sha256(metric_bytes).hexdigest(),
                        'law_sha256':hashlib.sha256(law_bytes).hexdigest()}
                # Preserve each completed body before the equality assertion.
                save(attempt/'observations'/f'{support}-{variant}-{tag}-{mode}.json', observation)
                assert len(metrics) == 104, 'full_score_field_count_changed'
                return observation

            reference_path = Path(authenticate()['references'][support+'-'+variant])
            reference = json.loads(reference_path.read_bytes())
            def equal(row):
                for name in ['descriptor_sha256','metrics_sha256','law_sha256']:
                    assert row[name]==reference[name], ('candidate_output_mismatch',support,variant,row['mode'],name)
                assert row['descriptor']==reference['descriptor'] and row['metrics']==reference['metrics']
            warmups=[]
            for mode in modes:
                row=run(mode,'warmup'); equal(row); warmups.append(row)
            rounds=[]
            for repeat in range(6):
                order=modes[repeat%3:]+modes[:repeat%3]
                observations=[]
                for mode in order:
                    row=run(mode,f'repeat-{repeat}'); equal(row); observations.append(row)
                rounds.append({'repeat':repeat,'order':order,'observations':observations})
            report['cases'].append({'support':support,'atoms':len(mapper.atoms),'setting':selected,'variant':variant,
                'stage':stage,'native_mean':json.loads(strict(obj.selected_native(selected,variant,'z-target')['mean'])),
                'warmups':warmups,'rounds':rounds,'complete_fit_callbacks':len(acc.rows)//2,
                'complete_score_callbacks':counts['actual_score_calls'],'all_equal':True})
            save(attempt/f'case-{support}-{variant}.json',report['cases'][-1])
            print('RF-COMP-02',support,variant,'all modes exact',flush=True)
    assert sum(c['complete_fit_callbacks'] for c in report['cases']) == 168
    assert sum(c['complete_score_callbacks'] for c in report['cases']) == 168
    assert saved.encoded is original_encoded
    report['reference_basis'] = 'pinned_accepted_original_observations'
    report['encoder'] = 'original_unmodified'
    report['status']='complete_exact_synthetic_callback_comparison'
    save(attempt/'benchmark.json',report)


if __name__ == '__main__':
    if len(sys.argv)==3 and sys.argv[1]=='--child':
        child(Path(sys.argv[2]))
    else:
        parent()
