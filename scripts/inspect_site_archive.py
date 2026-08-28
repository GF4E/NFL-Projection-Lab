#!/usr/bin/env python3
"""Inspect an OS-01 Sites archive without extracting it.

Only the exact byte envelope emitted by package_os01_site_archive.py is
accepted. The inspector rejects alternate gzip members, trailing bytes,
non-canonical tar metadata or padding, and nested archive/compression payloads.
It emits a canonical manifest for regular files only.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import pathlib
import re
import sys
import tarfile
import tempfile
import zlib
from typing import BinaryIO


MAXIMUM_ARCHIVE_BYTES = 512 * 1024 * 1024
MAXIMUM_ARCHIVE_INPUT_BYTES = 256 * 1024 * 1024
MAXIMUM_MEMBER_BYTES = 256 * 1024 * 1024
MAXIMUM_MEMBERS = 50_000
TAR_BLOCK_BYTES = 512
TAR_RECORD_BYTES = 20 * TAR_BLOCK_BYTES
GZIP_CHUNK_BYTES = 64 * 1024
SPOOL_MEMORY_BYTES = 16 * 1024 * 1024
CANONICAL_GZIP_HEADER = bytes.fromhex("1f8b08000000000002ff")
FORBIDDEN_NESTED_SUFFIXES = (
    ".7z", ".br", ".bz2", ".gz", ".tar", ".tar.br", ".tar.bz2",
    ".rar", ".tar.gz", ".tar.xz", ".tar.zst", ".tgz", ".txz", ".xz",
    ".zip", ".zst", ".zstd",
)
FORBIDDEN_NESTED_SIGNATURES = (
    # RFC 1952 fixes the compression-method byte at 8.  Matching only the
    # two-byte gzip prefix produces routine false positives in WOFF and PNG
    # assets, while a real gzip member always begins with all three bytes.
    b"\x1f\x8b\x08",  # gzip
    b"PK\x03\x04",  # zip file
    b"PK\x05\x06",  # empty zip
    b"PK\x07\x08",  # zip data descriptor
    *(b"BZh" + bytes((level,)) for level in range(ord("1"), ord("9") + 1)),
    b"\xfd7zXZ\x00",  # xz
    b"7z\xbc\xaf'\x1c",  # 7zip
    b"Rar!\x1a\x07\x00",  # RAR4
    b"Rar!\x1a\x07\x01\x00",  # RAR5
    b"\x28\xb5\x2f\xfd",  # zstandard
)
MAXIMUM_NESTED_SIGNATURE_BYTES = max(
    len(signature) for signature in FORBIDDEN_NESTED_SIGNATURES
)
FORBIDDEN_SELECTION_METACHARACTERS = frozenset("*?[]\\")
ASCII_LOWER_TRANSLATION = str.maketrans(
    {chr(code): chr(code + 32) for code in range(ord("A"), ord("Z") + 1)}
)
TAR_CHECKSUM_CANDIDATE_RE = re.compile(
    rb"(?=([ 0-7]{6}\x00[ \x00]|[ 0-7]{7}\x00))"
)
TAR_CHECKSUM_FIELD_RE = re.compile(
    rb"(?:[ 0-7]{6}\x00[ \x00]|[ 0-7]{7}\x00)\Z"
)
MAXIMUM_TAR_CHECKSUM_CANDIDATES = 4096


def fail(message: str) -> None:
    raise SystemExit(message)


def _looks_like_tar_header(data: bytes) -> bool:
    """Recognize checksum-valid ustar or legacy/V7 TAR at byte zero."""

    if len(data) < TAR_BLOCK_BYTES:
        return False
    header = data[:TAR_BLOCK_BYTES]
    if not header.strip(b"\x00"):
        return False
    if TAR_CHECKSUM_FIELD_RE.fullmatch(header[148:156]) is None:
        return False
    checksum_field = header[148:156].strip(b"\x00 ")
    if not checksum_field:
        return False
    try:
        recorded = int(checksum_field, 8)
    except ValueError:
        return False
    unsigned = sum(header[:148]) + (8 * ord(" ")) + sum(header[156:])
    signed = (
        sum(byte if byte < 128 else byte - 256 for byte in header[:148])
        + (8 * ord(" "))
        + sum(byte if byte < 128 else byte - 256 for byte in header[156:])
    )
    return recorded in {unsigned, signed}


def _scan_tar_headers(
    data: bytes,
    minimum_header_offset: int = 0,
    candidate_count: int = 0,
) -> tuple[bool, int]:
    if len(data) < TAR_BLOCK_BYTES:
        return False, candidate_count
    search_start = max(148, minimum_header_offset + 148)
    candidates = candidate_count
    for match in TAR_CHECKSUM_CANDIDATE_RE.finditer(data, search_start):
        offset = match.start() - 148
        if (
            offset < minimum_header_offset
            or offset < 0
            or offset + TAR_BLOCK_BYTES > len(data)
        ):
            continue
        candidates += 1
        if candidates > MAXIMUM_TAR_CHECKSUM_CANDIDATES:
            return True, candidates
        if _looks_like_tar_header(data[offset:offset + TAR_BLOCK_BYTES]):
            return True, candidates
    return False, candidates


def _contains_tar_header(data: bytes) -> bool:
    return _scan_tar_headers(data)[0]


def _write_bounded(output: BinaryIO, data: bytes, total: int) -> int:
    updated = total + len(data)
    if updated > 2 * 1024 * 1024 * 1024:
        fail("archive exceeds the uncompressed-byte limit")
    output.write(data)
    return updated


def _exact_gzip_payload(archive_bytes: bytes) -> tuple[BinaryIO, int]:
    if len(archive_bytes) < 18 or archive_bytes[:10] != CANONICAL_GZIP_HEADER:
        fail("archive gzip header is not canonical")
    output = tempfile.SpooledTemporaryFile(max_size=SPOOL_MEMORY_BYTES)
    decoder = zlib.decompressobj(wbits=31)
    total = 0
    offset = 0
    try:
        while offset < len(archive_bytes):
            if decoder.eof:
                fail("archive contains trailing bytes or concatenated gzip members")
            chunk = archive_bytes[offset:offset + GZIP_CHUNK_BYTES]
            offset += len(chunk)
            pending = chunk
            while pending:
                inflated = decoder.decompress(pending, GZIP_CHUNK_BYTES)
                total = _write_bounded(output, inflated, total)
                if decoder.unused_data:
                    fail("archive contains trailing bytes or concatenated gzip members")
                pending = decoder.unconsumed_tail
                if decoder.eof and (pending or offset < len(archive_bytes)):
                    fail("archive contains trailing bytes or concatenated gzip members")
        if not decoder.eof:
            fail("archive gzip member is truncated")
        if decoder.unused_data or decoder.unconsumed_tail:
            fail("archive gzip envelope is ambiguous")
        total = _write_bounded(output, decoder.flush(), total)
        output.seek(0)
        return output, total
    except BaseException:
        output.close()
        raise


def _stream_hash(source: BinaryIO) -> tuple[int, str]:
    source.seek(0)
    digest = hashlib.sha256()
    size = 0
    while True:
        chunk = source.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
        size += len(chunk)
    source.seek(0)
    return size, digest.hexdigest()


def _validate_tar_padding(source: BinaryIO, total_bytes: int) -> None:
    if total_bytes == 0 or total_bytes % TAR_BLOCK_BYTES != 0:
        fail("archive tar envelope is not block aligned")
    offset = 0
    source.seek(0)
    while offset + TAR_BLOCK_BYTES <= total_bytes:
        block = source.read(TAR_BLOCK_BYTES)
        if block == bytes(TAR_BLOCK_BYTES):
            second = source.read(TAR_BLOCK_BYTES)
            if second != bytes(TAR_BLOCK_BYTES):
                fail("archive tar envelope has a non-canonical end marker")
            canonical_size = (
                (offset + 2 * TAR_BLOCK_BYTES + TAR_RECORD_BYTES - 1)
                // TAR_RECORD_BYTES
            ) * TAR_RECORD_BYTES
            if total_bytes != canonical_size:
                fail("archive tar envelope has non-canonical zero padding")
            while True:
                tail = source.read(1024 * 1024)
                if not tail:
                    break
                if any(tail):
                    fail("archive tar envelope contains bytes after its end marker")
            source.seek(0)
            return
        try:
            metadata = tarfile.TarInfo.frombuf(block, "utf-8", "surrogateescape")
        except (tarfile.HeaderError, UnicodeError, ValueError):
            fail("archive tar header is invalid")
        if metadata is None or metadata.size < 0:
            fail("archive tar header is invalid")
        data_blocks = (metadata.size + TAR_BLOCK_BYTES - 1) // TAR_BLOCK_BYTES
        offset += TAR_BLOCK_BYTES + data_blocks * TAR_BLOCK_BYTES
        if offset > total_bytes:
            fail("archive tar member exceeds the envelope")
        source.seek(offset)
    fail("archive tar envelope omits its end marker")


class _DigestingReader:
    def __init__(self, source: BinaryIO) -> None:
        self.source = source
        self.digest = hashlib.sha256()
        self.size = 0
        self.nested_signature_found = False
        self._signature_tail = b""
        self._tar_header_found = False
        self._tar_tail = b""
        self._tar_candidate_count = 0
        self._tar_processed_through = -1

    def _scan_nested_signatures(self, data: bytes) -> None:
        if not data or self.nested_signature_found:
            return
        boundary_bytes = MAXIMUM_NESTED_SIGNATURE_BYTES - 1
        boundary = self._signature_tail + data[:boundary_bytes]
        self.nested_signature_found = any(
            signature in data or signature in boundary
            for signature in FORBIDDEN_NESTED_SIGNATURES
        )
        if boundary_bytes > 0:
            tail_source = self._signature_tail + data[-boundary_bytes:]
            self._signature_tail = tail_source[-boundary_bytes:]

    def read(self, requested: int = -1) -> bytes:
        data = self.source.read(requested)
        if data and not self._tar_header_found:
            window_start = self.size - len(self._tar_tail)
            tar_window = self._tar_tail + data
            minimum_relative_offset = max(
                0, self._tar_processed_through + 1 - window_start
            )
            (
                self._tar_header_found,
                self._tar_candidate_count,
            ) = _scan_tar_headers(
                tar_window,
                minimum_relative_offset,
                self._tar_candidate_count,
            )
            last_complete_relative_offset = len(tar_window) - TAR_BLOCK_BYTES
            if last_complete_relative_offset >= minimum_relative_offset:
                self._tar_processed_through = max(
                    self._tar_processed_through,
                    window_start + last_complete_relative_offset,
                )
            self._tar_tail = tar_window[-(TAR_BLOCK_BYTES - 1):]
        self.digest.update(data)
        self.size += len(data)
        self._scan_nested_signatures(data)
        return data

    @property
    def nested_container_found(self) -> bool:
        return self.nested_signature_found or self._tar_header_found


def _is_nested_container(name: str, nested_signature_found: bool) -> bool:
    lowered = name.translate(ASCII_LOWER_TRANSLATION)
    if any(lowered.endswith(suffix) for suffix in FORBIDDEN_NESTED_SUFFIXES):
        return True
    return nested_signature_found


def _canonical_manifest(tar_payload: BinaryIO) -> tuple[list[dict[str, object]], BinaryIO]:
    records: list[dict[str, object]] = []
    seen: set[str] = set()
    total_inputs = 0
    canonical_tar = tempfile.SpooledTemporaryFile(max_size=SPOOL_MEMORY_BYTES)
    try:
        tar_payload.seek(0)
        with tarfile.open(fileobj=tar_payload, mode="r:") as archive:
            members = archive.getmembers()
            if not members or len(members) > MAXIMUM_MEMBERS:
                fail("archive member count is outside the canonical limit")
            member_names = [member.name for member in members]
            if member_names != sorted(member_names):
                fail("archive member order is not canonical")
            with tarfile.open(fileobj=canonical_tar, mode="w", format=tarfile.PAX_FORMAT) as rebuilt:
                for member in members:
                    name = member.name
                    parts = pathlib.PurePosixPath(name).parts
                    if (
                        not name
                        or name.startswith("/")
                        or ".." in parts
                        or not parts
                        or parts[0] != "dist"
                        or any(character in FORBIDDEN_SELECTION_METACHARACTERS for character in name)
                    ):
                        fail("archive contains an invalid path")
                    if not member.isreg():
                        fail("archive contains a directory, link, or special entry")
                    if (
                        member.size < 0
                        or member.size > MAXIMUM_MEMBER_BYTES
                        or member.mode != 0o644
                        or member.mtime != 0
                        or member.uid != 0
                        or member.gid != 0
                        or member.uname != ""
                        or member.gname != ""
                    ):
                        fail("archive member metadata is not canonical")
                    normalized = pathlib.PurePosixPath(*parts[1:]).as_posix()
                    if not normalized or normalized in seen:
                        fail("archive contains an empty or duplicate file path")
                    total_inputs += member.size
                    if total_inputs > MAXIMUM_ARCHIVE_INPUT_BYTES:
                        fail("archive inputs exceed the canonical byte limit")
                    extracted = archive.extractfile(member)
                    if extracted is None:
                        fail("archive regular file has no readable bytes")
                    reader = _DigestingReader(extracted)
                    metadata = tarfile.TarInfo(name)
                    metadata.size = member.size
                    metadata.mode = 0o644
                    metadata.mtime = 0
                    metadata.uid = 0
                    metadata.gid = 0
                    metadata.uname = ""
                    metadata.gname = ""
                    metadata.pax_headers = {}
                    rebuilt.addfile(metadata, reader)
                    if reader.size != member.size:
                        fail("archive member size changed while reading")
                    if _is_nested_container(name, reader.nested_container_found):
                        fail("archive contains a nested compressed or archive payload")
                    seen.add(normalized)
                    records.append({
                        "path": normalized,
                        "bytes": reader.size,
                        "sha256": reader.digest.hexdigest(),
                    })
        canonical_tar.seek(0)
        return records, canonical_tar
    except BaseException:
        canonical_tar.close()
        raise


def _canonical_gzip_hash(tar_payload: BinaryIO) -> tuple[int, str]:
    compressed = tempfile.SpooledTemporaryFile(max_size=SPOOL_MEMORY_BYTES)
    try:
        tar_payload.seek(0)
        with gzip.GzipFile(
            filename="", mode="wb", fileobj=compressed, compresslevel=9, mtime=0
        ) as output:
            while True:
                chunk = tar_payload.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
        return _stream_hash(compressed)
    finally:
        compressed.close()


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] != "--stdin":
        fail("usage: inspect_site_archive.py --stdin")
    archive_bytes = sys.stdin.buffer.read(MAXIMUM_ARCHIVE_BYTES + 1)
    if not archive_bytes or len(archive_bytes) > MAXIMUM_ARCHIVE_BYTES:
        fail("archive input is empty or exceeds the compressed-byte limit")

    tar_payload, tar_bytes = _exact_gzip_payload(archive_bytes)
    try:
        _validate_tar_padding(tar_payload, tar_bytes)
        records, canonical_tar = _canonical_manifest(tar_payload)
        try:
            original_tar_size, original_tar_hash = _stream_hash(tar_payload)
            canonical_tar_size, canonical_tar_hash = _stream_hash(canonical_tar)
            if (
                original_tar_size != canonical_tar_size
                or original_tar_hash != canonical_tar_hash
            ):
                fail("archive tar bytes are not canonical")
            canonical_gzip_size, canonical_gzip_hash = _canonical_gzip_hash(canonical_tar)
            if (
                canonical_gzip_size != len(archive_bytes)
                or canonical_gzip_hash != hashlib.sha256(archive_bytes).hexdigest()
            ):
                fail("archive gzip bytes are not canonical")
        finally:
            canonical_tar.close()
    finally:
        tar_payload.close()

    required = {
        "server/index.js",
        ".openai/hosting.json",
        ".openai/drizzle/meta/_journal.json",
    }
    seen = {str(record["path"]) for record in records}
    missing = sorted(required.difference(seen))
    if missing:
        fail("archive omits required build entries: " + ", ".join(missing))

    print(json.dumps({"records": records}, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
