import hashlib,json,pathlib,resource,subprocess,time
workspace=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02f-archive-unit')
repo=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k')
files=('scripts/research_score_split_archive.py','tests/research-score-split/test_archive_unit.py')
pins=lambda:{name:hashlib.sha256((repo/name).read_bytes()).hexdigest() for name in files}
prior=pins();n=1
while (workspace/f'attempt-{n}.json').exists(): n+=1
log=workspace/f'attempt-{n}.log'; started=time.monotonic()
cmd=['/opt/anaconda3/bin/python3.12','-I','-m','unittest','discover','-s','tests/research-score-split','-p','test_archive_unit.py','-v']
with log.open('xb') as stream:
 child=subprocess.Popen(cmd,cwd=repo,stdout=stream,stderr=subprocess.STDOUT)
 try: result=child.wait(timeout=120)
 except subprocess.TimeoutExpired:
  child.kill();child.wait();result=-9
elapsed=time.monotonic()-started
rss=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss/2**20
report={'command':cmd,'exit_code':result,'external_seconds_including_setup':elapsed,'peak_rss_mib':rss,'wall_limit_seconds':120,'rss_limit_mib':2048,'source_hashes':prior,'source_hashes_unchanged':prior==pins(),'historical_admission_invoked':False,'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
out=workspace/f'attempt-{n}.json';out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report)); print(log.read_text()[-17000:])
raise SystemExit(result if result else int(elapsed>120 or rss>2048))
