"""Static development copy with explicit resource-acceptance deltas only."""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
old = (ROOT/'scripts/research_score_split_compute_preflight.py').read_text()
tree = ast.parse(old)


def function(name):
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    return '\n'.join(old.splitlines()[node.lineno-1:node.end_lineno])


baseline_path = '.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'
baseline_bytes = (ROOT/baseline_path).read_bytes()
baseline = json.loads(baseline_bytes)
assert hashlib.sha256(baseline_bytes).hexdigest() == '9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e'
old_frozen = ast.literal_eval(next(n.value for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'FROZEN_CODE_HASHES' for t in n.targets)))
extra = {k:v for k,v in baseline['code_hashes'].items() if k not in old_frozen}
assert len(old_frozen) == 72 and len(extra) == 7 and len(baseline['code_hashes']) == 79
policy_path = 'config/research-local-resource-policy.v1.json'
policy_bytes = (ROOT/policy_path).read_bytes()
policy = json.loads(policy_bytes)
header = '''"""RF-COMP-08 final acceptance; the old permission validator is never called.

The scientific config and 79-source baseline are immutable evidence. Only a
fresh receipt binding this resource policy, qualification and distinct reviews
can authorize the new identity. Imports never admit history or run science.
"""
from pathlib import Path
from research_score_split_preflight import (
    ROOT, WORK, PROTOCOL_PATH, PROTOCOL_SHA, CONFIG_PATH, CONFIG_SHA,
    INHERITED_CONFIG_SHA, PARENT_MANIFEST, PARENT_INDEX, DATA_SHA, RUNTIME,
    PERMISSIONS, require, encoded, parse, digest, _sha, _relative, _file,
    _pointer, _stage_evidence, actual_runtime)
from research_score_split_compute_preflight import (
    FROZEN_CODE_HASHES as _OLD_FROZEN, STAGES, RUNTIME_FILES, TERMINAL_POINTERS,
    COMPUTE_PROTOCOL_PATH, COMPUTE_PROTOCOL_SHA, _runtime_files, validate_runtime_files)
from research_score_resource_policy import BUDGET

VERSION = 'rfcomp08.prefit-acceptance.v1'
REVIEW_SCOPE = 'complete_resource_policy_controller_synthetic_qualification'
RESOURCE_PROTOCOL_PATH = '.planning/engine-os/research-first/RF-COMP-08-RESOURCE-PROTOCOL.v1.md'
RESOURCE_PROTOCOL_SHA = '58d77e6e1cb727ee6655d1ab925b1475fa7dd9fdcdb5740fe1630b5ad27d012f'
RESOURCE_POLICY_PATH = 'config/research-local-resource-policy.v1.json'
'''
header += 'RESOURCE_POLICY_SHA = ' + repr(hashlib.sha256(policy_bytes).hexdigest()) + '\n'
header += 'POLICY = ' + repr(policy) + '\n'
header += 'BASELINE_ACCEPTANCE = ' + repr({'path': baseline_path, 'sha256': hashlib.sha256(baseline_bytes).hexdigest(), 'bytes': len(baseline_bytes)}) + '\n'
header += 'FROZEN_CODE_HASHES = {**_OLD_FROZEN, **' + repr(extra) + '}\n'
header += '''CANDIDATE_FILES = tuple('scripts/research_score_resource_' + name + '.py'
                        for name in ('policy', 'watchdog', 'preflight', 'controller')) + (
    'tests/research-score-resource-policy/test_resource_policy.py',
    'tests/research-score-resource-policy/qualify_resource_policy.py')
CODE_FILES = tuple(sorted(set(FROZEN_CODE_HASHES) | set(CANDIDATE_FILES)))


'''
evidence = function('_evidence_result').replace('rfcomp04.', 'rfcomp08.')
evidence = evidence.replace('runtime_files=None):', 'runtime_files=None, resource_sha=None, policy_sha=None):')
evidence = evidence.replace("'compute_protocol_sha256', 'runtime_files'}", "'compute_protocol_sha256', 'runtime_files',\n                'resource_protocol_sha256', 'resource_policy_sha256'}")
evidence = evidence.replace("and encoded(value['runtime_files']) == encoded(runtime_files),", "and encoded(value['runtime_files']) == encoded(runtime_files)\n            and value['resource_protocol_sha256'] == resource_sha\n            and value['resource_policy_sha256'] == policy_sha,")

