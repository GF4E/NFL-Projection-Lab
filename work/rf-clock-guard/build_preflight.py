"""Static COMP09 binding adaptation; never imports candidate or science."""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
text = (ROOT/'scripts/research_score_resource_preflight.py').read_text()


def definition(name):
    node = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == name)
    return '\n'.join(text.splitlines()[node.lineno-1:node.end_lineno])


def pointer(path, expected):
    data=(ROOT/path).read_bytes()
    assert hashlib.sha256(data).hexdigest()==expected
    return {'path':path,'sha256':expected,'bytes':len(data)},json.loads(data)


baseline, receipt=pointer('.planning/engine-os/research-first/RF-COMP-08-PREFIT-ACCEPTANCE.v1.json',
    '3bbc98b3645782ba088d814c61505a86041f0a5c82e6a32d6430b62c58fd1bbe')
old=next(n.value for n in ast.parse(text).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='FROZEN_CODE_HASHES' for t in n.targets))
extra={name:value for name,value in receipt['code_hashes'].items() if 'research_score_resource_' in name or 'tests/research-score-resource-policy/' in name}
assert len(receipt['code_hashes'])==85 and len(extra)==6
predecessor, closed=pointer('.planning/engine-os/research-first/RF-COMP-08-TERMINAL-ACCEPTANCE.v1.json',
    '51962cdf91c7aa58652d9d4cef508449268aba07127770e578a9a07bdc42e727')
artifacts={key:closed[key] for key in ('manifest','artifact_index','terminal')}
header='''"""RF-COMP-09 pre-fit boundary; old permissions and failures are evidence only.

No historical admission, approval creation or mutable dependency injection in
production. The private reader/pin seam exists for explicit synthetic fixtures.
"""
from pathlib import Path
from research_score_split_preflight import (
    ROOT, WORK, PROTOCOL_PATH, PROTOCOL_SHA, CONFIG_PATH, CONFIG_SHA,
    INHERITED_CONFIG_SHA, PARENT_MANIFEST, PARENT_INDEX, DATA_SHA, RUNTIME,
    PERMISSIONS, require, encoded, parse, digest, _sha, _relative, _file,
    _pointer, _stage_evidence, actual_runtime)
from research_score_resource_preflight import (
    FROZEN_CODE_HASHES as _OLD_FROZEN, STAGES, RUNTIME_FILES, TERMINAL_POINTERS,
    COMPUTE_PROTOCOL_PATH, COMPUTE_PROTOCOL_SHA, _runtime_files, validate_runtime_files,
    RESOURCE_PROTOCOL_PATH, RESOURCE_PROTOCOL_SHA, RESOURCE_POLICY_PATH, RESOURCE_POLICY_SHA,
    POLICY, BUDGET)

VERSION = 'rfcomp09.prefit-acceptance.v1'
REVIEW_SCOPE = 'clock_guard_complete_controller_qualification'
GUARD_PROTOCOL_PATH = '.planning/engine-os/research-first/RF-COMP-09-CLOCK-PROTOCOL.v1.md'
GUARD_PROTOCOL_SHA = '9f7f68aa65d04ec172818c62d64e2f32768e058c22bd92c81ce6a2dc3a287ffb'
'''
header+='BASELINE_ACCEPTANCE = '+repr(baseline)+'\n'
header+='PREDECESSOR_TERMINAL = '+repr(predecessor)+'\n'
header+='PREDECESSOR_ARTIFACTS = '+repr(artifacts)+'\n'
header+='FROZEN_CODE_HASHES = {**_OLD_FROZEN, **'+repr(extra)+'}\n'
header+='''CANDIDATE_FILES = (
    'scripts/research_score_clock_guard.py',
    'scripts/research_score_clock_guard_preflight.py',
    'scripts/research_score_clock_guard_controller.py',
    'tests/research-score-clock-guard/test_clock_guard.py',
    'tests/research-score-clock-guard/test_integration.py',
    'tests/research-score-clock-guard/qualify_clock_guard.py')
CODE_FILES = tuple(sorted(set(FROZEN_CODE_HASHES) | set(CANDIDATE_FILES)))


def _predecessor(root, check, *, read, pointer, artifacts):
    """Authenticate fixed invalid-terminal evidence without replaying any row."""
    receipt = parse(_pointer(pointer, root, check, read=read))
    require(receipt['version'] == 'rfcomp08.terminal-acceptance.v1'
            and receipt['status'] == 'accepted_retained_protocol_invalid_clock_stop_only',
            'closed_predecessor_acceptance_required')
    require(type(artifacts) is dict and set(artifacts) == {'manifest', 'artifact_index', 'terminal'},
            'exact_predecessor_artifacts_required')
    bodies = {}
    for key, fixed in artifacts.items():
        require(receipt[key] == fixed and set(fixed) == {'path', 'sha256', 'bytes'},
                'fixed_predecessor_artifact_required')
        _sha(fixed['sha256'])
        require(type(fixed['bytes']) is int and fixed['bytes'] > 0, 'positive_predecessor_size_required')
        path = Path(fixed['path'])
        require(path.is_absolute(), 'absolute_predecessor_artifact_required')
        bodies[key] = read(path, check, expected_sha=fixed['sha256'], expected_bytes=fixed['bytes'])
    terminal = parse(bodies['terminal'])
    require(terminal['status'] == 'protocol_invalid' and terminal['reason'] == 'invalid_monotonic_clock'
            and terminal['manifest_sha256'] == artifacts['manifest']['sha256'],
            'predecessor_invalid_status_must_remain')
    # Only the three fixed archive pointers can be outside the ordinary roots.
    _stage_evidence({k:v for k,v in receipt.items() if k not in artifacts}, root, check, read=read)
    return receipt


def validate_predecessor_terminal(check):
    require(callable(check), 'shared_budget_check_required')
    return _predecessor(ROOT, check, read=_file, pointer=PREDECESSOR_TERMINAL,
                        artifacts=PREDECESSOR_ARTIFACTS)


'''
evidence=definition('_evidence_result').replace('rfcomp08.', 'rfcomp09.')
evidence=evidence.replace('policy_sha=None):', 'policy_sha=None, guard_sha=None):')
evidence=evidence.replace("'resource_protocol_sha256', 'resource_policy_sha256'}", "'resource_protocol_sha256', 'resource_policy_sha256', 'guard_protocol_sha256'}")
evidence=evidence.replace("and value['resource_policy_sha256'] == policy_sha,", "and value['resource_policy_sha256'] == policy_sha\n            and value['guard_protocol_sha256'] == guard_sha,")

