#!/usr/bin/env python3
"""Fail if the active source or production bundle can reach retired Supabase code."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


SOURCE_PATTERNS = {
    "Supabase package import": re.compile(rb"(?:from\s+|import\s*\()[\"']@supabase/"),
    "retired Supabase module import": re.compile(rb"[\"']@/server/supabase/"),
    "Supabase client factory": re.compile(rb"\b(?:createServerClient|createUserClient|createAdminClient)\b"),
    "Supabase runtime credential": re.compile(
        rb"\b(?:NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)\b"
    ),
}

BUILD_MARKERS = (
    b"@supabase/",
    b"supabase-js",
    b"createServerClient",
    b"NEXT_PUBLIC_SUPABASE_URL",
    b"NEXT_PUBLIC_SUPABASE_ANON_KEY",
    b"SUPABASE_SERVICE_ROLE_KEY",
    b"Legacy Supabase job runner is quarantined",
)

# Do not scan for the bare hostname ``supabase.co``. Vinext's generic image URL
# optimizer ships a provider-detection table containing that hostname even when
# this application has no Supabase client or network path. The markers above
# identify the retired package, client factory, credentials, and runner without
# rejecting that unrelated framework table.

DEPLOYMENT_ONLY_MARKERS = (
    b"NEXT_PUBLIC_SUPABASE_URL",
    b"NEXT_PUBLIC_SUPABASE_ANON_KEY",
    b"SUPABASE_SERVICE_ROLE_KEY",
    b"PIPELINE_WORKER_SECRET",
    b"PIPELINE_WORKER_URL",
    b"CRON_SECRET",
)


def files_under(root: Path, relative: str, suffixes: set[str] | None = None):
    directory = root / relative
    if not directory.exists():
        return
    for path in sorted(directory.rglob("*")):
        if path.is_file() and (suffixes is None or path.suffix in suffixes):
            yield path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--build-root", type=Path, default=Path("dist"))
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.repo_root.resolve()
    build_root = args.build_root if args.build_root.is_absolute() else root / args.build_root
    errors: list[str] = []
    scanned_source = 0
    scanned_build = 0

    package_path = root / "package.json"
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"package.json cannot be read: {error}")
        package = {}
    declared_packages = set(package.get("dependencies", {})) | set(package.get("devDependencies", {}))
    for name in ("@supabase/ssr", "@supabase/supabase-js"):
        if name in declared_packages:
            errors.append(f"retired package remains declared: {name}")
    lock_path = root / "pnpm-lock.yaml"
    if not lock_path.is_file():
        errors.append("pnpm-lock.yaml is missing")
    elif b"@supabase/" in lock_path.read_bytes():
        errors.append("retired Supabase packages remain in pnpm-lock.yaml")

    for relative in ("src", "worker"):
        for path in files_under(root, relative, {".ts", ".tsx", ".js", ".jsx"}):
            scanned_source += 1
            data = path.read_bytes()
            for label, pattern in SOURCE_PATTERNS.items():
                if pattern.search(data):
                    errors.append(f"{label} in active source: {path.relative_to(root)}")

    for relative in (".env.example", ".openai/hosting.json", "wrangler.json", "wrangler.jsonc", "wrangler.toml"):
        path = root / relative
        if not path.is_file():
            continue
        data = path.read_bytes()
        for marker in DEPLOYMENT_ONLY_MARKERS:
            if marker in data:
                errors.append(f"retired deployment variable {marker.decode()} remains in {relative}")

    if not build_root.is_dir():
        errors.append(f"production build is missing: {build_root}")
    else:
        for path in files_under(build_root, "."):
            scanned_build += 1
            data = path.read_bytes()
            for marker in BUILD_MARKERS:
                if marker in data:
                    errors.append(f"retired runtime marker {marker.decode()} bundled in {path.relative_to(root)}")

    payload = {
        "status": "pass" if not errors else "fail",
        "sourceFilesScanned": scanned_source,
        "buildFilesScanned": scanned_build,
        "errors": errors,
    }
    if args.json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(
            f"Active build graph verification {payload['status']}: "
            f"{scanned_source} source files, {scanned_build} build files"
        )
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
