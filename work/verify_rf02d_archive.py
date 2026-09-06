"""Read-only integrity audit of an atomically completed RF-02D archive.

This checks artifact integrity and source pins, not scientific acceptance.
It cannot launch, resume, grade, fit, repair, or finalize an experiment.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time

REPOSITORY = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OUTPUT_PARENT = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data')
HEX = re.compile(r'[0-9a-f]{64}\Z')
FLAT = re.compile(r'[a-z0-9][a-z0-9.-]*\Z')
STAGING = re.compile(r'\.completion-staging-[0-9a-f]{16}\Z')


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def parse(raw):
    def pairs(values):
        result = {}
        for key, value in values:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    def constant(value):
        raise ValueError('nonfinite JSON constant: ' + value)
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


def directory(path):
    require(path.is_absolute() and '..' not in path.parts, 'absolute canonical directory required')
    fd = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.parts[1:]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def read(fd, name, keep=False):
    digest = hashlib.sha256()
    size = 0
    content = []
    child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
    with os.fdopen(child, 'rb') as stream:
        require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), 'nonregular artifact')
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
            if keep:
                require(size <= 32 * 1024 * 1024, 'metadata artifact too large')
                content.append(chunk)
    return {'sha256': digest.hexdigest(), 'bytes': size}, b''.join(content) if keep else None


def verify(run_path, expected_manifest_sha256):
    started = time.monotonic()
    require(run_path.parent == OUTPUT_PARENT and run_path.name.startswith('rf02d-v1-'), 'wrong run parent or family')
    require(HEX.fullmatch(expected_manifest_sha256), 'expected manifest hash required')
    run_fd = directory(run_path)
    completion_fd = None
    staging_fds = {}
    try:
        completion_fd = os.open('completion', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=run_fd)
        index_pin, index_raw = read(completion_fd, 'artifact-index.json', keep=True)
        index = parse(index_raw)
        require(type(index) is dict and set(index) == {'files', 'uncommitted_staging', 'uncommitted_artifacts'}
                and type(index['files']) is dict, 'bad complete index')
        files = index['files']
        staging = index['uncommitted_staging']
        uncommitted = index['uncommitted_artifacts']
        require(type(staging) is list and all(type(name) is str and STAGING.fullmatch(name) for name in staging)
                and len(staging) == len(set(staging)), 'bad staging evidence declarations')
        require(type(uncommitted) is list and all(type(name) is str and FLAT.fullmatch(name)
                and '..' not in name and name in files for name in uncommitted)
                and len(uncommitted) == len(set(uncommitted)), 'bad uncommitted artifact declarations')
        for name in staging:
            staging_fds[name] = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=run_fd)
        require({'manifest.json', 'completion/terminal.json'} <= set(files), 'missing manifest or terminal')
        observed = {}
        terminal = manifest = None
        for name, expected in files.items():
            require(time.monotonic() - started <= 600, 'integrity audit time limit')
            require(type(name) is str, 'nonstring indexed name')
            pieces = name.split('/')
            is_staging = len(pieces) == 2 and pieces[0] in staging_fds and pieces[1] in ('terminal.json', 'artifact-index.json')
            require(name == 'completion/terminal.json' or is_staging or (FLAT.fullmatch(name) and '..' not in name), 'unsafe indexed name')
            require(type(expected) is dict and set(expected) == {'sha256', 'bytes'}
                    and type(expected['sha256']) is str and HEX.fullmatch(expected['sha256'])
                    and type(expected['bytes']) is int and expected['bytes'] >= 0, 'bad indexed pointer')
            keep = name in ('manifest.json', 'completion/terminal.json')
            owner_fd = staging_fds[pieces[0]] if is_staging else completion_fd if name.startswith('completion/') else run_fd
            actual, raw = read(owner_fd, pieces[-1], keep=keep)
            require(actual == expected, 'artifact mismatch: ' + name)
            observed[name] = actual
            if name == 'manifest.json':
                require(actual['sha256'] == expected_manifest_sha256, 'unexpected run manifest')
                manifest = parse(raw)
            elif name == 'completion/terminal.json':
                terminal = parse(raw)
        require(not (staging or uncommitted) or terminal.get('status') == 'protocol_invalid', 'uncommitted bytes require invalid authoritative terminal')
        expected_outer = {name for name in files if '/' not in name} | {'completion'} | set(staging)
        require(set(os.listdir(run_fd)) == expected_outer, 'unindexed outer artifact or undeclared staging remainder')
        require(set(os.listdir(completion_fd)) == {'terminal.json', 'artifact-index.json'}, 'unexpected completion member')
        for name, fd in staging_fds.items():
            expected_children = {key.split('/')[1] for key in files if key.startswith(name + '/')}
            require(set(os.listdir(fd)) == expected_children, 'unindexed staging evidence')
        require(type(manifest.get('code_hashes')) is dict and len(manifest['code_hashes']) == 43, '43 source pins required')
        for name, digest in manifest['code_hashes'].items():
            path = Path(name)
            require(not path.is_absolute() and '..' not in path.parts and name.startswith(('scripts/research_score_', 'tests/research-score')), 'unsafe source pin')
            # Resolve parent directories with no symlink following.
            parent_fd = directory(REPOSITORY / path.parent)
            try:
                actual, _ = read(parent_fd, path.name)
                require(actual['sha256'] == digest, 'source pin mismatch: ' + name)
            finally:
                os.close(parent_fd)
        return {'version': 'rf02d-read-only-integrity-audit.v1', 'status': 'passed_integrity_only',
                'run_directory': str(run_path), 'expected_manifest_sha256': expected_manifest_sha256,
                'index': index_pin, 'indexed_files': len(files),
                'indexed_bytes': sum(value['bytes'] for value in observed.values()),
                'current_source_pins_verified': 43, 'terminal_reported_status': terminal.get('status'),
                'authoritative_terminal': 'completion/terminal.json',
                'uncommitted_staging': staging, 'uncommitted_artifacts': uncommitted,
                'seconds': time.monotonic() - started,
                'scientific_acceptance_established': False, 'historical_fit_or_score_calls': 0}
    finally:
        for fd in (*staging_fds.values(), completion_fd, run_fd):
            if fd is not None:
                os.close(fd)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run_directory', type=Path)
    parser.add_argument('expected_manifest_sha256')
    args = parser.parse_args()
    print(json.dumps(verify(args.run_directory, args.expected_manifest_sha256), indent=2, sort_keys=True))
