#!/usr/bin/env python3
"""Verify the OS-00 frozen Model Lab evidence without running either model.

The verifier has four scopes:

* checkout: small Git-designated code, config, protocols, and contracts;
* artifacts: large scored outputs, which may be restored into an external cache;
* sources: the content-addressed Module 1 source cache shared by Modules 1/2;
* all: every scope plus nested manifests and frozen status assertions.

It never downloads a mutable upstream URL. A missing byte is a preservation
failure, not permission to substitute the provider's current response.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


DEFAULT_MANIFEST = Path(".planning/engine-os/execution/os-00/evidence-inventory.json")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass
class Verification:
    checked_files: int = 0
    checked_bytes: int = 0
    checked_source_objects: int = 0
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def error(self, message: str) -> None:
        self.errors.append(message)

    def verify_file(self, path: Path, expected_sha256: str, expected_bytes: int, label: str) -> bool:
        if not path.is_file():
            self.error(f"missing {label}: {path}")
            return False
        size = path.stat().st_size
        if size != expected_bytes:
            self.error(f"byte-count mismatch for {label}: expected {expected_bytes}, got {size}: {path}")
            return False
        actual = sha256_file(path)
        if actual != expected_sha256:
            self.error(f"sha256 mismatch for {label}: expected {expected_sha256}, got {actual}: {path}")
            return False
        self.checked_files += 1
        self.checked_bytes += size
        return True


def load_json(path: Path, result: Verification, label: str) -> Any | None:
    try:
        with path.open("r", encoding="utf-8") as source:
            return json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        result.error(f"invalid JSON for {label}: {path}: {error}")
        return None


def resolve_evidence_object(
    item: Mapping[str, Any], repo_root: Path, artifact_cache_root: Path | None
) -> Path:
    relative = Path(str(item["path"]))
    digest = str(item["sha256"])
    expected_bytes = int(item["bytes"])
    candidates = [repo_root / relative]
    if artifact_cache_root is not None:
        candidates.extend(
            [
                artifact_cache_root / relative,
                artifact_cache_root / "objects" / relative.name,
                artifact_cache_root / "sha256" / digest,
                artifact_cache_root / "sha256" / digest[:2] / digest,
                artifact_cache_root / digest,
            ]
        )
    for candidate in candidates:
        if (
            candidate.is_file()
            and candidate.stat().st_size == expected_bytes
            and sha256_file(candidate) == digest
        ):
            return candidate
    return next((candidate for candidate in candidates if candidate.is_file()), candidates[0])


def resolve_source_object(source_root: Path, object_name: str, digest: str, expected_bytes: int) -> Path:
    candidates = [
        source_root / "objects" / object_name,
        source_root / "sha256" / digest,
        source_root / "sha256" / digest[:2] / digest,
        source_root / "model-lab" / "raw" / "sha256" / digest,
        source_root / digest,
    ]
    for candidate in candidates:
        if (
            candidate.is_file()
            and candidate.stat().st_size == expected_bytes
            and sha256_file(candidate) == digest
        ):
            return candidate
    return next((candidate for candidate in candidates if candidate.is_file()), candidates[0])


def verify_inventory_digest(manifest_path: Path, result: Verification) -> None:
    digest_path = manifest_path.with_suffix(".sha256")
    if not digest_path.is_file():
        result.error(f"inventory digest file is missing: {digest_path}")
        return
    fields = digest_path.read_text(encoding="utf-8").strip().split()
    if len(fields) != 2 or fields[1] != manifest_path.name:
        result.error(f"inventory digest file has invalid format: {digest_path}")
        return
    actual = sha256_file(manifest_path)
    if actual != fields[0]:
        result.error(f"inventory sha256 mismatch: expected {fields[0]}, got {actual}")


def git_tracked(repo_root: Path, relative_path: str) -> bool:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "--error-unmatch", "--", relative_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return completed.returncode == 0


def verify_checkout(
    inventory: Mapping[str, Any], repo_root: Path, result: Verification, require_git_tracked: bool
) -> None:
    for item in inventory.get("gitFiles", []):
        relative = str(item["path"])
        result.verify_file(
            repo_root / relative,
            str(item["sha256"]),
            int(item["bytes"]),
            f"Git evidence {relative}",
        )
        if require_git_tracked and not git_tracked(repo_root, relative):
            result.error(f"Git-designated evidence is not tracked: {relative}")


def evidence_index(inventory: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    return {str(item["path"]): item for item in inventory.get("evidenceObjects", [])}


def verify_artifacts(
    inventory: Mapping[str, Any],
    repo_root: Path,
    artifact_cache_root: Path | None,
    result: Verification,
) -> dict[str, Path]:
    resolved: dict[str, Path] = {}
    for item in inventory.get("evidenceObjects", []):
        relative = str(item["path"])
        path = resolve_evidence_object(item, repo_root, artifact_cache_root)
        resolved[relative] = path
        result.verify_file(path, str(item["sha256"]), int(item["bytes"]), f"evidence object {relative}")
    return resolved


def verify_nested_manifests(
    inventory: Mapping[str, Any],
    repo_root: Path,
    artifact_cache_root: Path | None,
    resolved: Mapping[str, Path],
    result: Verification,
) -> None:
    indexed = evidence_index(inventory)
    for definition in inventory.get("nestedManifests", []):
        relative = str(definition["path"])
        manifest_path = resolved.get(relative)
        if manifest_path is None:
            item = indexed.get(relative)
            if item is None:
                result.error(f"nested manifest is not in evidenceObjects: {relative}")
                continue
            manifest_path = resolve_evidence_object(item, repo_root, artifact_cache_root)
        payload = load_json(manifest_path, result, f"nested manifest {relative}")
        if not isinstance(payload, Mapping):
            continue
        manifest_format = definition["format"]
        if manifest_format == "module-one-artifacts-map":
            raw_entries = payload.get("artifacts")
            if not isinstance(raw_entries, Mapping):
                result.error(f"module-one nested artifact map is missing: {manifest_path}")
                continue
            entries = {
                str(name): {"sha256": value["sha256"], "bytes": value["bytes"]}
                for name, value in raw_entries.items()
            }
        elif manifest_format == "filename-to-sha256":
            entries = {
                str(name): {"sha256": digest, "bytes": None}
                for name, digest in payload.items()
            }
        else:
            result.error(f"unknown nested manifest format {manifest_format}: {relative}")
            continue
        base_path = Path(str(definition["basePath"]))
        for filename, expected in entries.items():
            child_relative = str(base_path / filename)
            item = indexed.get(child_relative)
            if item is None:
                result.error(f"nested artifact is absent from OS-00 inventory: {child_relative}")
                continue
            if str(item["sha256"]) != str(expected["sha256"]):
                result.error(f"nested artifact hash disagrees with OS-00 inventory: {child_relative}")
            if expected["bytes"] is not None and int(item["bytes"]) != int(expected["bytes"]):
                result.error(f"nested artifact byte count disagrees with OS-00 inventory: {child_relative}")


def json_pointer(payload: Any, pointer: str) -> Any:
    if pointer == "":
        return payload
    if not pointer.startswith("/"):
        raise ValueError("JSON pointer must be empty or begin with /")
    current = payload
    for raw_token in pointer[1:].split("/"):
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, Sequence) and not isinstance(current, (str, bytes, bytearray)):
            current = current[int(token)]
        elif isinstance(current, Mapping):
            current = current[token]
        else:
            raise KeyError(token)
    return current


def verify_status_assertions(
    inventory: Mapping[str, Any],
    repo_root: Path,
    artifact_cache_root: Path | None,
    resolved: Mapping[str, Path],
    result: Verification,
) -> None:
    indexed = evidence_index(inventory)
    for assertion in inventory.get("statusAssertions", []):
        relative = str(assertion["path"])
        path = resolved.get(relative, repo_root / relative)
        if not path.is_file() and relative in indexed:
            path = resolve_evidence_object(indexed[relative], repo_root, artifact_cache_root)
        payload = load_json(path, result, f"status assertion {relative}")
        if payload is None:
            continue
        pointer = str(assertion["jsonPointer"])
        try:
            actual = json_pointer(payload, pointer)
        except (KeyError, IndexError, ValueError, TypeError) as error:
            result.error(f"status assertion path is absent: {relative}{pointer}: {error}")
            continue
        if actual != assertion["equals"]:
            result.error(
                f"status assertion failed: {relative}{pointer}: expected {assertion['equals']!r}, got {actual!r}"
            )


def verify_sources(
    inventory: Mapping[str, Any], source_cache_root: Path, result: Verification
) -> dict[str, Mapping[str, Any]]:
    contract = inventory["sourceCache"]
    index_path = source_cache_root / str(contract["indexPath"])
    if not result.verify_file(
        index_path,
        str(contract["indexSha256"]),
        int(contract["indexBytes"]),
        "source cache index",
    ):
        return {}
    payload = load_json(index_path, result, "source cache index")
    if not isinstance(payload, Mapping) or not isinstance(payload.get("sources"), Mapping):
        result.error(f"source cache index has no sources map: {index_path}")
        return {}
    if payload.get("version") != contract["expectedIndexVersion"]:
        result.error(
            f"source cache version mismatch: expected {contract['expectedIndexVersion']}, got {payload.get('version')}"
        )
    sources: Mapping[str, Mapping[str, Any]] = payload["sources"]
    if len(sources) != int(contract["expectedObjectCount"]):
        result.error(
            f"source object count mismatch: expected {contract['expectedObjectCount']}, got {len(sources)}"
        )
    declared_total = sum(int(entry["byte_count"]) for entry in sources.values())
    if declared_total != int(contract["expectedTotalObjectBytes"]):
        result.error(
            f"source declared byte total mismatch: expected {contract['expectedTotalObjectBytes']}, got {declared_total}"
        )
    for logical_name, entry in sorted(sources.items()):
        digest = str(entry["sha256"])
        object_name = str(entry["object"])
        if object_name != digest and not object_name.startswith(digest + "."):
            result.error(f"source object is not content-addressed: {logical_name}: {object_name}")
            continue
        path = resolve_source_object(source_cache_root, object_name, digest, int(entry["byte_count"]))
        if result.verify_file(path, digest, int(entry["byte_count"]), f"source object {logical_name}"):
            result.checked_source_objects += 1
    return dict(sources)


def verify_module_two_source_ledgers(
    inventory: Mapping[str, Any],
    repo_root: Path,
    artifact_cache_root: Path | None,
    sources: Mapping[str, Mapping[str, Any]],
    result: Verification,
) -> None:
    indexed = evidence_index(inventory)
    for relative in (
        "artifacts/model-lab/module-two/pre-replay-manifest.json",
        "artifacts/model-lab/module-two-v8/pre-replay-manifest.json",
    ):
        item = indexed.get(relative)
        if item is None:
            continue
        path = resolve_evidence_object(item, repo_root, artifact_cache_root)
        payload = load_json(path, result, f"Module 2 source ledger {relative}")
        if not isinstance(payload, Mapping) or not isinstance(payload.get("sourceObjects"), list):
            result.error(f"Module 2 source ledger is missing sourceObjects: {relative}")
            continue
        for ledger_item in payload["sourceObjects"]:
            logical_name = str(ledger_item["logicalName"])
            source = sources.get(logical_name)
            if source is None:
                result.error(f"Module 2 ledger references missing source: {relative}: {logical_name}")
                continue
            if str(ledger_item["sha256"]) != str(source["sha256"]):
                result.error(f"Module 2 source hash disagrees with cache: {relative}: {logical_name}")
            if int(ledger_item["byteCount"]) != int(source["byte_count"]):
                result.error(f"Module 2 source bytes disagree with cache: {relative}: {logical_name}")


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--artifact-cache-root", type=Path)
    parser.add_argument("--source-cache-root", type=Path)
    parser.add_argument("--scope", choices=("checkout", "artifacts", "sources", "all"), default="all")
    parser.add_argument("--require-git-tracked", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    repo_root = args.repo_root.resolve()
    manifest_path = args.manifest if args.manifest.is_absolute() else repo_root / args.manifest
    result = Verification()
    verify_inventory_digest(manifest_path, result)
    inventory = load_json(manifest_path, result, "OS-00 evidence inventory")
    if not isinstance(inventory, Mapping):
        inventory = {}

    artifact_cache_root = args.artifact_cache_root.resolve() if args.artifact_cache_root else None
    source_cache_root = (
        args.source_cache_root.resolve()
        if args.source_cache_root
        else repo_root / str(inventory.get("sourceCache", {}).get("defaultWorkingCopyPath", ""))
    )
    resolved: dict[str, Path] = {}
    sources: dict[str, Mapping[str, Any]] = {}

    if args.scope in {"checkout", "all"}:
        verify_checkout(inventory, repo_root, result, args.require_git_tracked)
    if args.scope in {"artifacts", "all"}:
        resolved = verify_artifacts(inventory, repo_root, artifact_cache_root, result)
        verify_nested_manifests(inventory, repo_root, artifact_cache_root, resolved, result)
        verify_status_assertions(inventory, repo_root, artifact_cache_root, resolved, result)
    if args.scope in {"sources", "all"}:
        sources = verify_sources(inventory, source_cache_root, result)
    if args.scope == "all" and sources:
        verify_module_two_source_ledgers(inventory, repo_root, artifact_cache_root, sources, result)

    payload = {
        "status": "pass" if not result.errors else "fail",
        "scope": args.scope,
        "checkedFiles": result.checked_files,
        "checkedBytes": result.checked_bytes,
        "checkedSourceObjects": result.checked_source_objects,
        "errors": result.errors,
        "warnings": result.warnings,
    }
    if args.json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(
            f"OS-00 evidence verification {payload['status']}: "
            f"{result.checked_files} files, {result.checked_bytes} bytes, "
            f"{result.checked_source_objects} source objects"
        )
        for message in result.errors:
            print(f"ERROR: {message}", file=sys.stderr)
        for message in result.warnings:
            print(f"WARNING: {message}", file=sys.stderr)
    return 0 if not result.errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
