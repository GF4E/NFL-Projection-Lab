#!/usr/bin/env python3
"""Verify ADR-0001's machine-readable ownership and quarantine inventory."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping, Sequence


CREATE_TABLE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?[`\"\[]?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)",
    re.IGNORECASE,
)


@dataclass
class Result:
    errors: list[str] = field(default_factory=list)

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            self.errors.append(message)


def discovered_tables(root: Path, relative_roots: Sequence[str], suffixes: set[str]) -> set[str]:
    tables: set[str] = set()
    for relative_root in relative_roots:
        directory = root / relative_root
        if not directory.is_dir():
            continue
        for path in directory.rglob("*"):
            if path.is_file() and path.suffix in suffixes:
                tables.update(match.lower() for match in CREATE_TABLE.findall(path.read_text(errors="ignore")))
    return tables


def unique_values(rows: Sequence[Mapping[str, object]], key: str, result: Result, label: str) -> set[str]:
    values = [str(row[key]) for row in rows]
    result.require(len(values) == len(set(values)), f"duplicate {label}: {values}")
    return set(values)


def compare_registry(actual: set[str], declared: set[str], result: Result, label: str) -> None:
    missing = sorted(actual - declared)
    stale = sorted(declared - actual)
    result.require(not missing, f"{label} missing from ownership registry: {missing}")
    result.require(not stale, f"{label} declared but not found in source: {stale}")


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--registry",
        type=Path,
        default=Path(".planning/engine-os/execution/os-00/ownership-registry.json"),
    )
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    root = args.repo_root.resolve()
    registry_path = args.registry if args.registry.is_absolute() else root / args.registry
    result = Result()
    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ownership registry cannot be read: {error}", file=sys.stderr)
        return 1

    expected_planes = {"git", "r2", "d1", "worker", "computeRunner"}
    result.require(set(registry.get("authoritativePlanes", {})) == expected_planes, "authoritative planes changed")

    declared_d1 = [str(value) for value in registry.get("d1Tables", [])]
    result.require(len(declared_d1) == len(set(declared_d1)), "D1 table registry contains duplicates")
    actual_d1 = discovered_tables(root, ("drizzle", "src/server"), {".sql", ".ts"})
    compare_registry(actual_d1, set(declared_d1), result, "D1 tables")

    quarantine = registry.get("supabaseQuarantine", {})
    result.require(quarantine.get("authority") == "none", "Supabase has an authority assignment")
    result.require(quarantine.get("executionAllowed") is False, "Supabase execution is not fail-closed")
    result.require(
        quarantine.get("networkAccessAllowedFromActiveEngine") is False,
        "Supabase network access is not forbidden",
    )
    actual_supabase = discovered_tables(root, ("supabase/migrations",), {".sql"})
    compare_registry(
        actual_supabase,
        {str(value) for value in quarantine.get("legacyTables", [])},
        result,
        "Supabase legacy tables",
    )

    unique_values(registry.get("r2ObjectFamilies", []), "family", result, "R2 object family")
    jobs = registry.get("jobs", [])
    unique_values(jobs, "job", result, "job")
    unique_values(registry.get("modules", []), "module", result, "module")
    unique_values(registry.get("secrets", []), "name", result, "secret")
    legacy_job = next((row for row in jobs if row.get("job") == "legacy-supabase-job-api"), None)
    result.require(legacy_job is not None, "legacy Supabase job is not inventoried")
    if legacy_job is not None:
        result.require(legacy_job.get("owner") == "none-quarantined", "legacy Supabase job has an active owner")
        result.require(legacy_job.get("status") == "must-be-unreachable", "legacy Supabase job is not quarantined")

    read_module = next(
        (row for row in registry.get("modules", []) if row.get("module") == "read-serving"), None
    )
    result.require(read_module is not None, "read-serving module is absent")
    if read_module is not None:
        result.require(read_module.get("requestSideEffectsAllowed") is False, "public reads permit side effects")

    worker_path = root / "worker/index.ts"
    if worker_path.is_file():
        worker = worker_path.read_text(encoding="utf-8")
        fetch_match = re.search(r"async fetch\b(?P<body>.*?)(?:\n\s*async scheduled\b)", worker, re.DOTALL)
        result.require(fetch_match is not None, "Worker fetch/scheduled boundary cannot be located")
        if fetch_match is not None:
            fetch_body = fetch_match.group("body")
            result.require("runBackgroundMaintenance" not in fetch_body, "public fetch invokes background maintenance")
            result.require("runModelLifecycleAutomation" not in fetch_body, "public fetch invokes model lifecycle")
            result.require("readOnlyD1(env.DB)" in fetch_body, "public fetch lacks the SELECT-only D1 capability")
    else:
        result.errors.append("worker/index.ts is missing")

    runner_path = root / "src/server/jobs/runner.ts"
    if runner_path.is_file():
        runner = runner_path.read_text(encoding="utf-8")
        result.require("createAdminClient" not in runner, "legacy job runner can create a Supabase client")
        result.require("fetchOddsSnapshots" not in runner, "legacy job runner can fetch provider data")
        result.require("throw new Error" in runner, "legacy job runner is not a fail-closed tombstone")
    else:
        result.errors.append("legacy job runner tombstone is missing")

    route_path = root / "src/app/api/jobs/[job]/route.ts"
    if route_path.is_file():
        route = route_path.read_text(encoding="utf-8")
        result.require("status: 410" in route, "legacy job route does not return HTTP 410")
        result.require("runJob" not in route, "legacy job route still imports or calls runJob")
    else:
        result.errors.append("legacy job route is missing rather than explicitly retired")

    payload = {
        "status": "pass" if not result.errors else "fail",
        "d1Tables": len(actual_d1),
        "supabaseLegacyTables": len(actual_supabase),
        "r2ObjectFamilies": len(registry.get("r2ObjectFamilies", [])),
        "jobs": len(jobs),
        "modules": len(registry.get("modules", [])),
        "secrets": len(registry.get("secrets", [])),
        "errors": result.errors,
    }
    if args.json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(
            f"OS-00 ownership verification {payload['status']}: "
            f"{payload['d1Tables']} D1 tables, {payload['supabaseLegacyTables']} quarantined tables, "
            f"{payload['jobs']} jobs"
        )
        for error in result.errors:
            print(f"ERROR: {error}", file=sys.stderr)
    return 0 if not result.errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
