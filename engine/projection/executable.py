"""Verified executable scorer recovery; never activates a production release.

Repository code and exact fit/calibration travel together. The existing native
runtime is measured, not archived: changed dependencies require requalification.
Preparation, scheduling and publication remain outside this executable package.
"""
import ast
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

from .bundle import raw, resolve
from .lineage import read_artifact
from .model import hash_value
from .scoring import SCHEMA, artifact_payload, validate_shapes, validate_pair
from .storage import write_bytes

SCHEMA_VERSION = 'projection-executable-v1'
FOLDER = 'outputs/projection-v3/executables'
WORKER = 'scripts/projection_score_worker.py'
ENV = {'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], stderr=subprocess.PIPE, timeout=30)


def code_closure(root, commit):
    """Static repository imports, including package initializers, from one commit."""
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('Exact code commit required')
    available = set(git(root, 'ls-tree', '-r', '--name-only', commit).decode().splitlines())
    pending = [WORKER]
    files = {}
    while pending:
        path = pending.pop()
        if path in files:
            continue
        if path not in available:
            raise ValueError('Missing repository code dependency: ' + path)
        source = git(root, 'show', commit + ':' + path).decode('utf-8')
        files[path] = source
        parts = PurePosixPath(path).parts
        for i in range(1, len(parts)):
            init = '/'.join(parts[:i]) + '/__init__.py'
            if init in available:
                pending.append(init)
        package = '.'.join(parts[:-1])
        for node in ast.walk(ast.parse(source, filename=path)):
            names = []
            if isinstance(node, ast.Import):
                names = [item.name for item in node.names]
            elif isinstance(node, ast.ImportFrom):
                name = node.module or ''
                if node.level:
                    name = importlib.util.resolve_name('.' * node.level + name, package)
                names = [name]
                # Also include imported submodules if the base is a package.
                names.extend(name + '.' + item.name for item in node.names)
            for name in names:
                if name.split('.')[0] not in ('engine', 'scripts'):
                    continue
                base = name.replace('.', '/')
                target = next((p for p in (base + '.py', base + '/__init__.py') if p in available), None)
                if target:
                    pending.append(target)
                elif name in names[:1]:
                    raise ValueError('Unresolved repository import: ' + name)
    return dict(sorted(files.items()))


def unpack_code(files, destination):
    """No extractall, path traversal, symlinks, or overwrite of another restore."""
    destination = Path(destination)
    if destination.exists():
        raise ValueError('Executable restore requires a new destination')
    for name, source in files.items():
        p = PurePosixPath(name)
        if (p.is_absolute() or '..' in p.parts or str(p) != name or p.suffix != '.py'
                or p.parts[0] not in ('engine', 'scripts') or not isinstance(source, str)):
            raise ValueError('Invalid executable member')
    if WORKER not in files:
        raise ValueError('Missing scoring executable')
    destination.mkdir(parents=True, mode=0o700)
    for name, source in files.items():
        write_bytes(destination / name, source.encode(), immutable=True)


def verify_code(package, destination):
    destination = Path(destination).resolve()
    expected = package['code']['files']
    found = {}
    for path in destination.rglob('*'):
        if path.is_symlink():
            raise ValueError('Executable restore contains a symlink')
        if path.is_file():
            found[path.relative_to(destination).as_posix()] = path
    if set(found) != set(expected):
        raise ValueError('Executable member set differs')
    for name, source in expected.items():
        if found[name].read_bytes() != source.encode():
            raise ValueError('Executable code differs: ' + name)


PROBE = r'''
import hashlib,json,platform,runpy,sys,sysconfig
from pathlib import Path
root=Path(sys.argv[1]).resolve()
runpy.run_path(str(root/'scripts/projection_score_worker.py'),run_name='capsule_probe')
import numpy
files={}
stdlib=Path(sysconfig.get_path('stdlib')).resolve()
for module in list(sys.modules.values()):
 name=getattr(module,'__file__',None)
 if not name:continue
 path=Path(name).resolve()
 if path.is_relative_to(root):continue
 if not path.is_file():raise ValueError('Unresolved runtime dependency')
 if not path.is_relative_to(stdlib):raise ValueError('Unapproved external runtime location')
 key='stdlib/'+path.relative_to(stdlib).as_posix()
 files[key]=hashlib.sha256(path.read_bytes()).hexdigest()
 cached=getattr(module,'__cached__',None)
 if cached and Path(cached).is_file():
  path=Path(cached).resolve()
  if not path.is_relative_to(stdlib):raise ValueError('Unapproved runtime cache location')
  files['stdlib/'+path.relative_to(stdlib).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
# NumPy's linked libraries may not have Python module entries.
for folder in [Path(numpy.__file__).resolve().parent,Path(numpy.__file__).resolve().parent.parent/'numpy.libs']:
 if folder.exists():
  for path in sorted(folder.rglob('*')):
   if path.is_file() and ('.so' in path.name or path.suffix in ('.dylib','.dll')):
    files['stdlib/'+path.resolve().relative_to(stdlib).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
files['interpreter']=hashlib.sha256(Path(sys.executable).resolve().read_bytes()).hexdigest()
native={}
if platform.system()=='Linux':
 for line in Path('/proc/self/maps').read_text().splitlines():
  fields=line.split(maxsplit=5)
  if len(fields)==6 and fields[5].startswith('/'):
   path=Path(fields[5])
   if not path.is_file():raise ValueError('Unresolved mapped runtime file')
   native[str(path)]=hashlib.sha256(path.read_bytes()).hexdigest()
print(json.dumps({'identity':{'python':platform.python_version(),'implementation':platform.python_implementation(),'numpy':numpy.__version__,'system':platform.system(),'machine':platform.machine()},'files':dict(sorted(files.items())),'mapped_native_files':dict(sorted(native.items())),'native_scope':'Linux mapped-file bytes' if platform.system()=='Linux' else 'Non-Linux: imported module and packaged NumPy bytes only; OS runtime not fully qualified','os_build':platform.version()},sort_keys=True))
'''


def runtime(destination):
    result = subprocess.run([sys.executable, '-I', '-B', '-c', PROBE, str(Path(destination).resolve())],
                            cwd=destination, env=ENV, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise ValueError('Executable runtime probe failed: ' + result.stderr[-800:])
    return json.loads(result.stdout)


def validate(package):
    if package.get('schema') != SCHEMA_VERSION:
        raise ValueError('Unsupported executable schema')
    release = package['release']
    if (sha(raw(release)) != package['release_ref']['sha256']
            or release['schema'] != 'projection-release-v1' or release['input_schema'] != SCHEMA
            or release['output_schema'] != 'projection-scoring-bundle-v1'):
        raise ValueError('Executable release differs')
    if package['code']['commit'] != release['code']['commit']:
        raise ValueError('Executable commit differs')
    files = package['code']['files']
    for path, expected in release['code']['files'].items():
        if path in files and sha(files[path].encode()) != expected:
            raise ValueError('Executable code and release differ')
    # The package hash binds transitive files not present in old release manifests.
    if sha(raw(files)) != package['code']['sha256']:
        raise ValueError('Executable code hash differs')
    artifacts = package['artifacts']
    for name, ref in [('fit', release['fit_artifact_ref']), ('calibration', release['calibration_ref'])]:
        if sha(artifacts[name].encode()) != ref['sha256']:
            raise ValueError('Executable artifact differs')
    artifact = json.loads(artifacts['fit'])
    shapes = json.loads(artifacts['calibration'])
    if (artifact['shapes'] != release['calibration_ref'] or artifact['version'] != release['version']
            or hash_value(artifact['fit']) != release['fit_sha256']
            or hash_value(artifact_payload(artifact)) != release['scoring_artifact_sha256']):
        raise ValueError('Executable fit/calibration compatibility failed')
    validate_shapes(shapes)
    if package['runtime']['identity'] != release['code']['environment']:
        raise ValueError('Executable runtime and issuing environment differ')
    return artifact, shapes


def build(root, release_ref, destination):
    """Create a package after native runtime verification; no active pointer changes."""
    root = Path(root)
    release = resolve(root, release_ref, 'releases')
    commit = release['code']['commit']
    for name, expected in release['code']['files'].items():
        if sha(git(root, 'show', commit + ':' + name)) != expected:
            raise ValueError('Release code is not present at its pinned commit')
    files = code_closure(root, commit)
    unpack_code(files, destination)
    measured = runtime(destination)
    package = {'schema': SCHEMA_VERSION, 'release_ref': release_ref, 'release': release,
               'code': {'commit': commit, 'files': files, 'sha256': sha(raw(files)),
                        'provenance': 'Recorded code hashes verified; remaining import closure reconstructed from pinned Git commit'},
               'runtime': measured, 'artifacts': {},
               'scope': 'Scoring executable only; preparation, scheduling and publication not restored',
               'qualification': 'REQUIRES_SAVED_FORECAST_REPRODUCTION_BEFORE_ACTIVATION'}
    for name, ref in [('fit', release['fit_artifact_ref']), ('calibration', release['calibration_ref'])]:
        read_artifact(root, ref)
        package['artifacts'][name] = (root / ref['path']).read_text()
    validate(package)
    verify_code(package, destination)
    return package


def store(root, package):
    validate(package)
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', filename='', mtime=0) as stream:
        stream.write(raw(package))
    data = buffer.getvalue()
    ref = {'path': FOLDER + '/' + sha(data) + '.json.gz', 'sha256': sha(data)}
    write_bytes(Path(root) / ref['path'], data, immutable=True)
    return ref


def load(root, ref):
    if (set(ref) != {'path', 'sha256'} or not re.fullmatch('[0-9a-f]{64}', ref['sha256'])
            or ref['path'] != FOLDER + '/' + ref['sha256'] + '.json.gz'):
        raise ValueError('Invalid executable reference')
    root = Path(root).resolve()
    path = root / ref['path']
    if not path.resolve().is_relative_to(root) or path.is_symlink():
        raise ValueError('Executable reference escapes storage')
    data = path.read_bytes()
    if sha(data) != ref['sha256']:
        raise ValueError('Executable package hash differs')
    package = json.loads(gzip.decompress(data))
    validate(package)
    return package


def execute(package, destination, requests, prepared_manifest):
    """Run restored code with its own fit/calibration, never current-checkout imports."""
    artifact, shapes = validate(package)
    if prepared_manifest.get('fit') != package['release']['fit_artifact_ref']:
        raise ValueError('Prepared inputs and executable fit differ')
    verify_code(package, destination)
    if runtime(destination) != package['runtime']:
        raise ValueError('Executable native runtime changed; requalification required')
    for request in requests:
        validate_pair(request)
    result = subprocess.run([sys.executable, '-I', '-B', str(Path(destination).resolve() / WORKER)],
        cwd=destination, env=ENV, input=raw({'artifact': artifact_payload(artifact), 'shapes': shapes,
        'requests': requests}).decode(), text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise ValueError('Restored scoring failed; no fallback')
    values = json.loads(result.stdout)
    if set(values) != {request['game_id'] for request in requests}:
        raise ValueError('Restored scoring batch incomplete')
    return values
