"""Create-only, durable artifacts. No provider or model access."""
import hashlib
import json
import os
from pathlib import Path


def encode(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def put(path, value, raw=False):
    path = Path(path)
    data = value if raw else encode(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError('Immutable artifact differs: '+str(path))
        return sha(data)
    # Atomic publish with no overwrite: crash staging is never a visible lock.
    # Retain staging links (ignored by Git); no cleanup/deletion is required.
    import uuid
    staging = path.parent/('.pending-'+uuid.uuid4().hex)
    fd = os.open(staging, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o444)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    try:
        os.link(staging, path)
    except FileExistsError:
        if path.read_bytes() != data:
            raise ValueError('Immutable artifact differs: '+str(path))

    return sha(data)


def pin(folder, value, suffix='.json', raw=False):
    data = value if raw else encode(value)
    digest = sha(data)
    path = Path(folder)/(digest+suffix)
    put(path, data, raw=True)
    return {'path': str(path), 'sha256': digest}


def read_pinned(ref):
    data = Path(ref['path']).read_bytes()
    if sha(data) != ref['sha256']:
        raise ValueError('Pinned artifact hash mismatch')
    return json.loads(data)
