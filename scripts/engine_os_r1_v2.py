#!/usr/bin/env python3
"""Fail-closed R1-v2 human commit-reveal workflow.

The program verifies and packages evidence. It never supplies a reviewer,
adjudicator, role attestation, official-truth value, or comparison value.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any, Iterable


PROTOCOL_ID = "engine-os-r1-target-reconciliation.2026-08-25.2"
PREREG_SHA256 = "f86261b7bdb3addc0348b798729a59128456747c54f13abd887cb372b242fe44"
WORKFLOW_SHA256 = "00faaef74022b2cae682e441ae27e6561410b01aafde8b8977852caa9a51ddf0"
PARENT_PREREG_SHA256 = "21142d8a45a2e7e9421d5b20b4ecbd2e803657cda7e9bcf832db9fb2fd447866"
SAMPLE_SHA256 = "5182984aa57765f536e3d4dd537e8f34e8c3a9d5b7debf0950ea9000e6d4bf83"
SOURCE_CAPTURE_SHA256 = "21a3ea54c359c1acca68788c5af531144535d745485b8d6a54da1b32924d5b15"
SOURCE_INDEX_SHA256 = "0a49ed9a11a31acfd2629496b1b86ba63206ddaebe0d809f3c2c1b27e19dc9c6"
R1_V1_IMMUTABLE_FILES = {
    ".planning/engine-os/execution/r1/PREREGISTRATION.sha256": "ddf85f65699cb0e9449ec16113e365838ee13836156acb9117db7045dadb1ff3",
    ".planning/engine-os/execution/r1/preregistration.v1.json": PARENT_PREREG_SHA256,
    ".planning/engine-os/execution/r1/r1_target_audit.py": "2d52b48a057c1da782573e724d93e0d87a68ce45112c62f479763fa7e7f8dbc5",
    "artifacts/engine-os/r1/RESULT.md": "5cfc0b8600c5954deebe04f3878c720b34a71eafe1743c9b9fd151558b62740a",
    "artifacts/engine-os/r1/adjudication.csv": "c3818dadf6dc585a60141d2733633c9affeceadc20ba65359c2d8093b4d2261e",
    "artifacts/engine-os/r1/artifact-hashes.json": "f35c16e1e9fae857ce0487baeb73c62260e495cfb7621feaf366818a042b85e0",
    "artifacts/engine-os/r1/official-source-capture.csv": SOURCE_CAPTURE_SHA256,
    "artifacts/engine-os/r1/reviewer-a-entry.csv": "f75423b3cbd515b203e66fa9d6800cc558bbd43809fb42bdd39889425d9046fb",
    "artifacts/engine-os/r1/reviewer-b-entry.csv": "f75423b3cbd515b203e66fa9d6800cc558bbd43809fb42bdd39889425d9046fb",
    "artifacts/engine-os/r1/sample-manifest.json": SAMPLE_SHA256,
    "artifacts/engine-os/r1/status.json": "7e86c4c67fee4056809f39cc1362dec22128802d82290bf2aef7b694050470a9",
}

ROLES = ("identity_coordinator", "reviewer_a", "reviewer_b", "adjudicator")
REVIEWERS = ("reviewer_a", "reviewer_b")
AMBIGUOUS = "AMBIGUOUS"
UNRESOLVED = "official_truth_unresolved"

REVIEW_COLUMNS = (
    "game_id", "season", "week", "gameday", "away_team", "home_team",
    "sampling_stratum", "edge_selector", "official_gamecenter_discovery_url",
    "official_gamebook_url", "official_gamebook_sha256",
    "official_gamebook_page_references", "final_home_score", "final_away_score",
    "regulation_home_series", "regulation_away_series", "overtime_occurred",
    "overtime_home_series", "overtime_away_series", "edge_event_reference",
    "edge_creates_series", "edge_offense", "notes_limited_to_source_ambiguity",
)
NUMERIC_FIELDS = (
    "final_home_score", "final_away_score", "regulation_home_series",
    "regulation_away_series", "overtime_occurred", "overtime_home_series",
    "overtime_away_series",
)
TARGET_FIELDS = (*NUMERIC_FIELDS, "edge_creates_series", "edge_offense")
EDGE_FIELDS = ("edge_creates_series", "edge_offense")
TAXONOMY = {
    "reviewer_transcription", "reviewer_series_boundary",
    "official_gamebook_editorial_ambiguity", "source_fixed_drive_boundary",
    "offense_attribution", "overtime_contamination", "score_mismatch",
    "edge_treatment_mismatch", "source_unavailable",
    "other_preregistered_definition_conflict",
}


class ProtocolViolation(RuntimeError):
    """A terminal breach of the frozen protocol."""


class AwaitingHuman(RuntimeError):
    """A valid nonterminal state that still needs human evidence."""


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_json(value) + b"\n")


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProtocolViolation(f"invalid_or_missing_json:{path}") from exc


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def is_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def protocol_paths(root: Path) -> tuple[Path, Path]:
    directory = root / ".planning/engine-os/execution/r1-v2"
    return directory / "preregistration.v2.json", directory / "PREREGISTRATION.sha256"


def verify_parent(root: Path) -> dict[str, Any]:
    prereg, hash_record = protocol_paths(root)
    expected_line = f"{PREREG_SHA256}  preregistration.v2.json"
    if sha256_file(prereg) != PREREG_SHA256:
        raise ProtocolViolation("r1_v2_preregistration_mutated")
    if hash_record.read_text(encoding="utf-8").strip() != expected_line:
        raise ProtocolViolation("r1_v2_preregistration_hash_record_mutated")
    workflow = prereg.parent / "workflow.v1.json"
    workflow_hash = prereg.parent / "WORKFLOW.sha256"
    if sha256_file(workflow) != WORKFLOW_SHA256:
        raise ProtocolViolation("r1_v2_workflow_definition_mutated")
    if workflow_hash.read_text(encoding="utf-8").strip() != f"{WORKFLOW_SHA256}  workflow.v1.json":
        raise ProtocolViolation("r1_v2_workflow_hash_record_mutated")

    for relative, digest in R1_V1_IMMUTABLE_FILES.items():
        path = root / relative
        if not path.is_file() or sha256_file(path) != digest:
            raise ProtocolViolation(f"parent_evidence_mutated:{path.relative_to(root)}")

    manifest = read_json(root / "artifacts/engine-os/r1/sample-manifest.json")
    sample = manifest.get("sample")
    if (
        manifest.get("sourceIndexSha256") != SOURCE_INDEX_SHA256
        or not isinstance(sample, list)
        or len(sample) != 64
        or len({row.get("gameId") for row in sample}) != 64
    ):
        raise ProtocolViolation("parent_sample_manifest_incomplete")

    capture_path = root / "artifacts/engine-os/r1/official-source-capture.csv"
    with capture_path.open(newline="", encoding="utf-8") as handle:
        captures = list(csv.DictReader(handle))
    if len(captures) != 64 or len({row["game_id"] for row in captures}) != 64:
        raise ProtocolViolation("parent_source_capture_incomplete")
    if any(
        row["retrieval_status"] != "captured"
        or not is_sha256(row["official_gamebook_sha256"])
        or not row["official_gamebook_url"].startswith("https://static.www.nfl.com/")
        for row in captures
    ):
        raise ProtocolViolation("parent_source_capture_invalid")
    return {"manifest": manifest, "captures": {row["game_id"]: row for row in captures}}


def initial_status() -> dict[str, Any]:
    return {
        "schemaVersion": "engine-os-r1-v2-status-v1",
        "protocolId": PROTOCOL_ID,
        "preregistrationSha256": PREREG_SHA256,
        "workflowDefinitionSha256": WORKFLOW_SHA256,
        "stage": "protocol_frozen",
        "status": "awaiting_human_review",
        "r2Authorized": False,
        "comparisonLabelsRevealed": False,
        "officialTruthFrozen": False,
        "eventCount": 0,
        "lastEventSha256": None,
        "nextAction": "prepare_review_bundles",
    }


def status_path(workspace: Path) -> Path:
    return workspace / "status.json"


def load_status(workspace: Path) -> dict[str, Any]:
    status = read_json(status_path(workspace))
    if (
        status.get("protocolId") != PROTOCOL_ID
        or status.get("preregistrationSha256") != PREREG_SHA256
        or status.get("workflowDefinitionSha256") != WORKFLOW_SHA256
    ):
        raise ProtocolViolation("workspace_protocol_binding_invalid")
    if status.get("r2Authorized") and not (
        status.get("status") == "pass" and status.get("stage") == "gate_computed"
    ):
        raise ProtocolViolation("premature_r2_authorization")
    return status


def append_event(
    workspace: Path,
    status: dict[str, Any],
    action: str,
    artifacts: Iterable[Path] = (),
    detail: dict[str, Any] | None = None,
) -> None:
    sequence = int(status["eventCount"]) + 1
    artifact_hashes = {}
    for path in artifacts:
        relative = str(path.relative_to(workspace))
        artifact_hashes[relative] = {"sha256": sha256_file(path), "byteCount": path.stat().st_size}
    event = {
        "schemaVersion": "engine-os-r1-v2-event-v1",
        "protocolId": PROTOCOL_ID,
        "sequence": sequence,
        "action": action,
        "recordedAtUtc": utc_now(),
        "previousEventSha256": status["lastEventSha256"],
        "artifacts": artifact_hashes,
        "detail": detail or {},
    }
    event_path = workspace / "events" / f"{sequence:04d}.{action}.json"
    if event_path.exists():
        raise ProtocolViolation(f"event_path_collision:{event_path.name}")
    write_json(event_path, event)
    status["eventCount"] = sequence
    status["lastEventSha256"] = sha256_file(event_path)
    write_json(status_path(workspace), status)


def verify_event_chain(workspace: Path, status: dict[str, Any]) -> None:
    events = sorted((workspace / "events").glob("*.json"))
    if len(events) != status.get("eventCount"):
        raise ProtocolViolation("event_manifest_incomplete")
    previous = None
    derived_stage = None
    derived_status = "awaiting_human_review"
    derived_r2_authorized = False
    official_truth_frozen = False
    comparison_revealed = False
    stage_by_action = {
        "protocol_frozen": "protocol_frozen",
        "review_bundles_prepared": "review_bundles_prepared",
        "roles_verified": "roles_verified",
        "entry_commitments_frozen": "entry_commitments_frozen",
        "entries_revealed": "entries_revealed",
        "discrepancies_frozen": "discrepancies_frozen",
        "adjudication_frozen": "adjudication_frozen",
        "official_truth_frozen": "official_truth_frozen",
        "comparison_unblinded": "comparison_unblinded",
        "gate_computed": "gate_computed",
    }
    for index, path in enumerate(events, start=1):
        event = read_json(path)
        if event.get("sequence") != index or event.get("previousEventSha256") != previous:
            raise ProtocolViolation("event_chain_mutated")
        for relative, record in event.get("artifacts", {}).items():
            artifact = workspace / relative
            if (
                not artifact.is_file()
                or sha256_file(artifact) != record.get("sha256")
                or artifact.stat().st_size != record.get("byteCount")
            ):
                raise ProtocolViolation(f"frozen_artifact_mutated:{relative}")
        action = event.get("action")
        if action in stage_by_action:
            derived_stage = stage_by_action[action]
        elif not (
            isinstance(action, str)
            and (action.startswith("role_registered_") or action.startswith("entry_committed_"))
        ):
            raise ProtocolViolation(f"unknown_event_action:{action}")
        if action == "official_truth_frozen":
            official_truth_frozen = True
        elif action == "comparison_unblinded":
            if not official_truth_frozen:
                raise ProtocolViolation("event_chain_early_comparison_reveal")
            comparison_revealed = True
        elif action == "gate_computed":
            gate_record = event.get("artifacts", {}).get("gate-result.json")
            if not gate_record:
                raise ProtocolViolation("gate_event_missing_result")
            gate = read_json(workspace / "gate-result.json")
            if gate.get("result") not in ("pass", "reject_all"):
                raise ProtocolViolation("gate_result_invalid")
            if gate.get("r2Authorized") is not (gate["result"] == "pass"):
                raise ProtocolViolation("gate_authorization_inconsistent")
            derived_status = gate["result"]
            derived_r2_authorized = gate["result"] == "pass" and gate.get("r2Authorized") is True
        previous = sha256_file(path)
    if previous != status.get("lastEventSha256"):
        raise ProtocolViolation("event_head_mutated")
    if (
        derived_stage != status.get("stage")
        or derived_status != status.get("status")
        or derived_r2_authorized != status.get("r2Authorized")
        or official_truth_frozen != status.get("officialTruthFrozen")
        or comparison_revealed != status.get("comparisonLabelsRevealed")
    ):
        raise ProtocolViolation("mutable_status_diverges_from_frozen_event_chain")


def verify_workspace(root: Path, workspace: Path) -> dict[str, Any]:
    verify_parent(root)
    status = load_status(workspace)
    verify_event_chain(workspace, status)
    marker = workspace / "PROTOCOL_INVALID.json"
    if marker.exists() and status.get("status") != "protocol_invalid":
        raise ProtocolViolation("terminal_marker_status_mismatch")
    return status


def mark_protocol_invalid(workspace: Path, reason: str) -> None:
    workspace.mkdir(parents=True, exist_ok=True)
    marker = {
        "schemaVersion": "engine-os-r1-v2-terminal-marker-v1",
        "protocolId": PROTOCOL_ID,
        "status": "protocol_invalid",
        "reason": reason,
        "r2Authorized": False,
        "recordedAtUtc": utc_now(),
    }
    marker_path = workspace / "PROTOCOL_INVALID.json"
    if not marker_path.exists():
        write_json(marker_path, marker)
    path = status_path(workspace)
    if path.exists():
        try:
            status = read_json(path)
        except ProtocolViolation:
            status = initial_status()
        status.update({
            "status": "protocol_invalid",
            "r2Authorized": False,
            "terminalReason": reason,
            "nextAction": "none_terminal",
        })
        write_json(path, status)


def require_stage(status: dict[str, Any], *allowed: str) -> None:
    if status.get("status") != "awaiting_human_review" or status.get("stage") not in allowed:
        raise ProtocolViolation(
            f"invalid_stage:{status.get('status')}:{status.get('stage')}:expected={','.join(allowed)}"
        )


def cmd_freeze_protocol(root: Path, workspace: Path) -> None:
    verify_parent(root)
    if workspace.exists() and any(workspace.iterdir()):
        raise ProtocolViolation("freeze_requires_empty_workspace")
    workspace.mkdir(parents=True, exist_ok=True)
    prereg, _ = protocol_paths(root)
    lock = {
        "schemaVersion": "engine-os-r1-v2-protocol-lock-v1",
        "protocolId": PROTOCOL_ID,
        "preregistrationSha256": PREREG_SHA256,
        "workflowDefinitionSha256": WORKFLOW_SHA256,
        "parentPreregistrationSha256": PARENT_PREREG_SHA256,
        "sampleManifestSha256": SAMPLE_SHA256,
        "officialSourceCaptureSha256": SOURCE_CAPTURE_SHA256,
        "comparisonSourceIndexSha256": SOURCE_INDEX_SHA256,
        "preregistrationByteCount": prereg.stat().st_size,
    }
    lock_path = workspace / "protocol-lock.json"
    write_json(lock_path, lock)
    status = initial_status()
    write_json(status_path(workspace), status)
    append_event(workspace, status, "protocol_frozen", (lock_path,))


def build_bundle_rows(parent: dict[str, Any]) -> list[dict[str, str]]:
    rows = []
    captures = parent["captures"]
    for item in parent["manifest"]["sample"]:
        capture = captures[item["gameId"]]
        row = {column: "" for column in REVIEW_COLUMNS}
        row.update({
            "game_id": item["gameId"], "season": str(item["season"]),
            "week": str(item["week"]), "gameday": item["gameday"],
            "away_team": item["awayTeam"], "home_team": item["homeTeam"],
            "sampling_stratum": item["samplingStratum"],
            "edge_selector": item["edgeSelector"] or "NOT_ASSIGNED",
            "official_gamecenter_discovery_url": item["officialGamecenterDiscoveryUrl"],
            "official_gamebook_url": capture["official_gamebook_url"],
            "official_gamebook_sha256": capture["official_gamebook_sha256"],
        })
        rows.append(row)
    return rows


def write_csv(path: Path, rows: list[dict[str, str]], columns: tuple[str, ...] = REVIEW_COLUMNS) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def cmd_prepare_review_bundles(root: Path, workspace: Path) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "protocol_frozen")
    parent = verify_parent(root)
    rows = build_bundle_rows(parent)
    outputs = []
    for reviewer in REVIEWERS:
        path = workspace / "bundles" / f"{reviewer}.csv"
        write_csv(path, rows)
        outputs.append(path)
    source_lock = {
        "schemaVersion": "engine-os-r1-v2-source-lock-v1",
        "protocolId": PROTOCOL_ID,
        "sampleManifestSha256": SAMPLE_SHA256,
        "officialSourceCaptureSha256": SOURCE_CAPTURE_SHA256,
        "gamebookSha256ByGame": {
            row["game_id"]: row["official_gamebook_sha256"] for row in rows
        },
    }
    source_path = workspace / "source-lock.json"
    write_json(source_path, source_lock)
    outputs.append(source_path)
    status.update({"stage": "review_bundles_prepared", "nextAction": "register_four_human_roles"})
    append_event(workspace, status, "review_bundles_prepared", outputs)


def validate_attestation(value: Any, role: str, roles: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProtocolViolation("role_attestation_not_object")
    required = {
        "protocolId", "role", "pseudonym", "personCommitmentSha256",
        "naturalPersonAttested", "automationParticipant", "coordinatorPersonCommitmentSha256",
        "signedStatement", "signedAtUtc",
    }
    if set(value) != required:
        raise ProtocolViolation(f"role_attestation_schema_invalid:{role}")
    if value["protocolId"] != PROTOCOL_ID or value["role"] != role:
        raise ProtocolViolation(f"role_attestation_binding_invalid:{role}")
    if value["naturalPersonAttested"] is not True or value["automationParticipant"] is not False:
        raise ProtocolViolation(f"role_not_attested_as_natural_person:{role}")
    if not is_sha256(value["personCommitmentSha256"]) or not value["pseudonym"]:
        raise ProtocolViolation(f"role_identity_commitment_invalid:{role}")
    if not value["signedStatement"] or not value["signedAtUtc"]:
        raise ProtocolViolation(f"role_signature_evidence_incomplete:{role}")

    person = value["personCommitmentSha256"]
    existing_people = {record["personCommitmentSha256"] for record in roles.values()}
    if person in existing_people:
        raise ProtocolViolation(f"role_collision:{role}")
    if role == "identity_coordinator":
        if value["coordinatorPersonCommitmentSha256"] != person:
            raise ProtocolViolation("identity_coordinator_self_binding_invalid")
    else:
        coordinator = roles.get("identity_coordinator")
        if not coordinator:
            raise ProtocolViolation("identity_coordinator_must_register_first")
        if value["coordinatorPersonCommitmentSha256"] != coordinator["personCommitmentSha256"]:
            raise ProtocolViolation(f"coordinator_attestation_binding_invalid:{role}")
    return value


def load_roles(workspace: Path) -> dict[str, Any]:
    roles = {}
    for role in ROLES:
        path = workspace / "roles" / f"{role}.json"
        if path.exists():
            roles[role] = read_json(path)
    return roles


def cmd_register_role(root: Path, workspace: Path, role: str, attestation: Path) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "review_bundles_prepared")
    if role not in ROLES:
        raise ProtocolViolation(f"unknown_role:{role}")
    roles = load_roles(workspace)
    if role in roles:
        raise ProtocolViolation(f"role_registration_mutation:{role}")
    raw = attestation.read_bytes()
    value = validate_attestation(json.loads(raw), role, roles)
    public = {
        "schemaVersion": "engine-os-r1-v2-public-role-v1",
        "protocolId": PROTOCOL_ID,
        "role": role,
        "pseudonym": value["pseudonym"],
        "personCommitmentSha256": value["personCommitmentSha256"],
        "naturalPersonAttested": True,
        "automationParticipant": False,
        "coordinatorPersonCommitmentSha256": value["coordinatorPersonCommitmentSha256"],
        "privateAttestationSha256": sha256_bytes(raw),
        "signedAtUtc": value["signedAtUtc"],
    }
    output = workspace / "roles" / f"{role}.json"
    write_json(output, public)
    append_event(workspace, status, f"role_registered_{role}", (output,), {"role": role})


def cmd_verify_roles(root: Path, workspace: Path) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "review_bundles_prepared")
    roles = load_roles(workspace)
    if set(roles) != set(ROLES):
        missing = sorted(set(ROLES) - set(roles))
        raise AwaitingHuman(f"missing_human_roles:{','.join(missing)}")
    people = [roles[role]["personCommitmentSha256"] for role in ROLES]
    if len(set(people)) != 4:
        raise ProtocolViolation("role_collision")
    coordinator = roles["identity_coordinator"]["personCommitmentSha256"]
    if any(roles[role]["coordinatorPersonCommitmentSha256"] != coordinator for role in REVIEWERS + ("adjudicator",)):
        raise ProtocolViolation("coordinator_role_set_binding_invalid")
    role_set = {
        "schemaVersion": "engine-os-r1-v2-role-set-v1",
        "protocolId": PROTOCOL_ID,
        "roles": {role: sha256_file(workspace / "roles" / f"{role}.json") for role in ROLES},
        "distinctNaturalPersonCommitmentCount": 4,
        "identityCoordinatorNonReviewing": True,
    }
    output = workspace / "role-set.json"
    write_json(output, role_set)
    status.update({"stage": "roles_verified", "nextAction": "complete_and_commit_both_blinded_entries"})
    append_event(workspace, status, "roles_verified", (output,))


def read_csv_exact(path: Path) -> list[dict[str, str]]:
    try:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            if tuple(reader.fieldnames or ()) != REVIEW_COLUMNS:
                raise ProtocolViolation("review_entry_schema_invalid")
            return list(reader)
    except OSError as exc:
        raise ProtocolViolation(f"review_entry_unreadable:{path}") from exc


def integer_or_ambiguous(value: str, field: str) -> None:
    if value == AMBIGUOUS:
        return
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ProtocolViolation(f"review_value_invalid:{field}") from exc
    if parsed < 0 or (field == "overtime_occurred" and parsed not in (0, 1)):
        raise ProtocolViolation(f"review_value_out_of_range:{field}")


def validate_entry(workspace: Path, path: Path) -> list[dict[str, str]]:
    rows = read_csv_exact(path)
    bundle_rows = read_csv_exact(workspace / "bundles/reviewer_a.csv")
    if len(rows) != 64 or len({row["game_id"] for row in rows}) != 64:
        raise ProtocolViolation("review_entry_incomplete_or_duplicate")
    immutable = REVIEW_COLUMNS[:11]
    for expected, row in zip(bundle_rows, rows, strict=True):
        if any(row[field] != expected[field] for field in immutable):
            raise ProtocolViolation(f"review_entry_source_or_assignment_mutated:{expected['game_id']}")
        for field in NUMERIC_FIELDS:
            if row[field] == "":
                raise ProtocolViolation(f"review_entry_incomplete:{row['game_id']}:{field}")
            integer_or_ambiguous(row[field], field)
        if not row["official_gamebook_page_references"]:
            raise ProtocolViolation(f"review_entry_missing_support:{row['game_id']}")
        if row["edge_selector"] == "NOT_ASSIGNED":
            if any(row[field] != "NOT_ASSIGNED" for field in ("edge_event_reference", *EDGE_FIELDS)):
                raise ProtocolViolation(f"unassigned_edge_fields_invalid:{row['game_id']}")
        else:
            if not row["edge_event_reference"]:
                raise ProtocolViolation(f"edge_reference_incomplete:{row['game_id']}")
            if row["edge_creates_series"] not in ("0", "1", AMBIGUOUS):
                raise ProtocolViolation(f"edge_series_value_invalid:{row['game_id']}")
            if row["edge_offense"] not in (row["home_team"], row["away_team"], "NONE", AMBIGUOUS):
                raise ProtocolViolation(f"edge_offense_value_invalid:{row['game_id']}")
    return rows


def cmd_commit_entry(
    root: Path, workspace: Path, role: str, entry: Path, salt_commitment: str
) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "roles_verified")
    if role not in REVIEWERS or not is_sha256(salt_commitment):
        raise ProtocolViolation("entry_commitment_arguments_invalid")
    validate_entry(workspace, entry)
    output = workspace / "commitments" / f"{role}.json"
    if output.exists():
        raise ProtocolViolation(f"entry_commitment_mutation:{role}")
    record = {
        "schemaVersion": "engine-os-r1-v2-entry-commitment-v1",
        "protocolId": PROTOCOL_ID,
        "role": role,
        "reviewerPersonCommitmentSha256": load_roles(workspace)[role]["personCommitmentSha256"],
        "entrySha256": sha256_file(entry),
        "entryByteCount": entry.stat().st_size,
        "saltCommitmentSha256": salt_commitment,
        "committedAtUtc": utc_now(),
    }
    write_json(output, record)
    append_event(workspace, status, f"entry_committed_{role}", (output,), {"role": role})


def cmd_register_commitments(root: Path, workspace: Path) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "roles_verified")
    records = {}
    for role in REVIEWERS:
        path = workspace / "commitments" / f"{role}.json"
        if not path.is_file():
            raise AwaitingHuman(f"missing_entry_commitment:{role}")
        records[role] = read_json(path)
    joint = {
        "schemaVersion": "engine-os-r1-v2-joint-commitment-v1",
        "protocolId": PROTOCOL_ID,
        "commitments": {
            role: {"artifactSha256": sha256_file(workspace / "commitments" / f"{role}.json"), **records[role]}
            for role in REVIEWERS
        },
        "comparisonLabelsRevealed": False,
    }
    output = workspace / "entry-commitments.json"
    if output.exists():
        raise ProtocolViolation("joint_commitment_mutation")
    write_json(output, joint)
    status.update({"stage": "entry_commitments_frozen", "nextAction": "reveal_both_committed_entries_atomically"})
    append_event(workspace, status, "entry_commitments_frozen", (output,))


def cmd_reveal_entries(root: Path, workspace: Path, entry_a: Path, entry_b: Path) -> None:
    status = verify_workspace(root, workspace)
    if status.get("stage") != "entry_commitments_frozen":
        raise ProtocolViolation("early_reveal")
    require_stage(status, "entry_commitments_frozen")
    joint = read_json(workspace / "entry-commitments.json")
    inputs = {"reviewer_a": entry_a, "reviewer_b": entry_b}
    for role, path in inputs.items():
        commitment = joint["commitments"][role]
        if sha256_file(path) != commitment["entrySha256"] or path.stat().st_size != commitment["entryByteCount"]:
            raise ProtocolViolation(f"committed_entry_mutated:{role}")
        validate_entry(workspace, path)
    outputs = []
    for role, path in inputs.items():
        output = workspace / "revealed" / f"{role}.csv"
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, output)
        outputs.append(output)
    status.update({"stage": "entries_revealed", "nextAction": "build_anonymized_discrepancies"})
    append_event(workspace, status, "entries_revealed", outputs)


def cmd_build_discrepancies(root: Path, workspace: Path) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "entries_revealed")
    a_rows = validate_entry(workspace, workspace / "revealed/reviewer_a.csv")
    b_rows = validate_entry(workspace, workspace / "revealed/reviewer_b.csv")
    discrepancies = []
    for a_row, b_row in zip(a_rows, b_rows, strict=True):
        for field in TARGET_FIELDS:
            if a_row[field] != b_row[field] or AMBIGUOUS in (a_row[field], b_row[field]):
                discrepancies.append({
                    "discrepancy_id": f"{a_row['game_id']}::{field}",
                    "game_id": a_row["game_id"], "field": field,
                    "reviewer_value_1": a_row[field], "reviewer_value_2": b_row[field],
                    "official_gamebook_sha256": a_row["official_gamebook_sha256"],
                })
    artifact = {
        "schemaVersion": "engine-os-r1-v2-discrepancies-v1",
        "protocolId": PROTOCOL_ID,
        "reviewerIdentityBlinded": True,
        "comparisonLabelsRevealed": False,
        "records": discrepancies,
    }
    output = workspace / "discrepancies.json"
    write_json(output, artifact)
    status.update({"stage": "discrepancies_frozen", "nextAction": "third_person_adjudication"})
    append_event(workspace, status, "discrepancies_frozen", (output,), {"count": len(discrepancies)})


def cmd_freeze_adjudication(root: Path, workspace: Path, adjudication_file: Path) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "discrepancies_frozen")
    expected = read_json(workspace / "discrepancies.json")["records"]
    supplied = read_json(adjudication_file)
    if supplied.get("protocolId") != PROTOCOL_ID or not isinstance(supplied.get("records"), list):
        raise ProtocolViolation("adjudication_manifest_invalid")
    expected_by_id = {row["discrepancy_id"]: row for row in expected}
    records = supplied["records"]
    if len(records) != len(expected) or {row.get("discrepancy_id") for row in records} != set(expected_by_id):
        raise ProtocolViolation("adjudication_manifest_incomplete")
    adjudicator = load_roles(workspace)["adjudicator"]["personCommitmentSha256"]
    normalized = []
    for row in records:
        frozen = expected_by_id[row["discrepancy_id"]]
        required = {
            "discrepancy_id", "game_id", "field", "adjudicated_truth",
            "official_gamebook_sha256", "page_play_support", "taxonomy",
            "adjudicator_person_commitment_sha256",
        }
        if set(row) != required:
            raise ProtocolViolation("adjudication_record_schema_invalid")
        if any(row[field] != frozen[field] for field in ("game_id", "field", "official_gamebook_sha256")):
            raise ProtocolViolation("adjudication_record_binding_invalid")
        if row["adjudicator_person_commitment_sha256"] != adjudicator:
            raise ProtocolViolation("adjudicator_identity_binding_invalid")
        if not row["page_play_support"] or row["taxonomy"] not in TAXONOMY:
            raise ProtocolViolation("adjudication_support_incomplete")
        if row["adjudicated_truth"] != UNRESOLVED:
            validate_target_value(row["field"], str(row["adjudicated_truth"]), frozen["game_id"], workspace)
        normalized.append(row)
    output = workspace / "adjudication.json"
    write_json(output, {"schemaVersion": "engine-os-r1-v2-adjudication-v1", "protocolId": PROTOCOL_ID, "records": normalized})
    status.update({"stage": "adjudication_frozen", "nextAction": "freeze_complete_official_truth"})
    append_event(workspace, status, "adjudication_frozen", (output,), {"count": len(normalized)})


def validate_target_value(field: str, value: str, game_id: str, workspace: Path) -> None:
    if field in NUMERIC_FIELDS:
        if value == AMBIGUOUS:
            raise ProtocolViolation(f"truth_cannot_remain_ambiguous:{game_id}:{field}")
        integer_or_ambiguous(value, field)
        return
    if field == "edge_creates_series" and value not in ("0", "1", "NOT_ASSIGNED"):
        raise ProtocolViolation(f"truth_edge_value_invalid:{game_id}")
    if field == "edge_offense":
        bundle = {row["game_id"]: row for row in read_csv_exact(workspace / "bundles/reviewer_a.csv")}
        row = bundle[game_id]
        if value not in (row["home_team"], row["away_team"], "NONE", "NOT_ASSIGNED"):
            raise ProtocolViolation(f"truth_edge_offense_invalid:{game_id}")


def cmd_freeze_truth(root: Path, workspace: Path) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "adjudication_frozen")
    a_rows = validate_entry(workspace, workspace / "revealed/reviewer_a.csv")
    b_rows = validate_entry(workspace, workspace / "revealed/reviewer_b.csv")
    decisions = {row["discrepancy_id"]: row for row in read_json(workspace / "adjudication.json")["records"]}
    truth_rows = []
    for a_row, b_row in zip(a_rows, b_rows, strict=True):
        truth = {
            "game_id": a_row["game_id"],
            "official_gamebook_sha256": a_row["official_gamebook_sha256"],
        }
        for field in TARGET_FIELDS:
            discrepancy_id = f"{a_row['game_id']}::{field}"
            if a_row[field] == b_row[field] and a_row[field] != AMBIGUOUS:
                value = a_row[field]
            else:
                if discrepancy_id not in decisions:
                    raise ProtocolViolation(f"missing_adjudication:{discrepancy_id}")
                value = str(decisions[discrepancy_id]["adjudicated_truth"])
            if value != UNRESOLVED:
                validate_target_value(field, value, a_row["game_id"], workspace)
            truth[field] = value
        truth_rows.append(truth)
    if len(truth_rows) != 64:
        raise ProtocolViolation("official_truth_manifest_incomplete")
    output = workspace / "official-truth.json"
    write_json(output, {
        "schemaVersion": "engine-os-r1-v2-official-truth-v1",
        "protocolId": PROTOCOL_ID,
        "comparisonLabelsRevealed": False,
        "rows": truth_rows,
    })
    status.update({
        "stage": "official_truth_frozen", "officialTruthFrozen": True,
        "nextAction": "unblind_frozen_comparison_labels",
    })
    append_event(workspace, status, "official_truth_frozen", (output,))


def normalize_comparison(workspace: Path, comparison: Any) -> dict[str, Any]:
    if (
        not isinstance(comparison, dict)
        or comparison.get("protocolId") != PROTOCOL_ID
        or comparison.get("sourceIndexSha256") != SOURCE_INDEX_SHA256
        or not isinstance(comparison.get("rows"), list)
    ):
        raise ProtocolViolation("comparison_manifest_invalid")
    rows = comparison["rows"]
    if len(rows) != 64 or len({row.get("game_id") for row in rows}) != 64:
        raise ProtocolViolation("comparison_manifest_incomplete")
    truth = read_json(workspace / "official-truth.json")["rows"]
    truth_by_game = {row["game_id"]: row for row in truth}
    normalized = []
    exact_keys = {"game_id", "official_gamebook_sha256", *TARGET_FIELDS}
    for row in rows:
        if set(row) != exact_keys or row["game_id"] not in truth_by_game:
            raise ProtocolViolation("comparison_row_schema_or_assignment_invalid")
        game_id = row["game_id"]
        if row["official_gamebook_sha256"] != truth_by_game[game_id]["official_gamebook_sha256"]:
            raise ProtocolViolation(f"comparison_source_hash_mismatch:{game_id}")
        clean = {"game_id": game_id, "official_gamebook_sha256": row["official_gamebook_sha256"]}
        for field in TARGET_FIELDS:
            value = str(row[field])
            validate_target_value(field, value, game_id, workspace)
            clean[field] = value
        normalized.append(clean)
    normalized.sort(key=lambda row: row["game_id"])
    return {"schemaVersion": "engine-os-r1-v2-comparison-v1", "protocolId": PROTOCOL_ID,
            "sourceIndexSha256": SOURCE_INDEX_SHA256, "rows": normalized}


def cmd_unblind(
    root: Path, workspace: Path, comparison_file: Path, exporter_attestation_file: Path
) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "official_truth_frozen")
    if not status.get("officialTruthFrozen"):
        raise ProtocolViolation("comparison_unblinded_before_truth_freeze")
    comparison_bytes = comparison_file.read_bytes()
    comparison = normalize_comparison(workspace, json.loads(comparison_bytes))
    attestation = read_json(exporter_attestation_file)
    required = {
        "protocolId", "sourceIndexSha256", "comparisonFileSha256",
        "deterministicExporterVerified", "comparisonGeneratedWithoutOfficialTruth",
        "exporterSha256", "verifierId", "verifiedAtUtc",
    }
    if set(attestation) != required:
        raise ProtocolViolation("comparison_exporter_attestation_schema_invalid")
    if (
        attestation["protocolId"] != PROTOCOL_ID
        or attestation["sourceIndexSha256"] != SOURCE_INDEX_SHA256
        or attestation["comparisonFileSha256"] != sha256_bytes(comparison_bytes)
        or attestation["deterministicExporterVerified"] is not True
        or attestation["comparisonGeneratedWithoutOfficialTruth"] is not True
        or not is_sha256(attestation["exporterSha256"])
        or not attestation["verifierId"]
        or not attestation["verifiedAtUtc"]
    ):
        raise ProtocolViolation("comparison_exporter_attestation_invalid")
    comparison["exporterAttestationSha256"] = sha256_file(exporter_attestation_file)
    comparison["originalComparisonFileSha256"] = sha256_bytes(comparison_bytes)
    output = workspace / "unblinded-comparison.json"
    write_json(output, comparison)
    status.update({
        "stage": "comparison_unblinded", "comparisonLabelsRevealed": True,
        "nextAction": "compute_frozen_gate",
    })
    append_event(workspace, status, "comparison_unblinded", (output,))


def exact_rate(pairs: list[tuple[str, str]]) -> float:
    return (
        sum(a == b and a not in (AMBIGUOUS, UNRESOLVED) for a, b in pairs) / len(pairs)
        if pairs else 1.0
    )


def review_metrics(workspace: Path) -> tuple[dict[str, Any], int]:
    a_rows = validate_entry(workspace, workspace / "revealed/reviewer_a.csv")
    b_rows = validate_entry(workspace, workspace / "revealed/reviewer_b.csv")
    category_fields = {
        "finalScore": ("final_home_score", "final_away_score"),
        "regulationSeries": ("regulation_home_series", "regulation_away_series"),
        "overtimeOccurrence": ("overtime_occurred",),
        "overtimeSeries": ("overtime_home_series", "overtime_away_series"),
    }
    metrics = {}
    for name, fields in category_fields.items():
        metrics[name] = exact_rate([(a[field], b[field]) for a, b in zip(a_rows, b_rows, strict=True) for field in fields])
    edge_pairs = [
        (a[field], b[field]) for a, b in zip(a_rows, b_rows, strict=True)
        if a["edge_selector"] != "NOT_ASSIGNED" for field in EDGE_FIELDS
    ]
    metrics["edgeTreatment"] = exact_rate(edge_pairs)
    severe = 0
    for a, b in zip(a_rows, b_rows, strict=True):
        if any(a[field] != b[field] for field in ("final_home_score", "final_away_score", "overtime_occurred", "overtime_home_series", "overtime_away_series")):
            severe += 1
        for field in ("regulation_home_series", "regulation_away_series"):
            if AMBIGUOUS in (a[field], b[field]) or abs(int(a[field]) - int(b[field])) >= 2:
                severe += 1
        if a["edge_selector"] != "NOT_ASSIGNED" and any(a[field] != b[field] for field in EDGE_FIELDS):
            severe += 1
    return metrics, severe


def target_metrics(workspace: Path) -> tuple[dict[str, Any], int, int]:
    truth_rows = read_json(workspace / "official-truth.json")["rows"]
    comp_rows = read_json(workspace / "unblinded-comparison.json")["rows"]
    truth = {row["game_id"]: row for row in truth_rows}
    comp = {row["game_id"]: row for row in comp_rows}
    categories = {
        "finalScore": ("final_home_score", "final_away_score"),
        "regulationSeries": ("regulation_home_series", "regulation_away_series"),
        "overtimeOccurrence": ("overtime_occurred",),
        "overtimeSeries": ("overtime_home_series", "overtime_away_series"),
    }
    metrics = {}
    for name, fields in categories.items():
        pairs = [(truth[game][field], comp[game][field]) for game in truth for field in fields]
        metrics[name] = exact_rate(pairs)
    edge_games = [game for game in truth if truth[game]["edge_creates_series"] != "NOT_ASSIGNED"]
    metrics["edgeTreatment"] = exact_rate([
        (truth[game][field], comp[game][field]) for game in edge_games for field in EDGE_FIELDS
    ])
    unresolved = sum(value == UNRESOLVED for row in truth.values() for value in (row[field] for field in TARGET_FIELDS))
    severe = unresolved
    for game, t in truth.items():
        c = comp[game]
        if any(t[field] != c[field] for field in ("final_home_score", "final_away_score", "overtime_occurred", "overtime_home_series", "overtime_away_series")):
            severe += 1
        for field in ("regulation_home_series", "regulation_away_series"):
            if t[field] == UNRESOLVED or abs(int(t[field]) - int(c[field])) >= 2:
                severe += 1
        if t["edge_creates_series"] != "NOT_ASSIGNED" and any(t[field] != c[field] for field in EDGE_FIELDS):
            severe += 1
    return metrics, severe, unresolved


def cmd_compute_gate(root: Path, workspace: Path) -> None:
    status = verify_workspace(root, workspace)
    require_stage(status, "comparison_unblinded")
    review, review_severe = review_metrics(workspace)
    target, target_severe, unresolved = target_metrics(workspace)
    review_pass = (
        review["finalScore"] == 1.0 and review["regulationSeries"] >= 0.98
        and review["overtimeOccurrence"] == 1.0 and review["overtimeSeries"] >= 0.98
        and review["edgeTreatment"] >= 0.95 and review_severe == 0
    )
    target_pass = all(value == 1.0 for value in target.values()) and target_severe == 0 and unresolved == 0
    result = "pass" if review_pass and target_pass else "reject_all"
    gate = {
        "schemaVersion": "engine-os-r1-v2-gate-v1",
        "protocolId": PROTOCOL_ID,
        "result": result,
        "r2Authorized": result == "pass",
        "reviewProcess": {"metrics": review, "severeDisagreements": review_severe, "pass": review_pass},
        "targetAgreement": {
            "metrics": target, "severeErrors": target_severe,
            "sourceUnavailableOrUnresolved": unresolved, "pass": target_pass,
        },
        "officialTruthSha256": sha256_file(workspace / "official-truth.json"),
        "comparisonSha256": sha256_file(workspace / "unblinded-comparison.json"),
    }
    output = workspace / "gate-result.json"
    write_json(output, gate)
    status.update({
        "stage": "gate_computed", "status": result, "r2Authorized": result == "pass",
        "nextAction": "r2_may_begin" if result == "pass" else "r2_remains_blocked",
    })
    append_event(workspace, status, "gate_computed", (output,), {"result": result})


def cmd_verify(root: Path, workspace: Path | None) -> None:
    parent = verify_parent(root)
    result: dict[str, Any] = {
        "status": "verified", "protocolId": PROTOCOL_ID,
        "preregistrationSha256": PREREG_SHA256, "parentSampleGameCount": len(parent["manifest"]["sample"]),
        "parentR1V1Preserved": True,
    }
    if workspace is not None:
        marker = workspace / "PROTOCOL_INVALID.json"
        if marker.exists():
            terminal = read_json(marker)
            result.update({"workflowStatus": "protocol_invalid", "r2Authorized": False,
                           "terminalReason": terminal.get("reason")})
        else:
            status = verify_workspace(root, workspace)
            result.update({"workflowStatus": status["status"], "stage": status["stage"],
                           "r2Authorized": status["r2Authorized"]})
    print(json.dumps(result, sort_keys=True))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=(
        "verify-parent", "freeze-protocol", "prepare-review-bundles", "register-role",
        "verify-independent-role-set", "commit-entry", "register-entry-commitments",
        "reveal-entries", "build-discrepancies", "freeze-adjudication",
        "freeze-truth", "unblind-comparison", "compute-gate", "verify",
    ))
    parser.add_argument("--root", type=Path, default=project_root())
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--role", choices=ROLES)
    parser.add_argument("--attestation", type=Path)
    parser.add_argument("--entry", type=Path)
    parser.add_argument("--salt-commitment")
    parser.add_argument("--reviewer-a-entry", type=Path)
    parser.add_argument("--reviewer-b-entry", type=Path)
    parser.add_argument("--adjudication-file", type=Path)
    parser.add_argument("--comparison-file", type=Path)
    parser.add_argument("--exporter-attestation", type=Path)
    return parser.parse_args()


def require(value: Any, name: str) -> Any:
    if value is None:
        raise ProtocolViolation(f"missing_argument:{name}")
    return value


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    workspace = args.workspace.resolve() if args.workspace else None
    try:
        if args.command == "verify-parent":
            cmd_verify(root, None)
        elif args.command == "verify":
            cmd_verify(root, workspace)
        else:
            workspace = require(workspace, "workspace")
            if args.command == "freeze-protocol":
                cmd_freeze_protocol(root, workspace)
            elif args.command == "prepare-review-bundles":
                cmd_prepare_review_bundles(root, workspace)
            elif args.command == "register-role":
                cmd_register_role(root, workspace, require(args.role, "role"), require(args.attestation, "attestation"))
            elif args.command == "verify-independent-role-set":
                cmd_verify_roles(root, workspace)
            elif args.command == "commit-entry":
                cmd_commit_entry(root, workspace, require(args.role, "role"), require(args.entry, "entry"), require(args.salt_commitment, "salt-commitment"))
            elif args.command == "register-entry-commitments":
                cmd_register_commitments(root, workspace)
            elif args.command == "reveal-entries":
                cmd_reveal_entries(root, workspace, require(args.reviewer_a_entry, "reviewer-a-entry"), require(args.reviewer_b_entry, "reviewer-b-entry"))
            elif args.command == "build-discrepancies":
                cmd_build_discrepancies(root, workspace)
            elif args.command == "freeze-adjudication":
                cmd_freeze_adjudication(root, workspace, require(args.adjudication_file, "adjudication-file"))
            elif args.command == "freeze-truth":
                cmd_freeze_truth(root, workspace)
            elif args.command == "unblind-comparison":
                cmd_unblind(root, workspace, require(args.comparison_file, "comparison-file"), require(args.exporter_attestation, "exporter-attestation"))
            elif args.command == "compute-gate":
                cmd_compute_gate(root, workspace)
        return 0
    except AwaitingHuman as exc:
        print(json.dumps({"status": "awaiting_human_review", "reason": str(exc), "r2Authorized": False}, sort_keys=True))
        return 3
    except (ProtocolViolation, OSError, KeyError, ValueError, json.JSONDecodeError) as exc:
        if workspace is not None and args.command != "verify-parent":
            mark_protocol_invalid(workspace, str(exc))
        print(json.dumps({"status": "protocol_invalid", "reason": str(exc), "r2Authorized": False}, sort_keys=True), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
