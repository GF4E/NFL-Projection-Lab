"""Authenticate existing inputs and exclusively freeze COMP06 pins; no model imports."""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OWNER = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
WORK = Path(__file__).resolve().parent
PROFILE = OWNER/'work/rf-origin-profile/profile-685708ac9c57a623'
PREFIT = ROOT/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'
PREVIOUS = ROOT/'.planning/engine-os/research-first/RF-COMP-05-ACCEPTANCE.v1.json'
SCOPE = ROOT/'.planning/engine-os/research-first/RF-COMP-06-BANK-SNAPSHOT-SCOPE.v1.md'
SOURCE = ROOT/'scripts/research_score_bank_snapshot.py'
TESTS = ROOT/'tests/research-score-bank-snapshot/test_bank_snapshot.py'
DRIVER = WORK/'qualify_bank_snapshot.py'
DESIGN = OWNER/'work/rf-strict-compute/NEXT-EFFICIENCY-DESIGN.md'
STATE = PROFILE/'plain/origin-store/state-2013-01.json'


def fingerprint(path):
    raw = path.read_bytes()
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


fixed = {
    SCOPE: '9f4ff7b1dced4698e48c4be4859893e16ebedb3f66e747913beda174749aff15',
    SOURCE: 'e327560586f3d938743cb9b44120b8e7206ad16e68c2af2edc277967485e2426',
    TESTS: 'e53a7c2b52215d1d477011c2bfa810b2cfc0a8f376d5ce18c2b2817b40a40165',
    DRIVER: 'c87cbfb3222aa953f88c23ca63fbe89877968086ef3079c8cd944b27fcc75259',
    DESIGN: 'd1b535773196fb5c5162134d67f72334cdd9a646effb9050b7bb45cd4de6a1f9',
    PREFIT: '9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e',
    PREVIOUS: '285949c06378799e01a95292708a6d16da371f16666bb92e82dc476bfe6d89cb',
    STATE: '0be4fb5801dc501d6ebb0a15c764eac82a45edb81dc640db77c6ae2c626bbda1',
    PROFILE/'artifact-index.json': 'ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b',
}
for path, expected in fixed.items():
    assert fingerprint(path)['sha256'] == expected, path
for path in (SOURCE, TESTS, DRIVER):
    ast.parse(path.read_text())
accepted = json.loads(PREFIT.read_bytes())
assert len(accepted['code_hashes']) == 79 and len(accepted['runtime_files']) == 7
for name, expected in accepted['code_hashes'].items():
    assert fingerprint(ROOT/name)['sha256'] == expected, name
for name, expected in accepted['runtime_files'].items():
    assert fingerprint(Path(name))['sha256'] == expected, name
paths = set(fixed)
paths.update(Path(name) for name in accepted['runtime_files'])
paths.update(ROOT/accepted[name]['path'] for name in ('protocol', 'config', 'compute_protocol'))
paths.update((Path(__file__).resolve(), Path('/opt/anaconda3/bin/python3.12'),
    ROOT/'.planning/engine-os/research-first/RF-COMP-04-ORIGIN-PROFILE-ACCEPTANCE.v1.json'))
paths.update(WORK/name for name in ('static-root-review.md', 'static-numerical-review.md',
    'static-fixture-review.md', 'static-driver-review.md', 'static-driver-review.v2.md'))
paths.update(Path('/opt/anaconda3/lib/python3.12')/name for name in (
    'json/__init__.py', 'json/encoder.py', 'json/decoder.py', 'json/scanner.py',
    're/__init__.py', 're/_compiler.py', 're/_parser.py', 're/_constants.py', 're/_casefix.py',
    'dataclasses.py', 'types.py', 'lib-dynload/_json.cpython-312-darwin.so',
    'lib-dynload/math.cpython-312-darwin.so'))
previous = json.loads(PREVIOUS.read_bytes())
for field in ('scope', 'implementation', 'pins', 'source', 'tests_source', 'driver', 'index', 'child_result'):
    pointer = previous[field]
    path = Path(pointer['path'])
    assert path.is_absolute() and fingerprint(path) == {key: pointer[key] for key in ('sha256', 'bytes')}, field
    paths.add(path)
state_pin = json.loads((PROFILE/'artifact-index.json').read_bytes())['files']['plain/origin-store/state-2013-01.json']
assert fingerprint(STATE) == state_pin
inputs = {str(path): {**fingerprint(path), 'snapshot': True} for path in sorted(paths)}
pins = {'version': 'rf-bank-snapshot-inputs.v1',
    **{key: accepted[key] for key in ('code_hashes', 'runtime_files', 'runtime')},
    'inputs': inputs, 'state': {'path': str(STATE), **state_pin}}
destination = WORK/'INPUT-PINS.v1.json'
with destination.open('x') as output:
    output.write(json.dumps(pins, sort_keys=True, indent=2)+'\n')
print(json.dumps({'pins_path': str(destination), 'pins': fingerprint(destination),
    'code_files': len(pins['code_hashes']), 'runtime_files': len(pins['runtime_files']),
    'inputs': len(inputs), 'input_bytes': sum(pin['bytes'] for pin in inputs.values()),
    'scientific_execution': False}, sort_keys=True))
