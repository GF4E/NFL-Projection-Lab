"""Daily public preparation and scoring, isolated from the lock worker."""
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine.pick_store import put

def run():
    day=dt.datetime.now(dt.timezone.utc).date().isoformat()
    directory=ROOT/'outputs/model-pick-v1/daily'/day
    done=directory/'job-complete.json'
    if done.exists():return json.loads(done.read_text())
    results={}
    for name,module,args in [('prepare','engine.t75_prepare',[]),('score','engine.t75_report',['--scorecard','--diagnose','--refresh-results'])]:
        p=subprocess.run([sys.executable,'-B','-m',module,*args],cwd=ROOT,capture_output=True,text=True,timeout=300)
        results[name]={'exit_code':p.returncode,'output':p.stdout.strip(),'error':p.stderr[-1000:] if p.returncode else None}
    if all(r['exit_code']==0 for r in results.values()):put(done,results)
    else:put(directory/('failed-'+dt.datetime.now(dt.timezone.utc).strftime('%H%M%S')+'.json'),results)
    return results

if __name__=='__main__':print(json.dumps(run()))
