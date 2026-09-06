"""Read-only source comparison plus explicitly missing-receipt CLI failure probe."""
from pathlib import Path
import ast
import hashlib
import json
import os
import subprocess
import time

R=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work')
D=W/'rf02f-controller-unit'
H=lambda raw:hashlib.sha256(raw).hexdigest()
def pointer(path):
    raw=path.read_bytes();return {'path':str(path),'sha256':H(raw),'bytes':len(raw)}
def read(path):return json.loads(path.read_bytes())
def save(path,value):
    with path.open('xb') as out:
        out.write((json.dumps(value,indent=2,sort_keys=True)+'\n').encode());out.flush();os.fsync(out.fileno())
controller=R/'scripts/research_score_split_controller.py'
tests=R/'tests/research-score-split/test_controller_unit.py'
expected={str(controller):'7f82f65839a53e7fd91fa09e531ad2b758dc6c7ffeed6503cc4c0b7e9643d28b',
          str(tests):'dd088f744f441f7dd8bae82751ec2edf673770ea05548d38bea8e24406b891c7'}
assert all(H(Path(p).read_bytes())==sha for p,sha in expected.items())
pins={str(path):H(path.read_bytes()) for path in (controller,tests,
    R/'scripts/research_score_split_preflight.py',R/'scripts/research_score_split_watchdog.py',
    R/'scripts/research_score_split_run.py')}

# This receipt intentionally does not exist. No acceptance file is created.
probe=D/'current-cli-missing-receipt'
probe.mkdir()
missing=probe/'SYNTHETIC-MISSING-ACCEPTANCE-NOT-AUTHORIZED.json'
fingerprint=H(b'RF02F current held 7f82 controller missing-receipt applicability probe v1')
observer=R/'work'/('rf02f-observer-'+fingerprint[:16])
assert not missing.exists() and not observer.exists()
parent=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data')
before={p.name for p in parent.iterdir() if p.name.startswith('rf02f-v1-')}
old_cli=W/'controller-unit/cli-missing-receipt-review.json'
old=read(old_cli);old_observer=Path(old['observer_directory'])/'process-report.json'
old_bytes=old_observer.read_bytes();assert H(old_bytes)==old['process_report_sha256']
command=['/opt/anaconda3/bin/python3.12','-I',str(controller),'--repository-root',str(R),
    '--implementation-acceptance',str(missing),'--implementation-acceptance-sha256',fingerprint]
t=time.monotonic();runs=[]
for number in (1,2):
    result=subprocess.run(command,cwd=R,capture_output=True,timeout=10)
    for suffix,raw in [('stdout',result.stdout),('stderr',result.stderr)]:
        with (probe/f'attempt-{number}.{suffix}').open('xb') as out:out.write(raw)
    assert result.returncode!=0
    runs.append({'attempt':number,'exit_code':result.returncode,
        'stdout':pointer(probe/f'attempt-{number}.stdout'),'stderr':pointer(probe/f'attempt-{number}.stderr')})
    if number==1:
        process=read(observer/'process-report.json');phase=read(observer/'phase.json')
        original=(observer/'process-report.json').read_bytes()
        stderr=(observer/'stderr.log').read_text()
        assert process['exit_code']!=0 and phase['phase']=='starting'
        assert 'FileNotFoundError' in stderr and str(missing) in stderr
        assert '--watchdog-phase-file' in process['command'] and '--envelope-started-monotonic' in process['command']
    else:
        assert b'FileExistsError' in result.stderr
        assert (observer/'process-report.json').read_bytes()==original
assert {p.name for p in parent.iterdir() if p.name.startswith('rf02f-v1-')}==before
assert old_observer.read_bytes()==old_bytes and not missing.exists()
assert all(H(Path(p).read_bytes())==sha for p,sha in pins.items())
cli={'status':'passed_current_cli_failure_route_only','pins':pins,'attempts':runs,
    'command':command,'observer_directory':str(observer),'process_report':pointer(observer/'process-report.json'),
    'phase':pointer(observer/'phase.json'),'failure':'FileNotFoundError for explicitly nonexistent receipt in preflight',
    'before_store_and_admission':'Source run() calls preflight before Store; missing receipt fails in preflight._file before _validate/admission.',
    'model_namespaces_created':0,'old_observer_preserved':True,'new_observer_reentry_refused':True,
    'source_hashes_unchanged':True,'seconds':time.monotonic()-t,'subprocess_timeout_seconds':10,
    'historical_admission_fit_score_bootstrap_calls':0,
    'limitations':['Failure route only. No valid receipt supplied or created; no historical archive loaded.',
        'No inference, numerical performance, complete run or historical execution acceptance is claimed.']}
cli_path=D/'current-cli-missing-receipt-review.json';save(cli_path,cli)

source=controller.read_text();tree=ast.parse(source)
current_nodes={n.name:n for n in tree.body if hasattr(n,'name')}
def segment(s,node):return ast.get_source_segment(s,node).encode()
def ast_sha(node):return H(ast.dump(node,include_attributes=False).encode())
phase_path=D/'root-watchdog-integration-review-current-cli.json';phase_report=read(phase_path)
class_hash=H(segment(source,current_nodes['ControllerEnvelope']))
assert class_hash==phase_report['controller_class_source_sha256']
for key,name in [('runtime_sha256','research_score_split_run.py'),('watchdog_sha256','research_score_split_watchdog.py')]:
    assert H((R/'scripts'/name).read_bytes())==phase_report[key]
