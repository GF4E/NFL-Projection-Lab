import datetime,hashlib,json,os,subprocess,sys,fcntl,time
from pathlib import Path
root=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');sys.path.insert(0,str(root))
from engine.projection import prospective_worker as w,prospective as p,pipeline_release as release,bundle,cutoff_worker
at=datetime.datetime.now(datetime.timezone.utc)
code=bundle.capture_code(root)
assert code['commit']=='5fd477b2719689334fe7bb14315e5eab7ed54f9d' and len(code['files'])==50
manifest=json.loads((root/'work/engine-rebuild/prospective-collector/linux-attempt3-source.json').read_bytes())['files']
for n in code['files']:assert hashlib.sha256((root/n).read_bytes()).hexdigest()==manifest[n],n
fence=json.loads((root/release.OWNER).read_bytes())
assert not (root/w.CONFIG).exists()
with (root/'outputs/model-pick-v1/.cloud-dispatch.lock').open('a+') as fd:
 deadline=time.monotonic()+45
 while True:
  try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);break
  except BlockingIOError:
   if time.monotonic()>=deadline:raise
   time.sleep(.2)
 disabled=w.collect(root,fence['owner'],fd)
assert disabled=={'state':'NOT_ENROLLED','activates_method':False}
assert not list((root/p.BASE/'enrollments').glob('*.json'))
fit=json.loads((root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes())
result={'observed_at':at.isoformat(),'uid':os.getuid(),'host_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'issuing_code_commit':code['commit'],'issuing_files_verified':len(code['files']),'disabled_path':disabled,'collector_health':w.health(root),'enrollments':0,'active_fit_ref':fit,'active_pipeline':release.pointer(root,release.ACTIVE),'cutoff_health':cutoff_worker.health(root,at),'root_available_bytes':os.statvfs('/').f_bavail*os.statvfs('/').f_frsize,'volume_available_bytes':os.statvfs(root).f_bavail*os.statvfs(root).f_frsize,'provider_requests':0,'scope':'Installed inactive collector and exact source identity; no activation or production prospective collection claimed'}
print(json.dumps(result,sort_keys=True))
