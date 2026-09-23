"""Immutable prepared-state snapshots with one durable current pointer.

These records preserve supplied provenance; they do not establish historical
source availability or change the feature builder's information horizon.
"""
from contextlib import contextmanager
import fcntl
import gzip
import hashlib
import json
from pathlib import Path
import re

from .storage import save, write_bytes, _directory

BASE = 'work/projection-v3'
POINTER = BASE + '/current-ref.json'
LEGACY = BASE + '/current-features.json.gz'


def raw(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


@contextmanager
def writer(root):
    folder = Path(root)/'.cloud-private/projection-preparation'
    _directory(folder)
    with (folder/'writer.lock').open('a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Prepared-state writer already active') from None
        yield


def active_fit(root):
    root = Path(root)
    path = root/'work/in-season-learning-v1/active-fit-ref.json'
    return json.loads((path if path.exists() else root/BASE/'fit-ref.json').read_bytes())


def current(root):
    path = Path(root)/POINTER
    return json.loads(path.read_bytes()) if path.exists() else None


def reference(data, kind):
    suffix = '.json.gz' if kind == 'prepared-features' else '.json'
    return {'path':f'{BASE}/{kind}/{sha(data)}{suffix}', 'sha256':sha(data)}


def read_ref(root, ref, kind):
    suffix = '.json.gz' if kind == 'prepared-features' else '.json'
    if (not isinstance(ref, dict) or set(ref) != {'path','sha256'}
            or not isinstance(ref['sha256'], str) or not re.fullmatch('[0-9a-f]{64}',ref['sha256'])
            or ref['path'] != f'{BASE}/{kind}/{ref["sha256"]}{suffix}'):
        raise ValueError('Invalid prepared-state reference')
    root = Path(root).resolve(); path = root/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError('Prepared-state reference escapes repository')
    data = path.read_bytes()
    if sha(data) != ref['sha256']:
        raise ValueError('Prepared-state artifact hash mismatch')
    return data


def decode(data):
    def invalid(_):
        raise ValueError('Nonfinite prepared value')
    rows = json.loads(gzip.decompress(data), parse_constant=invalid)
    if not isinstance(rows, list) or not rows:
        raise ValueError('Empty or malformed prepared population')
    pairs = {}
    for row in rows:
        if (not isinstance(row,dict) or not isinstance(row.get('game_id'),str)
                or type(row.get('home')) is not bool or not isinstance(row.get('features'),dict)):
            raise ValueError('Malformed prepared team row')
        sides = pairs.setdefault(row['game_id'],set())
        if row['home'] in sides:
            raise ValueError('Duplicate prepared team row')
        sides.add(row['home'])
    if any(sides != {False,True} for sides in pairs.values()):
        raise ValueError('Unpaired prepared population')
    return rows


def load(root, manifest=None, ref=None):
    """Resolve once; historical refs never consult the current mutable pointer."""
    root = Path(root)
    if ref is not None:
        if manifest is not None:
            raise ValueError('Choose one prepared-state identity')
        body = json.loads(read_ref(root,ref,'prepared-manifests'))
        manifest = {**body,'prepared_manifest_ref':ref}
    elif manifest is None:
        manifest = current(root)
    if not isinstance(manifest,dict):
        raise ValueError('Prepared manifest required')
    if 'features_ref' in manifest or 'prepared_manifest_ref' in manifest:
        if not manifest.get('features_ref') or not manifest.get('prepared_manifest_ref'):
            raise ValueError('Incomplete prepared snapshot references')
        body = json.loads(read_ref(root,manifest['prepared_manifest_ref'],'prepared-manifests'))
        if body != {k:v for k,v in manifest.items() if k!='prepared_manifest_ref'}:
            raise ValueError('Prepared pointer differs from immutable manifest')
        data = read_ref(root,manifest['features_ref'],'prepared-features')
    else:
        # Original snapshots remain readable only under their recorded byte hash.
        data = (root/LEGACY).read_bytes()
    if sha(data) != manifest.get('sha256'):
        raise ValueError('Prepared input hash mismatch')
    return decode(data), manifest, data


def retain(root, data, metadata):
    """Stage immutable preparation without changing either active pointer."""
    root = Path(root)
    decode(data)
    if metadata.get('sha256') != sha(data):
        raise ValueError('Prepared input hash mismatch')
    body = {k:v for k,v in metadata.items() if k not in ('features_ref','prepared_manifest_ref')}
    feature_ref = reference(data,'prepared-features')
    write_bytes(root/feature_ref['path'],data,immutable=True)
    body['features_ref'] = feature_ref
    encoded = raw(body); manifest_ref = reference(encoded,'prepared-manifests')
    write_bytes(root/manifest_ref['path'],encoded,immutable=True)
    return {**body,'prepared_manifest_ref':manifest_ref}


def commit(root, data, metadata):
    """Caller holds writer(); stage first, pointer last, same fit only."""
    root = Path(root)
    if metadata.get('fit') != active_fit(root):
        raise ValueError('Prepared inputs and active fit differ')
    pointer = retain(root, data, metadata)
    # An out-of-contract writer must not cause a mismatched pointer to publish.
    if active_fit(root) != metadata['fit']:
        raise ValueError('Active fit changed during preparation')
    save(root/POINTER,pointer)
    return pointer
