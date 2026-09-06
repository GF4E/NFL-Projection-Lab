"""One isolated diagnosis: exact AST check bodies, no scientific imports.

The synthetic clock acquires an outer sample, injects one inherited watchdog
call, then returns the earlier sample. It models interruption after sampling;
it is not an OS clock measurement or a replay of the historical execution.
"""
import time
STARTED = time.monotonic()
import ast
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
HERE = Path(__file__).resolve().parent
SOURCES = {
    'scripts/research_score_split_run.py': 'b71ba98cb62c78c657a02dd0a95f6d2296323b43b4425ef5a5b5597ff1efc9c7',
    'scripts/research_score_resource_policy.py': '6535330f1665399b73f6dba691b3ca01c2a461b4df029d6a00cd85dd6a6d9350'}


def encoded(value): return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n').encode()


def save(path, value):
    with path.open('xb') as out:
        out.write(encoded(value)); out.flush(); os.fsync(out.fileno())


def authenticate():
    for path, expected in SOURCES.items():
        if hashlib.sha256((ROOT/path).read_bytes()).hexdigest() != expected:
            raise ValueError('frozen_source_changed:'+path)


def method(path, cls, name):
    text = (ROOT/path).read_text()
    owner = next(n for n in ast.parse(text).body if isinstance(n, ast.ClassDef) and n.name == cls)
    node = next(n for n in owner.body if isinstance(n, ast.FunctionDef) and n.name == name)
    return node, {'path': path, 'class': cls, 'method': name, 'line': node.lineno,
                  'ast_sha256': hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()}


class IsolatedStop(BaseException): pass


class Clock:
    def __init__(self, values, trace, nested):
        self.values = iter(values); self.trace = trace; self.nested = nested; self.owner = None

    def monotonic(self):
        value = next(self.values)
        self.trace.append({'event':'sample_acquired', 'value':value})
        if self.nested:
            self.nested = False
            self.trace.append({'event':'watchdog_enter', 'outer_sample':value})
            self.owner._watchdog(signal.SIGALRM, None)
            self.trace.append({'event':'watchdog_return', 'last':self.owner._last})
        self.trace.append({'event':'sample_returned', 'value':value})
        return value


def observe(path, mode):
    trace = []
    clock = Clock([100.,101.] if mode == 'nested_monotone' else [100.,99.], trace,
                  nested=mode == 'nested_monotone')
    check, binding = method(path, 'RuntimeEnvelope', 'check')
    handler, handler_binding = method('scripts/research_score_split_run.py', 'RuntimeEnvelope', '_watchdog')
    namespace = {'time':clock, 'math':math, 'rss_mib':lambda:16.,
                 'finite':lambda v:type(v) in (int,float) and math.isfinite(v) and v >= 0,
                 'RuntimeStop':IsolatedStop}
    # Explicit diagnostic-only extraction. Production source stays untouched.
    exec(compile(ast.fix_missing_locations(ast.Module(body=[check,handler], type_ignores=[])),
                 '<isolated-exact-source-bodies>', 'exec'), namespace)
    class Probe:
        def __init__(self):
            self.phase='science';self.stop_reason=None;self._last=50.
            self._deadline=9000.;self._smoke_deadline=None;self.peak_rss_mib=0.
        def _stop(self, reason, stopped_at=None):
            self.stop_reason=reason;self.phase='stopped'
            trace.append({'event':'stop', 'reason':reason, 'last':self._last})
            raise IsolatedStop(reason)
    Probe.check=namespace['check'];Probe._watchdog=namespace['_watchdog']
    probe=Probe();clock.owner=probe
    error=None
    try:
        probe.check()
        if mode=='true_reversal':probe.check()
    except BaseException as exc:
        error={'type':type(exc).__name__,'reason':str(exc)}
    return {'source':binding,'handler':handler_binding,'mode':mode,'trace':trace,
            'error':error,'last':probe._last,'phase':probe.phase,
            'injected_dependencies':{'clock':'fixed synthetic samples','rss_mib':16,
                                    '_stop':'local BaseException latch, no timer/process action'}}


