"""Development-only static copies; no scientific/candidate imports."""
import ast
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')


def read(name): return (ROOT/'scripts'/name).read_text()


def node(text, name):
    return next(n for n in ast.parse(text).body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name == name)


def section(text, item):
    return '\n'.join(text.splitlines()[item.lineno-1:item.end_lineno])


def write(name, text):
    ast.parse(text)
    with (ROOT/'scripts'/name).open('x') as output: output.write(text)


policy = read('research_score_resource_policy.py')
runtime = node(policy, 'RuntimeEnvelope')
runtime_check = next(n for n in runtime.body if isinstance(n, ast.FunctionDef) and n.name == 'check')
body = section(policy, runtime_check)
body = '\n'.join(line[4:] if line.startswith('    ') else line for line in body.splitlines())
body = body.replace('def check(self):', 'def _runtime_check(self):', 1)
body = body.replace("        self._stop('invalid_monotonic_clock')",
                    "        self._clock_failure = {'reason': 'invalid_monotonic_clock',\n"
                    "            'sample': _clock_image(now), 'previous_last': _clock_image(self._last),\n"
                    "            'check_context': 'serialized_complete_runtime_check',\n"
                    "            'active': self._check_active, 'pending': self._check_pending}\n"
                    "        self._stop('invalid_monotonic_clock')")
smoke = node(policy, 'ControllerEnvelope')
smoke_check = next(n for n in smoke.body if isinstance(n, ast.FunctionDef) and n.name == 'check')
once = section(policy, smoke_check).replace('def check(self):', 'def _check_once(self):', 1)
once = once.replace('return super().check()', 'return _runtime_check(self)')
header = '''"""RF-COMP-09 serializes complete runtime checks; scientific code is unchanged.

Nested watchdog requests do not sample clocks/RSS or mutate checked state.
They are serviced after the active check, with every original rule retained.
No tolerance, timestamp clamping, global patch or historical entry point.
"""
import math
import time

from research_score_resource_policy import (
    ControllerEnvelope as _OriginalControllerEnvelope, RuntimeStop, finite, rss_mib)

VERSION = 'rfcomp09.clock-guard.v1'


def _clock_image(value):
    """Lossless production float image, including nonfinite values, without IO.

Non-float injected/corrupted objects retain only a type label: no arbitrary
repr/float conversion is called while preserving an original clock failure.
"""
    return {'type': type(value).__name__,
            'float_hex': float.hex(value) if type(value) is float else None}


'''
guard = '''


class ControllerEnvelope(_OriginalControllerEnvelope):
    """Original complete envelope with single-owner, pending-request checking."""
    def __init__(self, started_monotonic=None):
        self._check_active = False
        self._check_pending = False
        self._clock_failure = None
        super().__init__(started_monotonic)

    def check(self):
        if self._check_active:
            self._check_pending = True
            return
        while True:
            try:
                self._check_active = True
                self._check_pending = False
                self._check_once()
            finally:
                self._check_active = False
            # Release ownership first: a signal here performs its own complete
            # check, or the pending request starts a fresh protected iteration.
            # Exceptions bypass this drain and retain their original identity.
            if not self._check_pending:
                return

'''
write('research_score_clock_guard.py', header + body + guard + once + '\n')

old_controller = read('research_score_resource_controller.py')
# Preserve the fixed imports/lean-parent layout, replacing only new bindings.
prefix = old_controller[:node(old_controller, '_chronological_origins').lineno and
                        sum(len(line)+1 for line in old_controller.splitlines()[:node(old_controller, '_chronological_origins').lineno-1])]
prefix = prefix.replace('RF-COMP-08', 'RF-COMP-09').replace('rfcomp08', 'rfcomp09')
prefix = prefix.replace('from research_score_resource_policy import ControllerEnvelope, pilot_projection',
                        'from research_score_resource_policy import pilot_projection\nfrom research_score_clock_guard import ControllerEnvelope\nfrom research_score_resource_controller import _chronological_origins')
prefix = prefix.replace('from research_score_resource_preflight import (', 'from research_score_clock_guard_preflight import (')
prefix = prefix.replace('RESOURCE_PROTOCOL_PATH, RESOURCE_PROTOCOL_SHA, RESOURCE_POLICY_PATH, RESOURCE_POLICY_SHA)',
                        'RESOURCE_PROTOCOL_PATH, RESOURCE_PROTOCOL_SHA, RESOURCE_POLICY_PATH, RESOURCE_POLICY_SHA,\n    GUARD_PROTOCOL_PATH, GUARD_PROTOCOL_SHA, PREDECESSOR_TERMINAL, validate_predecessor_terminal)')
run = section(old_controller, node(old_controller, 'run')).replace('rfcomp08.', 'rfcomp09.')
run = run.replace('envelope.call(bound, ROOT / RESOURCE_POLICY_PATH, RESOURCE_POLICY_SHA)',
                  'envelope.call(bound, ROOT / RESOURCE_POLICY_PATH, RESOURCE_POLICY_SHA)\n'
                  '        envelope.call(bound, ROOT / GUARD_PROTOCOL_PATH, GUARD_PROTOCOL_SHA)\n'
                  '        envelope.call(validate_predecessor_terminal, envelope.check)')
run = run.replace("'error_type': type(error).__name__,", "'error_type': type(error).__name__,\n            'clock_failure': copy.deepcopy(envelope._clock_failure),")
worker = section(old_controller, node(old_controller, '_worker_main'))
write('research_score_clock_guard_controller.py', prefix + run + '\n\n\n' + worker + "\n\n\nif __name__ == '__main__':\n    raise SystemExit(_worker_main())\n")
print('Created guard/controller; static AST parse only. Preflight awaits predecessor evidence pin.')
