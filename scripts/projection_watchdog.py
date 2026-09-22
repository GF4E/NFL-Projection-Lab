"""Independent observers; no production dispatch lock, provider calls, or refits."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.projection.storage import save
from engine.projection.watchdog import (UTC, POLICY, stamp, digest, board_identity,
                                       assess_source, assess_host, assess_outside, transition)
from engine.forecast_system.calendar import schedule_kickoff

HOST_STATE = Path('/run/nfl-engine-monitor')
MAC_STATE = Path.home()/'Library/Application Support/NFLProjectionMonitor'
PUBLIC_URL = 'https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/api/projection-board'
MAX_PUBLIC_BYTES = 8_000_000


def load(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def pinned(root, ref):
    path = (root/ref['path']).resolve()
    if not path.is_relative_to((root/'work/projection-v1').resolve()):
        raise ValueError('Unexpected schedule path')
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref['sha256']:
        raise ValueError('Schedule hash mismatch')
    return json.loads(raw)


def source_snapshot(root, now, epoch):
    out = root/'outputs/projection-v3'
    board = load(out/'board.json')
    ref = load(root/'work/projection-v1/source-manifest.json')['schedule']
    schedule = []
    for game in pinned(root, ref):
        if int(game['season']) != POLICY['season'] or game['game_type'] != 'REG':
            continue
        kickoff = schedule_kickoff(game['gameday'], game['gametime'])
        schedule.append({'game_id': game['game_id'],
                         'cutoff_at': (kickoff-dt.timedelta(minutes=75)).isoformat()})
    if not schedule or len({g['game_id'] for g in schedule}) != len(schedule):
        raise ValueError('Missing or duplicated schedule')
    # A writer may replace the pointer between reads. Retry the read snapshot,
    # never the producer; do not call a normal concurrent commit corruption.
    for _ in range(2):
        before = load(out/'operations/final-feed.json', {})
        feed = load(out/'final-feed.json')
        after = load(out/'operations/final-feed.json', {})
        if before == after:
            break
    else:
        raise ValueError('Final snapshot changing')
    if after.get('state') == 'HEALTHY':
        if (feed.get('refresh_operation_id') != after.get('operation_id')
                or digest(feed) != after.get('expected_feed_sha256')):
            raise ValueError('Final commit receipt mismatch')
    now = now or dt.datetime.now(UTC)
    if stamp(feed['received_at']) > now:
        raise ValueError('Future final retrieval')
    from engine.projection.source_archive import read_source
    read_source(root,feed)
    sha = feed['source_sha256']
    matched = {}
    fields = ('version', 'projection', 'ours', 'evidence', 'freeze_time')
    for card in board['games']:
        gid = card['game_id']
        if any(c not in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_' for c in gid):
            raise ValueError('Invalid game identifier')
        for version in ('projection-v1', 'projection-v2', 'projection-v3'):
            lock = load(root/'outputs'/version/'locks'/f'{gid}.json')
            if lock and all(lock.get(k) == card.get(k) for k in fields):
                matched[gid] = True
    result = assess_source(board, schedule, feed['games'], matched, now, epoch)
    result['schedule_ref'] = ref
    result['final_received_at'] = feed['received_at']
    result['final_source_sha256'] = sha
    result['final_commit_receipt'] = 'VERIFIED' if after.get('state') == 'HEALTHY' else 'TRANSITION_OR_LEGACY'
    return result


def services():
    names = ['nfl-engine-capture.service', 'nfl-engine-capture.timer', 'nfl-cutoff-state.service', 'nfl-cutoff-state.timer']
    fields = ['Id', 'ActiveState', 'SubState', 'Result', 'ExecMainStatus',
              'ExecMainStartTimestamp', 'ExecMainExitTimestamp']
    args = ['systemctl', 'show', *names]
    for field in fields:
        args.extend(['-p', field])
    raw = subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=10)
    result = {}
    for chunk in raw.strip().split('\n\n'):
        values = dict(line.split('=', 1) for line in chunk.splitlines() if '=' in line)
        if values.get('Id') in names:
            result[values.pop('Id')] = values
    return result


def record(folder, name, value):
    """Only transitions create history; current state is a bounded atomic file."""
    assessment = value['assessment']
    if assessment['changed']:
        event = {'checked_at': value['checked_at'], 'observer': name,
                 'state': assessment['state'], 'active': assessment['active'],
                 'recovered_codes': assessment['recovered_codes']}
        # Event before heartbeat: a failed durable event is not success.
        save(folder/'events'/f'{digest(event)}.json', event, immutable=True)
    save(folder/f'{name}.json', value)


def host_once(folder=HOST_STATE, root=ROOT, now=None):
    fixed_time = now is not None
    now = now or dt.datetime.now(UTC)
    previous = load(folder/'host.json', {})
    epoch = previous.get('epoch', now.isoformat())
    disk = os.statvfs(root)
    value = {'schema': POLICY['schema'], 'policy_sha256': digest(POLICY),
             'checked_at': now.isoformat(), 'epoch': epoch,
             'storage': {'free_bytes': disk.f_bavail*disk.f_frsize,
                         'free_inodes': disk.f_favail, 'headroom_qualified': False},
             'observer_source_sha256': digest({str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                                               for p in [Path(__file__), ROOT/'engine/projection/watchdog.py']}),
             'services': services()}
    try:
        value['source'] = source_snapshot(root, now if fixed_time else None, stamp(epoch))
    except (OSError, ValueError, KeyError, TypeError) as error:
        value['source_error'] = type(error).__name__
    value['final_reader'] = load(root/'outputs/projection-v3/operations/final-feed.json', {})
    # Export only health evidence, not arbitrary runtime state.
    value['final_reader'] = {k: value['final_reader'].get(k) for k in ('state', 'last_success_at', 'reason')}
    try:
        from engine.projection.cutoff_worker import health as cutoff_health
        value['cutoff_state']=cutoff_health(root,now)
    except (OSError,ValueError,KeyError,TypeError) as error:
        value['cutoff_state']={'state':'UNVERIFIED','error_type':type(error).__name__}
    external = load(folder/'outside-receipt.json')
    now = now if fixed_time else dt.datetime.now(UTC)
    value['checked_at'] = now.isoformat()
    value['outside_received_at'] = external.get('received_at') if external else None
    value['assessment'] = transition(previous, assess_host(value, external, now), now)
    record(folder, 'host', value)
    if value['assessment']['changed']:
        print(json.dumps({'state': value['assessment']['state'],
                          'codes': [x['code'] for x in value['assessment']['active']],
                          'recovered': value['assessment']['recovered_codes']}), flush=True)
    return value


def accept_receipt(folder, receipt, now):
    if set(receipt) != {'schema', 'observer', 'checked_at', 'report_sha256'}:
        raise ValueError('Unexpected observer receipt fields')
    if receipt['schema'] != POLICY['schema'] or receipt['observer'] != 'gabe-mac':
        raise ValueError('Unknown observer')
    age = (now-stamp(receipt['checked_at'])).total_seconds()
    if age < -30 or age > POLICY['heartbeat_seconds']:
        raise ValueError('Observer clock or expired receipt')
    sha = receipt['report_sha256']
    if not isinstance(sha, str) or len(sha) != 64 or any(c not in '0123456789abcdef' for c in sha):
        raise ValueError('Invalid report hash')
    path = folder/'outside-receipt.json'
    previous = load(path)
    if previous:
        if stamp(previous['receipt']['checked_at']) > stamp(receipt['checked_at']):
            raise ValueError('Observer receipt rollback')
        if previous['receipt']['checked_at'] == receipt['checked_at']:
            if previous['receipt'] != receipt:
                raise ValueError('Changed observer payload')
            return previous  # Lost-response retry never refreshes the heartbeat.
    value = {'received_at': now.isoformat(), 'receipt': receipt}
    save(path, value)
    return value


def public_probe(previous=None, retry_access=False):
    if previous and previous.get('state') in ('ACCESS_UNQUALIFIED', 'SCHEMA_UNQUALIFIED') and not retry_access:
        return previous
    try:
        with urllib.request.urlopen(PUBLIC_URL, timeout=10) as response:
            raw = response.read(MAX_PUBLIC_BYTES+1)
        if len(raw) > MAX_PUBLIC_BYTES:
            raise ValueError('Oversized public response')
        return {'state': 'VERIFIED', 'identity': board_identity(json.loads(raw))}
    except urllib.error.HTTPError as error:
        return {'state': 'ACCESS_UNQUALIFIED' if error.code in (401, 403) else 'UNREACHABLE',
                'http_status': error.code}
    except (TimeoutError, OSError):
        return {'state': 'UNREACHABLE'}
    except (ValueError, KeyError, TypeError, UnicodeError):
        return {'state': 'SCHEMA_UNQUALIFIED'}


def remote(mode, receipt=None):
    if mode not in ('read', 'ack'):
        raise ValueError('Unsupported observer command')
    # Fixed command and allowlisted JSON stdin. No provider environment loaded.
    command = ('cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6'
               ' && runuser -u nflengine -- /opt/nfl-runtime/env/bin/python -B scripts/projection_watchdog.py '+mode)
    p = subprocess.run(['ssh', '-i', str(ROOT/'.cloud-private/admin_key'),
                        '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
                        'root@159.89.185.88', command],
                       input=json.dumps(receipt) if receipt else None,
                       capture_output=True, text=True, timeout=15)
    if p.returncode:
        raise RuntimeError('Observer SSH failed')
    return json.loads(p.stdout)


def notify(value):
    codes = [x['code'] for x in value['assessment']['active']]
    message = ', '.join(codes) if codes else 'Observed faults recovered; see the saved monitor report.'
    script = 'on run argv\n display notification (item 1 of argv) with title "NFL engine monitor"\nend run'
    try:
        p = subprocess.run(['/usr/bin/osascript', '-e', script, message],
                           capture_output=True, timeout=5)
        return 'SUBMITTED_NOT_READ_RECEIPT' if p.returncode == 0 else 'DELIVERY_FAILED'
    except (OSError, subprocess.TimeoutExpired):
        return 'DELIVERY_FAILED'


def outside_once(folder=MAC_STATE, now=None, retry_access=False, notifications=True):
    started = now or dt.datetime.now(UTC)
    previous = load(folder/'outside.json', {})
    try:
        host = remote('read')
        if host.get('schema') != POLICY['schema'] or host.get('policy_sha256') != digest(POLICY):
            raise ValueError('Unknown host observer policy')
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError):
        host = None
    public = public_probe(load(folder/'public-probe.json'), retry_access)
    save(folder/'public-probe.json', public)
    now = now or dt.datetime.now(UTC)
    value = {'schema': POLICY['schema'], 'checked_at': now.isoformat(),
             'started_at': started.isoformat(), 'failure_domain': 'Mac: requires awake, connected, logged-in session',
             'host': host, 'public': public,
             'assessment': transition(previous, assess_outside(host, public, now), now)}
    record(folder, 'outside', value)
    if value['assessment']['changed']:
        result = notify(value) if notifications else 'DISABLED_FOR_CHECK'
        save(folder/'notification.json', {'at': now.isoformat(), 'result': result,
                                         'report_sha256': digest(value)})
    receipt = {'schema': POLICY['schema'], 'observer': 'gabe-mac',
               'checked_at': now.isoformat(), 'report_sha256': digest(value)}
    try:
        ack = remote('ack', receipt)
        save(folder/'acknowledgment.json', ack)
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError):
        # No fabricated host acknowledgment; host independently alarms if absent.
        pass
    if value['assessment']['changed']:
        print(json.dumps({'state': value['assessment']['state'],
                          'codes': [x['code'] for x in value['assessment']['active']],
                          'recovered': value['assessment']['recovered_codes']}), flush=True)
    return value


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['host', 'outside', 'read', 'ack'])
    parser.add_argument('--retry-public', action='store_true')
    parser.add_argument('--no-notify', action='store_true')
    args = parser.parse_args()
    if args.mode == 'read':
        value = load(HOST_STATE/'host.json')
        if value is None:
            raise ValueError('Host observer unobserved')
        print(json.dumps(value)); return
    if args.mode == 'ack':
        raw = sys.stdin.read(4097)
        if len(raw) > 4096:
            raise ValueError('Oversized observer receipt')
        value = accept_receipt(HOST_STATE, json.loads(raw), dt.datetime.now(UTC))
        print(json.dumps(value)); return
    folder = HOST_STATE if args.mode == 'host' else MAC_STATE
    folder.mkdir(parents=True, exist_ok=True)
    with (folder/'observer.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        if args.mode == 'host':
            host_once()
        else:
            outside_once(retry_access=args.retry_public, notifications=not args.no_notify)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Failure must leave the previous heartbeat, not fresh success metadata.
        print(json.dumps({'state': 'WATCHDOG_FAILED_CLOSED', 'error_type': type(error).__name__}), flush=True)
        raise SystemExit(1)
