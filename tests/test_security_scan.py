from __future__ import annotations

import gzip
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "security_scan", ROOT / "scripts" / "security_scan.py"
)
assert SPEC is not None and SPEC.loader is not None
SECURITY_SCAN = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SECURITY_SCAN
SPEC.loader.exec_module(SECURITY_SCAN)


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
        payload = email + b"\n/cache=/Users/local-user/private/output.json\n"

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
