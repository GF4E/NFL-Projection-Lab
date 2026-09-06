"""Freeze RF-COMP-08 qualification inputs; metadata only, no candidate imports."""
import ast
import hashlib
import json
from pathlib import Path

ROOT=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-resource-policy')
BASE=ROOT/'.planning/engine-os/research-first'
def encoded(x): return (json.dumps(x,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def fingerprint(path):
    raw=path.read_bytes()
    return {'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'snapshot':True}
def add(path,expected=None):
    path=Path(path)
    if not path.is_absolute(): path=ROOT/path
    pin=fingerprint(path)
    if expected is not None:
        assert pin['sha256']==expected['sha256'],str(path)
        assert 'bytes' not in expected or pin['bytes']==expected['bytes'],str(path)
    inputs[str(path)]=pin
    return pin
def pointers(value):
    if isinstance(value,dict):
        if isinstance(value.get('path'),str) and isinstance(value.get('sha256'),str): add(value['path'],value)
        for child in value.values(): pointers(child)
    elif isinstance(value,list):
        for child in value: pointers(child)

inputs={}
old_path=BASE/'RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'
assert fingerprint(old_path)['sha256']=='9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e'
old=json.loads(old_path.read_bytes()); add(old_path); pointers(old)
for pointer in [old['qualification'],*old['independent_reviews'].values()]:
    pointers(json.loads(Path(pointer['path']).read_bytes()))
code=dict(old['code_hashes'])
for name,expected in code.items(): assert fingerprint(ROOT/name)['sha256']==expected,name
new_names=['scripts/research_score_resource_'+x+'.py' for x in ('policy','watchdog','preflight','controller')]
new_names += ['tests/research-score-resource-policy/'+x+'.py' for x in ('test_resource_policy','qualify_resource_policy')]
for name in new_names:
    path=ROOT/name; ast.parse(path.read_text()); code[name]=fingerprint(path)['sha256']
assert len(code)==85
for name,expected in old['runtime_files'].items(): add(name,{'sha256':expected})
resource_protocol=add(BASE/'RF-COMP-08-RESOURCE-PROTOCOL.v1.md')
resource_policy=add(ROOT/'config/research-local-resource-policy.v1.json')
for name in ('owner-approval-and-baseline.json','approved-resource-proposal.md','author-source-delta.json','implementation-notes.md'):
    add(WORK/name)
add(Path(__file__))
add(ROOT/'config/research-team-score.v2.json')
record={'version':'rfcomp08.qualification-input-pins.v1','historical_execution':False,
 'code_hashes':dict(sorted(code.items())),'inputs':dict(sorted(inputs.items())),
 'runtime':old['runtime'],'runtime_files':old['runtime_files'],
 'protocol_sha256':old['protocol']['sha256'],'config_sha256':old['config']['sha256'],
 'compute_protocol_sha256':old['compute_protocol']['sha256'],
 'resource_protocol_sha256':resource_protocol['sha256'],'resource_policy_sha256':resource_policy['sha256'],
 'limits':{'seconds':600,'rss_mib':2048},
 'tests':['tests/research-score-resource-policy/test_resource_policy.py'],
 'reused_scientific_evidence':{'baseline_prefit':old_path.as_posix(),'qualification':old['qualification'],
     'scope':'Original79 source and7 runtime pins; accepted53-check composed scientific qualification and its direct evidence/review pointers. No replay or bootstrap.'}}
raw=encoded(record); identity=hashlib.sha256(raw).hexdigest(); destination=WORK/('INPUT-PINS-'+identity[:16]+'.json')
with destination.open('xb') as f: f.write(raw)
print(json.dumps({'pins':str(destination),'sha256':identity,'sources':len(code),'inputs':len(inputs),'input_bytes':sum(v['bytes'] for v in inputs.values())}))
