"""Immutable weekly closeout, published before weight refits or experiments."""
import datetime as dt
import hashlib
import json
import subprocess
from pathlib import Path
from zoneinfo import ZoneInfo
from engine.projection_learning import metrics
from engine.board_v7 import qualified
PT = ZoneInfo('America/Los_Angeles')
ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require_published(root, receipt, now):
    r = json.loads(receipt.read_text())
    published = dt.datetime.fromisoformat(r['published_at'])
    if r['state'] != 'PUBLISHED' or not r['all_games_graded'] or published > now:
        raise ValueError('Closeout is not published before this operation')
    for name, sha in r['artifacts'].items():
        path = (root / name).resolve()
        if not path.is_relative_to(root.resolve()) or digest(path) != sha:
            raise ValueError('Closeout artifact changed')
    return r


def publish(root, rows, board, week, publish_callback, refresh_callback, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    local = now.astimezone(PT)
    # Retries may finish later, but publication timestamps are never backdated.
    tuesday = local.date() - dt.timedelta(days=(local.weekday()-1) % 7)
    if local < dt.datetime.combine(tuesday, dt.time(6), PT):
        return {'state': 'WAITING_FOR_TUESDAY_CLOSEOUT'}
    season = max(r['season'] for r in rows)
    folder = root / f'outputs/cadence-v2/weeks/{season}-w{week}'
    receipt = root / f'outputs/cadence-v2/closeouts/{tuesday}.json'
    if receipt.exists():
        result = require_published(root, receipt, now)
        if result['season'] == season and result['week'] == week:
            return result
        raise ValueError('Tuesday already belongs to another closeout')
    slate = {r['game_id']: r for r in rows if r['season'] == season and r['week'] == week}
    cards = {g['game_id']: g for g in board['games']}
    missing = sorted(gid for gid in slate if gid not in cards or not cards[gid].get('final') or
                     (cards[gid].get('projection') and not (cards[gid].get('grades') or {}).get('PROJECTION')))
    if not slate or missing:
        return {'state': 'WAITING_FOR_CLOSEOUT_GRADES', 'week': week, 'missing_games': missing}
    trend, evidence = refresh_callback()
    eligible = [cards[gid] for gid in sorted(slate) if qualified(cards[gid])]
    ranked = sorted(eligible, key=lambda g: (sum(abs(g['grades']['PROJECTION']['errors'][s+'_points']) for s in ('away','home'))/2, g['game_id']))
    summary = {'season': season, 'week': week, 'schedule_games': len(slate),
               'as_issued_games': len(eligible), 'unqualified_games': sorted(set(slate)-{g['game_id'] for g in eligible}),
               'scorecard': metrics(eligible), 'best_five': [g['game_id'] for g in ranked[:5]],
               'worst_five': [g['game_id'] for g in reversed(ranked[-5:])],
               'games': [cards[gid] for gid in sorted(slate)]}
    folder.mkdir(parents=True, exist_ok=True)
    artifacts = {}
    for name, value in [('scorecard.json', summary), ('trend.json', trend), ('season.json', evidence)]:
        path = folder/name
        raw = (json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n').encode()
        # A failed publication can retry the same snapshot, never revise it silently.
        if path.exists() and path.read_bytes() != raw:
            raise ValueError('Closeout snapshot exists with different contents')
        path.write_bytes(raw)
        artifacts[str(path.relative_to(root))] = digest(path)
    source = publish_callback()  # Raises unless the push succeeded.
    result = {'state': 'PUBLISHED', 'all_games_graded': True, 'season': season, 'week': week,
              'published_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'source_commit': source, 'artifacts': artifacts}
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(result, sort_keys=True, indent=2)+'\n')
    publish_callback()  # Publish receipt only after the evidence itself is remote.
    return result


def run(publish_callback, now=None):
    from scripts.projection_learning import current_rows, due_week, report
    from scripts.board_v7_publish import run as season_report
    now = now or dt.datetime.now(dt.timezone.utc)
    rows = current_rows()
    week = due_week(rows, now)
    if week is None:
        return {'state': 'NOT_DUE'}
    board = json.loads((ROOT/'outputs/projection-v3/board.json').read_text())
    return publish(ROOT, rows, board, week, publish_callback,
                   lambda: (report(), season_report(board)), now)
