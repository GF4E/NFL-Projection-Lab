#!/usr/bin/env python3
"""Secret/PII scanner that never emits matched values.

The scanner covers the current Git working tree, selected ignored build/runtime
outputs, and every reachable Git blob. Findings contain only rule identifiers,
paths, line numbers, and blob identifiers; matched content is deliberately not
retained in memory after classification and is never serialized.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


MAX_SCAN_BYTES = 32 * 1024 * 1024
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
BUILD_ROOTS = ("dist", "build", ".next", ".openai", ".wrangler")


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
        if path.stat().st_size > MAX_SCAN_BYTES:
            return None
        raw = path.read_bytes()
        if path.suffix == ".gz":
            raw = gzip.decompress(raw)
            if len(raw) > MAX_SCAN_BYTES:
                return None
        if b"\x00" in raw[:4096]:
            return None
        return raw
    except (OSError, EOFError, gzip.BadGzipFile):
        return None


def scan_bytes(
    data: bytes,
    *,
    scope: str,
    path: str,
    blob: str | None = None,
) -> list[Finding]:
    findings: list[Finding] = []

    def add(offset: int, rule: str, category: str, severity: str) -> None:
        if _line_allows_fixture(data, offset):
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
        if match.group(1).lower() not in EXAMPLE_EMAIL_DOMAINS:
            add(match.start(), "personal_email", "personal_data", "blocker")
    for match in HOME_PATH_RE.finditer(data):
        add(match.start(), "absolute_home_path", "personal_data", "review")
    for match in VENDOR_HEX32_RE.finditer(data):
        if not SAFE_HEX32_CONTEXT_RE.search(_line_bytes(data, match.start())):
            add(match.start(), "vendor_shape_hex32", "credential", "blocker")

    return findings


def _git_lines(root: Path, args: list[str]) -> list[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return result.stdout.splitlines()


def _walk_selected_root(root: Path, relative: str) -> Iterable[Path]:
    selected = root / relative
    if not selected.exists():
        return ()
    if selected.is_file():
        return (selected,)
    found: list[Path] = []
    for directory, names, files in os.walk(selected):
        names[:] = [name for name in names if name not in IGNORED_DIRECTORY_NAMES]
        base = Path(directory)
        found.extend(base / name for name in files)
    return found


def working_tree_paths(root: Path, *, include_ignored_outputs: bool = True) -> list[Path]:
    relative_paths = set(_git_lines(root, ["ls-files", "-co", "--exclude-standard"]))
    if not include_ignored_outputs:
        return [root / path for path in sorted(relative_paths)]
    for build_root in BUILD_ROOTS:
        for path in _walk_selected_root(root, build_root):
            relative_paths.add(str(path.relative_to(root)))
    for pattern in (".env", ".env.*", "*.log"):
        for path in root.glob(pattern):
            if path.is_file():
                relative_paths.add(str(path.relative_to(root)))
    return [root / path for path in sorted(relative_paths)]


def scan_working_tree(root: Path, *, include_ignored_outputs: bool = True) -> list[Finding]:
    findings: list[Finding] = []
    for path in working_tree_paths(root, include_ignored_outputs=include_ignored_outputs):
        data = _read_text_payload(path)
        if data is None:
            continue
        findings.extend(
            scan_bytes(
                data,
                scope="working_tree",
                path=str(path.relative_to(root)),
            )
        )
    return findings


def _reachable_object_paths(root: Path) -> dict[str, str]:
    paths: dict[str, str] = {}
    for line in _git_lines(root, ["rev-list", "--objects", "--all"]):
        object_id, separator, path = line.partition(" ")
        if separator and path:
            paths.setdefault(object_id, path)
    return paths


def scan_git_history(root: Path) -> list[Finding]:
    object_paths = _reachable_object_paths(root)
    if not object_paths:
        return []

    process = subprocess.Popen(
        ["git", "cat-file", "--batch"],
        cwd=root,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdin is not None
    assert process.stdout is not None

    findings: list[Finding] = []
    try:
        for object_id, path in object_paths.items():
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
            if size > MAX_SCAN_BYTES or b"\x00" in data[:4096]:
                continue
            if path.endswith(".gz"):
                try:
                    data = gzip.decompress(data)
                except (EOFError, gzip.BadGzipFile):
                    continue
                if len(data) > MAX_SCAN_BYTES:
                    continue
            findings.extend(
                scan_bytes(
                    data,
                    scope="git_history",
                    path=path,
                    blob=object_id[:12],
                )
            )
    finally:
        process.stdin.close()
        process.wait(timeout=30)
    return findings


def scan_git_commits(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for commit_id in _git_lines(root, ["rev-list", "--all"]):
        result = subprocess.run(
            ["git", "cat-file", "commit", commit_id],
            cwd=root,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        findings.extend(
            scan_bytes(
                result.stdout,
                scope="git_commit_metadata",
                path="<commit>",
                blob=commit_id[:12],
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--skip-working-tree", action="store_true")
    parser.add_argument(
        "--tracked-working-tree-only",
        action="store_true",
        help="scan tracked and non-ignored untracked files without opening ignored outputs or credential stores",
    )
    parser.add_argument("--skip-history", action="store_true")
    parser.add_argument("--json-output", type=Path)
    parser.add_argument(
        "--fail-on",
        choices=("none", "credential", "blocker"),
        default="blocker",
    )
    args = parser.parse_args()
    root = args.root.resolve()

    findings: list[Finding] = []
    if not args.skip_working_tree:
        findings.extend(
            scan_working_tree(
                root,
                include_ignored_outputs=not args.tracked_working_tree_only,
            )
        )
    if not args.skip_history:
        findings.extend(scan_git_history(root))
        findings.extend(scan_git_commits(root))
    findings = _deduplicate(findings)

    report = {
        "formatVersion": 1,
        "root": ".",
        "privacyGuarantee": "Matched values and line excerpts are never emitted.",
        "summary": _summary(findings),
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
        return int(any(f.category == "credential" for f in findings))
    return int(any(f.severity == "blocker" for f in findings))


if __name__ == "__main__":
    raise SystemExit(main())
