"""Wrap frozen workers, then export and push the read-only board. No new feeds."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.board_bridge import publish
from scripts.nfl_engine_autopush import guard, git, REMOTE


def push_board():
    if git('symbolic-ref', '--short', 'HEAD').strip() != b'engine-v2' or git('remote', 'get-url', 'origin').decode().strip() != REMOTE:
        raise RuntimeError('Unexpected publication branch or remote')
    allowed = ('outputs/model-pick-v1/board.json', 'outputs/model-pick-v1/board-versions/', 'outputs/model-pick-v1/result-refreshes/', 'outputs/model-pick-v1/final-sources/', 'outputs/model-pick-v1/grades/', 'outputs/model-pick-v1/reports/', 'outputs/jaret/grades/', 'outputs/jaret/reports/', 'outputs/jaret/source-reports/')
    staged = git('diff', '--cached', '--name-only').decode().splitlines()
    if any(not any(p == a or p.startswith(a) for a in allowed) for p in staged):
        return {'state': 'PUBLICATION_PENDING_OTHER_STAGED_WORK'}
    git('add', '--', *allowed)
    guard()
    if git('diff', '--cached', '--name-only').strip():
        git('commit', '-m', 'feat(board): publish locked verdicts and first grades')
    # Retry transport on later ticks, not provider dispatch. No force/rebase.
    local = git('rev-parse', 'HEAD').decode().strip()
    remote = git('ls-remote', 'origin', 'refs/heads/engine-v2').decode().split()[0]
    if local != remote:
        git('push', 'origin', 'HEAD:refs/heads/engine-v2')
    return {'state': 'PUBLISHED', 'commit': local}


def run(mode):
    out = ROOT/'outputs/model-pick-v1'
    if mode != 'publish':
        script = 'model_pick_runner.py' if mode == 'capture' else 'model_pick_daily.py'
        p = subprocess.run([sys.executable, '-B', str(ROOT/'scripts'/script)], cwd=ROOT)
        if p.returncode:
            print(json.dumps({'worker_exit_code': p.returncode}), flush=True)
    if mode == 'daily':
        from engine.board_results import refresh
        try: print(json.dumps({'public_final_refresh': refresh()}), flush=True)
        except Exception as exc: print(json.dumps({'public_final_refresh': 'FAILED_LAST_GOOD_RETAINED', 'error_type': type(exc).__name__}), flush=True)
    # Bridge is a separate process boundary from the frozen quote-only worker.
    with (out/'.board-publish.lock').open('a+') as f:
        try: fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: return
        result = publish()
        # Check local changes first to avoid polling GitHub every 15 seconds.
        dirty = git('status', '--porcelain', '--', 'outputs/model-pick-v1/board.json', 'outputs/model-pick-v1/board-versions').strip()
        marker = out/'.board-pushed.json'
        previous = json.loads(marker.read_text()) if marker.exists() else {}
        if dirty or previous.get('sha256') != result['sha256']:
            pushed = push_board()
            if pushed['state'] == 'PUBLISHED': marker.write_text(json.dumps({**pushed, 'sha256': result['sha256']}))
            print(json.dumps({**result, **pushed}), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('mode', choices=['capture', 'daily', 'publish'])
    run(p.parse_args().mode)
