#!/usr/bin/env python3
"""Upload, audit, restore, and verify the OS-00 content-addressed R2 archive."""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import ssl
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import quote, urlsplit


DEFAULT_MANIFEST = Path(".planning/engine-os/execution/os-00/r2-archive-manifest.v1.json")
TOKEN_ENV = "ENGINE_OS_EVIDENCE_ARCHIVE_TOKEN"
OPERATOR_PATH = "/__engine-os/evidence-archive/v1/object"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_relative_path(value: str) -> Path:
    pure = PurePosixPath(value)
    if pure.is_absolute() or not pure.parts or any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError(f"unsafe archive path: {value}")
    return Path(*pure.parts)


def confined_path(root: Path, value: str) -> Path:
    root = root.resolve()
    candidate = root / safe_relative_path(value)
    try:
        candidate.resolve(strict=False).relative_to(root)
    except ValueError as error:
        raise ValueError(f"archive path escapes the restore root through a symlink: {value}") from error
    return candidate


def load_manifest(path: Path) -> Mapping[str, Any]:
    digest_path = path.with_suffix(".sha256")
    fields = digest_path.read_text(encoding="utf-8").strip().split()
    if len(fields) != 2 or fields[1] != path.name:
        raise ValueError(f"invalid archive manifest digest file: {digest_path}")
    actual = sha256_file(path)
    if actual != fields[0]:
        raise ValueError(f"archive manifest digest mismatch: expected {fields[0]}, got {actual}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != "engine-os.os-00-r2-archive-manifest.v1":
        raise ValueError("unsupported archive manifest schema")
    objects = payload.get("objects")
    if not isinstance(objects, list) or len(objects) != int(payload.get("objectCount", -1)):
        raise ValueError("archive manifest object count is invalid")
    if sum(int(item["bytes"]) for item in objects) != int(payload.get("totalBytes", -1)):
        raise ValueError("archive manifest byte total is invalid")
    seen_paths: set[str] = set()
    seen_keys: set[str] = set()
    for item in objects:
        local_path = str(item["localPath"])
        r2_key = str(item["r2Key"])
        digest = str(item["sha256"])
        safe_relative_path(local_path)
        safe_relative_path(r2_key)
        if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
            raise ValueError(f"invalid object digest: {local_path}")
        if not r2_key.endswith(f"/{digest}"):
            raise ValueError(f"object key is not content-addressed: {r2_key}")
        if local_path in seen_paths or r2_key in seen_keys:
            raise ValueError("archive manifest contains duplicate paths or keys")
        seen_paths.add(local_path)
        seen_keys.add(r2_key)
    return payload


@dataclass(frozen=True)
class Endpoint:
    scheme: str
    host: str
    port: int | None
    path: str


def parse_endpoint(value: str) -> Endpoint:
    parsed = urlsplit(value)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.query or parsed.fragment:
        raise ValueError("archive endpoint must be an HTTP(S) URL without query or fragment")
    if parsed.scheme != "https" and parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("archive endpoint must use HTTPS outside localhost")
    path = parsed.path.rstrip("/")
    if path != OPERATOR_PATH:
        raise ValueError(f"archive endpoint path must be exactly {OPERATOR_PATH}")
    return Endpoint(parsed.scheme, parsed.hostname, parsed.port, path)


def connection(endpoint: Endpoint, timeout: int = 600) -> http.client.HTTPConnection:
    if endpoint.scheme == "https":
        return http.client.HTTPSConnection(
            endpoint.host, endpoint.port, timeout=timeout, context=ssl.create_default_context()
        )
    return http.client.HTTPConnection(endpoint.host, endpoint.port, timeout=timeout)


def object_path(endpoint: Endpoint, r2_key: str) -> str:
    return f"{endpoint.path}?key={quote(r2_key, safe='')}"


def response_error(method: str, r2_key: str, status: int, body: bytes) -> RuntimeError:
    message = body.decode("utf-8", errors="replace")[:500]
    return RuntimeError(f"archive {method} failed for {r2_key}: HTTP {status}: {message}")


def request_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "User-Agent": "engine-os-os00-archive/1"}


def remote_head(endpoint: Endpoint, token: str, item: Mapping[str, Any]) -> Mapping[str, str]:
    conn = connection(endpoint)
    key = str(item["r2Key"])
    try:
        conn.request("HEAD", object_path(endpoint, key), headers=request_headers(token))
        response = conn.getresponse()
        body = response.read()
        if response.status != 200:
            raise response_error("HEAD", key, response.status, body)
        headers = {name.lower(): value for name, value in response.getheaders()}
        if headers.get("x-content-sha256") != str(item["sha256"]):
            raise RuntimeError(f"remote sha256 metadata mismatch for {key}")
        if int(headers.get("content-length", "-1")) != int(item["bytes"]):
            raise RuntimeError(f"remote byte count mismatch for {key}")
        return headers
    finally:
        conn.close()


