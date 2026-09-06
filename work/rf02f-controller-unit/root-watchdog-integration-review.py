from pathlib import Path
import sys,json,hashlib,time
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k');W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02f-controller-unit');sys.path.insert(0,str(R/'scripts'))
from research_score_split_watchdog import supervise
code="""import sys,time
sys.path.insert(0, '/private/tmp/os01-gen15-rebuild.9ny71k/scripts')
from research_score_split_controller import ControllerEnvelope
p=sys.argv[sys.argv.index('--watchdog-phase-file')+1]
with ControllerEnvelope() as e:
 with e.complete_smoke(p):
  time.sleep(.02)
  e.measure_phase('inference_smoke',lambda:time.sleep(.02))
 print('handshake_completed')
"""
identity='independent-handshake-'+str(time.time_ns())
pins={p:hashlib.sha256((R/p).read_bytes()).hexdigest() for p in ['scripts/research_score_split_controller.py','scripts/research_score_split_watchdog.py','scripts/research_score_split_run.py']}
out=supervise(['/opt/anaconda3/bin/python3.12','-I','-c',code],cwd=R,output_parent=W,identity=identity)
d=W/identity;err=(d/'stderr.log').read_text();report={'status':'rejected' if out['exit_code']!=0 else 'passed_probe','scope':'actual_owned_subprocess_controller_complete_smoke_handshake','source_hashes':pins,'process_directory':str(d),'process_report_sha256':hashlib.sha256((d/'process-report.json').read_bytes()).hexdigest(),'process_status':out['status'],'exit_code':out['exit_code'],'phase_progression':out['phase_progression'],'stderr':err,'blockers':[] if out['exit_code']==0 else ['Controller expects transition_phase return mapping, but held API returns None; durable smoke marker written, then TypeError before body.'],'limits':['Small actual subprocess workloads only; no run_smoke, fixture, admission or historical science.','Failed initial handshake cannot establish preparation/evaluator timing separation or all requested BaseException probes.']}
p=W/'root-watchdog-integration-review.json';p.write_text(json.dumps(report,indent=2)+'\n');print(p);print(hashlib.sha256(p.read_bytes()).hexdigest());print(err)
