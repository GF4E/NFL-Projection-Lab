"""Fail-closed unit tests for the OS-00 archive/restore client."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("os00_r2_archive", ROOT / "scripts/os00_r2_archive.py")
assert SPEC and SPEC.loader
ARCHIVE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ARCHIVE
SPEC.loader.exec_module(ARCHIVE)


def write_manifest(directory: Path, objects: list[dict[str, object]]) -> Path:
    path = directory / "manifest.json"
    payload = {
        "schemaVersion": "engine-os.os-00-r2-archive-manifest.v1",
        "objectCount": len(objects),
        "totalBytes": sum(int(item["bytes"]) for item in objects),
        "objects": objects,
    }
    path.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    path.with_suffix(".sha256").write_text(f"{digest}  {path.name}\n", encoding="utf-8")
    return path


class ArchiveContractTests(unittest.TestCase):
    def test_rejects_path_traversal(self) -> None:
        for value in ("../secret", "/absolute", "safe/../secret"):
            with self.assertRaises(ValueError):
                ARCHIVE.safe_relative_path(value)

    def test_rejects_tampered_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            path = write_manifest(directory, [])
            path.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "digest mismatch"):
                ARCHIVE.load_manifest(path)

    def test_local_verification_detects_corruption(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            evidence = b"frozen evidence"
            digest = hashlib.sha256(evidence).hexdigest()
            target = root / "cache/object.bin"
            target.parent.mkdir(parents=True)
            target.write_bytes(evidence)
            objects = [{
                "localPath": "cache/object.bin",
                "r2Key": f"model-lab/raw/sha256/{digest}",
                "sha256": digest,
                "bytes": len(evidence),
            }]
            self.assertEqual(ARCHIVE.verify_local(root, objects, 1)["objects"], 1)
            target.write_bytes(b"corrupt")
            with self.assertRaisesRegex(RuntimeError, "byte mismatch"):
                ARCHIVE.verify_local(root, objects, 1)

    def test_restore_refuses_to_overwrite_a_corrupt_destination(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            expected = b"expected"
            digest = hashlib.sha256(expected).hexdigest()
            target = root / "cache/object.bin"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"wrong")
            item = {
                "localPath": "cache/object.bin",
                "r2Key": f"model-lab/raw/sha256/{digest}",
                "sha256": digest,
                "bytes": len(expected),
            }
            endpoint = ARCHIVE.parse_endpoint(
                "http://localhost/__engine-os/evidence-archive/v1/object"
            )
            with self.assertRaisesRegex(RuntimeError, "refusing to overwrite"):
                ARCHIVE.download_object(endpoint, "x" * 32, root, item)


if __name__ == "__main__":
    unittest.main()
