#!/usr/bin/env python3
"""Create a byte-reproducible OS-01 Sites archive from a qualified worktree."""

from __future__ import annotations

import argparse
import gzip
import io
import os
import stat
import tarfile
from dataclasses import dataclass
from pathlib import Path


MAX_ARCHIVE_INPUT_BYTES = 256 * 1024 * 1024


@dataclass(frozen=True)
class _BoundInput:
    path: Path
    descriptor: int
    identity: tuple[int, int, int, int, int]


def _identity(metadata: os.stat_result) -> tuple[int, int, int, int, int]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def _bind_regular_file(path: Path) -> _BoundInput:
    requested_input = path.absolute()
    input_metadata = requested_input.lstat()
    if not stat.S_ISREG(input_metadata.st_mode):
        raise ValueError("archive input contains a non-canonical regular file")
    requested = requested_input.resolve(strict=True)
    before = requested.lstat()
    if not stat.S_ISREG(before.st_mode) or _identity(input_metadata) != _identity(before):
        raise ValueError("archive input contains a non-canonical regular file")
    flags = os.O_RDONLY | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.open(requested, flags)
    try:
        opened = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened.st_mode)
            or _identity(before) != _identity(opened)
            or opened.st_size > MAX_ARCHIVE_INPUT_BYTES
        ):
            raise ValueError("archive input changed while it was bound")
        return _BoundInput(requested, descriptor, _identity(opened))
    except BaseException:
        os.close(descriptor)
        raise


def _pread_exact(descriptor: int, size: int) -> bytes:
    chunks: list[bytes] = []
    offset = 0
    while offset < size:
        chunk = os.pread(descriptor, min(1024 * 1024, size - offset), offset)
        if not chunk:
            raise ValueError("archive input ended before its bound size")
        chunks.append(chunk)
        offset += len(chunk)
    if os.pread(descriptor, 1, size):
        raise ValueError("archive input grew beyond its bound size")
    return b"".join(chunks)


def _read_bound_input(bound: _BoundInput) -> bytes:
    first = _pread_exact(bound.descriptor, bound.identity[2])
    second = _pread_exact(bound.descriptor, bound.identity[2])
    opened = os.fstat(bound.descriptor)
    try:
        pathname = bound.path.lstat()
        canonical = bound.path.resolve(strict=True)
    except OSError as error:
        raise ValueError("archive input path changed after binding") from error
    if (
        first != second
        or _identity(opened) != bound.identity
        or _identity(pathname) != bound.identity
        or canonical != bound.path
    ):
        raise ValueError("archive input path, identity, or bytes changed after binding")
    return first


def _read_stable_regular_file(path: Path) -> bytes:
    bound = _bind_regular_file(path)
    try:
        return _read_bound_input(bound)
    finally:
        os.close(bound.descriptor)


def _regular_files(root: Path) -> list[Path]:
    if not root.is_dir() or root.is_symlink():
        raise ValueError(f"archive input is not a canonical directory: {root.name}")
    files: list[Path] = []
    for directory, names, filenames in os.walk(root, followlinks=False):
        names.sort()
        filenames.sort()
        base = Path(directory)
        for name in names:
            candidate = base / name
            if candidate.is_symlink():
                raise ValueError("archive input contains a symbolic-link directory")
        for name in filenames:
            candidate = base / name
            if candidate.is_symlink() or not candidate.is_file():
                raise ValueError("archive input contains a non-regular file")
            files.append(candidate)
    return files


def _entries(repository_root: Path) -> list[tuple[str, bytes]]:
    dist = repository_root / "dist"
    candidates: list[tuple[str, Path]] = [
        (f"dist/{path.relative_to(dist).as_posix()}", path)
        for path in _regular_files(dist)
    ]
    hosting = repository_root / ".openai" / "hosting.json"
    if hosting.is_symlink() or not hosting.is_file():
        raise ValueError("tracked Sites hosting document is absent")
    candidates.append(("dist/.openai/hosting.json", hosting))
    drizzle = repository_root / "drizzle"
    if drizzle.exists():
        candidates.extend(
            (f"dist/.openai/drizzle/{path.relative_to(drizzle).as_posix()}", path)
            for path in _regular_files(drizzle)
        )
    candidates.sort(key=lambda item: tuple(ord(character) for character in item[0]))
    if not candidates:
        raise ValueError("archive path manifest is empty")
    total = 0
    entries_by_path: dict[str, bytes] = {}
    for archive_path, source_path in candidates:
        data = _read_stable_regular_file(source_path)
        total += len(data)
        if total > MAX_ARCHIVE_INPUT_BYTES:
            raise ValueError("archive inputs exceed the byte limit")
        existing = entries_by_path.get(archive_path)
        if existing is not None:
            if existing != data:
                raise ValueError("archive path collision contains different bytes")
            continue
        entries_by_path[archive_path] = data
    return sorted(
        entries_by_path.items(),
        key=lambda item: tuple(ord(character) for character in item[0]),
    )


def package(repository_root: Path) -> bytes:
    tar_bytes = io.BytesIO()
    with tarfile.open(fileobj=tar_bytes, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for path, data in _entries(repository_root):
            metadata = tarfile.TarInfo(path)
            metadata.size = len(data)
            metadata.mode = 0o644
            metadata.mtime = 0
            metadata.uid = 0
            metadata.gid = 0
            metadata.uname = ""
            metadata.gname = ""
            metadata.pax_headers = {}
            archive.addfile(metadata, io.BytesIO(data))
    compressed = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=compressed, compresslevel=9, mtime=0) as output:
        output.write(tar_bytes.getvalue())
    return compressed.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repository_root = args.repository_root.resolve(strict=True)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = package(repository_root)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        os.close(descriptor)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
