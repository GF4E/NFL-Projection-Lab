from pathlib import Path
import json,hashlib,ast
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k');W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
old=(R/'scripts/research_score_split_preflight.py').read_text();tree=ast.parse(old)
def fun(name):return ast.get_source_segment(old,next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
acc=json.loads((R/'.planning/engine-os/research-first/RF-02F-PREFIT-ACCEPTANCE.v1.json').read_bytes());pins=json.loads((W/'work/rf-comp-03/attempt-1788650331150204000/INPUT-PINS.json').read_bytes())
frozen=dict(acc['code_hashes']);extra=['scripts/research_score_probability_compute.py','scripts/research_score_skellam_compute.py','scripts/research_score_encoding_memo.py','tests/research-score-probability-compute/test_probability_compute.py','tests/research-score-skellam-compute/test_skellam_compute.py','tests/research-score-encoding-memo/test_encoding_memo.py']
for n in extra:frozen[n]=pins['files'][str(R/n)]
stages={}
for n,v in acc['stage_acceptances'].items():stages[n]={**v,'status':json.loads((R/v['path']).read_bytes())['status']}
for n,fn in [('comp01','RF-COMP-01-ACCEPTANCE.v1.json'),('comp02','RF-COMP-02-ACCEPTANCE.v1.json'),('comp03','RF-COMP-03-ACCEPTANCE.v1.json'),('rf02f_terminal','RF-02F-TERMINAL-ACCEPTANCE.v1.json')]:
 p=R/'.planning/engine-os/research-first'/fn;stages[n]={'path':str(p.relative_to(R)),'sha256':sha(p),'bytes':p.stat().st_size,'status':json.loads(p.read_bytes())['status']}
terminal=json.loads((R/stages['rf02f_terminal']['path']).read_bytes());tp={k:terminal[k] for k in ['manifest','artifact_index','terminal']}
rt={p:h for p,h in pins['files'].items() if p.startswith('/opt/anaconda3/')}
head='''"""RF-COMP-04 fixed acceptance boundary. No archive admission or approval creation.

Only this experiment's final receipt can authorize its new identity. Shared
helpers are non-versioned readers/serializers, never the original validator.
"""
from pathlib import Path
from research_score_split_preflight import (
    ROOT, WORK, PROTOCOL_PATH, PROTOCOL_SHA, CONFIG_PATH, CONFIG_SHA,
    INHERITED_CONFIG_SHA, PARENT_MANIFEST, PARENT_INDEX, DATA_SHA, RUNTIME,
    PERMISSIONS, require, encoded, parse, digest, _sha, _relative, _file,
    _pointer, _stage_evidence, actual_runtime)

VERSION = 'rfcomp04.prefit-acceptance.v1'
REVIEW_SCOPE = 'complete_controller_synthetic_qualification'
COMPUTE_PROTOCOL_PATH = '.planning/engine-os/research-first/RF-COMP-04-COMPUTE-PROTOCOL.v1.md'
COMPUTE_PROTOCOL_SHA = None  # Must be frozen before any production acceptance.
'''
head+='FROZEN_CODE_HASHES = '+repr(frozen)+'\nSTAGES = '+repr(stages)+'\nRUNTIME_FILES = '+repr(rt)+'\nTERMINAL_POINTERS = '+repr(tp)+'\n'
head+="CANDIDATE_FILES = tuple('scripts/research_score_split_compute_' + name + '.py' for name in ('integration', 'preflight', 'controller')) + tuple('tests/research-score-split-compute/test_' + name + '.py' for name in ('integration', 'preflight', 'controller')) + ('tests/research-score-split-compute/qualify_controller.py',)\nCODE_FILES = tuple(sorted(set(FROZEN_CODE_HASHES) | set(CANDIDATE_FILES)))\n\n"
head+='''def _runtime_files(check, *, read, pins):
    for name, fingerprint in pins.items():
        _sha(fingerprint)
        read(Path(name), check, expected_sha=fingerprint)
    return dict(pins)


def validate_runtime_files(check):
    """Recheck pinned private backend and encoder bytes, including after science."""
    require(callable(check), 'shared_budget_check_required')
    check()
    require(encoded(actual_runtime()) == encoded(RUNTIME), 'unqualified_runtime')
    return _runtime_files(check, read=_file, pins=RUNTIME_FILES)


'''
e=fun('_evidence_result').replace('qualification_sha=None):','qualification_sha=None, compute_sha=None, runtime_files=None):').replace("'runtime', 'historical_execution', 'tests', 'evidence'","'runtime', 'historical_execution', 'tests', 'evidence', 'compute_protocol_sha256', 'runtime_files'").replace('rf02f.controller-','rfcomp04.controller-').replace("and value['historical_execution'] is False,","and value['historical_execution'] is False\n            and value['compute_protocol_sha256'] == compute_sha\n            and encoded(value['runtime_files']) == encoded(runtime_files),")
v=fun('_validate').replace('protocol_sha=PROTOCOL_SHA, config_sha=CONFIG_SHA):','protocol_sha=PROTOCOL_SHA, config_sha=CONFIG_SHA, compute_sha=None, runtime_files=None, terminal_pointers=None):').replace("'config', 'stage_acceptances'","'config', 'compute_protocol', 'runtime_files', 'stage_acceptances'")
v=v.replace("    require(encoded(acceptance['permissions'])", "    _sha(compute_sha)\n    _sha(acceptance_sha)\n    require(encoded(acceptance['runtime_files']) == encoded(runtime_files), 'fixed_runtime_files_required')\n    _runtime_files(check, read=read, pins=runtime_files)\n    require(acceptance['compute_protocol']['path'] == COMPUTE_PROTOCOL_PATH\n            and acceptance['compute_protocol']['sha256'] == compute_sha, 'fixed_compute_protocol_required')\n    _pointer(acceptance['compute_protocol'], root, check, read=read)\n    require(encoded(acceptance['permissions'])")
v=v.replace("        _stage_evidence(stage, root, check, read=read)","""        if name == 'rf02f_terminal':
            # Old permission is evidence only, never passed to a permission validator.
            for key, fixed in terminal_pointers.items():
                require(stage[key] == fixed, 'fixed_terminal_evidence_required')
                _sha(fixed['sha256'])
                require(type(fixed['bytes']) is int and fixed['bytes'] > 0, 'positive_terminal_size_required')
                read(Path(fixed['path']), check, expected_sha=fixed['sha256'], expected_bytes=fixed['bytes'])
            for key in ('observer', 'prefit_acceptance', 'root_integrity'):
                _pointer(stage[key], root, check, read=read)
            for item in stage['independent_reviews'].values():
                _pointer(item, root, check, read=read)
        else:
            _stage_evidence(stage, root, check, read=read)""")
v=v.replace('_evidence_result(qualification, code, runtime, protocol_sha, config_sha)','_evidence_result(qualification, code, runtime, protocol_sha, config_sha, compute_sha=compute_sha, runtime_files=runtime_files)').replace("qualification_sha=acceptance['qualification']['sha256'])","qualification_sha=acceptance['qualification']['sha256'], compute_sha=compute_sha, runtime_files=runtime_files)")
v=v.replace("identities = [acceptance['qualification']['path']]","identities = [str((root / acceptance['qualification']['path']).resolve())]").replace("identities.append(pointer['path'])","identities.append(str((root / pointer['path']).resolve()))")
v=v.replace("'version': 'rf02f.team-score.v1'","'version': 'rfcomp04.manifest.v1'").replace("'code_hashes': dict(code),", "'compute_protocol': acceptance['compute_protocol'], 'runtime_files': dict(runtime_files),\n                'code_hashes': dict(code),").replace("'identity': 'rf02f-v1-'","'identity': 'rfcomp04-v1-'")
p=fun('preflight').replace('    budget_check()','    budget_check()\n    _sha(COMPUTE_PROTOCOL_SHA)',1).replace('stages=STAGES)','stages=STAGES, compute_sha=COMPUTE_PROTOCOL_SHA,\n                     runtime_files=RUNTIME_FILES, terminal_pointers=TERMINAL_POINTERS)')
(R/'scripts/research_score_split_compute_preflight.py').write_text(head+e+'\n\n\n'+v+'\n\n\n'+p+'\n')
print('wrote candidate; frozen',len(frozen),'new7 runtime',len(rt))
