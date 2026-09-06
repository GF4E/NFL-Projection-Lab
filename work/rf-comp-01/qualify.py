"""One bounded RF-COMP-01 synthetic qualification; no historical entry point."""
import time
STARTED = time.monotonic()
from pathlib import Path
import hashlib
import importlib.util
import json
import resource
import subprocess
import sys

HERE = Path(__file__).resolve().parent
WORK = HERE.parent.parent
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
PYTHON = '/opt/anaconda3/bin/python3.12'
TEST = ROOT / 'tests/research-score-probability-compute/test_probability_compute.py'
sys.dont_write_bytecode = True


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def save(p, value):
    p.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')


def authenticate():
    pins = json.loads((HERE / 'QUALIFICATION-PINS.json').read_text())
    assert all(sha(Path(p)) == h for p, h in pins.items()), 'qualification_input_drift'
    frozen = json.loads((WORK / 'work/rf02f-controller-unit/controller-final-pins-20260905.json').read_text())['code_hashes']
    assert len(frozen) == 66 and all(sha(ROOT / p) == h for p, h in frozen.items()), 'frozen_source_drift'
    return {'qualification': pins, 'frozen': frozen}


def parent():
    inputs = authenticate()
    attempt = HERE / ('attempt-' + str(time.time_ns()))
    attempt.mkdir()
    save(attempt / 'source-map-before.json', inputs)
    for p in inputs['qualification']:
        source = Path(p)
        (attempt / source.name).write_bytes(source.read_bytes())
    (attempt / 'QUALIFICATION-PINS.json').write_bytes((HERE / 'QUALIFICATION-PINS.json').read_bytes())
    stop = None; samples = []
    with (attempt / 'process.log').open('wb') as log:
        process = subprocess.Popen([PYTHON, '-I', str(Path(__file__).resolve()), '--child', str(attempt)],
                                   stdout=log, stderr=subprocess.STDOUT)
        try:
            while process.poll() is None:
                elapsed = time.monotonic() - STARTED
                if elapsed >= 60:
                    stop = 'wall_limit'; process.kill(); break
                result = subprocess.run(['/bin/ps', '-o', 'rss=', '-p', str(process.pid)],
                                        capture_output=True, timeout=min(.5, 60-elapsed))
                if result.returncode == 0 and result.stdout.strip():
                    rss = int(result.stdout.strip()) / 1024
                    samples.append([elapsed, rss])
                    if rss > 2048:
                        stop = 'rss_limit'; process.kill(); break
                time.sleep(min(.025, max(0., 60-(time.monotonic()-STARTED))))
        except Exception as exc:
            stop = type(exc).__name__ + ':' + str(exc)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
    error = None
    try:
        after = authenticate()
        save(attempt / 'source-map-after.json', after)
        assert after == inputs, 'source_or_pin_identity_changed_during_qualification'
    except Exception as exc:
        error = type(exc).__name__ + ':' + str(exc)
    elapsed = time.monotonic() - STARTED
    peak = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 2**20
    report = {'attempt': str(attempt), 'exit_code': process.returncode, 'stop': stop,
              'source_error': error, 'wall_seconds': elapsed, 'peak_child_rss_mib': peak, 'rss_samples': samples}
    save(attempt / 'process.json', report)
    print(json.dumps({k: v for k, v in report.items() if k != 'rss_samples'}), flush=True)
    assert process.returncode == 0 and stop is None and error is None and elapsed < 60 and peak < 2048


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
    module = load('probability_compute_tests', TEST)
    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
    began = time.perf_counter()
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)
    save(attempt / 'unit-tests.json', {'tests_run': result.testsRun, 'success': result.wasSuccessful(),
         'failures': [t.id() for t, _ in result.failures], 'errors': [t.id() for t, _ in result.errors],
         'skipped': [(t.id(), reason) for t, reason in result.skipped], 'wall_seconds': time.perf_counter()-began})
    assert result.wasSuccessful() and not result.skipped, 'unit_qualification_failed'
    benchmark(attempt)
    authenticate()


def benchmark(attempt):
    from unittest.mock import patch
    import numpy as np
    import research_score_probability_compute as candidate
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
    modes = ['original','cdf','encoder','both']
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
                scorer = candidate.score_forecast if mode in ('cdf','both') else original_score
                encoder = candidate.encode_flat_floats if mode in ('encoder','both') else original_encoded
                with patch.object(saved,'encoded',encoder):
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
                return observation

            warmups=[run(mode,'warmup') for mode in modes];reference=warmups[0]
            def equal(row):
                for name in ['descriptor_sha256','metrics_sha256','law_sha256']:
                    assert row[name]==reference[name], ('candidate_output_mismatch',support,variant,row['mode'],name)
                assert row['descriptor']==reference['descriptor'] and row['metrics']==reference['metrics']
            for row in warmups[1:]:equal(row)
            rounds=[]
            for repeat in range(8):
                order=modes[repeat%4:]+modes[:repeat%4]
                observations=[run(mode,f'repeat-{repeat}') for mode in order]
                for row in observations:equal(row)
                rounds.append({'repeat':repeat,'order':order,'observations':observations})
            report['cases'].append({'support':support,'atoms':len(mapper.atoms),'setting':selected,'variant':variant,
                'stage':stage,'native_mean':json.loads(strict(obj.selected_native(selected,variant,'z-target')['mean'])),
                'warmups':warmups,'rounds':rounds,'complete_fit_callbacks':len(acc.rows)//2,
                'complete_score_callbacks':counts['actual_score_calls'],'all_equal':True})
            save(attempt/'benchmark.json',report)
            print('BENCHMARK',support,variant,'all modes exact',flush=True)
    report['status']='complete_exact_synthetic_callback_comparison'
    save(attempt/'benchmark.json',report)


if __name__ == '__main__':
    if len(sys.argv)==3 and sys.argv[1]=='--child':
        child(Path(sys.argv[2]))
    else:
        parent()
