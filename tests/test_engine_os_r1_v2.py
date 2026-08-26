from __future__ import annotations

import csv
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/engine_os_r1_v2.py"
PROTOCOL_ID = "engine-os-r1-target-reconciliation.2026-08-25.2"
ROLES = ("identity_coordinator", "reviewer_a", "reviewer_b", "adjudicator")


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class R1V2WorkflowTest(unittest.TestCase):
    def run_cli(self, workspace: Path | None, command: str, *args: str) -> subprocess.CompletedProcess[str]:
        argv = [sys.executable, str(SCRIPT), command, "--root", str(ROOT)]
        if workspace is not None:
            argv.extend(("--workspace", str(workspace)))
        argv.extend(args)
        return subprocess.run(argv, check=False, capture_output=True, text=True)

    def bootstrap(self, base: Path) -> Path:
        workspace = base / "workspace"
        for command in ("freeze-protocol", "prepare-review-bundles"):
            completed = self.run_cli(workspace, command)
            self.assertEqual(completed.returncode, 0, completed.stderr)
        return workspace

    def attestation(self, base: Path, role: str, person: str, coordinator: str) -> Path:
        path = base / f"{role}.attestation.json"
        path.write_text(json.dumps({
            "protocolId": PROTOCOL_ID,
            "role": role,
            "pseudonym": f"test-{role}",
            "personCommitmentSha256": person,
            "naturalPersonAttested": True,
            "automationParticipant": False,
            "coordinatorPersonCommitmentSha256": coordinator,
            "signedStatement": "TEST FIXTURE ONLY: role and independence assertions accepted",
            "signedAtUtc": "2026-08-25T20:00:00Z",
        }, sort_keys=True), encoding="utf-8")
        return path

    def register_roles(self, base: Path, workspace: Path) -> dict[str, str]:
        people = {role: sha(f"test-person::{role}".encode()) for role in ROLES}
        coordinator = people["identity_coordinator"]
        for role in ROLES:
            attestation = self.attestation(
                base, role, people[role], people[role] if role == "identity_coordinator" else coordinator
            )
            completed = self.run_cli(
                workspace, "register-role", "--role", role, "--attestation", str(attestation)
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
        completed = self.run_cli(workspace, "verify-independent-role-set")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return people

    def completed_entry(self, workspace: Path, output: Path, score_delta: int = 0) -> Path:
        source = workspace / "bundles/reviewer_a.csv"
        with source.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            columns = tuple(reader.fieldnames or ())
            rows = list(reader)
        for row in rows:
            row.update({
                "official_gamebook_page_references": "gamebook:1",
                "final_home_score": str(20 + score_delta),
                "final_away_score": "17",
                "regulation_home_series": "10",
                "regulation_away_series": "10",
                "overtime_occurred": "0",
                "overtime_home_series": "0",
                "overtime_away_series": "0",
            })
            if row["edge_selector"] == "NOT_ASSIGNED":
                row.update({
                    "edge_event_reference": "NOT_ASSIGNED",
                    "edge_creates_series": "NOT_ASSIGNED",
                    "edge_offense": "NOT_ASSIGNED",
                })
            else:
                row.update({
                    "edge_event_reference": "gamebook:play-1",
                    "edge_creates_series": "0",
                    "edge_offense": "NONE",
                })
        with output.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        return output

    def commit_both(self, workspace: Path, a: Path, b: Path) -> None:
        for role, path in (("reviewer_a", a), ("reviewer_b", b)):
            completed = self.run_cli(
                workspace, "commit-entry", "--role", role, "--entry", str(path),
                "--salt-commitment", sha(f"salt::{role}".encode()),
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
        completed = self.run_cli(workspace, "register-entry-commitments")
        self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_parent_and_frozen_protocol_verify_without_touching_r1_v1(self) -> None:
        completed = self.run_cli(None, "verify-parent")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertTrue(payload["parentR1V1Preserved"])
        self.assertEqual(payload["parentSampleGameCount"], 64)

    def test_role_collision_is_terminal_and_never_authorizes_r2(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            workspace = self.bootstrap(base)
            person = sha(b"same-person")
            coordinator = self.attestation(base, "identity_coordinator", person, person)
            first = self.run_cli(
                workspace, "register-role", "--role", "identity_coordinator",
                "--attestation", str(coordinator),
            )
            self.assertEqual(first.returncode, 0, first.stderr)
            reviewer = self.attestation(base, "reviewer_a", person, person)
            collision = self.run_cli(
                workspace, "register-role", "--role", "reviewer_a",
                "--attestation", str(reviewer),
            )
            self.assertEqual(collision.returncode, 2)
            status = json.loads((workspace / "status.json").read_text())
            self.assertEqual(status["status"], "protocol_invalid")
            self.assertFalse(status["r2Authorized"])
            self.assertIn("role_collision", status["terminalReason"])

    def test_early_reveal_and_incomplete_entry_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            early_workspace = self.bootstrap(base / "early")
            entry = self.completed_entry(early_workspace, base / "early-entry.csv")
            early = self.run_cli(
                early_workspace, "reveal-entries", "--reviewer-a-entry", str(entry),
                "--reviewer-b-entry", str(entry),
            )
            self.assertEqual(early.returncode, 2)
            self.assertIn("early_reveal", (early_workspace / "PROTOCOL_INVALID.json").read_text())

            incomplete_workspace = self.bootstrap(base / "incomplete")
            self.register_roles(base / "incomplete", incomplete_workspace)
            incomplete = self.completed_entry(incomplete_workspace, base / "incomplete-entry.csv")
            text = incomplete.read_text(encoding="utf-8")
            incomplete.write_text(text.replace(",20,17,", ",,17,", 1), encoding="utf-8")
            failed = self.run_cli(
                incomplete_workspace, "commit-entry", "--role", "reviewer_a",
                "--entry", str(incomplete), "--salt-commitment", sha(b"salt"),
            )
            self.assertEqual(failed.returncode, 2)
            self.assertIn("review_entry_incomplete", (incomplete_workspace / "PROTOCOL_INVALID.json").read_text())

    def test_committed_entry_mutation_is_terminal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            workspace = self.bootstrap(base)
            self.register_roles(base, workspace)
            a = self.completed_entry(workspace, base / "a.csv")
            b = self.completed_entry(workspace, base / "b.csv")
            self.commit_both(workspace, a, b)
            a.write_bytes(a.read_bytes() + b"\n")
            failed = self.run_cli(
                workspace, "reveal-entries", "--reviewer-a-entry", str(a),
                "--reviewer-b-entry", str(b),
            )
            self.assertEqual(failed.returncode, 2)
            marker = json.loads((workspace / "PROTOCOL_INVALID.json").read_text())
            self.assertEqual(marker["status"], "protocol_invalid")
            self.assertFalse(marker["r2Authorized"])
            self.assertIn("committed_entry_mutated", marker["reason"])

    def test_only_complete_valid_gate_can_authorize_r2(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            workspace = self.bootstrap(base)
            people = self.register_roles(base, workspace)
            a = self.completed_entry(workspace, base / "a.csv")
            b = self.completed_entry(workspace, base / "b.csv")
            self.commit_both(workspace, a, b)
            for command, args in (
                ("reveal-entries", ("--reviewer-a-entry", str(a), "--reviewer-b-entry", str(b))),
                ("build-discrepancies", ()),
            ):
                completed = self.run_cli(workspace, command, *args)
                self.assertEqual(completed.returncode, 0, completed.stderr)

            adjudication = base / "adjudication.json"
            adjudication.write_text(json.dumps({"protocolId": PROTOCOL_ID, "records": []}), encoding="utf-8")
            completed = self.run_cli(
                workspace, "freeze-adjudication", "--adjudication-file", str(adjudication)
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            completed = self.run_cli(workspace, "freeze-truth")
            self.assertEqual(completed.returncode, 0, completed.stderr)
            before = json.loads((workspace / "status.json").read_text())
            self.assertFalse(before["r2Authorized"])

            truth = json.loads((workspace / "official-truth.json").read_text())
            comparison = {
                "protocolId": PROTOCOL_ID,
                "sourceIndexSha256": "0a49ed9a11a31acfd2629496b1b86ba63206ddaebe0d809f3c2c1b27e19dc9c6",
                "rows": truth["rows"],
            }
            comparison_path = base / "comparison.json"
            comparison_bytes = json.dumps(comparison, sort_keys=True).encode()
            comparison_path.write_bytes(comparison_bytes)
            exporter = base / "exporter-attestation.json"
            exporter.write_text(json.dumps({
                "protocolId": PROTOCOL_ID,
                "sourceIndexSha256": comparison["sourceIndexSha256"],
                "comparisonFileSha256": sha(comparison_bytes),
                "deterministicExporterVerified": True,
                "comparisonGeneratedWithoutOfficialTruth": True,
                "exporterSha256": sha(b"test-exporter-code"),
                "verifierId": "test-fixture-verifier",
                "verifiedAtUtc": "2026-08-25T21:00:00Z",
            }, sort_keys=True), encoding="utf-8")
            completed = self.run_cli(
                workspace, "unblind-comparison", "--comparison-file", str(comparison_path),
                "--exporter-attestation", str(exporter),
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            completed = self.run_cli(workspace, "compute-gate")
            self.assertEqual(completed.returncode, 0, completed.stderr)
            final = json.loads((workspace / "status.json").read_text())
            self.assertEqual(final["status"], "pass")
            self.assertTrue(final["r2Authorized"])
            self.assertEqual(people["adjudicator"], json.loads((workspace / "roles/adjudicator.json").read_text())["personCommitmentSha256"])


if __name__ == "__main__":
    unittest.main()
