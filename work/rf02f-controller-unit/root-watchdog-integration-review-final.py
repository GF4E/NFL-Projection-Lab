from pathlib import Path
import sys,json,hashlib,time,ast
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k');W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02f-controller-unit');sys.path.insert(0,str(R/'scripts'))
from research_score_split_watchdog import supervise,_supervise
source=(R/'scripts/research_score_split_controller.py').read_text();node=next(n for n in ast.parse(source).body if isinstance(n,ast.ClassDef) and n.name=='ControllerEnvelope');class_source=ast.get_source_segment(source,node)
header="""import sys,time,json
sys.path.insert(0,'/private/tmp/os01-gen15-rebuild.9ny71k/scripts')
from research_score_split_controller import ControllerEnvelope
p=sys.argv[sys.argv.index('--watchdog-phase-file')+1]
"""
success="""with ControllerEnvelope() as e:
 with e.complete_smoke(p):
  time.sleep(.06)
  e.measure_phase('inference_smoke',lambda:time.sleep(.025))
 print(json.dumps({'phase_measurements':e.phase_measurements,'elapsed':e.elapsed()}),flush=True)
"""
fail=lambda error:"""with ControllerEnvelope() as e:
 try:
  with e.complete_smoke(p):
   time.sleep(.01)
   def callback():
    time.sleep(.015)
    raise ERROR('synthetic')
   e.measure_phase('inference_smoke',callback)
 except BaseException as exc:
  print(json.dumps({'error_type':type(exc).__name__,'phase_measurements':e.phase_measurements}),flush=True)
  raise
""".replace('ERROR',error)
external="""with ControllerEnvelope() as e:
 with e.complete_smoke(p):
  print('load_started',flush=True)
  time.sleep(.4)
  print('evaluator_started',flush=True)
  e.measure_phase('inference_smoke',lambda:time.sleep(.01))
"""
internal="""with ControllerEnvelope() as e:
 try:
  with e.complete_smoke(p):
   e._whole_smoke_deadline=time.monotonic()+.03
   e._arm()
   time.sleep(.1)
 except BaseException as exc:
  print(json.dumps({'error_type':type(exc).__name__,'stop_reason':e.stop_reason,'phase_measurements':e.phase_measurements}),flush=True)
  raise
"""
results=[]
for name,body in [('success',success),('ordinary_failure',fail('ValueError')),('keyboard_interrupt',fail('KeyboardInterrupt')),('system_exit',fail('SystemExit')),('external_load_timeout',external),('internal_short_test_deadline',internal)]:
 identity='independent-fixed-'+name.replace('_','-')+'-'+str(time.time_ns());argv=['/opt/anaconda3/bin/python3.12','-I','-c',header+body]
 if name=='external_load_timeout':report=_supervise(argv,cwd=R,output_parent=W,identity=identity,limits=(3.,256.,1.,.01),phase_status=True,_smoke_seconds=.08)
 else:report=supervise(argv,cwd=R,output_parent=W,identity=identity)
 d=W/identity;phase=json.loads((d/'phase.json').read_bytes());stdout=(d/'stdout.log').read_text()
 if name=='success':
  assert report['exit_code']==0 and report['status']=='completed_process' and phase['phase']=='science'
  measured=json.loads(stdout)['phase_measurements'];assert len(measured)==1 and measured[0]['name']=='inference_smoke'
  total=phase['smoke_finished']-phase['smoke_started'];evaluator=measured[0]['seconds'];assert total-evaluator>=.05 and evaluator>=.02
 elif name=='external_load_timeout':
  assert report['status']=='externally_stopped_process' and report['stop_reason']=='complete_smoke_deadline' and phase['phase']=='smoke';assert 'evaluator_started' not in stdout;assert report['worker_grace_seconds']==0
 else:
  assert report['exit_code']!=0 and phase['phase']=='smoke'
  details=json.loads(stdout);expected={'ordinary_failure':'ValueError','keyboard_interrupt':'KeyboardInterrupt','system_exit':'SystemExit','internal_short_test_deadline':'RuntimeStop'}[name];assert details['error_type']==expected
  if name!='internal_short_test_deadline':assert details['phase_measurements'][0]['error_type']==expected and details['phase_measurements'][0]['seconds']>=.01
 results.append({'name':name,'process_directory':str(d),'process_report_sha256':hashlib.sha256((d/'process-report.json').read_bytes()).hexdigest(),'status':report['status'],'exit_code':report['exit_code'],'stop_reason':report['stop_reason'],'phase':phase['phase'],'stdout':stdout,'elapsed_seconds':report['elapsed_seconds']})
old=W/'root-watchdog-integration-review.json';out={'status':'accepted','scope':'actual_owned_watchdog_ControllerEnvelope_complete_smoke_integration_only','controller_wholefile_sha256_at_start':hashlib.sha256(source.encode()).hexdigest(),'controller_class_source_sha256':hashlib.sha256(class_source.encode()).hexdigest(),'watchdog_sha256':hashlib.sha256((R/'scripts/research_score_split_watchdog.py').read_bytes()).hexdigest(),'runtime_sha256':hashlib.sha256((R/'scripts/research_score_split_run.py').read_bytes()).hexdigest(),'prior_rejection':{'path':str(old),'sha256':hashlib.sha256(old.read_bytes()).hexdigest()},'blockers':[],'results':results,'limits':['Six small real owned subprocesses only, no run_smoke/fullfixture/admission/model/scoring/bootstrap.','External timeout uses private shortened80ms smoke seam; internal timeout sets instance deadline30ms solely to exercise real exception handling without120s wait. Successful and ordinary/BaseException paths use public supervise fixed limits.','Parent marks failed smoke handshakes operationally invalid; retained child stdout proves original exception type and evaluator phase timing even when parent stops on incomplete phase.','This does not qualify full controller publication, complete smoke workload performance, historical admission or a historical run.','Controller wholefile may receive unrelated concurrent edits; class source hash binds exact inspected boundary.']};p=W/'root-watchdog-integration-review-final.json';p.write_text(json.dumps(out,indent=2)+'\n');print(p);print(hashlib.sha256(p.read_bytes()).hexdigest());print('six_probes_passed')