def child():
    authenticate()
    records=[]
    for path in SOURCES:
        for mode in ('nested_monotone','true_reversal'):
            record=observe(path,mode)
            # Save each actual outcome before testing the diagnosis.
            save(HERE/f'case-{len(records)}.json',record);records.append(record)
            assert record['error']=={'type':'IsolatedStop','reason':'invalid_monotonic_clock'}
            samples=[event['value'] for event in record['trace'] if event['event']=='sample_acquired']
            assert samples==([100.,101.] if mode=='nested_monotone' else [100.,99.])
            assert record['last']==(101. if mode=='nested_monotone' else 100.)
    authenticate()
    save(HERE/'result.json',{'status':'reproduced_false_clock_failure_in_both_exact_check_bodies',
        'cases':records,'source_hashes':SOURCES,'seconds':time.monotonic()-STARTED,
        'historical_execution':False,'scientific_imports':False,
        'limitations':['Deterministic nested sample injection, not a real SIGALRM scheduling test.',
                      'The retained historical terminal has no now/last trace; its precise cause remains inferred.',
                      'No corrective implementation is executed or accepted by this diagnosis.']})


def parent():
    authenticate()
    limit=30.;rss_limit=1024.;child_process=None;waited=None;peak=0.;error=None
    with (HERE/'stdout.log').open('xb') as out, (HERE/'stderr.log').open('xb') as err:
        try:
            child_process=subprocess.Popen([sys.executable,'-I',str(Path(__file__).resolve()),'--child'],
                stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True)
            while True:
                if time.monotonic()-STARTED>=limit:raise TimeoutError('diagnostic_deadline')
                pid,status,usage=os.wait4(child_process.pid,os.WNOHANG)
                if pid:
                    child_process.returncode=os.waitstatus_to_exitcode(status)
                    waited=usage.ru_maxrss/1024.**2;peak=max(peak,waited)
                    break
                sample=subprocess.run(['/bin/ps','-p',str(child_process.pid),'-o','rss='],
                                      capture_output=True,text=True,timeout=.5,check=False)
                if sample.returncode not in (0,1) or sample.stderr.strip():raise ValueError('rss_observation_failed')
                if sample.stdout.strip():peak=max(peak,float(sample.stdout.strip())/1024.)
                if peak>rss_limit:raise MemoryError('diagnostic_rss_limit')
                time.sleep(.01)
            if peak>rss_limit:raise MemoryError('waited_diagnostic_rss_limit')
            if child_process.returncode:raise ValueError('diagnostic_child_failed')
            authenticate()
        except BaseException as exc:
            error={'type':type(exc).__name__,'reason':str(exc)}
            if child_process is not None and child_process.returncode is None:
                os.killpg(child_process.pid,signal.SIGKILL)
                _,status,usage=os.wait4(child_process.pid,0)
                child_process.returncode=os.waitstatus_to_exitcode(status)
                waited=usage.ru_maxrss/1024.**2;peak=max(peak,waited)
        finally:
            save(HERE/'process.json',{'status':'passed' if error is None else 'failed','error':error,
                'exit_code':child_process.returncode if child_process else None,
                'seconds':time.monotonic()-STARTED,'peak_child_rss_mib':peak,'waited_child_rss_mib':waited,
                'limits':{'seconds':limit,'rss_mib':rss_limit},'source_hashes':SOURCES,
                'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'limits_of_observation':'Child RSS sampled externally and checked at wait4; no instantaneous kernel RSS reservation.'})
    if error is not None:raise RuntimeError(error)
    print(json.dumps({'status':'passed','seconds':time.monotonic()-STARTED,'peak_child_rss_mib':peak}))


if __name__=='__main__':
    child() if sys.argv[1:]==['--child'] else parent()
