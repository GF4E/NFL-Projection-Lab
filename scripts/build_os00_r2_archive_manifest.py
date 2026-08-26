#!/usr/bin/env python3
"""Build the deterministic OS-00 R2 preservation manifest from frozen evidence.

The generator never downloads data. Every local object must already match a
tracked hash-and-byte contract before it can enter the archive manifest.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping


DEFAULT_INVENTORY = Path(".planning/engine-os/execution/os-00/evidence-inventory.json")
DEFAULT_R1_LEDGER = Path("artifacts/engine-os/r1/official-source-capture.csv")
DEFAULT_OUTPUT = Path(".planning/engine-os/execution/os-00/r2-archive-manifest.v1.json")
EXPERIMENT_IDS = {
    "module1": "module1.2026-08-24.4",
    "module2-legacy-invalid": "module2.2026-08-24.7",
    "module2": "module2.2026-08-25.8",
}
EXPECTED_INVENTORY_SHA256 = "1f13332c0f40953fdfe0b8f94a0522c87c9783405d8849a95357c1c2e0e4678d"
EXPECTED_R1_LEDGER_SHA256 = "21a3ea54c359c1acca68788c5af531144535d745485b8d6a54da1b32924d5b15"
EXPECTED_SOURCE_INDEX_SHA256 = "0a49ed9a11a31acfd2629496b1b86ba63206ddaebe0d809f3c2c1b27e19dc9c6"
EXPECTED_ARCHIVE_MANIFEST_SHA256 = "123da9434123d875c2f5505a85cd783a2cc8d5730d304986721b4809b57d604a"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_bytes(payload: Mapping[str, Any]) -> bytes:
    return (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")


def require_relative_path(value: str) -> str:
    path = PurePosixPath(value)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"unsafe archive path: {value}")
    return path.as_posix()


def require_local_object(root: Path, relative: str, expected_sha256: str, expected_bytes: int) -> None:
    path = root / require_relative_path(relative)
    if not path.is_file():
        raise FileNotFoundError(f"missing preservation object: {relative}")
    if path.stat().st_size != expected_bytes:
        raise ValueError(
            f"byte-count mismatch for {relative}: expected {expected_bytes}, got {path.stat().st_size}"
        )
    actual = sha256_file(path)
    if actual != expected_sha256:
        raise ValueError(f"sha256 mismatch for {relative}: expected {expected_sha256}, got {actual}")


def archive_object(
    *, category: str, local_path: str, r2_key: str, sha256: str, byte_count: int
) -> dict[str, Any]:
    local_path = require_relative_path(local_path)
    require_relative_path(r2_key)
    if len(sha256) != 64 or any(character not in "0123456789abcdef" for character in sha256):
        raise ValueError(f"invalid sha256 for {local_path}")
    if not r2_key.endswith(f"/{sha256}"):
        raise ValueError(f"R2 key is not content-addressed: {r2_key}")
    if byte_count <= 0:
        raise ValueError(f"invalid byte count for {local_path}: {byte_count}")
    return {
        "bytes": byte_count,
        "category": category,
        "localPath": local_path,
        "r2Key": r2_key,
        "sha256": sha256,
    }


def build_manifest(
    root: Path,
    inventory_path: Path = DEFAULT_INVENTORY,
    r1_ledger_path: Path = DEFAULT_R1_LEDGER,
) -> dict[str, Any]:
    inventory_path = root / inventory_path
    r1_ledger_path = root / r1_ledger_path
    if sha256_file(inventory_path) != EXPECTED_INVENTORY_SHA256:
        raise ValueError("OS-00 evidence inventory no longer matches the frozen contract")
    if sha256_file(r1_ledger_path) != EXPECTED_R1_LEDGER_SHA256:
        raise ValueError("R1 gamebook ledger no longer matches the frozen contract")
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    objects: list[dict[str, Any]] = []

    for item in inventory.get("evidenceObjects", []):
        module = str(item["module"])
        experiment_id = EXPERIMENT_IDS.get(module)
        if experiment_id is None:
            raise ValueError(f"unmapped experiment module: {module}")
        relative = str(item["path"])
        digest = str(item["sha256"])
        byte_count = int(item["bytes"])
        require_local_object(root, relative, digest, byte_count)
        objects.append(
            archive_object(
                category="model_lab_artifact",
                local_path=relative,
                r2_key=f"experiments/{experiment_id}/sha256/{digest}",
                sha256=digest,
                byte_count=byte_count,
            )
        )

    source_contract = inventory["sourceCache"]
    source_root = root / str(source_contract["defaultWorkingCopyPath"])
    source_index_relative = str(
        PurePosixPath(str(source_contract["defaultWorkingCopyPath"]))
        / str(source_contract["indexPath"])
    )
    source_index_sha256 = str(source_contract["indexSha256"])
    if source_index_sha256 != EXPECTED_SOURCE_INDEX_SHA256:
        raise ValueError("Module Lab source index no longer matches the frozen contract")
    source_index_bytes = int(source_contract["indexBytes"])
    require_local_object(root, source_index_relative, source_index_sha256, source_index_bytes)
    objects.append(
        archive_object(
            category="model_lab_source_index",
            local_path=source_index_relative,
            r2_key=f"model-lab/raw/index/sha256/{source_index_sha256}",
            sha256=source_index_sha256,
            byte_count=source_index_bytes,
        )
    )
    source_index = json.loads((source_root / str(source_contract["indexPath"])).read_text(encoding="utf-8"))
    sources = source_index.get("sources", {})
    if len(sources) != int(source_contract["expectedObjectCount"]):
        raise ValueError("source index object count disagrees with the frozen inventory")
    if sum(int(item["byte_count"]) for item in sources.values()) != int(
        source_contract["expectedTotalObjectBytes"]
    ):
        raise ValueError("source index byte total disagrees with the frozen inventory")
    for logical_name, item in sorted(sources.items()):
        digest = str(item["sha256"])
        object_name = str(item["object"])
        if object_name != digest and not object_name.startswith(digest + "."):
            raise ValueError(f"source object is not content-addressed: {logical_name}")
        relative = str(
            PurePosixPath(str(source_contract["defaultWorkingCopyPath"]))
            / str(source_contract["objectsDirectory"])
            / object_name
        )
        byte_count = int(item["byte_count"])
        require_local_object(root, relative, digest, byte_count)
        objects.append(
            archive_object(
                category="model_lab_source_object",
                local_path=relative,
                r2_key=f"model-lab/raw/sha256/{digest}",
                sha256=digest,
                byte_count=byte_count,
            )
        )

    with r1_ledger_path.open(newline="", encoding="utf-8") as source:
        gamebooks = list(csv.DictReader(source))
    if len(gamebooks) != 64:
        raise ValueError(f"R1 gamebook ledger must contain exactly 64 rows, got {len(gamebooks)}")
    if any(row.get("retrieval_status") != "captured" for row in gamebooks):
        raise ValueError("R1 gamebook ledger contains a non-captured row")
    for row in sorted(gamebooks, key=lambda item: str(item["game_id"])):
        relative = str(row["cache_object"])
        digest = str(row["official_gamebook_sha256"])
        byte_count = int(row["byte_count"])
        require_local_object(root, relative, digest, byte_count)
        objects.append(
            archive_object(
                category="r1_official_gamebook",
                local_path=relative,
                r2_key=f"raw/nfl/official-gamebook/sha256/{digest}",
                sha256=digest,
                byte_count=byte_count,
            )
        )

    objects.sort(key=lambda item: (str(item["category"]), str(item["localPath"])))
    keys = [str(item["r2Key"]) for item in objects]
    local_paths = [str(item["localPath"]) for item in objects]
    if len(keys) != len(set(keys)):
        raise ValueError("R2 preservation manifest contains duplicate object keys")
    if len(local_paths) != len(set(local_paths)):
        raise ValueError("R2 preservation manifest contains duplicate local paths")
    if len(objects) != 117:
        raise ValueError(f"expected 117 preservation objects, got {len(objects)}")

    category_totals: dict[str, dict[str, int]] = {}
    for item in objects:
        totals = category_totals.setdefault(str(item["category"]), {"bytes": 0, "objects": 0})
        totals["bytes"] += int(item["bytes"])
        totals["objects"] += 1
    total_bytes = sum(int(item["bytes"]) for item in objects)
    if total_bytes != 630_716_255:
        raise ValueError(f"expected 630716255 preservation bytes, got {total_bytes}")

    return {
        "categoryTotals": category_totals,
        "contracts": {
            "evidenceInventory": {
                "path": str(inventory_path.relative_to(root)),
                "sha256": sha256_file(inventory_path),
            },
            "r1GamebookLedger": {
                "path": str(r1_ledger_path.relative_to(root)),
                "sha256": sha256_file(r1_ledger_path),
            },
            "sourceIndexSha256": source_index_sha256,
        },
        "hashAlgorithm": "sha256",
        "objectCount": len(objects),
        "objects": objects,
        "schemaVersion": "engine-os.os-00-r2-archive-manifest.v1",
        "totalBytes": total_bytes,
    }


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    root = args.repo_root.resolve()
    output = args.output if args.output.is_absolute() else root / args.output
    payload = build_manifest(root)
    data = canonical_bytes(payload)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    if digest != EXPECTED_ARCHIVE_MANIFEST_SHA256:
        raise ValueError(
            f"archive manifest changed from the reviewed contract: expected "
            f"{EXPECTED_ARCHIVE_MANIFEST_SHA256}, got {digest}"
        )
    output.with_suffix(".sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
    print(
        f"OS-00 R2 manifest: {payload['objectCount']} objects, "
        f"{payload['totalBytes']} bytes, sha256 {digest}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
