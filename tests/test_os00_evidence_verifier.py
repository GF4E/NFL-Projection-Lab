from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
VERIFIER = REPOSITORY_ROOT / "scripts" / "verify_os00_evidence.py"


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


class Os00EvidenceVerifierTest(unittest.TestCase):
    def make_fixture(self, root: Path) -> Path:
        protocol = b"frozen protocol\n"
        artifact = b"frozen result\n"
        source_object = b"immutable source bytes\n"

        (root / "docs").mkdir()
        (root / "docs" / "protocol.txt").write_bytes(protocol)
        (root / "artifacts").mkdir()
        (root / "artifacts" / "result.bin").write_bytes(artifact)
        (root / "source-cache" / "objects").mkdir(parents=True)
        source_sha = digest(source_object)
        source_name = f"{source_sha}.bin"
        (root / "source-cache" / "objects" / source_name).write_bytes(source_object)
        source_index = {
            "version": 1,
            "sources": {
                "fixture": {
                    "byte_count": len(source_object),
                    "object": source_name,
                    "sha256": source_sha,
                    "url": "https://invalid.example/never-downloaded",
                }
            },
        }
        index_bytes = (json.dumps(source_index, indent=2, sort_keys=True) + "\n").encode()
        (root / "source-cache" / "source-index.json").write_bytes(index_bytes)

        inventory = {
            "schemaVersion": "prediction-engine-os-evidence-inventory-v1",
            "gitFiles": [
                {
                    "path": "docs/protocol.txt",
                    "bytes": len(protocol),
                    "sha256": digest(protocol),
                }
            ],
            "evidenceObjects": [
                {
                    "path": "artifacts/result.bin",
                    "bytes": len(artifact),
                    "sha256": digest(artifact),
                }
            ],
            "sourceCache": {
                "defaultWorkingCopyPath": "source-cache",
                "indexPath": "source-index.json",
                "indexBytes": len(index_bytes),
                "indexSha256": digest(index_bytes),
                "expectedIndexVersion": 1,
                "expectedObjectCount": 1,
                "expectedTotalObjectBytes": len(source_object),
            },
            "statusAssertions": [],
            "nestedManifests": [],
        }
        manifest_path = root / "inventory.json"
        manifest_bytes = (json.dumps(inventory, indent=2, sort_keys=True) + "\n").encode()
        manifest_path.write_bytes(manifest_bytes)
        manifest_path.with_suffix(".sha256").write_text(
            f"{digest(manifest_bytes)}  {manifest_path.name}\n", encoding="utf-8"
        )
        return manifest_path

    def run_verifier(self, root: Path, manifest: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(VERIFIER),
                "--repo-root",
                str(root),
                "--manifest",
                str(manifest),
                "--scope",
                "all",
                "--json",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_complete_fixture_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            completed = self.run_verifier(root, self.make_fixture(root))
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(json.loads(completed.stdout)["status"], "pass")

    def test_changed_artifact_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self.make_fixture(root)
            (root / "artifacts" / "result.bin").write_bytes(b"changed result\n")
            completed = self.run_verifier(root, manifest)
            self.assertNotEqual(completed.returncode, 0)
            payload = json.loads(completed.stdout)
            self.assertEqual(payload["status"], "fail")
            self.assertTrue(any("mismatch" in message for message in payload["errors"]))

    def test_missing_source_object_fails_without_downloading(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self.make_fixture(root)
            next((root / "source-cache" / "objects").iterdir()).unlink()
            completed = self.run_verifier(root, manifest)
            self.assertNotEqual(completed.returncode, 0)
            payload = json.loads(completed.stdout)
            self.assertTrue(any("missing source object" in message for message in payload["errors"]))


if __name__ == "__main__":
    unittest.main()
