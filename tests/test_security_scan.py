from __future__ import annotations

import gzip
import hashlib
import io
import importlib.util
import json
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "security_scan", ROOT / "scripts" / "security_scan.py"
)
assert SPEC is not None and SPEC.loader is not None
SECURITY_SCAN = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SECURITY_SCAN
SPEC.loader.exec_module(SECURITY_SCAN)


def archive_bytes(members: list[tuple[str, bytes]]) -> bytes:
    archive_buffer = io.BytesIO()
    with tarfile.open(fileobj=archive_buffer, mode="w") as archive:
        for name, payload in members:
            member = tarfile.TarInfo(name)
            member.size = len(payload)
            archive.addfile(member, io.BytesIO(payload))
    return archive_buffer.getvalue()


def gzip_with_comment(payload: bytes, comment: bytes) -> bytes:
    compressed = bytearray(gzip.compress(payload, mtime=0))
    compressed[3] |= 0x10
    return bytes(compressed[:10] + comment + b"\x00" + compressed[10:])


def gzip_with_filename(payload: bytes, filename: bytes) -> bytes:
    compressed = bytearray(gzip.compress(payload, mtime=0))
    compressed[3] |= 0x08
    return bytes(compressed[:10] + filename + b"\x00" + compressed[10:])


def legacy_tar_bytes(payload: bytes) -> bytes:
    archive = bytearray(10 * 1024)
    archive[0:10] = b"nested.txt"
    archive[100:108] = b"0000644\x00"
    archive[108:116] = b"0000000\x00"
    archive[116:124] = b"0000000\x00"
    archive[124:136] = f"{len(payload):011o}\0".encode("ascii")
    archive[136:148] = b"00000000000\x00"
    archive[148:156] = b" " * 8
    archive[156] = ord("0")
    archive[512:512 + len(payload)] = payload
    checksum = sum(archive[:512])
    archive[148:156] = f"{checksum:06o}\0 ".encode("ascii")
    return bytes(archive)


def tar_with_header_metadata(payload: bytes, metadata: bytes) -> bytes:
    archive = bytearray(archive_bytes([("safe.txt", payload)]))
    if len(metadata) > 32:
        raise ValueError("fixture metadata is too long")
    archive[265:297] = metadata.ljust(32, b"\x00")
    archive[148:156] = b" " * 8
    checksum = sum(archive[:512])
    archive[148:156] = f"{checksum:06o}\0 ".encode("ascii")
    return bytes(archive)


def scan_decoded_payloads(data: bytes, path: str):
    findings = []
    for payload_path, payload, issue in SECURITY_SCAN._scan_payloads(data, path):
        if issue is not None:
            findings.append(
                SECURITY_SCAN._control_finding(
                    scope="fixture", path=payload_path, rule=issue
                )
            )
        elif payload is not None:
            findings.extend(
                SECURITY_SCAN.scan_bytes(
                    payload, scope="fixture", path=payload_path
                )
            )
    return findings


