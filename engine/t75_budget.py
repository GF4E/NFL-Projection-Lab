"""Durable weekly reservations. Uncertain requests retain all three credits."""
import datetime as dt
import fcntl
import json
import os
from pathlib import Path


def transact(path, week, request_id, action='reserve', actual=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.seek(0)
        events = [json.loads(line) for line in f if line.strip()]
        latest = {}
        for row in events:
            if row['week'] == week and row['action'] in ('reserve', 'settle'):
                latest[row['request_id']] = row
        spent = sum(r['credits'] for r in latest.values())
        prior = latest.get(request_id)
        if action == 'reserve':
            allowed = not prior and spent+3 <= 60
            row = {'action': 'reserve' if allowed else 'refused', 'credits': 3 if allowed else 0,
                   'reason': None if allowed else ('DUPLICATE' if prior else 'WEEKLY_CAP')}
        elif action == 'settle':
            if not prior or prior['action'] != 'reserve':
                raise ValueError('No unsettled reservation')
            if not isinstance(actual, int) or not 0 <= actual <= 3:
                raise ValueError('Unexpected provider cost; reservation retained, halt provider')
            allowed = True
            row = {'action': 'settle', 'credits': actual}
        else:
            raise ValueError('Unknown ledger action')
        row.update(week=week, request_id=request_id, timestamp=dt.datetime.now(dt.timezone.utc).isoformat())
        f.write(json.dumps(row, sort_keys=True)+'\n'); f.flush(); os.fsync(f.fileno())
        return allowed


def status(path):
    states = {}
    if Path(path).exists():
        for row in map(json.loads, Path(path).read_text().splitlines()):
            if row['action'] in ('reserve', 'settle'):
                states[(row['week'], row['request_id'])] = row['credits']
    weeks = {}
    for (week, _), credits in states.items():
        weeks[week] = weeks.get(week, 0)+credits
    return {'weekly_cap': 60, 'accounted_by_week': weeks, 'remaining_by_week': {w:60-c for w,c in weeks.items()}}