validate = function('_validate').replace('rfcomp04.', 'rfcomp08.').replace("'rfcomp04-v1-'", "'rfcomp08-v1-'")
validate = validate.replace('terminal_pointers=None):', 'terminal_pointers=None,\n              resource_sha=None, policy_sha=None, baseline_pointer=None):')
validate = validate.replace("'runtime', 'permissions'},", "'runtime', 'permissions',\n            'resource_protocol', 'resource_policy', 'baseline_acceptance'},")
anchor = "    _pointer(acceptance['compute_protocol'], root, check, read=read)"
added = '''
    _sha(resource_sha); _sha(policy_sha)
    require(acceptance['resource_protocol']['path'] == RESOURCE_PROTOCOL_PATH
            and acceptance['resource_protocol']['sha256'] == resource_sha
            and acceptance['resource_policy']['path'] == RESOURCE_POLICY_PATH
            and acceptance['resource_policy']['sha256'] == policy_sha,
            'fixed_resource_protocol_and_policy_required')
    _pointer(acceptance['resource_protocol'], root, check, read=read)
    policy = parse(_pointer(acceptance['resource_policy'], root, check, read=read))
    require(encoded(policy) == encoded(POLICY) and encoded(policy['budget']) == encoded(BUDGET),
            'exact_resource_policy_required')
    require(acceptance['baseline_acceptance'] == baseline_pointer, 'fixed_baseline_evidence_required')
    baseline = parse(_pointer(acceptance['baseline_acceptance'], root, check, read=read))
    require(baseline['version'] == 'rfcomp04.prefit-acceptance.v1'
            and baseline['status'] == 'accepted_for_one_historical_invocation'
            and baseline['code_hashes'] == frozen
            and encoded(baseline['runtime']) == encoded(runtime)
            and encoded(baseline['runtime_files']) == encoded(runtime_files),
            'baseline_scientific_source_evidence_mismatch')
    # Authenticate old evidence recursively; never call its permission validator.
    _stage_evidence(baseline, root, check, read=read)
'''
validate = validate.replace(anchor, anchor + added)
validate = validate.replace('compute_sha=compute_sha, runtime_files=runtime_files)', 'compute_sha=compute_sha, runtime_files=runtime_files,\n                     resource_sha=resource_sha, policy_sha=policy_sha)')
validate = validate.replace("'compute_protocol': acceptance['compute_protocol'], 'runtime_files': dict(runtime_files),", "'compute_protocol': acceptance['compute_protocol'], 'runtime_files': dict(runtime_files),\n                'resource_protocol': acceptance['resource_protocol'], 'resource_policy': acceptance['resource_policy'],\n                'baseline_acceptance': acceptance['baseline_acceptance'],")
validate = validate.replace("'budget': {'seconds': 7200, 'rss_mib': 4096, 'complete_smoke_seconds': 120,\n                                             'invalid_metadata_seconds': 30, 'external_worker_grace_seconds': 0}", "'budget': dict(BUDGET)")

preflight = function('preflight')
preflight = preflight.replace('_sha(COMPUTE_PROTOCOL_SHA)', '_sha(COMPUTE_PROTOCOL_SHA)\n    _sha(RESOURCE_PROTOCOL_SHA); _sha(RESOURCE_POLICY_SHA)')
preflight = preflight.replace('runtime_files=RUNTIME_FILES, terminal_pointers=TERMINAL_POINTERS)', 'runtime_files=RUNTIME_FILES, terminal_pointers=TERMINAL_POINTERS,\n                     resource_sha=RESOURCE_PROTOCOL_SHA, policy_sha=RESOURCE_POLICY_SHA,\n                     baseline_pointer=BASELINE_ACCEPTANCE)')
text = header + evidence + '\n\n\n' + validate + '\n\n\n' + preflight + '\n'
ast.parse(text)
with (ROOT/'scripts/research_score_resource_preflight.py').open('x') as out:
    out.write(text)
print('Created fourth module: source parse only, no candidate import or execution.')
