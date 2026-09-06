from pathlib import Path
import subprocess,hashlib,time,json,sys
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k');W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work');D=W/'controller-unit';D.mkdir(parents=True,exist_ok=True)
parent=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data')
fingerprint=hashlib.sha256(b'RF02F independent synthetic missing final acceptance CLI probe v1').hexdigest()
missing=D/'SYNTHETIC-MISSING-FINAL-ACCEPTANCE.json';assert not missing.exists();observer=R/'work'/('rf02f-observer-'+fingerprint[:16]);assert not observer.exists()
command=['/opt/anaconda3/bin/python3.12','-I',str(R/'scripts/research_score_split_controller.py'),'--repository-root',str(R),'--implementation-acceptance',str(missing),'--implementation-acceptance-sha256',fingerprint]
before={p.name for p in parent.iterdir() if p.name.startswith('rf02f-v1-')};t=time.monotonic();runs=[]
for n in (1,2):
 result=subprocess.run(command,cwd=R,capture_output=True,timeout=10)
 (D/f'cli-missing-receipt-attempt{n}.stdout').write_bytes(result.stdout);(D/f'cli-missing-receipt-attempt{n}.stderr').write_bytes(result.stderr)
 assert result.returncode!=0
 runs.append({'attempt':n,'exit_code':result.returncode,'stdout_sha256':hashlib.sha256(result.stdout).hexdigest(),'stderr_sha256':hashlib.sha256(result.stderr).hexdigest()})
 if n==1:
  process=json.loads((observer/'process-report.json').read_bytes());original_report=(observer/'process-report.json').read_bytes();phase=json.loads((observer/'phase.json').read_bytes());err=(observer/'stderr.log').read_text()
  assert process['exit_code']!=0 and phase['phase']=='starting' and 'FileNotFoundError' in err and str(missing) in err
  assert '--watchdog-phase-file' in process['command'] and '--envelope-started-monotonic' in process['command']
 else:
  assert b'FileExistsError' in result.stderr and (observer/'process-report.json').read_bytes()==original_report
assert {p.name for p in parent.iterdir() if p.name.startswith('rf02f-v1-')}==before
out={'status':'accepted','scope':'actual_isolated_CLI_missing_receipt_and_observer_reentry_only','controller_sha256':hashlib.sha256((R/'scripts/research_score_split_controller.py').read_bytes()).hexdigest(),'synthetic_acceptance_sha256':fingerprint,'missing_receipt':str(missing),'observer_directory':str(observer),'process_report_sha256':hashlib.sha256(original_report).hexdigest(),'attempts':runs,'phase_handoff':'starting_owned_file_received','parent_start_argument_received':True,'model_namespaces_created':0,'observer_reentry_refused_without_report_change':True,'elapsed_seconds':time.monotonic()-t,'limits':['Each subprocess hard timeout10seconds; production watchdog limits unchanged.','Missing finalreceipt fails in preflight before Store creation/admission. No fabricated approval or historical data read, fit, scorer, bootstrap or fullfixture.','CLI failure route only; does not qualify complete277-origin runner.']};p=D/'cli-missing-receipt-review.json';p.write_text(json.dumps(out,indent=2)+'\n');print(p);print(hashlib.sha256(p.read_bytes()).hexdigest());print(out['elapsed_seconds'])
