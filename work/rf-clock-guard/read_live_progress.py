"""Small read-only progress snapshot; no scientific modules or callbacks."""
from pathlib import Path
import json,time
ROOT=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
record=json.loads((ROOT/'.planning/engine-os/research-first/RF-COMP-09-EXECUTION.v1.json').read_bytes())
run=Path(record['run_directory']);observer=Path(record['observer_directory'])
read=lambda p:json.loads(p.read_bytes())
result={'session':record.get('tool_session'),'identity':record['run_identity']}
if (run/'started.json').exists():result['elapsed_seconds']=time.monotonic()-read(run/'started.json')['envelope_started_monotonic']
if (observer/'phase.json').exists():result['owned_phase']=read(observer/'phase.json')
origins=sorted(run.glob('origin-evidence-*.json'));result['completed_origin_files']=len(origins)
if origins:result['last_origin_file']=origins[-1].name
if (run/'pilot.json').exists():
 pilot=read(run/'pilot.json')
 for key,value in pilot.items():
  if isinstance(value,dict) and 'projected_total_seconds' in value:result['pilot_projection']={k:value[k] for k in ('projected_total_seconds','passed','peak_rss_mib')}
if (run/'completion/terminal.json').exists():
 terminal=read(run/'completion/terminal.json');result['terminal']={k:terminal.get(k) for k in ('status','reason','error_type','phase','completed_origins','seconds','peak_rss_mib','clock_failure')}
if (observer/'process-report.json').exists():
 report=read(observer/'process-report.json');result['observer']={k:report.get(k) for k in ('status','exit_code','elapsed_seconds','stop_reason','waited_worker_peak_rss_mib')}
print(json.dumps(result,sort_keys=True))
