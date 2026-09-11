"""Branch-owned scheduler wrapper; frozen workers remain byte-for-byte unchanged.

The committed ownership lock has no timeout: loss of a heartbeat is not proof a
paid dispatch did not happen. Transfer ownership only after fencing the old host
and reconciling its capture receipts and quota ledger.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.nfl_engine_autopush import guard, REMOTE

LOCK_PATH = 'work/cloud-migration-v1/ownership.json'
OUT = ROOT/'outputs/model-pick-v1'
ALLOWED = ('outputs/model-pick-v1/', 'outputs/jarrett/', 'outputs/scorecard.csv',
           'work/model-pick-v1/daily/', 'work/model-pick-v1/sources/',
           'work/model-pick-v1/schedules/', 'work/model-pick-v1/states/',
           'work/model-pick-v1/depth/')
ENV = {**os.environ, 'GIT_TERMINAL_PROMPT': '0'}


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], env=ENV,
                                   stderr=subprocess.PIPE, timeout=45)


def permitted(record, host):
    return record.get('state') == 'ACTIVE' and record.get('owner') == host


def ownership():
    if git('branch', '--show-current').strip() != b'engine-v2':
        raise RuntimeError('Unexpected branch')
    if git('remote', 'get-url', 'origin').decode().strip() != REMOTE:
        raise RuntimeError('Unexpected remote')
    git('fetch', '--quiet', '--no-tags', 'origin', 'engine-v2')
    return json.loads(git('show', 'FETCH_HEAD:'+LOCK_PATH))


def synchronize():
    # No reset, force push or rebase. A conflict stops execution for inspection.
    git('merge', '--no-edit', 'FETCH_HEAD')


def allowed(path):
    return any(path.startswith(prefix) for prefix in ALLOWED)


def publish_artifacts():
    staged = git('diff', '--cached', '--name-only').decode().splitlines()
    if any(not allowed(p) for p in staged):
        raise RuntimeError('Unrelated staged work; publication deferred')
    changed = git('diff', '--name-only', '--diff-filter=D').decode().splitlines()
    if any(allowed(p) for p in changed):
        raise RuntimeError('Deletion requires owner approval')
    paths = [p for p in ALLOWED if (ROOT/p).exists()]
    git('add', '--', *paths)
    guard()
    if git('diff', '--cached', '--name-only').strip():
        git('commit', '-m', 'feat(scheduler): publish capture and grading artifacts')
    head = git('rev-parse', 'HEAD').decode().strip()
    remote = git('ls-remote', 'origin', 'refs/heads/engine-v2').decode().split()[0]
    if head != remote:
        git('push', 'origin', 'HEAD:refs/heads/engine-v2')
    return head


def weekly_capture_window(current):
    from zoneinfo import ZoneInfo
    local = current.astimezone(ZoneInfo('America/Los_Angeles'))
    if local.weekday() not in (4, 5, 6):
        return False
    scheduled = local.replace(hour=7 if local.weekday() == 6 else 12, minute=0, second=0, microsecond=0)
    return scheduled-dt.timedelta(minutes=6) <= local <= scheduled+dt.timedelta(minutes=1)


def capture_window(current=None):
    """Postpone preparation/grading during a capture/lock window."""
    current = current or dt.datetime.now(dt.timezone.utc)
    for folder in sorted((ROOT/'work/model-pick-v1/daily').glob('*'), reverse=True):
        p = folder/'schedule-ref.json'
        if not p.exists():
            continue
        from engine.pick_store import read_pinned
        schedule = read_pinned(json.loads(p.read_text()))
        return (weekly_capture_window(current) and any(dt.datetime.fromisoformat(g['cutoff_at']) > current for g in schedule['groups'])) or any(dt.datetime.fromisoformat(g['capture_at'])-dt.timedelta(minutes=6)
                   <= current <= dt.datetime.fromisoformat(g['cutoff_at'])+dt.timedelta(minutes=1)
                   for g in schedule['groups'])
    return False


def worker(script):
    result = subprocess.run([sys.executable, '-B', str(ROOT/'scripts'/script)],
                            cwd=ROOT, env=ENV, capture_output=True, text=True, timeout=650)
    # Do not print exception arguments, URLs, environment, or provider bodies.
    return result.returncode


def run(mode, host):
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT/'.cloud-dispatch.lock').open('a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'state': 'LOCAL_JOB_ACTIVE'}
        record = ownership()
        if not permitted(record, host):
            return {'state': 'YIELD_TO_OWNER', 'owner': record.get('owner')}
        synchronize()
        # Recover any pending artifact publication before another worker call.
        publish_artifacts()
        if mode == 'daily' and capture_window():
            return {'state': 'DEFERRED_CAPTURE_WINDOW'}
        code = worker('live_pick_runner.py' if mode == 'capture' else 'model_pick_daily.py')
        if mode == 'daily':
            from engine.board_results import refresh
            refresh()
            from engine.slip_grade import run as grade_slips
            grade_slips()
        from engine.live_scorecard import run as live_scorecard
        live_scorecard(ROOT)
        from engine.board_bridge import publish
        publish()
        commit = publish_artifacts()
        if code:
            raise RuntimeError('Worker failed; available artifacts preserved')
        hour = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H')
        heartbeat = OUT/'.cloud-heartbeat.json'
        previous = json.loads(heartbeat.read_text()) if heartbeat.exists() else {}
        if previous.get('hour') != hour:
            print(json.dumps({'state': 'HEARTBEAT', 'host': host, 'hour': hour}), flush=True)
        heartbeat.write_text(json.dumps({'hour': hour, 'host': host, 'commit': commit}))
        return {'state': 'OK', 'mode': mode, 'commit': commit}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['capture', 'daily'])
    parser.add_argument('--host', default=os.environ.get('NFL_RUNNER_ID', 'mac-fallback'))
    args = parser.parse_args()
    try:
        result = run(args.mode, args.host)
        if result['state'] not in ('OK', 'YIELD_TO_OWNER', 'LOCAL_JOB_ACTIVE'):
            print(json.dumps(result), flush=True)
    except Exception as exc:
        print(json.dumps({'state': 'FAILED_CLOSED', 'error_type': type(exc).__name__}), flush=True)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
