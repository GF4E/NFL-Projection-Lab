"""Bounded canonical JSON handling for retained calibration evidence.

Bytes match the existing sorted, compact, ASCII-escaped JSON representation.
No scores, fit settings, schema or hash semantics are changed.
"""
import hashlib
import json
import codecs
import mmap
import os
from pathlib import Path
import stat
import uuid
from . import storage


def chunks(value, *, newline=False):
    encoder = json.JSONEncoder(sort_keys=True, separators=(',', ':'), allow_nan=False)
    pending = []
    size = 0
    for token in encoder.iterencode(value):
        pending.append(token)
        size += len(token)
        if size >= 65536:
            yield ''.join(pending).encode()
            pending = []
            size = 0
    if pending:
        yield ''.join(pending).encode()
    if newline:
        yield b'\n'


def digest(value, *, newline=False):
    h = hashlib.sha256()
    for block in chunks(value, newline=newline):
        h.update(block)
    return h.hexdigest()


def file_digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(65536), b''):
            h.update(block)
    return h.hexdigest()


def load(path):
    """Decode once, sharing repeated immutable strings within this read only."""
    strings = {}
    def shared(value):
        if isinstance(value, str):
            return strings.setdefault(value, value)
        if isinstance(value, list):
            for i, element in enumerate(value):
                if isinstance(element, str):
                    value[i] = strings.setdefault(element, element)
        return value
    def hook(mapping):
        for key, value in mapping.items():
            mapping[key] = shared(value)
        return mapping
    # Decode from a read-only file buffer, avoiding TextIO's simultaneous full
    # byte buffer and Unicode copy. The immutable result is hash-checked by the
    # caller before and after parsing; no mapping remains in returned objects.
    with Path(path).open('rb') as stream:
        if os.fstat(stream.fileno()).st_size == 0:
            return json.loads('', object_hook=hook)
        with mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ) as mapped:
            text = codecs.decode(mapped, 'utf-8')
    return json.loads(text, object_hook=hook)


def save(path, value, *, immutable=True):
    """Same-file durable staging and atomic publication without a whole-byte copy."""
    path = Path(path)
    expected = digest(value, newline=True)  # Validate before creating any artifact.
    storage._directory(path.parent)
    def same():
        try:
            mode = path.lstat().st_mode
        except FileNotFoundError:
            return False
        if not stat.S_ISREG(mode):
            raise ValueError('Projection artifact must be a regular file')
        if file_digest(path) == expected:
            storage._sync_directory(path.parent)
            return True
        if immutable:
            raise ValueError('Frozen projection changed')
        return False
    if same():
        return 'UNCHANGED'
    temporary = path.with_name('.'+path.name+'.'+uuid.uuid4().hex+'.pending')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o666)
    try:
        try:
            if path.exists():
                os.fchmod(fd, stat.S_IMODE(path.stat().st_mode))
            with os.fdopen(fd, 'wb') as stream:
                fd = None
                written = hashlib.sha256()
                for block in chunks(value, newline=True):
                    stream.write(block)
                    written.update(block)
                stream.flush()
                os.fsync(stream.fileno())
            if written.hexdigest() != expected:
                raise ValueError('JSON value changed during staging')
            if immutable:
                try:
                    os.link(temporary, path)
                except FileExistsError:
                    if same():
                        return 'UNCHANGED'
                    raise
            else:
                os.replace(temporary, path)
            storage._sync_directory(path.parent)
            return 'COMMITTED'
        finally:
            if fd is not None:
                os.close(fd)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
