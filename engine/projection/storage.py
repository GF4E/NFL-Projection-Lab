"""Durable local-file commits; immutable writes are atomic create-if-absent.

A raised exception after the namespace operation means the outcome is uncertain,
not that nothing was written. Retry the same payload. Workflow ownership and
multi-file release transactions are separate contracts.
"""
import errno
import json
import os
from pathlib import Path
import stat
import uuid


def _sync_directory(path):
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _directory(path):
    if path.is_dir():
        return
    _directory(path.parent)
    try:
        path.mkdir()
    except FileExistsError:
        if not path.is_dir():
            raise
    _sync_directory(path.parent)


def _same(path, raw, immutable):
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(mode):
        raise ValueError('Projection artifact must be a regular file')
    if path.read_bytes() == raw:
        # Also completes a retry after a previous namespace commit whose directory
        # fsync failed. A retry does not rewrite the artifact or its timestamps.
        _sync_directory(path.parent)
        return True
    if immutable:
        raise ValueError('Frozen projection changed')
    return False


def write_bytes(path, raw, immutable=False):
    path = Path(path)
    if not isinstance(raw, bytes):
        raise TypeError('Artifact bytes required')
    _directory(path.parent)
    if _same(path, raw, immutable):
        return 'UNCHANGED'
    temporary = path.with_name('.' + path.name + '.' + uuid.uuid4().hex + '.pending')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o666)
    try:
        try:
            if path.exists():
                os.fchmod(fd, stat.S_IMODE(path.stat().st_mode))
            with os.fdopen(fd, 'wb') as stream:
                fd = None
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            if immutable:
                try:
                    # Same-filesystem hard link atomically commits only if absent.
                    os.link(temporary, path)
                except FileExistsError:
                    if _same(path, raw, True):
                        return 'UNCHANGED'
                    raise
            else:
                os.replace(temporary, path)
            _sync_directory(path.parent)
            return 'COMMITTED'
        finally:
            if fd is not None:
                os.close(fd)
    finally:
        # Only this invocation's disposable staging file is removed.
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def save(path, value, immutable=False):
    raw = (json.dumps(value, sort_keys=True, separators=(',', ':'),
                      allow_nan=False) + '\n').encode()
    return write_bytes(path, raw, immutable)
