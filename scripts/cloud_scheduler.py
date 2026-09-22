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
ALLOWED = ('work/projection-observations-v1/', 'outputs/cadence-v2/', 'outputs/board-v8-market/', 'outputs/board-v7/', 'outputs/in-season-learning-v1/', 'work/in-season-learning-v1/', 'CHANGELOG.md', 'outputs/projection-v3/', 'work/projection-v3/', 'outputs/projection-v2/', 'work/projection-v2/', 'outputs/projection-v1/', 'work/projection-v1/', 'outputs/game-card-v3/', 'outputs/human-tickets-v1/', 'outputs/iron-man-v1/', 'outputs/model-pick-v1/', 'outputs/jarrett/', 'outputs/scorecard.csv',
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
    from scripts.board_v8_market_publish import run as publish_book_display
    publish_book_display(ROOT)
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
    if git('ls-remote', 'origin', 'refs/heads/engine-v2').decode().split()[0] != head:
        raise RuntimeError('Publication remote verification failed')
    return head


def weekly_capture_window(current):
    from zoneinfo import ZoneInfo
    local = current.astimezone(ZoneInfo('America/Los_Angeles'))
    if local.weekday() not in (0, 4, 5, 6):
        return False
    scheduled = local.replace(hour=9 if local.weekday()==0 else 7 if local.weekday() == 6 else 12, minute=0, second=0, microsecond=0)
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
            fcntl.flock(handle, fcntl.LOCK_EX | (0 if mode == 'learning' else fcntl.LOCK_NB))
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
        if mode in ('daily','learning'):
            from scripts.reference_line_refresh import refresh as refresh_audit_lines
            refresh_audit_lines(ROOT)
        from scripts.projection_publish import sync as sync_projection
        entries_synced=sync_projection()
        if mode=='learning':
            if not entries_synced: return {'state':'WAITING_FOR_ENTRY_SYNC'}
            from engine.board_results import refresh
            from scripts.suit_prepare import run as prepare_suit
            from scripts.projection_refresh import prepare
            from scripts.projection_v3_prepare import prepare as prepare_v3
            from scripts.projection_v3_publish import run as publish_projection
            from scripts.projection_learning import report,run_weekly
            refresh();prepare_suit(refresh=True);prepare();prepare_v3()
            publish_projection(require_synced_entries=True);report()
            from scripts.closeout_publish import run as closeout
            closed=closeout(publish_artifacts)
            if closed['state'] != 'PUBLISHED': return closed
            result=run_weekly()
            if result.get('state')=='REFIT_COMPLETE':prepare_v3()
            publish_projection(require_synced_entries=True);report()
            return {**result,'commit':publish_artifacts()}
        from engine.game_card_runtime import sync as sync_cards
        sync_cards(ROOT)
        code = worker('live_pick_runner.py' if mode == 'capture' else 'model_pick_daily.py')
        if mode == 'capture':
            code = max(code, worker('suit_runner.py'))
            from zoneinfo import ZoneInfo
            pt=dt.datetime.now(ZoneInfo('America/Los_Angeles'))
            marker=ROOT/'outputs/iron-man-v1/renders'/(pt.date().isoformat()+'.json')
            if pt.weekday()==6 and pt.hour==20 and not marker.exists():
                from scripts.suit_prepare import run as prepare_suit
                from engine.pick_store import put
                put(marker,prepare_suit(refresh=True))
        if mode == 'daily':
            from engine.board_results import refresh
            refresh()
            from engine.slip_grade import run as grade_slips
            grade_slips()
            from scripts.suit_daily import main as grade_suit
            grade_suit()
            from scripts.suit_prepare import run as prepare_suit
            marker=ROOT/'outputs/iron-man-v1/renders'/('daily-'+dt.datetime.now(dt.timezone.utc).date().isoformat()+'.json')
            if not marker.exists():
                from engine.pick_store import put
                put(marker,prepare_suit(refresh=True))
        if mode == 'daily':
            from engine.game_card_runtime import grade as grade_cards
            grade_cards(ROOT)
        from engine.live_scorecard import run as live_scorecard
        live_scorecard(ROOT)
        from engine.board_bridge import publish
        publish()
        if mode == 'daily':
            from engine.ticket_ledger import run as grade_tickets
            grade_tickets(ROOT, sync=True)
        from engine.suit_publish import publish as publish_suit
        publish_suit(ROOT)
        # Every capture tick retries finals independently of hourly model preparation.
        from engine.projection.finals import refresh as refresh_finals
        final_status=refresh_finals(ROOT)
        if final_status['state'] not in ('FRESH','REFRESHED'):
            print(json.dumps(final_status),flush=True)
        if (ROOT/'work/projection-v1/fit-ref.json').exists():
            if mode == 'daily':
                from scripts.projection_refresh import prepare, forecasts
                prepare()
                forecasts()
            if (ROOT/'work/projection-v3/fit-ref.json').exists():
                from scripts.projection_v3_prepare import prepare as prepare_v3
                from scripts.projection_v3_publish import run as publish_projection
                prepare_v3()
            elif (ROOT/'work/projection-v2/fit-ref.json').exists():
                from scripts.projection_v2_prepare import prepare as prepare_v2
                from scripts.projection_v2_publish import run as publish_projection
                # Reuse the refreshed football sources; no provider call or refit.
                prepare_v2()
            else:
                from scripts.projection_publish import run as publish_projection
            publish_projection(require_synced_entries=True)
            from scripts.projection_learning import report,run_weekly
            report()
            if mode=='daily' and entries_synced:
                from scripts.closeout_publish import run as closeout
                closed=closeout(publish_artifacts)
                weekly=run_weekly() if closed['state']=='PUBLISHED' else closed
                if weekly.get('state')=='REFIT_COMPLETE':
                    if (ROOT/'work/projection-v3/fit-ref.json').exists():prepare_v3()
                    publish_projection(require_synced_entries=True)
                    report()
        commit = publish_artifacts()
        if code:
            raise RuntimeError('Worker failed; available artifacts preserved')
        hour = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H')
        heartbeat = OUT/'.cloud-heartbeat.json'
        previous = json.loads(heartbeat.read_text()) if heartbeat.exists() else {}
        if previous.get('hour') != hour:
            print(json.dumps({'state': 'HEARTBEAT', 'host': host, 'hour': hour}), flush=True)
        heartbeat.write_text(json.dumps({'hour': hour, 'host': host, 'commit': commit}))
        return {'state': 'OK' if final_status['state'] in ('FRESH','REFRESHED') else 'DEGRADED',
                'mode': mode, 'commit': commit,'projection_final_feed':final_status}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['capture', 'daily', 'learning'])
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