validate=definition('_validate')
validate=validate.replace('baseline_pointer=None):', 'baseline_pointer=None, guard_sha=None,\n              predecessor_pointer=None, predecessor_artifacts=None):')
validate=validate.replace("'resource_protocol', 'resource_policy', 'baseline_acceptance'},", "'resource_protocol', 'resource_policy', 'baseline_acceptance', 'guard_protocol', 'predecessor_terminal'},")
validate=validate.replace("baseline['version'] == 'rfcomp04.prefit-acceptance.v1'", "baseline['version'] == 'rfcomp08.prefit-acceptance.v1'")
anchor="    _stage_evidence(baseline, root, check, read=read)"
validate=validate.replace(anchor,anchor+'''
    _sha(guard_sha)
    require(acceptance['guard_protocol']['path'] == GUARD_PROTOCOL_PATH
            and acceptance['guard_protocol']['sha256'] == guard_sha, 'fixed_guard_protocol_required')
    _pointer(acceptance['guard_protocol'], root, check, read=read)
    require(acceptance['predecessor_terminal'] == predecessor_pointer,
            'fixed_predecessor_terminal_evidence_required')
    _predecessor(root, check, read=read, pointer=predecessor_pointer, artifacts=predecessor_artifacts)
''')
validate=validate.replace('resource_sha=resource_sha, policy_sha=policy_sha)', 'resource_sha=resource_sha, policy_sha=policy_sha, guard_sha=guard_sha)')
validate=validate.replace("'version': 'rfcomp08.manifest.v1'", "'version': 'rfcomp09.manifest.v1'")
validate=validate.replace("'baseline_acceptance': acceptance['baseline_acceptance'],", "'baseline_acceptance': acceptance['baseline_acceptance'],\n                'guard_protocol': acceptance['guard_protocol'], 'predecessor_terminal': acceptance['predecessor_terminal'],")
validate=validate.replace("'identity': 'rfcomp08-v1-'", "'identity': 'rfcomp09-v1-'")

preflight=definition('preflight')
preflight=preflight.replace('_sha(RESOURCE_PROTOCOL_SHA); _sha(RESOURCE_POLICY_SHA)', '_sha(RESOURCE_PROTOCOL_SHA); _sha(RESOURCE_POLICY_SHA); _sha(GUARD_PROTOCOL_SHA)')
preflight=preflight.replace('baseline_pointer=BASELINE_ACCEPTANCE)', 'baseline_pointer=BASELINE_ACCEPTANCE, guard_sha=GUARD_PROTOCOL_SHA,\n                     predecessor_pointer=PREDECESSOR_TERMINAL, predecessor_artifacts=PREDECESSOR_ARTIFACTS)')
result=header+evidence+'\n\n\n'+validate+'\n\n\n'+preflight+'\n'
ast.parse(result)
with (ROOT/'scripts/research_score_clock_guard_preflight.py').open('x') as output:output.write(result)
print('Created new preflight; static parse only. All candidate modules remain unimported.')
