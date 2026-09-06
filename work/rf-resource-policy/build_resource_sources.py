"""Development-only static source assembly; never imported by a controller."""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')


def source(name):
    return (ROOT / 'scripts' / name).read_text()


def definition(text, name):
    node = next(n for n in ast.parse(text).body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name == name)
    return '\n'.join(text.splitlines()[node.lineno-1:node.end_lineno])


def write(name, text):
    path = ROOT / 'scripts' / name
    ast.parse(text)
    with path.open('x') as out:
        out.write(text)


runtime = source('research_score_split_run.py')
controller = source('research_score_split_controller.py')
runtime_class = definition(runtime, 'RuntimeEnvelope')
methods = ast.parse(runtime_class).body[0].body
selected = []
for method in methods:
    if isinstance(method, ast.FunctionDef) and method.name in ('__init__', 'check'):
        selected.append('\n'.join(runtime_class.splitlines()[method.lineno-1:method.end_lineno]).replace('7200', '9000'))
policy = '''"""RF-COMP-08 resource amendment; all scientific dependencies remain COMP04.

Only worker deadline initialization/reason and the projected-cost decision
change. RuntimeStop, callbacks, accounting and invalid closure retain their
original identities. Imports do not create an envelope or run science.
"""
from contextlib import contextmanager
import math
import signal
import time

from research_score_split_run import (
    RuntimeEnvelope as _OriginalRuntimeEnvelope, RuntimeStop, CallbackResult,
    OriginAccounting, finite, require, rss_mib,
    pilot_projection as _original_pilot_projection)

VERSION = 'rfcomp08.resource-policy.v1'
BUDGET = {'seconds': 9000, 'projected_seconds': 9000, 'rss_mib': 4096,
          'complete_smoke_seconds': 120, 'invalid_metadata_seconds': 30,
          'external_worker_grace_seconds': 0, 'model_workers': 1}


class RuntimeEnvelope(_OriginalRuntimeEnvelope):
    """Original initialization/check with the separately accepted 9000s cap."""
'''
policy += '\n\n'.join(selected) + '\n\n\n'
policy += definition(controller, 'ControllerEnvelope').replace('7200', '9000') + '\n\n\n'
policy += '''def pilot_projection(original_origins, ledger, remaining_origins):
    """Retain every original check/arithmetic value; amend only the two gates."""
    result = _original_pilot_projection(original_origins, ledger, remaining_origins)
    within = result['projected_total_seconds'] <= 9000
    return {**result, 'within_time_screen': within,
            'passed': within and ledger['peak_rss_mib'] <= 4096}
'''
write('research_score_resource_policy.py', policy)

watchdog = source('research_score_split_watchdog.py')
watchdog_imports = '''"""RF-COMP-08 external resource watchdog; no scientific imports or grace.

Only the public/private maximum and report version change from RF-02F.
Owned phase, process observation and exact byte helpers are imported unchanged.
"""
import hashlib
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid
from research_score_split_watchdog import (
    ObservationFailure, _Halt, _json, _read_phase, _write_phase, _observe)


'''
watchdog_body = definition(watchdog, 'supervise') + '\n\n\n' + definition(watchdog, '_supervise') + '\n'
watchdog_body = watchdog_body.replace('7200', '9000').replace('rf02f.external-process-watchdog.v1', 'rfcomp08.external-process-watchdog.v1')
write('research_score_resource_watchdog.py', watchdog_imports + watchdog_body)

composed = source('research_score_split_compute_controller.py')
composed = composed.replace('RF-COMP-04', 'RF-COMP-08').replace('rfcomp04', 'rfcomp08')
composed = composed.replace('from research_score_split_watchdog import supervise', 'from research_score_resource_watchdog import supervise')
composed = composed.replace('OriginAccounting, RuntimeStop, require, strict, put_object, pilot_projection)',
                            'OriginAccounting, RuntimeStop, require, strict, put_object)\nfrom research_score_resource_policy import ControllerEnvelope, pilot_projection')
composed = composed.replace('CONFIG_SHA, COUNT_KEYS, ControllerEnvelope,', 'CONFIG_SHA, COUNT_KEYS,')
composed = composed.replace('from research_score_split_compute_preflight import (', 'from research_score_resource_preflight import (')
composed = composed.replace('preflight, validate_runtime_files, COMPUTE_PROTOCOL_PATH, COMPUTE_PROTOCOL_SHA)',
                            'preflight, validate_runtime_files, COMPUTE_PROTOCOL_PATH, COMPUTE_PROTOCOL_SHA,\n    RESOURCE_PROTOCOL_PATH, RESOURCE_PROTOCOL_SHA, RESOURCE_POLICY_PATH, RESOURCE_POLICY_SHA)')
composed = composed.replace('envelope.call(bound, ROOT / COMPUTE_PROTOCOL_PATH, COMPUTE_PROTOCOL_SHA)',
                            'envelope.call(bound, ROOT / COMPUTE_PROTOCOL_PATH, COMPUTE_PROTOCOL_SHA)\n        envelope.call(bound, ROOT / RESOURCE_PROTOCOL_PATH, RESOURCE_PROTOCOL_SHA)\n        envelope.call(bound, ROOT / RESOURCE_POLICY_PATH, RESOURCE_POLICY_SHA)')
write('research_score_resource_controller.py', composed)

policy_config = {'version': 'rfcomp08.resource-policy.v1',
    'scientific_config': {'path': 'config/research-team-score-split.v1.json',
                         'sha256': hashlib.sha256((ROOT/'config/research-team-score-split.v1.json').read_bytes()).hexdigest()},
    'baseline_compute_protocol': {'path': '.planning/engine-os/research-first/RF-COMP-04-COMPUTE-PROTOCOL.v1.md',
                                 'sha256': '69de6edd1ea666209e02eb51005513a0a9a2622dd3eeb30c39a6be70c0bd0a00'},
    'budget': {'seconds': 9000, 'projected_seconds': 9000, 'rss_mib': 4096,
               'complete_smoke_seconds': 120, 'invalid_metadata_seconds': 30,
               'external_worker_grace_seconds': 0, 'model_workers': 1},
    'overrides': {'setup_inclusive_seconds': {'previous': 7200, 'new': 9000},
                  'projected_seconds': {'previous': 7200, 'new': 9000}},
    'historical_invocation_authorized_by_this_file': False,
    'deferred_helpers_integrated': False, 'automatic_restart': False,
    'production_authorized': False, 'provider_requests': 0}
with (ROOT/'config/research-local-resource-policy.v1.json').open('x') as out:
    out.write(json.dumps(policy_config, sort_keys=True, indent=2, allow_nan=False)+'\n')

print('Created three new modules and separate policy config; static parse only. Preflight follows.')
