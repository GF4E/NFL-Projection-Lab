"""Read-only source authentication and exclusive qualification pin creation."""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OWNER = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
WORK = Path(__file__).resolve().parent
PROFILE = OWNER/'work/rf-origin-profile/profile-685708ac9c57a623'
PREFIT = ROOT/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'
SCOPE = ROOT/'.planning/engine-os/research-first/RF-COMP-05-STRICT-SCOPE.v1.md'
SOURCE = ROOT/'scripts/research_score_strict_compute.py'
TESTS = ROOT/'tests/research-score-strict-compute/test_strict_compute.py'
DRIVER = WORK/'qualify_strict.py'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


fixed = {
    SCOPE: 'e734420782264bfdf4dc80ec784c5e7cc05b2cab7a1836628cc77243fe74e344',
    SOURCE: '87bfff865b0626ec05569a49e6c7935106b12f87ca222cf8ab5d7251edf97523',
    TESTS: '0ed92cbf7c902a9718e28bfb732c90a547945b8d1eddbe5850db775c6463a935',
    DRIVER: 'a5b746892bfac9e94e486db8379919cd4550d41754ca0437cc06b2f9ea045a86',
    PREFIT: '9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e',
    PROFILE/'artifact-index.json': 'ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b',
}
for path, expected in fixed.items():
    assert sha(path) == expected, path
for path in (SOURCE, TESTS, DRIVER):
    ast.parse(path.read_text())
accepted = json.loads(PREFIT.read_bytes())
for name, expected in accepted['code_hashes'].items():
    assert sha(ROOT/name) == expected, name
for name, expected in accepted['runtime_files'].items():
    assert sha(Path(name)) == expected, name
paths = set(fixed)
paths.update(Path(name) for name in accepted['runtime_files'])
paths.update(ROOT/accepted[name]['path'] for name in ('protocol', 'config', 'compute_protocol'))
paths.update((
    Path(__file__).resolve(),
    ROOT/'.planning/engine-os/research-first/RF-COMP-04-ORIGIN-PROFILE-ACCEPTANCE.v1.json',
    OWNER/'work/rf-origin-profile/NEXT-SERIALIZER-DESIGN.md',
    WORK/'static-numerical-review.md', WORK/'static-driver-review.v2.md', WORK/'static-root-review.md',
    Path('/opt/anaconda3/bin/python3.12'),
))
paths.update(OWNER/'work/rf-origin-profile'/name for name in (
    'actual-numerical-review.json', 'actual-root-review.json', 'actual-attribution-review.md'))
paths.update(Path('/opt/anaconda3/lib/python3.12')/name for name in (
    'json/__init__.py', 'json/encoder.py', 'json/decoder.py', 'json/scanner.py',
    're/__init__.py', 're/_compiler.py', 're/_parser.py', 're/_constants.py', 're/_casefix.py',
    'lib-dynload/_json.cpython-312-darwin.so', 'lib-dynload/math.cpython-312-darwin.so'))
inputs = {str(path): {'sha256': sha(path), 'bytes': path.stat().st_size, 'snapshot': True}
          for path in sorted(paths)}
index = json.loads((PROFILE/'artifact-index.json').read_bytes())['files']
corpus = {name: pin for name, pin in index.items()
          if name.startswith('plain/origin-store/') and name.endswith('.json')}
assert len(corpus) == 10 and sum(pin['bytes'] for pin in corpus.values()) == 1188475
for name, pin in corpus.items():
    assert sha(PROFILE/name) == pin['sha256'] and (PROFILE/name).stat().st_size == pin['bytes'], name
pins = {'version': 'rf-strict-compute-inputs.v1', **{key: accepted[key] for key in ('code_hashes', 'runtime_files', 'runtime')},
        'inputs': inputs, 'corpus': corpus}
destination = WORK/'INPUT-PINS.v1.json'
with destination.open('x') as output:
    output.write(json.dumps(pins, sort_keys=True, indent=2)+'\n')
print(json.dumps({'pins_path': str(destination), 'pins_sha256': sha(destination),
                  'code_files': len(pins['code_hashes']), 'runtime_files': len(pins['runtime_files']),
                  'inputs': len(inputs), 'input_bytes': sum(pin['bytes'] for pin in inputs.values()),
                  'corpus': len(corpus), 'scientific_execution': False}, sort_keys=True))