phase_processes=[]
for result in phase_report['results']:
    path=Path(result['process_directory'])/'process-report.json'
    assert H(path.read_bytes())==result['process_report_sha256'];phase_processes.append(pointer(path))
assert len(phase_processes)==6
snapshots=[]
names=['ControllerEnvelope','_launch','_worker_main','_suffix','_validate_published_state',
       'publish_origin','validate_publication_binding','_bank_state_digest']
for path in [D/'controller-before-phase-read-fix.py',D/'smoke-timing/attempt-1-controller.py']:
    old_source=path.read_text();old_tree=ast.parse(old_source)
    nodes={n.name:n for n in old_tree.body if hasattr(n,'name')}
    comparisons={}
    for name in names:
        if name not in nodes:comparisons[name]={'present_in_snapshot':False};continue
        old_segment=segment(old_source,nodes[name]);new_segment=segment(source,current_nodes[name])
        comparisons[name]={'old_source_sha256':H(old_segment),'current_source_sha256':H(new_segment),
            'source_segment_equal':old_segment==new_segment,'ast_equal':ast_sha(nodes[name])==ast_sha(current_nodes[name])}
    old_guards=[n for n in old_tree.body if isinstance(n,ast.If)]
    new_guards=[n for n in tree.body if isinstance(n,ast.If)]
    snapshots.append({'snapshot':pointer(path),'matches_requested_old_tested_hash':False,
        'comparisons':comparisons,'main_guards_ast_equal':[ast_sha(n) for n in old_guards]==[ast_sha(n) for n in new_guards]})
current_test_report_path=D/'saved-input-smoke-attempt-1.json';current_test_report=read(current_test_report_path)
assert current_test_report['status']=='passed' and current_test_report['exit_code']==0
assert current_test_report['pins']['scripts/research_score_split_controller.py']==expected[str(controller)]
assert current_test_report['pins']['tests/research-score-split/test_controller_unit.py']==expected[str(tests)]
log=D/'saved-input-smoke-attempt-1.log';logtext=log.read_text()
assert 'Ran 24 tests' in logtext and logtext.rstrip().endswith('OK')
grade_report_path=W/'rf02f-grade-unit/author-qualification-final.json';grade_report=read(grade_report_path)
grade_unchanged={name:H((R/name).read_bytes())==sha for name,sha in grade_report['source_hashes'].items()
    if name!='scripts/research_score_split_controller.py'}
assert all(grade_unchanged.values())
out={'version':'rf02f.evidence-applicability.v1','status':'applicable_with_explicit_replacement_evidence',
    'current_controller':pointer(controller),'current_tests':pointer(tests),'script':pointer(Path(__file__)),
    'six_phase_transfer':{'status':'exact_class_source_bytes_proven','report':pointer(phase_path),
        'old_wholefile_sha256':phase_report['controller_wholefile_sha256_at_start'],
        'class_source_sha256':class_hash,'runtime_and_watchdog_pins_match':True,'process_reports':phase_processes},
    'old_cli_transfer':{'status':'not_proven_exact_old_snapshot_unavailable','report':pointer(old_cli),
        'replacement_current_actual_probe':pointer(cli_path)},
    'grader_controller_transfer':{'status':'old_wholefile_equivalence_not_proven_current_publication_tests_used',
        'old_grader_report':pointer(grade_report_path),'old_controller_sha256':grade_report['source_hashes']['scripts/research_score_split_controller.py'],
        'all_other_grader_report_source_pins_unchanged':grade_unchanged,
        'current_test_report':pointer(current_test_report_path),'current_test_log':pointer(log),
        'coverage':['Real Store state/ancestry/publication to actual archive.grade_inputs.',
            'Missing/changed states, wrong run/parent, ancestry/write failure, exact saved byte/plan/pointer binding.',
            'Directory fsync fault, own state origin/type/shape/population, terminal failure/interrupt/atomic paths.',
            'No re-execution of PublishedOriginGrader scorer integration in this applicability check.']},
    'other_preserved_snapshots':snapshots,
    'snapshot_search_scope':['Workspace work Python files containing def _launch or class ControllerEnvelope.',
        'Repository work Python files containing those same definitions; none found there.'],
    'limitations':['Neither ef82f33d nor021c0c exact tested wholefile was found; no equality to those absent bytes is asserted.',
        'Source/AST equality of other preserved snapshots is context only, not a substitute for an absent tested snapshot.',
        'Current CLI probe replaces missing old CLI transfer; current24 tests replace the controller publication boundary evidence.',
        'Review scope and original synthetic limitations remain unchanged. No new scientific execution or approval.'],
    'blockers':[]}
assert all(H(Path(p).read_bytes())==sha for p,sha in pins.items())
outpath=D/'evidence-applicability.json';save(outpath,out)
print(json.dumps({'cli':pointer(cli_path),'applicability':pointer(outpath),'seconds':cli['seconds']},sort_keys=True))
