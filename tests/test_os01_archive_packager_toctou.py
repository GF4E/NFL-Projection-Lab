from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "os01_archive_packager", ROOT / "scripts" / "package_os01_site_archive.py"
)
assert SPEC is not None and SPEC.loader is not None
PACKAGER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PACKAGER
SPEC.loader.exec_module(PACKAGER)

INSPECTOR_SPEC = importlib.util.spec_from_file_location(
    "os01_archive_inspector", ROOT / "scripts" / "inspect_site_archive.py"
)
assert INSPECTOR_SPEC is not None and INSPECTOR_SPEC.loader is not None
INSPECTOR = importlib.util.module_from_spec(INSPECTOR_SPEC)
sys.modules[INSPECTOR_SPEC.name] = INSPECTOR
INSPECTOR_SPEC.loader.exec_module(INSPECTOR)


class ArchivePackagerToctouTests(unittest.TestCase):
    def archive_fixture(self, directory: str, tracked_hosting: bytes, built_hosting: bytes) -> Path:
        root = Path(directory)
        (root / "dist" / "server").mkdir(parents=True)
        (root / "dist" / "server" / "index.js").write_bytes(b"qualified-worker")
        (root / "dist" / ".openai").mkdir(parents=True)
        (root / "dist" / ".openai" / "hosting.json").write_bytes(built_hosting)
        (root / ".openai").mkdir()
        (root / ".openai" / "hosting.json").write_bytes(tracked_hosting)
        return root

    def assert_replacement_rejected(self, replacement: bytes) -> None:
        with tempfile.TemporaryDirectory(prefix="os01-packager-swap-") as directory:
            path = Path(directory) / "input.js"
            path.write_bytes(b"qualified-input")
            bound = PACKAGER._bind_regular_file(path)
            try:
                replacement_path = Path(directory) / "replacement.js"
                replacement_path.write_bytes(replacement)
                os.replace(replacement_path, path)
                with self.assertRaisesRegex(
                    ValueError, "path, identity, or bytes changed"
                ):
                    PACKAGER._read_bound_input(bound)
            finally:
                os.close(bound.descriptor)

    def test_rejects_same_path_same_byte_replacement(self) -> None:
        self.assert_replacement_rejected(b"qualified-input")

    def test_rejects_same_path_different_byte_replacement(self) -> None:
        self.assert_replacement_rejected(b"unqualified-input")

    def test_reads_unchanged_bound_input(self) -> None:
        with tempfile.TemporaryDirectory(prefix="os01-packager-stable-") as directory:
            path = Path(directory) / "input.js"
            path.write_bytes(b"qualified-input")
            self.assertEqual(
                PACKAGER._read_stable_regular_file(path), b"qualified-input"
            )

    def test_deduplicates_identical_archive_paths(self) -> None:
        with tempfile.TemporaryDirectory(prefix="os01-packager-deduplicate-") as directory:
            root = self.archive_fixture(directory, b"same-hosting", b"same-hosting")
            entries = PACKAGER._entries(root)
            self.assertEqual(
                [path for path, _ in entries],
                ["dist/.openai/hosting.json", "dist/server/index.js"],
            )

    def test_rejects_conflicting_archive_paths(self) -> None:
        with tempfile.TemporaryDirectory(prefix="os01-packager-collision-") as directory:
            root = self.archive_fixture(directory, b"tracked-hosting", b"built-hosting")
            with self.assertRaisesRegex(
                ValueError, "archive path collision contains different bytes"
            ):
                PACKAGER._entries(root)

    def test_suffix_matching_uses_ascii_only_case_folding(self) -> None:
        self.assertTrue(
            INSPECTOR._is_nested_container("dist/client/asset.ZSTD", False)
        )
        self.assertFalse(
            INSPECTOR._is_nested_container("dist/client/asset.zſtd", False)
        )


if __name__ == "__main__":
    unittest.main()
