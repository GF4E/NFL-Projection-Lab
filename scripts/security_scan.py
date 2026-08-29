#!/usr/bin/env python3
"""Secret/PII scanner that never emits matched values.

The scanner covers tracked working-tree files plus every reachable Git blob.
Ignored credential stores are never opened. Selected build outputs may be
included explicitly, but credential-file name globs are never traversed. Findings
contain only rule identifiers, paths, line numbers, and blob identifiers; matched
content is deliberately not retained in memory after classification and is never
serialized.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import stat
import subprocess
import sys
import tarfile
import zlib
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


MAX_SCAN_BYTES = 32 * 1024 * 1024
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_EXPANDED_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_MEMBER_COUNT = 100_000
MAX_ARCHIVE_RECURSION_DEPTH = 4
SCANNER_VERSION = "security-scan.2026.2"
FROZEN_GIT_EXECUTABLE = Path("/Library/Developer/CommandLineTools/usr/bin/git")
FROZEN_GIT_SHA256 = "24d10c6f5ee9d5eb463273269d3bc30fa8dcbffda30841112480dea950d0c55a"
_VALIDATED_GIT_EXECUTABLE: str | None = None
ALLOW_MARKER = b"secret-scan: allow-fixture"
IGNORED_DIRECTORY_NAMES = {
    ".git",
    ".model-lab-cache",
    ".pytest_cache",
    ".turbo",
    ".venv",
    "__pycache__",
    "node_modules",
    "venv",
}
BUILD_ROOTS = ("dist", "build", ".next", ".openai")
CREDENTIAL_STORAGE_NAMES = {
    ".netrc",
    ".npmrc",
    ".pypirc",
    "credentials",
    "credentials.json",
    "secrets",
    "secrets.json",
}
CREDENTIAL_STORAGE_SUFFIXES = (".key", ".p12", ".pem", ".pfx")
UNSUPPORTED_ARCHIVE_SIGNATURES = (
    b"PK\x03\x04",
    b"PK\x05\x06",
    b"PK\x07\x08",
    b"BZh",
    b"\xfd7zXZ\x00",
    b"7z\xbc\xaf'\x1c",
    b"Rar!\x1a\x07",
    b"\x28\xb5\x2f\xfd",
)
UNSUPPORTED_ARCHIVE_SUFFIXES = (
    ".7z", ".br", ".bz2", ".rar", ".tar.br", ".tar.bz2", ".tar.xz",
    ".tar.zst", ".tar.zstd", ".txz", ".xz", ".zip", ".zst", ".zstd",
)


@dataclass(frozen=True)
class Finding:
    scope: str
    path: str
    line: int
    rule: str
    category: str
    severity: str
    blob: str | None = None


PRIVATE_KEY_RE = re.compile(
    rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"
)
TOKEN_PREFIX_RE = re.compile(
    rb"(?<![A-Za-z0-9])(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|"
    rb"xox[baprs]-[A-Za-z0-9-]{16,}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,})"
)
BEARER_RE = re.compile(
    rb"(?i)\bBearer[ \t]+([A-Za-z0-9._~+/=-]{16,})"
)
QUERY_SECRET_RE = re.compile(
    rb"(?i)(?:\?|&|%3[fF]|%26)(?:api[_-]?key|apikey|token|access[_-]?token)"
    rb"(?:=|%3[dD])([^&\s\"']{16,})"
)
ENV_ASSIGNMENT_RE = re.compile(
    rb"(?im)^[ \t]*(ODDS_API_KEY|API_KEY|AUTH_SECRET|SESSION_SECRET|"
    rb"PIPELINE_WORKER_SECRET|PRIVATE_KEY|ACCESS_TOKEN|TEAM_ACCESS_CODE)"
    rb"[ \t]*=[ \t]*([A-Za-z0-9._~+/=-]{12,})"
)
STRUCTURED_ASSIGNMENT_RE = re.compile(
    rb"(?i)\b(ODDS_API_KEY|API_KEY|AUTH_SECRET|SESSION_SECRET|PIPELINE_WORKER_SECRET|"
    rb"PRIVATE_KEY|ACCESS_TOKEN|TEAM_ACCESS_CODE)\b[ \t]*(?:=|:)[ \t]*[\"']"
    rb"([^\"'\r\n]+)[\"']"
)
ACCESS_LITERAL_RE = re.compile(
    rb"(?i)\b(?:access[_-]?code|owner[_-]?(?:link|token)|team[_-]?(?:token|code))\b"
    rb"[ \t]*(?:=|:)[ \t]*[\"']([^\"'\r\n]{8,})[\"']"
)
EMAIL_RE = re.compile(
    rb"(?i)\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b"
)
HOME_PATH_RE = re.compile(rb"(?<![A-Za-z0-9])/(?:Users|home)/[^/\s\"']+/")
VENDOR_HEX32_RE = re.compile(rb"(?<![0-9A-Fa-f])[0-9a-f]{32}(?![0-9A-Fa-f])")
SAFE_HEX32_CONTEXT_RE = re.compile(
    rb"(?i)(?:sha|hash|digest|checksum|cache[_-]?path|output[_-]?directory|"
    rb"project[_-]?id|database[_-]?id|deployment[_-]?id|request[_-]?id|"
    rb"model[_-]?id|game[_-]?id|api[_-]?key|secret|token|access[_-]?code|"
    rb"appgprj_|g-p-|node_modules/\.pnpm)"
)

EXAMPLE_EMAIL_DOMAINS = {
    b"example.com",
    b"example.net",
    b"example.org",
    b"example.invalid",
    b"test.invalid",
}


def _line_number(data: bytes, offset: int) -> int:
    return data.count(b"\n", 0, offset) + 1


def _line_allows_fixture(data: bytes, offset: int) -> bool:
    start = data.rfind(b"\n", 0, offset) + 1
    end = data.find(b"\n", offset)
    if end < 0:
        end = len(data)
    return ALLOW_MARKER in data[start:end]


def _line_bytes(data: bytes, offset: int) -> bytes:
    start = data.rfind(b"\n", 0, offset) + 1
    end = data.find(b"\n", offset)
    if end < 0:
        end = len(data)
    return data[start:end]


def _looks_dynamic_or_placeholder(value: bytes) -> bool:
    normalized = value.strip().strip(b"\"'").lower()
    if not normalized:
        return True
    prefixes = (
        b"${",
        b"<",
        b"process.",
        b"env.",
        b"request.",
        b"config.",
        b"z.",
        b"+",
        b"undefined",
        b"null",
    )
    placeholders = {
        b"changeme",
        b"example",
        b"placeholder",
        b"redacted",
        b"secret-value",
        b"test-only",
        b"your-key-here",
    }
    return normalized.startswith(prefixes) or normalized in placeholders


def _read_text_payload(path: Path) -> bytes | None:
    try:
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_SCAN_BYTES:
            return None
        raw = path.read_bytes()
        if path.suffix == ".gz":
            raw, issue = _decode_gzip_bounded(raw, MAX_SCAN_BYTES)
            if issue is not None or raw is None:
                return None
        if b"\x00" in raw[:4096]:
            return None
        return raw
    except OSError:
        return None


def _archive_path(path: str) -> bool:
    lowered = path.lower()
    return lowered.endswith(
        (".tar", ".tar.gz", ".tgz", ".gz") + UNSUPPORTED_ARCHIVE_SUFFIXES
    )


def _looks_like_tar_header(data: bytes) -> bool:
    """Recognize a tar at byte zero without trusting a filename extension."""

    if len(data) < 512:
        return False
    header = data[:512]
    if not header.strip(b"\x00"):
        return False
    if header[257:262] == b"ustar":
        return True
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


TAR_CHECKSUM_CANDIDATE_RE = re.compile(
    rb"(?=([ 0-7]{6}\x00[ \x00]|[ 0-7]{7}\x00))"
)
MAX_TAR_CHECKSUM_CANDIDATES = 4096


def _contains_tar_header(data: bytes) -> bool:
    """Recognize a checksum-valid TAR header at any byte offset, boundedly."""

    if len(data) < 512:
        return False
    candidate_count = 0
    for match in TAR_CHECKSUM_CANDIDATE_RE.finditer(data, 148):
        offset = match.start() - 148
        if offset < 0 or offset + 512 > len(data):
            continue
        candidate_count += 1
        if candidate_count > MAX_TAR_CHECKSUM_CANDIDATES:
            # A deliberately checksum-like opaque payload is ambiguous. Treat it
            # as a container so qualification blocks rather than burns unbounded
            # work or silently calls it text.
            return True
        if _looks_like_tar_header(data[offset:offset + 512]):
            return True
    return False


def _looks_binary_container_payload(data: bytes) -> bool:
    sample = data[:4096]
    if not sample:
        return False
    if b"\x00" in sample:
        return True
    control_bytes = sum(
        byte < 9 or (13 < byte < 32) or byte > 126
        for byte in sample
    )
    return control_bytes * 100 >= len(sample) * 2


def _archive_payload_kind(data: bytes, name_hint: str) -> str | None:
    lowered = name_hint.lower()
    if lowered.endswith((".gz", ".tgz")) or data.startswith(b"\x1f\x8b\x08"):
        return "gzip"
    if lowered.endswith(".tar") or _contains_tar_header(data):
        return "tar"
    if lowered.endswith(UNSUPPORTED_ARCHIVE_SUFFIXES):
        return "unsupported"
    if b"\x1f\x8b\x08" in data:
        return "unsupported"
    if data.startswith(UNSUPPORTED_ARCHIVE_SIGNATURES):
        return "unsupported"
    binary_signatures = tuple(
        signature
        for signature in UNSUPPORTED_ARCHIVE_SIGNATURES
        if any(byte < 32 or byte > 126 for byte in signature)
    )
    if any(signature in data for signature in binary_signatures):
        return "unsupported"
    if _looks_binary_container_payload(data) and any(
        signature in data for signature in UNSUPPORTED_ARCHIVE_SIGNATURES
    ):
        return "unsupported"
    return None


@dataclass
class _ArchiveScanBudget:
    expanded_bytes: int = 0
    member_count: int = 0
    terminal_issue: str | None = None


def _safe_archive_member_path(path: str, index: int, member_name: bytes) -> str:
    digest = hashlib.sha256(member_name).hexdigest()[:16]
    return f"{path}!/member-{index:06d}-{digest}"


def _gzip_header_payloads(
    data: bytes, path: str
) -> tuple[list[tuple[str, bytes]], str | None, str | None]:
    """Return bounded, secret-scannable gzip metadata without exposing names.

    zlib validates the compressed stream, but callers must scan optional header
    fields as evidence too.  Otherwise a credential can hide exclusively in an
    original-file-name, comment, or extra field and never reach ``scan_bytes``.
    """

    if len(data) < 10 or data[:3] != b"\x1f\x8b\x08":
        return [], None, "compressed_payload_invalid"
    flags = data[3]
    if flags & 0xE0:
        return [], None, "compressed_payload_invalid"
    offset = 10
    fields: list[tuple[str, bytes]] = []

    if flags & 0x04:
        if offset + 2 > len(data):
            return [], None, "compressed_payload_invalid"
        extra_size = int.from_bytes(data[offset:offset + 2], "little")
        offset += 2
        if offset + extra_size > len(data):
            return [], None, "compressed_payload_invalid"
        fields.append(("extra", data[offset:offset + extra_size]))
        offset += extra_size

    for flag in (0x08, 0x10):
        if not flags & flag:
            continue
        end = data.find(b"\x00", offset)
        if end < 0:
            return [], None, "compressed_payload_invalid"
        fields.append(("filename" if flag == 0x08 else "comment", data[offset:end]))
        offset = end + 1

    if flags & 0x02:
        if offset + 2 > len(data):
            return [], None, "compressed_payload_invalid"
        offset += 2

    payloads: list[tuple[str, bytes]] = []
    credential_name_path: str | None = None
    for index, (field_kind, field) in enumerate(fields):
        digest = hashlib.sha256(field).hexdigest()[:16]
        metadata_path = f"{path}!/gzip-metadata-{index:02d}-{digest}"
        if field_kind == "filename" and _credential_storage_path(
            Path(field.decode("utf-8", errors="surrogateescape"))
        ):
            credential_name_path = metadata_path
        payloads.append((metadata_path, field))
    return payloads, credential_name_path, None


def _decode_gzip_bounded(
    data: bytes, maximum: int
) -> tuple[bytes | None, str | None]:
    """Decode exactly one gzip stream without permitting unbounded expansion."""

    decoder = zlib.decompressobj(wbits=16 + zlib.MAX_WBITS)
    decoded = bytearray()
    pending = data
    try:
        while pending:
            remaining = maximum - len(decoded)
            chunk = decoder.decompress(pending, remaining + 1)
            decoded.extend(chunk)
            if len(decoded) > maximum:
                return None, "compressed_payload_oversize"
            if decoder.eof:
                # Concatenated streams and arbitrary trailing bytes are ambiguous
                # evidence containers, so qualification treats both as invalid.
                if decoder.unused_data:
                    return None, "compressed_payload_invalid"
                pending = b""
                break
            next_pending = decoder.unconsumed_tail
            if next_pending == pending:
                return None, "compressed_payload_invalid"
            pending = next_pending

        if not decoder.eof:
            return None, "compressed_payload_invalid"
        flushed = decoder.flush(maximum - len(decoded) + 1)
        decoded.extend(flushed)
        if len(decoded) > maximum:
            return None, "compressed_payload_oversize"
    except (OverflowError, ValueError, zlib.error):
        return None, "compressed_payload_invalid"
    return bytes(decoded), None


def _tar_has_exact_end_marker(data: bytes, logical_end: int) -> bool:
    if logical_end < 0 or logical_end + 1024 > len(data):
        return False
    trailer = data[logical_end:]
    return trailer.startswith(b"\x00" * 1024) and not trailer.strip(b"\x00")


def _tar_header_field_payloads(
    data: bytes, path: str
) -> Iterable[tuple[str, bytes | None, str | None]]:
    """Yield logical TAR header fields with structure boundaries restored."""

    field_offsets = (
        (0, 100), (100, 108), (108, 116), (116, 124), (124, 136),
        (136, 148), (148, 156), (156, 157), (157, 257), (257, 263),
        (263, 265), (265, 297), (297, 329), (329, 337), (337, 345),
        (345, 500), (500, 512),
    )
    for block_index in range(0, len(data) - 511, 512):
        header = data[block_index:block_index + 512]
        if not _looks_like_tar_header(header):
            continue
        for field_index, (start, end) in enumerate(field_offsets):
            field = header[start:end].strip(b"\x00 ")
            if not field:
                continue
            field_path = (
                f"{path}!/tar-header-{block_index // 512:06d}"
                f"-field-{field_index:02d}"
            )
            if ALLOW_MARKER in field:
                yield field_path, None, "archive_metadata_fixture_marker"
            else:
                yield field_path, field, None


def _consume_archive_expansion(
    budget: _ArchiveScanBudget, amount: int
) -> bool:
    if amount < 0 or budget.expanded_bytes + amount > MAX_ARCHIVE_EXPANDED_BYTES:
        budget.terminal_issue = "archive_expanded_oversize"
        return False
    budget.expanded_bytes += amount
    return True


def _scan_payloads_bounded(
    data: bytes,
    path: str,
    *,
    name_hint: str,
    depth: int,
    budget: _ArchiveScanBudget,
) -> Iterable[tuple[str, bytes | None, str | None]]:
    if budget.terminal_issue is not None:
        return

    kind = _archive_payload_kind(data, name_hint)
    if kind == "unsupported":
        yield path, None, "archive_format_unsupported"
        return
    if kind is not None and depth > MAX_ARCHIVE_RECURSION_DEPTH:
        budget.terminal_issue = "archive_recursion_limit"
        yield path, None, budget.terminal_issue
        return

    decoded = data
    if kind == "gzip":
        metadata_payloads, credential_name_path, metadata_issue = _gzip_header_payloads(data, path)
        if metadata_issue is not None:
            yield path, None, metadata_issue
            return
        if credential_name_path is not None:
            yield credential_name_path, None, "credential_named_storage_path"
            return
        for metadata_path, metadata in metadata_payloads:
            if ALLOW_MARKER in metadata:
                yield metadata_path, None, "archive_metadata_fixture_marker"
            else:
                yield metadata_path, metadata, None
        decoded, issue = _decode_gzip_bounded(data, MAX_ARCHIVE_BYTES)
        if issue is not None or decoded is None:
            yield path, None, issue or "compressed_payload_invalid"
            return
        if not _consume_archive_expansion(budget, len(decoded)):
            yield path, None, budget.terminal_issue
            return
        lowered = name_hint.lower()
        decoded_kind = _archive_payload_kind(decoded, "")
        if decoded_kind == "unsupported":
            yield path, None, "archive_format_unsupported"
            return
        if decoded_kind == "gzip":
            yield from _scan_payloads_bounded(
                decoded,
                path,
                name_hint="decoded.gz",
                depth=depth + 1,
                budget=budget,
            )
            return
        kind = "tar" if lowered.endswith((".tar.gz", ".tgz")) or decoded_kind == "tar" else None

    if kind == "tar":
        try:
            with tarfile.open(fileobj=io.BytesIO(decoded), mode="r:") as archive:
                total = 0
                content_spans: list[tuple[int, int]] = []
                for index, member in enumerate(archive):
                    budget.member_count += 1
                    if budget.member_count > MAX_ARCHIVE_MEMBER_COUNT:
                        budget.terminal_issue = "archive_member_limit"
                        yield path, None, budget.terminal_issue
                        return
                    member_name = member.name.encode("utf-8", errors="surrogateescape")
                    safe_path = _safe_archive_member_path(path, index, member_name)
                    yield f"{safe_path}-name", member_name, None
                    if member.isfile() and member.size >= 0:
                        content_start = member.offset_data
                        content_end = content_start + member.size
                        if (
                            content_start < 0
                            or content_end < content_start
                            or content_end > len(decoded)
                        ):
                            yield path, None, "archive_payload_invalid"
                            return
                        # Record every regular body before any credential-name or
                        # oversize early return. Envelope scanning must never turn
                        # a skipped body into metadata and inspect it accidentally.
                        content_spans.append((content_start, content_end))
                    if _credential_storage_path(Path(member.name)):
                        yield safe_path, None, "credential_named_storage_path"
                        continue
                    if member.isdir():
                        continue
                    if not member.isfile() or member.size < 0:
                        yield safe_path, None, "archive_nonregular_member"
                        continue
                    total += member.size
                    if total > MAX_ARCHIVE_BYTES:
                        yield path, None, "archive_total_oversize"
                        return
                    if member.size > MAX_SCAN_BYTES:
                        yield safe_path, None, "archive_member_oversize"
                        continue
                    if not _consume_archive_expansion(budget, member.size):
                        yield safe_path, None, budget.terminal_issue
                        return
                    extracted = archive.extractfile(member)
                    if extracted is None:
                        yield safe_path, None, "archive_member_unreadable"
                        continue
                    payload = extracted.read(MAX_SCAN_BYTES + 1)
                    if len(payload) > MAX_SCAN_BYTES or len(payload) != member.size:
                        yield safe_path, None, "archive_member_size_mismatch"
                        continue
                    content_path = f"{safe_path}-content"
                    nested_kind = _archive_payload_kind(payload, member.name)
                    if nested_kind is None:
                        yield content_path, payload, None
                        continue
                    yield from _scan_payloads_bounded(
                        payload,
                        content_path,
                        name_hint=member.name,
                        depth=depth + 1,
                        budget=budget,
                    )
                    if budget.terminal_issue is not None:
                        return
                if not _tar_has_exact_end_marker(decoded, archive.offset):
                    yield path, None, "archive_payload_invalid"
                    return

                yield from _tar_header_field_payloads(decoded, path)

                # Scan every byte in the TAR envelope other than regular-file
                # bodies. This includes legacy/PAX/GNU headers, uname/gname,
                # extension records, member padding, and end padding. tarfile's
                # resolved member model alone does not expose all of those bytes.
                cursor = 0
                for envelope_index, (start, end) in enumerate(sorted(content_spans)):
                    if start < cursor:
                        yield path, None, "archive_payload_invalid"
                        return
                    envelope = decoded[cursor:start]
                    if envelope:
                        envelope_path = f"{path}!/tar-envelope-{envelope_index:06d}"
                        if ALLOW_MARKER in envelope:
                            yield envelope_path, None, "archive_metadata_fixture_marker"
                        else:
                            yield envelope_path, envelope, None
                    cursor = end
                trailer = decoded[cursor:]
                if trailer:
                    trailer_path = f"{path}!/tar-envelope-{len(content_spans):06d}"
                    if ALLOW_MARKER in trailer:
                        yield trailer_path, None, "archive_metadata_fixture_marker"
                    else:
                        yield trailer_path, trailer, None
            return
        except (EOFError, OSError, OverflowError, tarfile.TarError, ValueError):
            yield path, None, "archive_payload_invalid"
            return

    if len(decoded) > MAX_SCAN_BYTES:
        yield path, None, "text_payload_oversize"
    else:
        # Credential recognizers operate on bytes and remain valid for binary
        # payloads. Silently dropping NUL-bearing files would turn every unknown
        # binary format into an unreported scanner blind spot.
        yield path, decoded, None


def _scan_payloads(
    data: bytes, path: str
) -> Iterable[tuple[str, bytes | None, str | None]]:
    yield from _scan_payloads_bounded(
        data,
        path,
        name_hint=path,
        depth=0,
        budget=_ArchiveScanBudget(),
    )


def _path_scan_payloads(
    path: Path, root: Path | None = None
) -> Iterable[tuple[str, bytes | None, str | None]]:
    try:
        metadata = path.lstat()
        if stat.S_ISLNK(metadata.st_mode):
            return ((path.name, None, "working_tree_symlink"),)
        if not stat.S_ISREG(metadata.st_mode):
            return ((path.name, None, "working_tree_nonregular_file"),)
        if root is not None:
            canonical_root = root.resolve(strict=True)
            canonical_path = path.resolve(strict=True)
            try:
                path.relative_to(root)
                canonical_path.relative_to(canonical_root)
            except ValueError:
                return ((path.name, None, "working_tree_path_escape"),)
        maximum = MAX_ARCHIVE_BYTES if _archive_path(path.name) else MAX_SCAN_BYTES
        if metadata.st_size > maximum:
            issue = (
                "archive_container_oversize"
                if _archive_path(path.name)
                else "text_payload_oversize"
            )
            return ((path.name, None, issue),)
        return tuple(_scan_payloads(path.read_bytes(), path.name))
    except OSError:
        return ((path.name, None, "working_tree_read_failed"),)


def scan_bytes(
    data: bytes,
    *,
    scope: str,
    path: str,
    blob: str | None = None,
    allow_fixture_markers: bool = True,
) -> list[Finding]:
    findings: list[Finding] = []

    def add(offset: int, rule: str, category: str, severity: str) -> None:
        if allow_fixture_markers and _line_allows_fixture(data, offset):
            return
        findings.append(
            Finding(
                scope=scope,
                path=path,
                line=_line_number(data, offset),
                rule=rule,
                category=category,
                severity=severity,
                blob=blob,
            )
        )

    for match in PRIVATE_KEY_RE.finditer(data):
        add(match.start(), "private_key_material", "credential", "blocker")
    for match in TOKEN_PREFIX_RE.finditer(data):
        add(match.start(), "provider_token_prefix", "credential", "blocker")
    for match in BEARER_RE.finditer(data):
        if not _looks_dynamic_or_placeholder(match.group(1)):
            add(match.start(), "bearer_token_literal", "credential", "blocker")
    for match in QUERY_SECRET_RE.finditer(data):
        if not _looks_dynamic_or_placeholder(match.group(1)):
            add(match.start(), "query_string_credential", "credential", "blocker")
    for match in ENV_ASSIGNMENT_RE.finditer(data):
        if not _looks_dynamic_or_placeholder(match.group(2)):
            add(match.start(), "secret_assignment", "credential", "blocker")
    for match in STRUCTURED_ASSIGNMENT_RE.finditer(data):
        if not _looks_dynamic_or_placeholder(match.group(2)):
            add(match.start(), "secret_assignment", "credential", "blocker")
    for match in ACCESS_LITERAL_RE.finditer(data):
        if not _looks_dynamic_or_placeholder(match.group(1)):
            add(match.start(), "private_access_literal", "credential", "blocker")
    for match in EMAIL_RE.finditer(data):
        email_like = match.group(0)
        package_version = re.fullmatch(
            rb"[A-Za-z0-9._-]+@\d+(?:\.\d+)+(?:[-.][A-Za-z0-9]+)*",
            email_like,
        )
        if (
            match.group(1).lower() not in EXAMPLE_EMAIL_DOMAINS
            and package_version is None
        ):
            add(match.start(), "personal_email", "personal_data", "blocker")
    for match in HOME_PATH_RE.finditer(data):
        add(match.start(), "absolute_home_path", "personal_data", "review")
    for match in VENDOR_HEX32_RE.finditer(data):
        if not SAFE_HEX32_CONTEXT_RE.search(_line_bytes(data, match.start())):
            add(match.start(), "vendor_shape_hex32", "credential", "blocker")

    return findings


def _git_lines(root: Path, args: list[str]) -> list[str]:
    result = subprocess.run(
        _git_command(args),
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=_git_environment(),
    )
    return result.stdout.splitlines()


def _git_environment() -> dict[str, str]:
    """A closed Git environment that cannot inherit repository redirection."""

    return {
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_GRAFT_FILE": "/dev/null",
        "GIT_NO_REPLACE_OBJECTS": "1",
        "GIT_TERMINAL_PROMPT": "0",
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
    }


def _git_command(args: list[str]) -> list[str]:
    global _VALIDATED_GIT_EXECUTABLE
    if _VALIDATED_GIT_EXECUTABLE is None:
        try:
            executable = FROZEN_GIT_EXECUTABLE.resolve(strict=True)
            metadata = executable.stat()
        except OSError as error:
            raise RuntimeError("frozen qualification Git is unavailable") from error
        if not stat.S_ISREG(metadata.st_mode):
            raise RuntimeError("frozen qualification Git is not a regular file")
        if hashlib.sha256(executable.read_bytes()).hexdigest() != FROZEN_GIT_SHA256:
            raise RuntimeError("frozen qualification Git bytes drifted")
        _VALIDATED_GIT_EXECUTABLE = str(executable)
    return [
        _VALIDATED_GIT_EXECUTABLE,
        "--no-replace-objects",
        "-c",
        "core.fsmonitor=false",
        *args,
    ]


def _walk_selected_root(root: Path, relative: str) -> Iterable[Path]:
    selected = root / relative
    try:
        metadata = selected.lstat()
    except OSError:
        return ()
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        return (selected,)
    found: list[Path] = []
    for directory, names, files in os.walk(selected):
        base = Path(directory)
        traversable: list[str] = []
        for name in names:
            if name in IGNORED_DIRECTORY_NAMES:
                continue
            candidate = base / name
            try:
                candidate_metadata = candidate.lstat()
            except OSError:
                found.append(candidate)
                continue
            if stat.S_ISDIR(candidate_metadata.st_mode):
                traversable.append(name)
            else:
                found.append(candidate)
        names[:] = traversable
        found.extend(base / name for name in files)
    return found


def _credential_storage_path(path: Path) -> bool:
    names = [part.lower() for part in path.parts]
    return any(
        name == ".env"
        or (
            name.startswith(".env.")
            and name not in {".env.example", ".env.sample", ".env.template"}
        )
        or name in CREDENTIAL_STORAGE_NAMES
        or name.endswith(CREDENTIAL_STORAGE_SUFFIXES)
        for name in names
    )


def working_tree_paths(root: Path, *, include_ignored_outputs: bool = False) -> list[Path]:
    relative_paths = set(_git_lines(root, ["ls-files", "-c"]))
    if not include_ignored_outputs:
        return [root / path for path in sorted(relative_paths)]
    for build_root in BUILD_ROOTS:
        for path in _walk_selected_root(root, build_root):
            relative_paths.add(str(path.relative_to(root)))
    return [root / path for path in sorted(relative_paths)]


def _control_finding(
    *,
    scope: str,
    path: str,
    rule: str,
    blob: str | None = None,
) -> Finding:
    return Finding(
        scope=scope,
        path=path,
        line=1,
        rule=rule,
        category="security_control",
        severity="blocker",
        blob=blob,
    )


def _redacted_path_label(scope: str, path: str) -> str:
    digest = hashlib.sha256(path.encode("utf-8", errors="surrogateescape")).hexdigest()[:16]
    return f"<{scope}-path-{digest}>"


def _scan_path_identity(
    path: str, *, scope: str, blob: str | None = None
) -> tuple[list[Finding], str, bool]:
    """Scan a pathname without ever echoing a credential-bearing name."""

    redacted = _redacted_path_label(scope, path)
    findings = scan_bytes(
        path.encode("utf-8", errors="surrogateescape"),
        scope=scope,
        path=redacted,
        blob=blob,
        allow_fixture_markers=False,
    )
    sensitive = bool(findings)
    credential_shaped = any(finding.category == "credential" for finding in findings)
    return findings, redacted if sensitive else path, credential_shaped


def _working_tree_virtual_path(
    relative_path: str, file_name: str, payload_path: str
) -> str:
    if payload_path == file_name:
        return relative_path
    marker = f"{file_name}!/"
    if payload_path.startswith(marker):
        return f"{relative_path}!/{payload_path[len(marker):]}"
    # The payload path is scanner-generated, but avoid surfacing it if a future
    # decoder violates the expected shape.
    digest = hashlib.sha256(payload_path.encode("utf-8")).hexdigest()[:16]
    return f"{relative_path}!/payload-{digest}"


def scan_working_tree(root: Path, *, include_ignored_outputs: bool = False) -> list[Finding]:
    findings: list[Finding] = []
    for path in working_tree_paths(root, include_ignored_outputs=include_ignored_outputs):
        relative_path = str(path.relative_to(root))
        path_findings, display_path, credential_shaped_path = _scan_path_identity(
            relative_path,
            scope="working_tree_path",
        )
        findings.extend(path_findings)
        if credential_shaped_path:
            continue
        if _credential_storage_path(path.relative_to(root)):
            findings.append(
                _control_finding(
                    scope="working_tree",
                    path=display_path,
                    rule="credential_named_storage_path",
                )
            )
            continue
        in_selected_build_root = any(
            relative_path == build_root
            or relative_path.startswith(f"{build_root}/")
            for build_root in BUILD_ROOTS
        )
        for payload_path, data, issue in _path_scan_payloads(path, root):
            virtual_path = _working_tree_virtual_path(
                display_path, path.name, payload_path
            )
            if issue is not None:
                findings.append(
                    _control_finding(
                        scope="working_tree", path=virtual_path, rule=issue
                    )
                )
                continue
            if data is None:
                findings.append(
                    _control_finding(
                        scope="working_tree",
                        path=virtual_path,
                        rule="scanner_payload_missing",
                    )
                )
                continue
            findings.extend(
                scan_bytes(
                    data,
                    scope="working_tree",
                    path=virtual_path,
                )
            )
    return findings


def _reachable_object_paths(root: Path) -> dict[str, tuple[str, ...]]:
    """Return every reachable blob-to-path alias, not one arbitrary alias.

    ``git rev-list --objects`` reports only one path hint per object. A blob that
    was ever stored under a credential filename must be quarantined even when a
    safe alias is the hint Git happens to print, so enumerate each distinct
    reachable root tree and retain all aliases.
    """

    paths: dict[str, set[str]] = {}
    reachable_records = _git_lines(root, ["rev-list", "--objects", "--all"])
    reachable_ids: list[str] = []
    path_hints: dict[str, set[str]] = {}
    for line in reachable_records:
        object_id, separator, path = line.partition(" ")
        if not object_id:
            continue
        reachable_ids.append(object_id)
        if separator and path:
            path_hints.setdefault(object_id, set()).add(path)

    if not reachable_ids:
        return {}
    type_result = subprocess.run(
        _git_command(["cat-file", "--batch-check=%(objectname) %(objecttype)"]),
        cwd=root,
        check=True,
        input=("\n".join(reachable_ids) + "\n").encode("ascii"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=_git_environment(),
    )
    blob_ids = {
        parts[0]
        for raw_line in type_result.stdout.decode("ascii").splitlines()
        if len(parts := raw_line.split()) == 2 and parts[1] == "blob"
    }
    for object_id in blob_ids:
        paths.setdefault(object_id, set()).update(path_hints.get(object_id, set()))

    # Enumerate every distinct commit-root tree plus a ref that points directly
    # at a tree. This supplies all aliases (not Git's single path hint) while the
    # complete rev-list set above also retains directly referenced/pathless blobs.
    commit_tips: list[str] = []
    tree_ids: set[str] = set()
    for ref_name in _git_lines(root, ["for-each-ref", "--format=%(refname)"]):
        peeled = subprocess.run(
            _git_command(["rev-parse", f"{ref_name}^{{}}"]),
            cwd=root,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=_git_environment(),
        ).stdout.strip()
        object_type = subprocess.run(
            _git_command(["cat-file", "-t", peeled]),
            cwd=root,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=_git_environment(),
        ).stdout.strip()
        if object_type == "commit":
            commit_tips.append(peeled)
        elif object_type == "tree":
            tree_ids.add(peeled)
    if commit_tips:
        tree_ids.update(_git_lines(root, ["log", "--format=%T", *sorted(set(commit_tips))]))
    for tree_id in sorted(tree_ids):
        result = subprocess.run(
            _git_command(["ls-tree", "-r", "-z", "--full-tree", tree_id]),
            cwd=root,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_git_environment(),
        )
        for raw_record in result.stdout.split(b"\x00"):
            if not raw_record:
                continue
            metadata, separator, raw_path = raw_record.partition(b"\t")
            parts = metadata.split()
            if not separator or len(parts) != 3 or parts[1] != b"blob":
                continue
            object_id = parts[2].decode("ascii")
            path = raw_path.decode("utf-8", errors="surrogateescape")
            if object_id in blob_ids:
                paths.setdefault(object_id, set()).add(path)
    return {
        object_id: tuple(sorted(aliases))
        for object_id, aliases in sorted(paths.items())
    }


def scan_git_history(root: Path) -> list[Finding]:
    object_paths = _reachable_object_paths(root)
    if not object_paths:
        return []

    findings: list[Finding] = []
    scannable_object_paths: dict[str, tuple[str, str]] = {}
    for object_id, aliases in object_paths.items():
        alias_displays: dict[str, str] = {}
        credential_shaped_alias = False
        for path in aliases:
            path_findings, display_path, credential_shaped = _scan_path_identity(
                path,
                scope="git_history_path",
                blob=object_id,
            )
            findings.extend(path_findings)
            alias_displays[path] = display_path
            credential_shaped_alias = credential_shaped_alias or credential_shaped
        if credential_shaped_alias:
            continue
        credential_aliases = tuple(
            path for path in aliases if _credential_storage_path(Path(path))
        )
        if credential_aliases:
            for path in credential_aliases:
                findings.append(
                    _control_finding(
                        scope="git_history",
                        path=alias_displays.get(path, path),
                        rule="credential_named_storage_path",
                        blob=object_id,
                    )
                )
            # Do not open a blob once any reachable alias identifies it as a
            # credential store, even if another alias looks innocuous.
            continue
        if aliases:
            ordered_aliases = sorted(aliases, key=lambda path: (not _archive_path(path), path))
            chosen = ordered_aliases[0]
            scannable_object_paths[object_id] = (chosen, alias_displays.get(chosen, chosen))
        else:
            scannable_object_paths[object_id] = (
                "<pathless-reachable-blob>",
                "<pathless-reachable-blob>",
            )
    if not scannable_object_paths:
        return findings

    process = subprocess.Popen(
        _git_command(["cat-file", "--batch"]),
        cwd=root,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=_git_environment(),
    )
    assert process.stdin is not None
    assert process.stdout is not None

    try:
        for object_id, (name_hint, display_path) in scannable_object_paths.items():
            process.stdin.write(object_id.encode("ascii") + b"\n")
            process.stdin.flush()
            header = process.stdout.readline().decode("ascii", errors="replace").strip()
            parts = header.split()
            if len(parts) != 3 or parts[1] != "blob":
                if len(parts) == 3 and parts[2].isdigit():
                    process.stdout.read(int(parts[2]) + 1)
                continue
            size = int(parts[2])
            data = process.stdout.read(size)
            process.stdout.read(1)
            maximum = MAX_ARCHIVE_BYTES if _archive_path(name_hint) else MAX_SCAN_BYTES
            if size > maximum:
                findings.append(
                    _control_finding(
                        scope="git_history",
                        path=display_path,
                        rule=(
                            "archive_container_oversize"
                            if _archive_path(name_hint)
                            else "text_payload_oversize"
                        ),
                        blob=object_id,
                    )
                )
                continue
            for payload_path, payload, issue in _scan_payloads_bounded(
                data,
                display_path,
                name_hint=name_hint,
                depth=0,
                budget=_ArchiveScanBudget(),
            ):
                if issue is not None:
                    findings.append(
                        _control_finding(
                            scope="git_history",
                            path=payload_path,
                            rule=issue,
                            blob=object_id,
                        )
                    )
                    continue
                if payload is None:
                    findings.append(
                        _control_finding(
                            scope="git_history",
                            path=payload_path,
                            rule="scanner_payload_missing",
                            blob=object_id,
                        )
                    )
                    continue
                findings.extend(
                    scan_bytes(
                        payload,
                        scope="git_history",
                        path=payload_path,
                        blob=object_id,
                    )
                )
    finally:
        process.stdin.close()
        process.wait(timeout=30)
        process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()
    return findings


def scan_git_commits(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for commit_id in _git_lines(root, ["rev-list", "--all"]):
        result = subprocess.run(
            _git_command(["cat-file", "commit", commit_id]),
            cwd=root,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_git_environment(),
        )
        findings.extend(
            scan_bytes(
                result.stdout,
                scope="git_commit_metadata",
                path="<commit>",
                blob=commit_id,
            )
        )
    return findings


def _deduplicate(findings: Iterable[Finding]) -> list[Finding]:
    return sorted(
        set(findings),
        key=lambda finding: (
            finding.severity,
            finding.category,
            finding.scope,
            finding.path,
            finding.line,
            finding.rule,
            finding.blob or "",
        ),
    )


def _summary(findings: list[Finding]) -> dict[str, object]:
    counts: dict[str, int] = {}
    for finding in findings:
        key = f"{finding.category}:{finding.severity}"
        counts[key] = counts.get(key, 0) + 1
    return {
        "findingCount": len(findings),
        "counts": dict(sorted(counts.items())),
    }


def _credential_gate_failed(findings: list[Finding]) -> bool:
    """Fail when a credential exists or its absence could not be verified.

    Security-control findings are deliberately included: credential-named paths
    are never opened, and malformed/unsupported containers are not fully scanned.
    Treating either condition as a credential-clean result would be fail-open.
    """
    return any(
        finding.category in {"credential", "security_control"}
        for finding in findings
    )


def _load_history_quarantine(
    root: Path, requested: Path
) -> tuple[set[Finding], dict[str, object]]:
    """Load an explicit metadata-only residual quarantine for bounded OS-01.

    This never clears or relabels a finding. It only allows the exact immutable
    metadata tuple to be separated from the package gate while remaining present
    in the report as ``quarantined_unknown``.
    """

    candidate = requested if requested.is_absolute() else root / requested
    candidate = candidate.resolve(strict=True)
    try:
        relative = candidate.relative_to(root)
    except ValueError as error:
        raise ValueError("history quarantine manifest is outside the repository") from error
    metadata = candidate.lstat()
    if (
        stat.S_ISLNK(metadata.st_mode)
        or not stat.S_ISREG(metadata.st_mode)
        or metadata.st_size > 64 * 1024
        or _credential_storage_path(relative)
    ):
        raise ValueError("history quarantine manifest is not an eligible tracked file")
    tracked = subprocess.run(
        _git_command(["ls-files", "--error-unmatch", "--", str(relative)]),
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=_git_environment(),
    )
    if tracked.returncode != 0:
        raise ValueError("history quarantine manifest is not tracked")
    raw = candidate.read_bytes()
    try:
        manifest = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("history quarantine manifest is invalid JSON") from error
    if not isinstance(manifest, dict) or set(manifest) != {
        "entries", "ownerRotationContext", "ownerRotationContextIsBlobProof", "packageBoundary",
        "providerUseAllowed", "qualifiesGitHistoryCredentialClean", "scannerSha256",
        "scannerVersion", "status", "version",
    }:
        raise ValueError("history quarantine manifest schema is invalid")
    scanner_sha256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    if (
        manifest["version"] != "os01-history-quarantine.2026.1"
        or manifest["scannerVersion"] != SCANNER_VERSION
        or manifest["scannerSha256"] != scanner_sha256
        or manifest["status"] != "bounded_quarantined_unknown"
        or manifest["packageBoundary"] != "OS-01_provider_free_only"
        or manifest["providerUseAllowed"] is not False
        or manifest["qualifiesGitHistoryCredentialClean"] is not False
        or manifest["ownerRotationContext"] != "owner_attested_replacement_key_rotated_before_os01"
        or manifest["ownerRotationContextIsBlobProof"] is not False
    ):
        raise ValueError("history quarantine manifest boundary is invalid")
    entries = manifest["entries"]
    if not isinstance(entries, list) or len(entries) != 1:
        raise ValueError("history quarantine manifest must contain exactly one residual entry")
    configured: set[Finding] = set()
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {
            "blob", "category", "line", "path", "rule", "scope", "severity", "status"
        }:
            raise ValueError("history quarantine entry schema is invalid")
        if (
            not isinstance(entry["blob"], str)
            or re.fullmatch(r"[a-f0-9]{40}", entry["blob"]) is None
            or entry["scope"] != "git_history"
            or entry["category"] != "credential"
            or entry["severity"] != "blocker"
            or entry["status"] != "quarantined_unknown"
            or not isinstance(entry["path"], str)
            or not entry["path"]
            or not isinstance(entry["line"], int)
            or entry["line"] < 1
            or not isinstance(entry["rule"], str)
            or not entry["rule"]
        ):
            raise ValueError("history quarantine entry boundary is invalid")
        configured.add(Finding(
            scope=entry["scope"],
            path=entry["path"],
            line=entry["line"],
            rule=entry["rule"],
            category=entry["category"],
            severity=entry["severity"],
            blob=entry["blob"],
        ))
    return configured, {
        "manifestPath": str(relative),
        "manifestSha256": hashlib.sha256(raw).hexdigest(),
        "status": "bounded_quarantined_unknown",
        "qualifiesGitHistoryCredentialClean": False,
        "providerUseAllowed": False,
    }


def _partition_history_quarantine(
    findings: list[Finding], configured: set[Finding]
) -> tuple[list[Finding], list[Finding], set[Finding]]:
    quarantined = [finding for finding in findings if finding in configured]
    gate_findings = [finding for finding in findings if finding not in configured]
    return quarantined, gate_findings, configured.difference(findings)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--skip-working-tree", action="store_true")
    parser.add_argument(
        "--tracked-working-tree-only",
        action="store_true",
        help="scan tracked working-tree files only and suppress explicit build-output traversal",
    )
    parser.add_argument(
        "--include-build-outputs",
        action="store_true",
        help="also scan selected ignored build roots; ignored credential files remain excluded",
    )
    parser.add_argument("--skip-history", action="store_true")
    parser.add_argument(
        "--history-quarantine-manifest",
        type=Path,
        help="explicit bounded OS-01 metadata quarantine; findings remain reported as unknown",
    )
    parser.add_argument("--json-output", type=Path)
    parser.add_argument(
        "--fail-on",
        choices=("none", "credential", "blocker"),
        default="blocker",
        help=(
            "credential fails on detected credentials and on security-control "
            "conditions that prevent proving credential absence"
        ),
    )
    args = parser.parse_args()
    root = args.root.resolve()

    findings: list[Finding] = []
    if not args.skip_working_tree:
        findings.extend(
            scan_working_tree(
                root,
                include_ignored_outputs=(
                    args.include_build_outputs and not args.tracked_working_tree_only
                ),
            )
        )
    if not args.skip_history:
        findings.extend(scan_git_history(root))
        findings.extend(scan_git_commits(root))
    findings = _deduplicate(findings)

    gate_findings = findings
    quarantine_report: dict[str, object] | None = None
    quarantined_findings: list[Finding] = []
    if args.history_quarantine_manifest is not None:
        try:
            configured, quarantine_report = _load_history_quarantine(
                root, args.history_quarantine_manifest
            )
        except (OSError, ValueError) as error:
            parser.error(str(error))
        quarantined_findings, gate_findings, missing = _partition_history_quarantine(
            findings, configured
        )
        if missing:
            gate_findings.append(_control_finding(
                scope="history_quarantine",
                path="<history-quarantine-manifest>",
                rule="quarantine_expected_finding_missing",
            ))
        quarantine_report = {
            **quarantine_report,
            "configuredCount": len(configured),
            "matchedCount": len(quarantined_findings),
            "missingCount": len(missing),
        }

    report = {
        "formatVersion": 2,
        "scannerVersion": SCANNER_VERSION,
        "root": ".",
        "privacyGuarantee": "Matched values and line excerpts are never emitted.",
        "summary": _summary(findings),
        "gateSummary": _summary(gate_findings),
        "historyCredentialStatus": (
            "quarantined_unknown_not_clean"
            if quarantine_report is not None and not quarantine_report["missingCount"]
            else "not_quarantined"
        ),
        "quarantine": quarantine_report,
        "quarantinedFindings": [asdict(finding) for finding in quarantined_findings],
        "findings": [asdict(finding) for finding in findings],
    }
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)

    if args.fail_on == "none":
        return 0
    if args.fail_on == "credential":
        return int(_credential_gate_failed(gate_findings))
    # The bounded residual quarantine is valid only for the OS-01 credential
    # gate. It never converts the overall blocker report into a clean result.
    blocker_findings = findings + [
        finding for finding in gate_findings if finding not in findings
    ]
    return int(any(f.severity == "blocker" for f in blocker_findings))


if __name__ == "__main__":
    raise SystemExit(main())
