#!/usr/bin/env python3
"""Inspect a Sites build archive without extracting it.

The caller supplies a tar.gz produced from a fresh vinext build.  This helper
emits a canonical manifest for regular files only.  It rejects archive features
that could make a later extraction ambiguous or unsafe.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import tarfile
from io import BytesIO


def fail(message: str) -> None:
    raise SystemExit(message)


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] != "--stdin":
        fail("usage: inspect_site_archive.py --stdin")
    maximum_archive_bytes = 512 * 1024 * 1024
    archive_bytes = sys.stdin.buffer.read(maximum_archive_bytes + 1)
    if not archive_bytes or len(archive_bytes) > maximum_archive_bytes:
        fail("archive input is empty or exceeds the compressed-byte limit")

    records: list[dict[str, object]] = []
    seen: set[str] = set()
    total_uncompressed = 0
    with tarfile.open(fileobj=BytesIO(archive_bytes), mode="r:gz") as archive:
        for member in archive.getmembers():
            if len(records) > 50_000:
                fail("archive exceeds the member-count limit")
            name = member.name
            parts = pathlib.PurePosixPath(name).parts
            if (
                not name
                or name.startswith("/")
                or ".." in parts
                or not parts
                or parts[0] != "dist"
            ):
                fail("archive contains an invalid path")
            if member.isdir():
                continue
            if not member.isreg():
                fail("archive contains a link or special entry")
            if member.size < 0 or member.size > 256 * 1024 * 1024:
                fail("archive member exceeds the per-file limit")
            total_uncompressed += member.size
            if total_uncompressed > 2 * 1024 * 1024 * 1024:
                fail("archive exceeds the uncompressed-byte limit")
            normalized = pathlib.PurePosixPath(*parts[1:]).as_posix()
            if not normalized or normalized in seen:
                fail("archive contains an empty or duplicate file path")
            source = archive.extractfile(member)
            if source is None:
                fail("archive regular file has no readable bytes")
            digest = hashlib.sha256()
            size = 0
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                size += len(chunk)
            if size != member.size:
                fail("archive member size changed while reading")
            seen.add(normalized)
            records.append({"path": normalized, "bytes": size, "sha256": digest.hexdigest()})

    records.sort(key=lambda record: str(record["path"]))
    required = {
        "server/index.js",
        ".openai/hosting.json",
        ".openai/drizzle/meta/_journal.json",
    }
    missing = sorted(required.difference(seen))
    if missing:
        fail("archive omits required build entries: " + ", ".join(missing))

    print(json.dumps({"records": records}, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