class SecurityScanTest(unittest.TestCase):
    def test_scan_reports_metadata_without_retaining_a_credential_value(self) -> None:
        candidate = b"a1b2c3d4" + b"e5f6a7b8" + b"c9d0e1f2" + b"a3b4c5d6"
        payload = b"ODDS_API_KEY=" + candidate + b"\n"

        findings = SECURITY_SCAN.scan_bytes(
            payload, scope="fixture", path="fixture.env"
        )
        serialized = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()

        self.assertEqual(
            [finding.rule for finding in findings], ["secret_assignment"]
        )
        self.assertNotIn(candidate, serialized)
        self.assertTrue(all(not hasattr(finding, "value") for finding in findings))

    def test_scan_ignores_empty_placeholder_and_dynamic_provider_configuration(
        self,
    ) -> None:
        payload = b"\n".join(
            [
                b"ODDS_API_KEY=",
                b"ODDS_API_KEY=<set-in-server-environment>",
                b"const request = { apiKey: env.ODDS_API_KEY };",
                b"contact=owner@example.invalid",
            ]
        )

        self.assertEqual(
            SECURITY_SCAN.scan_bytes(payload, scope="fixture", path="safe.ts"), []
        )

    def test_scan_finds_personal_email_and_absolute_home_path_without_excerpt(
        self,
    ) -> None:
        email = b"person" + b"@mailhost.test"
        payload = email + b"\n/cache=/Users/local-user/private/output.json\n"  # secret-scan: allow-fixture

        findings = SECURITY_SCAN.scan_bytes(
            payload, scope="fixture", path="artifact.json"
        )
        serialized = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()

        self.assertEqual(
            {finding.rule for finding in findings},
            {"personal_email", "absolute_home_path"},
        )
        self.assertNotIn(email, serialized)
        self.assertNotIn(b"local-user", serialized)

    def test_package_version_specifier_is_not_mistaken_for_an_email(self) -> None:
        payload = b"vinext@1.0.0-beta.2"

        self.assertEqual(
            SECURITY_SCAN.scan_bytes(payload, scope="fixture", path="lock.yaml"),
            [],
        )

    def test_gzip_artifacts_are_decoded_before_scanning(self) -> None:
        candidate = b"z9y8x7w6" + b"v5u4t3s2" + b"r1q0p9o8"
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "manifest.json.gz"
            artifact.write_bytes(gzip.compress(b"Bearer " + candidate))

            decoded = SECURITY_SCAN._read_text_payload(artifact)
            self.assertIsNotNone(decoded)
            findings = SECURITY_SCAN.scan_bytes(
                decoded, scope="fixture", path="manifest.json.gz"
            )

        self.assertEqual(
            [finding.rule for finding in findings], ["bearer_token_literal"]
        )

    def test_tar_gzip_members_are_scanned_without_extraction(self) -> None:
        candidate = b"q1w2e3r4" + b"t5y6u7i8" + b"o9p0a1s2"
        member_payload = b"Bearer " + candidate + b"\n"
        payloads = list(
            SECURITY_SCAN._scan_payloads(
                gzip.compress(
                    archive_bytes([("dist/server/manifest.txt", member_payload)]),
                    mtime=0,
                ),
                "site.tar.gz",
            )
        )
        self.assertTrue(any(path.endswith("-name") for path, _data, _issue in payloads))
        self.assertTrue(any(path.endswith("-content") for path, _data, _issue in payloads))
        self.assertTrue(any("tar-envelope" in path for path, _data, _issue in payloads))
        findings = scan_decoded_payloads(
            gzip.compress(
                archive_bytes([("dist/server/manifest.txt", member_payload)]),
                mtime=0,
            ),
            "site.tar.gz",
        )
        serialized = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()
        self.assertEqual(
            [finding.rule for finding in findings], ["bearer_token_literal"]
        )
        self.assertNotIn(candidate, serialized)

    def test_multilevel_nested_tar_members_are_scanned_recursively(self) -> None:
        candidate = b"n1e2s3t4" + b"e5d6a7r8" + b"c9h0i1v2"
        inner = archive_bytes([("evidence.txt", b"Bearer " + candidate)])
        middle = archive_bytes([("opaque.bin", inner)])
        outer = archive_bytes([("also-opaque.bin", middle)])

        findings = scan_decoded_payloads(outer, "site.tar")
        serialized = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()

        self.assertEqual(
            [item.rule for item in findings], ["bearer_token_literal"]
        )
        self.assertNotIn(candidate, serialized)
        self.assertNotIn(b"evidence.txt", serialized)

    def test_nested_gzip_tar_is_detected_without_an_archive_extension(self) -> None:
        candidate = b"o1p2a3q4" + b"u5e6g7z8" + b"i9p0x1y2"
        nested = gzip.compress(
            archive_bytes([("payload.txt", b"Bearer " + candidate)]),
            mtime=0,
        )

        findings = scan_decoded_payloads(
            archive_bytes([("opaque.bin", nested)]), "site.tar"
        )

        self.assertEqual(
            [item.rule for item in findings], ["bearer_token_literal"]
        )

    def test_gzip_wrapped_zip_fails_closed(self) -> None:
        wrapped = gzip.compress(b"PK\x05\x06" + b"\x00" * 18, mtime=0)

        findings = scan_decoded_payloads(wrapped, "opaque.gz")

        self.assertEqual(
            [item.rule for item in findings], ["archive_format_unsupported"]
        )

    def test_known_unsupported_compression_suffixes_fail_closed(self) -> None:
        for path in ("payload.br", "payload.tar.br", "payload.xz", "payload.rar"):
            with self.subTest(path=path):
                findings = scan_decoded_payloads(b"opaque", path)
                self.assertEqual(
                    [item.rule for item in findings], ["archive_format_unsupported"]
                )

    def test_prefixed_zip_signature_fails_closed(self) -> None:
        prefixed = b"safe-prefix" + b"PK\x03\x04" + b"\x00" * 32

        findings = scan_decoded_payloads(prefixed, "opaque.bin")

        self.assertEqual(
            [item.rule for item in findings], ["archive_format_unsupported"]
        )

    def test_prefixed_gzip_signature_fails_closed(self) -> None:
        prefixed = b"safe-prefix" + gzip.compress(b"opaque", mtime=0)

        findings = scan_decoded_payloads(prefixed, "opaque.bin")

        self.assertEqual(
            [item.rule for item in findings], ["archive_format_unsupported"]
        )

    def test_nul_prefixed_binary_is_still_scanned_as_raw_bytes(self) -> None:
        candidate = b"b1i2n3a4" + b"r5y6x7y8" + b"z9q0r1s2"
        findings = scan_decoded_payloads(
            b"\x00\x01opaque\x00Bearer " + candidate,
            "payload.bin",
        )
        rendered = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()

        self.assertEqual(
            [item.rule for item in findings], ["bearer_token_literal"]
        )
        self.assertNotIn(candidate, rendered)

    def test_text_source_that_defines_archive_signatures_remains_text(self) -> None:
        source = (
            b'ZIP = b"PK\\x03\\x04"\n'
            b'BZIP = b"BZh"\n'
            b'RAR = b"Rar!\\x1a\\x07"\n'
        )

        payloads = list(SECURITY_SCAN._scan_payloads(source, "scanner.py"))

        self.assertEqual(payloads, [("scanner.py", source, None)])

    def test_nested_archive_depth_limit_fails_closed(self) -> None:
        inner = archive_bytes([("safe.txt", b"safe")])
        middle = archive_bytes([("opaque.bin", inner)])
        outer = archive_bytes([("also-opaque.bin", middle)])

        with mock.patch.object(
            SECURITY_SCAN, "MAX_ARCHIVE_RECURSION_DEPTH", 1
        ):
            findings = scan_decoded_payloads(outer, "site.tar")

        self.assertIn(
            "archive_recursion_limit", {item.rule for item in findings}
        )

    def test_nested_archive_member_limit_is_global_and_fails_closed(self) -> None:
        nested = archive_bytes(
            [("one.txt", b"safe"), ("two.txt", b"also safe")]
        )
        outer = archive_bytes([("opaque.bin", nested)])

        with mock.patch.object(SECURITY_SCAN, "MAX_ARCHIVE_MEMBER_COUNT", 2):
            findings = scan_decoded_payloads(outer, "site.tar")

        self.assertIn("archive_member_limit", {item.rule for item in findings})

    def test_nested_archive_expanded_byte_limit_fails_closed(self) -> None:
        nested = archive_bytes([("safe.txt", b"safe")])
        outer = archive_bytes([("opaque.bin", nested)])

        with mock.patch.object(
            SECURITY_SCAN, "MAX_ARCHIVE_EXPANDED_BYTES", len(nested) - 1
        ):
            findings = scan_decoded_payloads(outer, "site.tar")

        self.assertIn(
            "archive_expanded_oversize", {item.rule for item in findings}
        )

    def test_malformed_and_truncated_gzip_fail_closed(self) -> None:
        valid = gzip.compress(b"safe", mtime=0)
        cases = (b"not-a-gzip-stream", valid[:-4], valid + b"trailing")

        for payload in cases:
            with self.subTest(length=len(payload)):
                decoded = list(
                    SECURITY_SCAN._scan_payloads(payload, "artifact.json.gz")
                )
                self.assertEqual(len(decoded), 1)
                self.assertEqual(decoded[0][1], None)
                self.assertEqual(decoded[0][2], "compressed_payload_invalid")

    def test_gzip_optional_header_metadata_is_scanned(self) -> None:
        candidate = b"g1z2i3p4" + b"h5e6a7d8" + b"e9r0x1y2"
        data = gzip_with_comment(b"safe", b"Bearer " + candidate)

        findings = scan_decoded_payloads(data, "opaque.gz")
        rendered = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()

        self.assertIn("bearer_token_literal", {item.rule for item in findings})
        self.assertNotIn(candidate, rendered)

    def test_credential_named_gzip_filename_blocks_before_inflate(self) -> None:
        data = gzip_with_filename(b"body must not inflate", b".env.local")

        with mock.patch.object(
            SECURITY_SCAN.zlib,
            "decompressobj",
            side_effect=AssertionError("credential-named gzip body was inflated"),
        ):
            findings = scan_decoded_payloads(data, "safe.gz")

        self.assertEqual(
            [item.rule for item in findings], ["credential_named_storage_path"]
        )
        self.assertNotIn(b".env.local", json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode())

    def test_tar_header_metadata_and_padding_are_scanned(self) -> None:
        metadata_candidate = b"m1e2t3a4" + b"d5a6t7a8" + b"x9y0z1q2"
        padding_candidate = b"p1a2d3d4" + b"i5n6g7x8" + b"y9z0q1r2"
        metadata_archive = tar_with_header_metadata(
            b"safe", b"Bearer " + metadata_candidate
        )
        padding_archive = bytearray(archive_bytes([("safe.txt", b"x")]))
        padding_archive[513:513 + 7 + len(padding_candidate)] = (
            b"Bearer " + padding_candidate
        )

        metadata_findings = scan_decoded_payloads(metadata_archive, "metadata.tar")
        padding_findings = scan_decoded_payloads(bytes(padding_archive), "padding.tar")
        rendered = json.dumps([
            SECURITY_SCAN.asdict(item)
            for item in metadata_findings + padding_findings
        ]).encode()

        self.assertIn("bearer_token_literal", {item.rule for item in metadata_findings})
        self.assertIn("bearer_token_literal", {item.rule for item in padding_findings})
        self.assertNotIn(metadata_candidate, rendered)
        self.assertNotIn(padding_candidate, rendered)

    def test_malformed_and_truncated_tar_fail_closed(self) -> None:
        valid = archive_bytes([("safe.txt", b"safe")])
        cases = (b"not-a-tar-stream", valid[:1536])

        for payload in cases:
            with self.subTest(length=len(payload)):
                payloads = list(
                    SECURITY_SCAN._scan_payloads(payload, "site.tar")
                )
                self.assertIn(
                    "archive_payload_invalid",
                    [issue for _path, _data, issue in payloads],
                )

    def test_prefixed_legacy_tar_is_detected_and_rejected_fail_closed(self) -> None:
        candidate = b"l1e2g3a4" + b"c5y6t7a8" + b"r9x0y1z2"
        legacy = legacy_tar_bytes(b"Bearer " + candidate)
        self.assertNotIn(b"ustar", legacy)

        findings = scan_decoded_payloads(
            b"opaque-prefix" + legacy,
            "renamed.bin",
        )

        self.assertIn("archive_payload_invalid", {item.rule for item in findings})

    def test_prefixed_ustar_is_detected_and_rejected_fail_closed(self) -> None:
        findings = scan_decoded_payloads(
            b"opaque-prefix" + archive_bytes([("safe.txt", b"safe")]),
            "renamed.bin",
        )

        self.assertIn("archive_payload_invalid", {item.rule for item in findings})

    def test_oversize_tar_member_is_blocked_and_later_member_is_scanned(self) -> None:
        oversize = b"x" * (SECURITY_SCAN.MAX_SCAN_BYTES + 1)
        candidate = b"m1n2b3v4" + b"c5x6z7a8" + b"s9d0f1g2"
        data = archive_bytes(
            [
                ("large.bin", oversize),
                ("later.txt", b"Bearer " + candidate),
            ]
        )

        findings = scan_decoded_payloads(data, "site.tar")
        serialized = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()

        self.assertIn("archive_member_oversize", {item.rule for item in findings})
        self.assertIn("bearer_token_literal", {item.rule for item in findings})
        self.assertNotIn(candidate, serialized)

    def test_archive_member_name_is_scanned_but_redacted_from_findings(self) -> None:
        candidate = b"h1j2k3l4" + b"m5n6p7q8" + b"r9s0t1u2"
        member_name = (b"reports/Bearer " + candidate + b".txt").decode("ascii")

        findings = scan_decoded_payloads(
            archive_bytes([(member_name, b"safe")]), "site.tar"
        )
        serialized = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()

        self.assertTrue(findings)
        self.assertEqual(
            {item.rule for item in findings}, {"bearer_token_literal"}
        )
        self.assertNotIn(candidate, serialized)
        self.assertNotIn(member_name.encode(), serialized)
        self.assertRegex(findings[0].path, r"member-000000-[0-9a-f]{16}-name$")

    def test_credential_named_archive_member_is_blocked_without_payload_access(self) -> None:
        candidate = b"never-open-this-payload"
        data = archive_bytes([("dist/.env.production", candidate)])

        original_scan_bytes = SECURITY_SCAN.scan_bytes

        def guarded_scan_bytes(payload, **kwargs):
            if candidate in payload:
                raise AssertionError("credential archive body reached scan_bytes")
            return original_scan_bytes(payload, **kwargs)

        with mock.patch.object(
            SECURITY_SCAN.tarfile.TarFile,
            "extractfile",
            side_effect=AssertionError("credential archive member was opened"),
        ), mock.patch.object(
            SECURITY_SCAN,
            "scan_bytes",
            side_effect=guarded_scan_bytes,
        ):
            findings = scan_decoded_payloads(data, "site.tar")

        self.assertEqual(
            [item.rule for item in findings], ["credential_named_storage_path"]
        )
        rendered = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()
        self.assertNotIn(candidate, rendered)
        self.assertNotIn(b".env.production", rendered)

    def test_tracked_symlink_is_blocked_without_following_outside_target(self) -> None:
        candidate = b"w1e2r3t4" + b"y5u6i7o8" + b"p9a0s1d2"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            outside = Path(directory) / "outside.txt"
            outside.write_bytes(b"Bearer " + candidate)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            link = root / "tracked-link"
            link.symlink_to(outside)
            subprocess.run(
                ["git", "add", "tracked-link"], cwd=root, check=True
            )

            findings = SECURITY_SCAN.scan_working_tree(
                root, include_ignored_outputs=False
            )

        serialized = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()
        self.assertEqual(
            [item.rule for item in findings], ["working_tree_symlink"]
        )
        self.assertNotIn(candidate, serialized)

    def test_working_tree_archive_integrity_issue_becomes_blocker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            artifact = root / "broken.tar"
            artifact.write_bytes(b"not-a-tar-stream")
            subprocess.run(["git", "add", "broken.tar"], cwd=root, check=True)

            findings = SECURITY_SCAN.scan_working_tree(
                root, include_ignored_outputs=False
            )

        self.assertEqual(
            [(item.rule, item.category, item.severity) for item in findings],
            [("archive_payload_invalid", "security_control", "blocker")],
        )

    def test_working_tree_scope_is_tracked_only(self) -> None:
        candidate = b"q1w2e3r4" + b"t5y6u7i8" + b"o9p0a1s2"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            (root / "tracked.txt").write_text("safe\n", encoding="utf-8")
            (root / "untracked.txt").write_bytes(b"Bearer " + candidate)
            subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)

            paths = SECURITY_SCAN.working_tree_paths(root)
            findings = SECURITY_SCAN.scan_working_tree(root)

        self.assertEqual([path.name for path in paths], ["tracked.txt"])
        self.assertEqual(findings, [])

    def test_tracked_env_example_is_scanned_as_source_not_secret_storage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            (root / ".env.example").write_text("ODDS_API_KEY=\n", encoding="utf-8")
            subprocess.run(["git", "add", ".env.example"], cwd=root, check=True)

            findings = SECURITY_SCAN.scan_working_tree(root)

        self.assertEqual(findings, [])

    def test_credential_named_build_output_is_blocked_without_being_opened(self) -> None:
        candidate = b"q1w2e3r4" + b"t5y6u7i8" + b"o9p0a1s2"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            build = root / "dist"
            build.mkdir()
            credential = build / ".env.production"
            credential.write_bytes(b"ODDS_API_KEY=" + candidate + b"\n")
            (root / ".gitignore").write_text("dist/\n", encoding="utf-8")
            subprocess.run(["git", "add", ".gitignore"], cwd=root, check=True)

            findings = SECURITY_SCAN.scan_working_tree(
                root, include_ignored_outputs=True
            )

        self.assertEqual(
            [(item.path, item.rule) for item in findings],
            [("dist/.env.production", "credential_named_storage_path")],
        )
        self.assertNotIn(candidate, json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode())

    def test_tracked_credential_storage_path_is_blocked_without_payload_access(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            credential = root / "credentials.json"
            credential.write_text("not opened\n", encoding="utf-8")
            subprocess.run(["git", "add", "credentials.json"], cwd=root, check=True)

            with mock.patch.object(
                SECURITY_SCAN,
                "_path_scan_payloads",
                side_effect=AssertionError("credential payload was opened"),
            ):
                findings = SECURITY_SCAN.scan_working_tree(root)

        self.assertEqual(
            [(item.path, item.rule) for item in findings],
            [("credentials.json", "credential_named_storage_path")],
        )
        self.assertTrue(SECURITY_SCAN._credential_gate_failed(findings))

    def test_credential_shaped_working_tree_path_is_redacted_and_not_opened(self) -> None:
        candidate = b"p1a2t3h4" + b"c5r6e7d8" + b"x9y0z1q2"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            name = (b"Bearer " + candidate + b".txt").decode("ascii")
            (root / name).write_text("must not open\n", encoding="utf-8")
            subprocess.run(["git", "add", name], cwd=root, check=True)

            with mock.patch.object(
                SECURITY_SCAN,
                "_path_scan_payloads",
                side_effect=AssertionError("credential-shaped path payload was opened"),
            ):
                findings = SECURITY_SCAN.scan_working_tree(root)

        rendered = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()
        self.assertEqual([item.rule for item in findings], ["bearer_token_literal"])
        self.assertRegex(findings[0].path, r"^<working_tree_path-path-[0-9a-f]{16}>$")
        self.assertNotIn(candidate, rendered)

    def test_fixture_marker_cannot_suppress_a_credential_shaped_path(self) -> None:
        candidate = b"m1a2r3k4" + b"e5r6p7a8" + b"t9h0x1y2"
        findings, display, blocked = SECURITY_SCAN._scan_path_identity(
            (b"Bearer " + candidate + b" secret-scan: allow-fixture.txt").decode("ascii"),
            scope="working_tree_path",
        )

        self.assertTrue(blocked)
        self.assertEqual([item.rule for item in findings], ["bearer_token_literal"])
        self.assertRegex(display, r"^<working_tree_path-path-[0-9a-f]{16}>$")

    def test_credential_gate_fails_closed_on_uninspectable_security_controls(self) -> None:
        findings = [
            SECURITY_SCAN._control_finding(
                scope="fixture",
                path="opaque.bin",
                rule="archive_payload_invalid",
            )
        ]

        self.assertTrue(SECURITY_SCAN._credential_gate_failed(findings))
        self.assertFalse(SECURITY_SCAN._credential_gate_failed([]))

    def test_history_credential_storage_path_is_blocked_without_blob_access(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "fixture"], cwd=root, check=True)
            subprocess.run(
                ["git", "config", "user.email", "fixture@example.invalid"],
                cwd=root,
                check=True,
            )
            (root / "credentials.json").write_text("not opened\n", encoding="utf-8")
            subprocess.run(["git", "add", "credentials.json"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "fixture"], cwd=root, check=True)
            object_paths = SECURITY_SCAN._reachable_object_paths(root)
            self.assertEqual(set(object_paths.values()), {("credentials.json",)})

            with mock.patch.object(
                SECURITY_SCAN, "_reachable_object_paths", return_value=object_paths
            ), mock.patch.object(
                SECURITY_SCAN.subprocess, "Popen",
                side_effect=AssertionError("credential blob was opened")
            ):
                findings = SECURITY_SCAN.scan_git_history(root)

        self.assertEqual(
            [(item.path, item.rule) for item in findings],
            [("credentials.json", "credential_named_storage_path")],
        )

    def test_history_blob_with_safe_and_credential_alias_is_never_opened(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "fixture"], cwd=root, check=True)
            subprocess.run(
                ["git", "config", "user.email", "fixture@example.invalid"],
                cwd=root,
                check=True,
            )
            (root / "safe.txt").write_text("same bytes\n", encoding="utf-8")
            subprocess.run(["git", "add", "safe.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "safe"], cwd=root, check=True)
            (root / "credentials.json").write_text("same bytes\n", encoding="utf-8")
            subprocess.run(["git", "add", "credentials.json"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "alias"], cwd=root, check=True)

            object_paths = SECURITY_SCAN._reachable_object_paths(root)
            aliased = [
                (object_id, aliases)
                for object_id, aliases in object_paths.items()
                if "credentials.json" in aliases
            ]
            self.assertEqual(len(aliased), 1)
            self.assertIn("safe.txt", aliased[0][1])

            with mock.patch.object(
                SECURITY_SCAN,
                "_reachable_object_paths",
                return_value=object_paths,
            ), mock.patch.object(
                SECURITY_SCAN.subprocess,
                "Popen",
                side_effect=AssertionError("aliased credential blob was opened"),
            ):
                findings = SECURITY_SCAN.scan_git_history(root)

        self.assertEqual(
            [(item.path, item.rule) for item in findings],
            [("credentials.json", "credential_named_storage_path")],
        )

    def test_history_alias_uses_the_most_restrictive_container_hint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "fixture"], cwd=root, check=True)
            subprocess.run(
                ["git", "config", "user.email", "fixture@example.invalid"],
                cwd=root,
                check=True,
            )
            (root / "safe.bin").write_bytes(b"opaque")
            subprocess.run(["git", "add", "safe.bin"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "safe"], cwd=root, check=True)
            (root / "payload.br").write_bytes(b"opaque")
            subprocess.run(["git", "add", "payload.br"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "container alias"], cwd=root, check=True)

            findings = SECURITY_SCAN.scan_git_history(root)

        self.assertIn(
            ("payload.br", "archive_format_unsupported"),
            {(item.path, item.rule) for item in findings},
        )

    def test_credential_shaped_history_alias_is_redacted_and_not_opened(self) -> None:
        candidate = b"h1i2s3t4" + b"p5a6t7h8" + b"x9y0z1q2"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "fixture"], cwd=root, check=True)
            subprocess.run(
                ["git", "config", "user.email", "fixture@example.invalid"],
                cwd=root,
                check=True,
            )
            name = (b"Bearer " + candidate + b".txt").decode("ascii")
            (root / name).write_text("must not open\n", encoding="utf-8")
            subprocess.run(["git", "add", name], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "sensitive path"], cwd=root, check=True)
            object_paths = SECURITY_SCAN._reachable_object_paths(root)

            with mock.patch.object(
                SECURITY_SCAN,
                "_reachable_object_paths",
                return_value=object_paths,
            ), mock.patch.object(
                SECURITY_SCAN.subprocess,
                "Popen",
                side_effect=AssertionError("credential-shaped history alias was opened"),
            ):
                findings = SECURITY_SCAN.scan_git_history(root)

        rendered = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()
        self.assertEqual([item.rule for item in findings], ["bearer_token_literal"])
        self.assertRegex(findings[0].path, r"^<git_history_path-path-[0-9a-f]{16}>$")
        self.assertNotIn(candidate, rendered)

    def test_direct_blob_ref_is_scanned_under_a_redacted_path(self) -> None:
        candidate = b"d1i2r3e4" + b"c5t6b7l8" + b"o9b0x1y2"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            blob = subprocess.run(
                ["git", "hash-object", "-w", "--stdin"],
                cwd=root,
                check=True,
                input=b"Bearer " + candidate,
                stdout=subprocess.PIPE,
            ).stdout.decode("ascii").strip()
            subprocess.run(
                ["git", "update-ref", "refs/qualification/direct-blob", blob],
                cwd=root,
                check=True,
            )

            findings = SECURITY_SCAN.scan_git_history(root)

        rendered = json.dumps(
            [SECURITY_SCAN.asdict(item) for item in findings]
        ).encode()
        self.assertEqual(
            [(item.path, item.rule) for item in findings],
            [("<pathless-reachable-blob>", "bearer_token_literal")],
        )
        self.assertNotIn(candidate, rendered)

    def test_git_replace_ref_cannot_hide_original_history(self) -> None:
        candidate = b"r1e2p3l4" + b"a5c6e7x8" + b"y9z0q1r2"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "fixture"], cwd=root, check=True)
            subprocess.run(
                ["git", "config", "user.email", "fixture@example.invalid"],
                cwd=root,
                check=True,
            )
            (root / "history.txt").write_bytes(b"Bearer " + candidate)
            subprocess.run(["git", "add", "history.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "original"], cwd=root, check=True)
            original = subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=root, check=True, stdout=subprocess.PIPE
            ).stdout.decode("ascii").strip()
            (root / "history.txt").write_text("safe\n", encoding="utf-8")
            subprocess.run(["git", "add", "history.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "replacement"], cwd=root, check=True)
            replacement = subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=root, check=True, stdout=subprocess.PIPE
            ).stdout.decode("ascii").strip()
            subprocess.run(["git", "replace", original, replacement], cwd=root, check=True)

            findings = SECURITY_SCAN.scan_git_history(root)

        self.assertIn("bearer_token_literal", {item.rule for item in findings})

    def test_qualification_git_environment_is_closed(self) -> None:
        self.assertEqual(
            SECURITY_SCAN._git_environment(),
            {
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_GRAFT_FILE": "/dev/null",
                "GIT_NO_REPLACE_OBJECTS": "1",
                "GIT_TERMINAL_PROMPT": "0",
                "LANG": "C",
                "LC_ALL": "C",
                "PATH": "/usr/bin:/bin",
            },
        )

    def test_bounded_history_quarantine_remains_reported_and_cannot_expand(self) -> None:
        candidate = b"q1u2a3r4" + b"a5n6t7i8" + b"n9e0x1y2"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "fixture"], cwd=root, check=True)
            subprocess.run(
                ["git", "config", "user.email", "fixture@example.invalid"],
                cwd=root,
                check=True,
            )
            source = root / "fixture.txt"
            source.write_bytes(b"https://provider.invalid/data?apiKey=" + candidate)
            subprocess.run(["git", "add", "fixture.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "historical fixture"], cwd=root, check=True)
            blob = subprocess.run(
                ["git", "rev-parse", "HEAD:fixture.txt"],
                cwd=root,
                check=True,
                stdout=subprocess.PIPE,
            ).stdout.decode("ascii").strip()
            source.write_text("safe\n", encoding="utf-8")
            subprocess.run(["git", "add", "fixture.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "current safe"], cwd=root, check=True)

            config = root / "config"
            config.mkdir()
            manifest_path = config / "os01-history-quarantine.v1.json"
            manifest = {
                "version": "os01-history-quarantine.2026.1",
                "scannerVersion": SECURITY_SCAN.SCANNER_VERSION,
                "scannerSha256": hashlib.sha256(
                    Path(SECURITY_SCAN.__file__).read_bytes()
                ).hexdigest(),
                "status": "bounded_quarantined_unknown",
                "packageBoundary": "OS-01_provider_free_only",
                "providerUseAllowed": False,
                "qualifiesGitHistoryCredentialClean": False,
                "ownerRotationContext": "owner_attested_replacement_key_rotated_before_os01",
                "ownerRotationContextIsBlobProof": False,
                "entries": [{
                    "blob": blob,
                    "scope": "git_history",
                    "path": "fixture.txt",
                    "line": 1,
                    "rule": "query_string_credential",
                    "category": "credential",
                    "severity": "blocker",
                    "status": "quarantined_unknown",
                }],
            }
            manifest_path.write_text(
                json.dumps(manifest, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            subprocess.run(["git", "add", str(manifest_path.relative_to(root))], cwd=root, check=True)
            subprocess.run(["git", "commit", "-q", "-m", "quarantine"], cwd=root, check=True)

            def run_gate(*extra: str):
                report_path = root / "report.json"
                report_path.unlink(missing_ok=True)
                result = subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / "scripts/security_scan.py"),
                        "--root", str(root),
                        "--tracked-working-tree-only",
                        "--history-quarantine-manifest", str(manifest_path.relative_to(root)),
                        "--json-output", str(report_path),
                        *extra,
                    ],
                    cwd=root,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                report = json.loads(report_path.read_text(encoding="utf-8")) \
                    if report_path.exists() else None
                return result, report

            accepted, report = run_gate("--fail-on", "credential")
            self.assertEqual(accepted.returncode, 0)
            self.assertIsNotNone(report)
            self.assertEqual(report["historyCredentialStatus"], "quarantined_unknown_not_clean")
            self.assertEqual(len(report["findings"]), 1)
            self.assertEqual(report["findings"], report["quarantinedFindings"])
            self.assertEqual(report["gateSummary"]["findingCount"], 0)
            self.assertFalse(report["quarantine"]["qualifiesGitHistoryCredentialClean"])
            self.assertNotIn(candidate, json.dumps(report).encode())

            blocker, _report = run_gate("--fail-on", "blocker")
            self.assertEqual(blocker.returncode, 1)
            skipped, skipped_report = run_gate("--skip-history", "--fail-on", "credential")
            self.assertEqual(skipped.returncode, 1)
            self.assertEqual(skipped_report["quarantine"]["missingCount"], 1)

            source.write_bytes(b"https://provider.invalid/data?apiKey=" + candidate)
            current, current_report = run_gate("--fail-on", "credential")
            self.assertEqual(current.returncode, 1)
            self.assertGreater(current_report["gateSummary"]["findingCount"], 0)
            source.write_text("safe\n", encoding="utf-8")

            original_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            for field, replacement in (
                ("blob", "b" * 40),
                ("path", "different.txt"),
                ("line", 2),
                ("rule", "bearer_token_literal"),
            ):
                changed = json.loads(json.dumps(original_manifest))
                changed["entries"][0][field] = replacement
                manifest_path.write_text(
                    json.dumps(changed, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8",
                )
                mismatch, mismatch_report = run_gate("--fail-on", "credential")
                self.assertEqual(mismatch.returncode, 1)
                self.assertEqual(mismatch_report["quarantine"]["missingCount"], 1)

            changed = json.loads(json.dumps(original_manifest))
            changed["scannerSha256"] = "c" * 64
            manifest_path.write_text(
                json.dumps(changed, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            invalid, invalid_report = run_gate("--fail-on", "credential")
            self.assertEqual(invalid.returncode, 2)
            self.assertIsNone(invalid_report)

    def test_allow_fixture_marker_suppresses_deliberate_test_pattern(self) -> None:
        candidate = b"abc12345" + b"def67890" + b"ghi24680"
        payload = (
            b"ODDS_API_KEY="
            + candidate
            + b"  # secret-scan: allow-fixture\n"
        )

        self.assertEqual(
            SECURITY_SCAN.scan_bytes(payload, scope="fixture", path="test.env"), []
        )

    def test_short_synthetic_query_value_is_not_mistaken_for_live_key(self) -> None:
        synthetic = b"short-" + b"fixture"
        payload = b"https://provider.invalid/data?apiKey=" + synthetic

        self.assertEqual(
            SECURITY_SCAN.scan_bytes(payload, scope="fixture", path="test.ts"), []
        )

    def test_bare_vendor_shaped_hex_is_flagged_but_known_ids_are_not(self) -> None:
        candidate = b"01234567" + b"89abcdef" + b"01234567" + b"89abcdef"
        finding_payload = b"unlabeled=" + candidate
        id_payload = b'project_id="appgprj_' + candidate + b'"'

        findings = SECURITY_SCAN.scan_bytes(
            finding_payload, scope="fixture", path="unknown.txt"
        )

        self.assertEqual(
            [finding.rule for finding in findings], ["vendor_shape_hex32"]
        )
        self.assertEqual(
            SECURITY_SCAN.scan_bytes(id_payload, scope="fixture", path="hosting.json"),
            [],
        )


if __name__ == "__main__":
    unittest.main()