def upload_object(endpoint: Endpoint, token: str, root: Path, item: Mapping[str, Any]) -> str:
    path = confined_path(root, str(item["localPath"]))
    expected_bytes = int(item["bytes"])
    expected_sha256 = str(item["sha256"])
    if not path.is_file() or path.stat().st_size != expected_bytes or sha256_file(path) != expected_sha256:
        raise RuntimeError(f"local object failed verification before upload: {path}")
    key = str(item["r2Key"])
    last_error: Exception | None = None
    for attempt in range(4):
        conn = connection(endpoint)
        try:
            conn.putrequest("PUT", object_path(endpoint, key))
            for name, value in request_headers(token).items():
                conn.putheader(name, value)
            conn.putheader("Content-Length", str(expected_bytes))
            conn.putheader("Content-Type", "application/octet-stream")
            conn.putheader("X-Content-SHA256", expected_sha256)
            conn.endheaders()
            with path.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    conn.send(chunk)
            response = conn.getresponse()
            body = response.read()
            if response.status in {200, 201}:
                payload = json.loads(body.decode("utf-8"))
                if payload.get("sha256") != expected_sha256 or int(payload.get("bytes", -1)) != expected_bytes:
                    raise RuntimeError(f"upload receipt mismatch for {key}")
                return str(payload.get("status", "stored"))
            error = response_error("PUT", key, response.status, body)
            if response.status not in {429, 500, 502, 503, 504}:
                raise error
            last_error = error
        except (OSError, http.client.HTTPException) as error:
            last_error = error
        finally:
            conn.close()
        if attempt < 3:
            time.sleep(2**attempt)
    raise RuntimeError(f"upload retries exhausted for {key}: {last_error}")


def download_object(endpoint: Endpoint, token: str, destination: Path, item: Mapping[str, Any]) -> str:
    target = confined_path(destination, str(item["localPath"]))
    expected_bytes = int(item["bytes"])
    expected_sha256 = str(item["sha256"])
    if target.exists():
        if target.is_file() and target.stat().st_size == expected_bytes and sha256_file(target) == expected_sha256:
            return "deduplicated"
        raise RuntimeError(f"refusing to overwrite corrupt restore target: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.partial-{uuid.uuid4().hex}")
    conn = connection(endpoint)
    key = str(item["r2Key"])
    try:
        conn.request("GET", object_path(endpoint, key), headers=request_headers(token))
        response = conn.getresponse()
        if response.status != 200:
            body = response.read()
            raise response_error("GET", key, response.status, body)
        headers = {name.lower(): value for name, value in response.getheaders()}
        if headers.get("x-content-sha256") != expected_sha256:
            raise RuntimeError(f"download sha256 metadata mismatch for {key}")
        if int(headers.get("content-length", "-1")) != expected_bytes:
            raise RuntimeError(f"download byte metadata mismatch for {key}")
        digest = hashlib.sha256()
        byte_count = 0
        with temporary.open("xb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
                digest.update(chunk)
                byte_count += len(chunk)
        if byte_count != expected_bytes or digest.hexdigest() != expected_sha256:
            raise RuntimeError(f"downloaded object failed verification: {key}")
        os.replace(temporary, target)
        return "restored"
    finally:
        conn.close()
        if temporary.exists():
            temporary.unlink()


def verify_local(root: Path, objects: Sequence[Mapping[str, Any]], workers: int) -> dict[str, int]:
    def verify(item: Mapping[str, Any]) -> int:
        path = confined_path(root, str(item["localPath"]))
        if not path.is_file():
            raise RuntimeError(f"missing local archive object: {path}")
        if path.stat().st_size != int(item["bytes"]):
            raise RuntimeError(f"local archive byte mismatch: {path}")
        if sha256_file(path) != str(item["sha256"]):
            raise RuntimeError(f"local archive sha256 mismatch: {path}")
        return int(item["bytes"])

    total = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(verify, item) for item in objects]
        for future in as_completed(futures):
            total += future.result()
    return {"objects": len(objects), "bytes": total}


def run_parallel(
    objects: Sequence[Mapping[str, Any]], workers: int, operation: Any
) -> dict[str, int]:
    counts: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(operation, item) for item in objects]
        for future in as_completed(futures):
            status = str(future.result())
            counts[status] = counts.get(status, 0) + 1
    return counts


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("verify-local", "upload", "audit-remote", "restore"))
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--endpoint",
        help=f"exact temporary operator URL ending in {OPERATOR_PATH}",
    )
    parser.add_argument("--workers", type=int, default=3)
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    root = args.root.resolve()
    manifest_path = args.manifest if args.manifest.is_absolute() else Path.cwd() / args.manifest
    manifest = load_manifest(manifest_path.resolve())
    objects = manifest["objects"]
    if args.workers < 1 or args.workers > 8:
        raise ValueError("workers must be between 1 and 8")
    if args.action == "verify-local":
        result: Mapping[str, Any] = verify_local(root, objects, args.workers)
    else:
        if not args.endpoint:
            raise ValueError("--endpoint is required for remote archive actions")
        token = os.environ.get(TOKEN_ENV, "")
        if len(token) < 32:
            raise ValueError(f"{TOKEN_ENV} must be set to a secret token")
        endpoint = parse_endpoint(args.endpoint)
        if args.action == "upload":
            verify_local(root, objects, args.workers)
            result = run_parallel(
                objects,
                args.workers,
                lambda item: upload_object(endpoint, token, root, item),
            )
        elif args.action == "audit-remote":
            run_parallel(objects, args.workers, lambda item: (remote_head(endpoint, token, item), "verified")[1])
            result = {"verified": len(objects)}
        else:
            result = run_parallel(
                objects,
                args.workers,
                lambda item: download_object(endpoint, token, root, item),
            )
            verify_local(root, objects, args.workers)
    print(json.dumps({"action": args.action, "result": result}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"OS-00 R2 archive failed: {error}", file=sys.stderr)
        raise SystemExit(1)
