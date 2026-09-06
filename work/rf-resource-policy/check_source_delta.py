"""Read-only AST/hash proof; imports no repository or scientific module."""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-resource-policy')


def raw(name):
    return (ROOT/name).read_text()


def nodes(name):
    return {n.name: n for n in ast.parse(raw(name)).body if isinstance(n, (ast.ClassDef, ast.FunctionDef))}


def dump(node):
    return ast.dump(node, include_attributes=False)


def normalized(node, replacements):
    node = ast.parse(ast.unparse(node)).body[0]
    class Replace(ast.NodeTransformer):
        def visit_Constant(self, item):
            if isinstance(item.value, str):
                for old, new in replacements.items():
                    if isinstance(old, str): item.value = item.value.replace(old, new)
            elif item.value == 9000:
                item.value = 7200. if isinstance(item.value, float) else 7200
            return item
    return Replace().visit(node)


checks = {}
old_runtime = nodes('scripts/research_score_split_run.py')['RuntimeEnvelope']
new_policy = nodes('scripts/research_score_resource_policy.py')
old_methods = {n.name:n for n in old_runtime.body if isinstance(n, ast.FunctionDef)}
new_methods = {n.name:n for n in new_policy['RuntimeEnvelope'].body if isinstance(n, ast.FunctionDef)}
checks['runtime_only_init_and_check_overridden'] = set(new_methods) == {'__init__','check'}
for name, node in new_methods.items():
    checks['runtime_'+name+'_only_9000_cap_or_reason'] = dump(normalized(node, {'registered_9000':'registered_7200'})) == dump(old_methods[name])
old_smoke = nodes('scripts/research_score_split_controller.py')['ControllerEnvelope']
checks['controller_envelope_only_parent_cap_change'] = dump(normalized(new_policy['ControllerEnvelope'], {})) == dump(old_smoke)

old_watch = nodes('scripts/research_score_split_watchdog.py')
new_watch = nodes('scripts/research_score_resource_watchdog.py')
for name in ('supervise','_supervise'):
    checks[name+'_only_9000_caps_and_report_version'] = dump(normalized(new_watch[name], {'fixed9000':'fixed7200', 'rfcomp08.external-process-watchdog.v1':'rf02f.external-process-watchdog.v1'})) == dump(old_watch[name])

old_controller = nodes('scripts/research_score_split_compute_controller.py')
new_controller = nodes('scripts/research_score_resource_controller.py')
checks['chronological_loop_ast_exact'] = dump(old_controller['_chronological_origins']) == dump(new_controller['_chronological_origins'])
checks['worker_cli_ast_exact'] = dump(old_controller['_worker_main']) == dump(new_controller['_worker_main'])
run = new_controller['run']
extra_rechecks = []
for node in ast.walk(run):
    if isinstance(node, ast.Try):
        kept = []
        for statement in node.body:
            code = ast.unparse(statement)
            if code in ('envelope.call(bound, ROOT / RESOURCE_PROTOCOL_PATH, RESOURCE_PROTOCOL_SHA)',
                        'envelope.call(bound, ROOT / RESOURCE_POLICY_PATH, RESOURCE_POLICY_SHA)'):
                extra_rechecks.append(code)
            else:
                kept.append(statement)
        node.body = kept
checks['two_exact_additional_post_science_resource_checks'] = len(extra_rechecks) == 2
checks['run_ast_exact_except_terminal_identity_and_resource_checks'] = dump(normalized(run, {'rfcomp08':'rfcomp04'})) == dump(old_controller['run'])
launch = new_controller['_launch']
for item in ast.walk(launch):
    if isinstance(item, ast.ImportFrom) and item.module == 'research_score_resource_watchdog':
        item.module = 'research_score_split_watchdog'
checks['launcher_ast_exact_except_watchdog_import_and_identity'] = dump(normalized(launch, {'rfcomp08':'rfcomp04','RF-COMP-08':'RF-COMP-04'})) == dump(old_controller['_launch'])

baseline = json.loads(raw('.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'))
for name, expected in baseline['code_hashes'].items():
    assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == expected, name
for name, expected in baseline['runtime_files'].items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == expected, name
new_files = ['scripts/research_score_resource_'+n+'.py' for n in ('policy','watchdog','controller','preflight')]
new_files += ['config/research-local-resource-policy.v1.json', '.planning/engine-os/research-first/RF-COMP-08-RESOURCE-PROTOCOL.v1.md']
for name in new_files:
    if name.endswith('.py'): ast.parse(raw(name))
result = {'status': 'passed_static_source_delta_only' if all(checks.values()) else 'failed',
          'checks': checks, 'source_hashes': baseline['code_hashes'],
          'runtime_files': baseline['runtime_files'],
          'new_inputs': {n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in new_files},
          'historical_execution': False, 'candidate_imports': False, 'tests_executed': False,
          'scope': 'Author static source correspondence and original 79/7 byte authentication only; independent review and qualification pending.'}
out = WORK/'author-source-delta.json'
with out.open('x') as stream:
    stream.write(json.dumps(result, indent=2, sort_keys=True)+'\n')
print(json.dumps({'status':result['status'], 'checks':checks, 'path':str(out), 'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
assert all(checks.values())
