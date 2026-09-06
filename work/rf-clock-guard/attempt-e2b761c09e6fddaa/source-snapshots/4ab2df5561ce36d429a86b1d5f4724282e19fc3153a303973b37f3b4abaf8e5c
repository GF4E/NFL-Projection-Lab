"""Freeze COMP09 metadata only; no candidate/history imports."""
import ast,hashlib,json
from pathlib import Path
ROOT=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-clock-guard')
BASE=ROOT/'.planning/engine-os/research-first'
def encoded(x):return (json.dumps(x,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def fingerprint(path):
 raw=path.read_bytes();return {'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'snapshot':True}
def add(path,expected=None):
 path=Path(path)
 if not path.is_absolute():path=ROOT/path
 pin=fingerprint(path)
 if expected:
  assert pin['sha256']==expected['sha256'],str(path)
  assert 'bytes' not in expected or pin['bytes']==expected['bytes'],str(path)
 inputs[str(path)]=pin;return pin
def pointers(value):
 if isinstance(value,dict):
  if isinstance(value.get('path'),str) and isinstance(value.get('sha256'),str):add(value['path'],value)
  for child in value.values():pointers(child)
 elif isinstance(value,list):
  for child in value:pointers(child)
inputs={};oldpath=BASE/'RF-COMP-08-PREFIT-ACCEPTANCE.v1.json'
assert fingerprint(oldpath)['sha256']=='3bbc98b3645782ba088d814c61505a86041f0a5c82e6a32d6430b62c58fd1bbe'
old=json.loads(oldpath.read_bytes());add(oldpath);pointers(old)
for pointer in [old['qualification'],*old['independent_reviews'].values()]:pointers(json.loads(Path(pointer['path']).read_bytes()))
terminal=BASE/'RF-COMP-08-TERMINAL-ACCEPTANCE.v1.json'
add(terminal,{'sha256':'51962cdf91c7aa58652d9d4cef508449268aba07127770e578a9a07bdc42e727','bytes':7373});pointers(json.loads(terminal.read_bytes()))
code=dict(old['code_hashes'])
for name,sha in code.items():assert fingerprint(ROOT/name)['sha256']==sha,name
new=['scripts/research_score_clock_guard'+x+'.py' for x in ('','_preflight','_controller')]
new += ['tests/research-score-clock-guard/'+x+'.py' for x in ('test_clock_guard','test_integration','qualify_clock_guard')]
for name in new:ast.parse((ROOT/name).read_text());code[name]=fingerprint(ROOT/name)['sha256']
assert len(code)==91
for name,sha in old['runtime_files'].items():add(name,{'sha256':sha})
guard=add(BASE/'RF-COMP-09-CLOCK-PROTOCOL.v1.md',{'sha256':'9f7f68aa65d04ec172818c62d64e2f32768e058c22bd92c81ce6a2dc3a287ffb'})
for name in ('author-source-delta.json','implementation-notes.md','timer-development-review.json','exception-release-finding.json','superseded-clock-guard-cbda894f2ad256ad.py'):add(WORK/name)
pointers(json.loads((WORK/'timer-development-review.json').read_bytes()))
add(Path(__file__));add(ROOT/'config/research-team-score.v2.json')
record={'version':'rfcomp09.qualification-input-pins.v1','historical_execution':False,'code_hashes':dict(sorted(code.items())),'inputs':dict(sorted(inputs.items())),
'runtime':old['runtime'],'runtime_files':old['runtime_files'],'protocol_sha256':old['protocol']['sha256'],'config_sha256':old['config']['sha256'],
'compute_protocol_sha256':old['compute_protocol']['sha256'],'resource_protocol_sha256':old['resource_protocol']['sha256'],'resource_policy_sha256':old['resource_policy']['sha256'],
'guard_protocol_sha256':guard['sha256'],'limits':{'seconds':600,'rss_mib':2048},'tests':['tests/research-score-clock-guard/test_clock_guard.py','tests/research-score-clock-guard/test_integration.py'],
'reused_scientific_evidence':{'baseline_prefit':str(oldpath),'qualification':old['qualification'],'scope':'Accepted immutable COMP08 resource/controller and inherited COMP04 science/inference evidence; no historical scoring or bootstrap repeated.'}}
raw=encoded(record);sha=hashlib.sha256(raw).hexdigest();dest=WORK/('INPUT-PINS-'+sha[:16]+'.json')
with dest.open('xb') as f:f.write(raw)
print(json.dumps({'pins':str(dest),'sha256':sha,'sources':len(code),'inputs':len(inputs),'input_bytes':sum(v['bytes'] for v in inputs.values())}))
