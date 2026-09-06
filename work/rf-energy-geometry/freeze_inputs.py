"""Metadata/source-only input freeze for the sole geometry qualification."""
import argparse
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OWNER = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
WORK = Path(__file__).resolve().parent
PROFILE = OWNER/'work/rf-origin-profile/profile-685708ac9c57a623'
PREFIT = ROOT/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'
PREVIOUS = ROOT/'.planning/engine-os/research-first/RF-COMP-06-ACCEPTANCE.v1.json'
SCOPE = ROOT/'.planning/engine-os/research-first/RF-COMP-07-ENERGY-GEOMETRY-SCOPE.v1.md'
SOURCE = ROOT/'scripts/research_score_energy_geometry.py'
TESTS = ROOT/'tests/research-score-energy-geometry/test_energy_geometry.py'
DRIVER = WORK/'qualify_energy_geometry.py'
FIXTURE = WORK/'SCORING-FIXTURES.v1.json'


def fingerprint(path):
    raw = path.read_bytes()
    return {'sha256':hashlib.sha256(raw).hexdigest(), 'bytes':len(raw)}


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--driver-sha256', required=True)
args = parser.parse_args()
assert len(args.driver_sha256) == 64 and set(args.driver_sha256) <= set('0123456789abcdef')
fixed = {
    SCOPE:'4170c944f5e3d02a9f176518661d6d6616141cad0f6aafc419bc8bc87b70979e',
    SOURCE:'4bc57604fe237cd407b66e59c84c6021f8ed68fe287ecb71cb6cecf5a8cdcb16',
    TESTS:'7061193136611105e8b2479025e99d2c60f0a9d0db290639a6ef241447ac5355',
    DRIVER:args.driver_sha256,
    FIXTURE:'1b1730b099eed2dd84eeb97f65b89a162dc7c4c9fcd4f5472aeee8a5dcede3aa',
    PREFIT:'9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e',
    PREVIOUS:'eb1f91b619f30374a580e3735923bc7a4a953155a1c8707b278e507628ddb384',
    PROFILE/'artifact-index.json':'ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b',
    PROFILE/'plain/scientific-witness.json':'e695fcbcfc6f1c03754e1186c344cdc42bfa4cc45575ff517ecc4703f75f4db2',
    WORK/'attribution-assessment.md':'dccd62268c149a7719e378945a51e45a163e57c23d6c3ad253bf37e0ca942f52',
    WORK/'numerical-contract-assessment.md':'fa13c9ea7840d94b9da7f628122251a3db832e20b6c97bc0554f24336db596b8',
    WORK/'lag-distance-contract.md':'02ef8cdc6e5850470617beb8e659f9b7b22798e47cb0d3311354bee3e69a1866',
    WORK/'static-numerical-review.md':'cc287c7e3bdf58514c237cdae94a2bf010dd5d69d9c1cff4fb4225b5d5584fb7',
}
for path, expected in fixed.items():
    assert fingerprint(path)['sha256'] == expected, path
for path in (SOURCE,TESTS,DRIVER):
    ast.parse(path.read_text())
accepted = json.loads(PREFIT.read_bytes())
assert len(accepted['code_hashes']) == 79 and len(accepted['runtime_files']) == 7
for name, expected in accepted['code_hashes'].items():
    assert fingerprint(ROOT/name)['sha256'] == expected, name
for name, expected in accepted['runtime_files'].items():
    assert fingerprint(Path(name))['sha256'] == expected, name
paths = set(fixed)
paths.update(Path(name) for name in accepted['runtime_files'])
paths.update(ROOT/accepted[name]['path'] for name in ('protocol','config','compute_protocol'))
paths.update((Path(__file__).resolve(),Path('/opt/anaconda3/bin/python3.12'),
    ROOT/'.planning/engine-os/research-first/RF-COMP-04-ORIGIN-PROFILE-ACCEPTANCE.v1.json'))
paths.update(WORK/name for name in ('freeze_fixture.py','static-root-review.md',
    'static-scope-review.md','static-fixture-review.md','static-driver-review.md'))
paths.update(Path('/opt/anaconda3/lib/python3.12')/name for name in (
    'json/__init__.py','json/encoder.py','json/decoder.py','json/scanner.py',
    're/__init__.py','re/_compiler.py','re/_parser.py','re/_constants.py','re/_casefix.py',
    'dataclasses.py','types.py','struct.py','copy.py','ast.py','warnings.py','functools.py','weakref.py',
    'unittest/mock.py','lib-dynload/_json.cpython-312-darwin.so',
    'lib-dynload/math.cpython-312-darwin.so','lib-dynload/_struct.cpython-312-darwin.so'))
paths.update(Path('/opt/anaconda3/lib/python3.12/site-packages/numpy')/name for name in (
    '__init__.py','core/numeric.py','core/fromnumeric.py','core/overrides.py','core/multiarray.py','core/umath.py',
    'core/_multiarray_umath.cpython-312-darwin.so','fft/_pocketfft.py',
    'fft/_pocketfft_internal.cpython-312-darwin.so'))
previous = json.loads(PREVIOUS.read_bytes())
for field in ('scope','implementation','pins','source','tests_source','driver','index','child_result'):
    pointer = previous[field]; path = Path(pointer['path'])
    assert path.is_absolute() and fingerprint(path) == {key:pointer[key] for key in ('sha256','bytes')}, field
    paths.add(path)
fixture = json.loads(FIXTURE.read_bytes())
for field in ('source','profile_index','builder'):
    pointer = fixture[field];path=Path(pointer['path'])
    assert fingerprint(path)=={key:pointer[key] for key in ('sha256','bytes')}
    paths.add(path)
inputs = {str(path):{**fingerprint(path),'snapshot':True} for path in sorted(paths)}
pins = {'version':'rf-energy-geometry-inputs.v1',
    **{key:accepted[key] for key in ('code_hashes','runtime_files','runtime')},
    'inputs':inputs,'fixture':{'path':str(FIXTURE),**fingerprint(FIXTURE)}}
destination = WORK/'INPUT-PINS.v1.json'
with destination.open('x') as output:
    output.write(json.dumps(pins,sort_keys=True,indent=2)+'\n')
print(json.dumps({'pins_path':str(destination),'pins':fingerprint(destination),
    'code_files':79,'runtime_files':7,'inputs':len(inputs),
    'input_bytes':sum(pin['bytes'] for pin in inputs.values()),'scientific_execution':False},sort_keys=True))
