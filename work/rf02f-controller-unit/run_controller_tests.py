import subprocess,time,json,resource,hashlib,sys
from pathlib import Path
root=Path('/private/tmp/os01-gen15-rebuild.9ny71k');work=Path(__file__).resolve().parent
name=sys.argv[1]
start=time.monotonic()
p=subprocess.run(['/opt/anaconda3/bin/python3.12','-I',str(root/'tests/research-score-split/test_controller_unit.py')],cwd=root,capture_output=True,text=True,timeout=120)
seconds=time.monotonic()-start;rss=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss/1024**2
(work/(name+'.log')).write_text(p.stdout+p.stderr)
report={'status':'passed' if p.returncode==0 and seconds<120 and rss<=2048 else 'failed','exit_code':p.returncode,'external_seconds':seconds,'waited_worker_peak_rss_mib':rss,'limit_seconds':120,'limit_rss_mib':2048,'historical_invocation':False,'pins':{n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in ['scripts/research_score_split_controller.py','tests/research-score-split/test_controller_unit.py']}}
(work/(name+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));print((p.stdout+p.stderr)[-4500:]);sys.exit(p.returncode)
