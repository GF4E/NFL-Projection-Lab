"""Immutable weekly closeout, published before weight refits or experiments."""
import datetime as dt
import hashlib
import json
import re
import subprocess
from pathlib import Path
from zoneinfo import ZoneInfo
from engine.projection_learning import metrics
from engine.board_v7 import qualified
from engine.projection.storage import write_bytes
PT = ZoneInfo('America/Los_Angeles')
ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _encode(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n').encode()


def _validate_receipt(root, receipt, now):
    r = json.loads(receipt.read_text())
    published = dt.datetime.fromisoformat(r['published_at'])
    if r['state'] != 'PUBLISHED' or not r['all_games_graded'] or published > now:
        raise ValueError('Closeout is not published before this operation')
    for name, sha in r['artifacts'].items():
        path = (root / name).resolve()
        if not path.is_relative_to(root.resolve()) or digest(path) != sha:
            raise ValueError('Closeout artifact changed')
    return r


def _ack_path(receipt):
    return receipt.parent/'acknowledgments'/receipt.name


def _verified_commit(source):
    if not isinstance(source, str) or len(source) != 40 or any(c not in '0123456789abcdef' for c in source):
        raise ValueError('Verified source commit required')
    return source


def require_published(root, receipt, now):
    r = _validate_receipt(root, receipt, now)
    if r.get('schema') == 'closeout-publication-v2':
        ack = json.loads(_ack_path(receipt).read_text())
        confirmed = dt.datetime.fromisoformat(ack['confirmed_at'])
        if (ack['receipt_sha256'] != digest(receipt) or confirmed > now
                or not ack.get('verified_remote_commit')):
            raise ValueError('Closeout receipt publication is not confirmed')
        _verified_commit(ack['verified_remote_commit'])
        _verified_commit(r['source_commit'])
    return r


def _confirm(receipt, publish_callback):
    # Callback must return only after remote verification. A lost response can
    # safely repeat this operation; it must not fabricate a local acknowledgment.
    source = _verified_commit(publish_callback())
    acknowledgment = {'receipt_sha256': digest(receipt),
                     'verified_remote_commit': source,
                     'confirmed_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                     'publication_surface': 'source_repository'}
    write_bytes(_ack_path(receipt), _encode(acknowledgment), immutable=True)


def publish_index(root, receipt, publish_callback):
    """Pin remotely published receipts; index retries never replace a release."""
    root, receipt = Path(root), Path(receipt)
    closed = require_published(root, receipt, dt.datetime.now(dt.timezone.utc))
    if closed.get('schema') != 'closeout-publication-v2':
        raise ValueError('Index requires a verified v2 closeout receipt')
    season, week = closed['season'], closed['week']
    if type(season) is not int or type(week) is not int or not 2000 <= season <= 2099 or not 1 <= week <= 22:
        raise ValueError('Invalid closeout season/week')
    key = f'{season}-w{week}'
    expected = {f'outputs/cadence-v2/weeks/{key}/{n}.json' for n in ('scorecard', 'trend', 'season')}
    if set(closed['artifacts']) != expected:
        raise ValueError('Index requires all three exact closeout paths')
    relative = str(receipt.resolve().relative_to(root.resolve()))
    if not re.fullmatch(r'outputs/cadence-v2/closeouts/\d{4}-\d{2}-\d{2}\.json', relative):
        raise ValueError('Invalid indexed receipt path')
    ack = json.loads(_ack_path(receipt).read_bytes())
    entry = {'season': season, 'week': week, 'published_at': closed['published_at'],
             'receipt_path': relative, 'receipt_sha256': digest(receipt),
             'receipt_source_commit': _verified_commit(ack['verified_remote_commit'])}
    path = root/'outputs/cadence-v2/publication-index.json'
    index = json.loads(path.read_bytes()) if path.exists() else {'schema': 'closeout-index-v1', 'releases': {}}
    if index.get('schema') != 'closeout-index-v1' or not isinstance(index.get('releases'), dict):
        raise ValueError('Invalid closeout index')
    releases = index['releases']
    for name, prior in releases.items():
        if (not re.fullmatch(r'20\d{2}-w(?:[1-9]|1\d|2[0-2])', name)
                or name != f"{prior['season']}-w{prior['week']}"
                or not re.fullmatch(r'[0-9a-f]{64}', prior['receipt_sha256'])):
            raise ValueError('Invalid prior index release')
        _verified_commit(prior['receipt_source_commit'])
    if key in releases and releases[key] != entry:
        raise ValueError('Indexed closeout identity cannot change')
    releases[key] = entry
    index['latest'] = max(releases, key=lambda k: (releases[k]['season'], releases[k]['week']))
    raw = _encode(index)
    write_bytes(path, raw)
    sha = hashlib.sha256(raw).hexdigest()
    confirmation = root/f'outputs/cadence-v2/index-acknowledgments/{sha}.json'
    if confirmation.exists():
        value = json.loads(confirmation.read_bytes())
        if value.get('index_sha256') != sha:
            raise ValueError('Index acknowledgment changed')
        _verified_commit(value['verified_remote_commit'])
        return value
    source = _verified_commit(publish_callback())
    value = {'schema': 'closeout-index-ack-v1', 'index_sha256': sha,
             'verified_remote_commit': source,
             'confirmed_at': dt.datetime.now(dt.timezone.utc).isoformat()}
    write_bytes(confirmation, _encode(value), immutable=True)
    return value


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
        result = _validate_receipt(root, receipt, now)
        if result['season'] == season and result['week'] == week:
            if result.get('schema') == 'closeout-publication-v2' and not _ack_path(receipt).exists():
                _confirm(receipt, publish_callback)
            result = require_published(root, receipt, dt.datetime.now(dt.timezone.utc))
            publish_index(root, receipt, publish_callback)
            return result
        raise ValueError('Tuesday already belongs to another closeout')
    slate = {r['game_id']: r for r in rows if r['season'] == season and r['week'] == week}
    cards = {g['game_id']: g for g in board['games']}
    missing = sorted(gid for gid in slate if gid not in cards or not cards[gid].get('final') or
                     (cards[gid].get('projection') and not (cards[gid].get('grades') or {}).get('PROJECTION')))
    if not slate or missing:
        return {'state': 'WAITING_FOR_CLOSEOUT_GRADES', 'week': week, 'missing_games': missing}
    checkpoint = folder/'checkpoint.json'
    names = ('scorecard.json', 'trend.json', 'season.json')
    if checkpoint.exists():
        saved = json.loads(checkpoint.read_text())
        snapshots = saved['snapshots']
        if hashlib.sha256(_encode(snapshots)).hexdigest() != saved['sha256'] or set(snapshots) != set(names):
            raise ValueError('Closeout checkpoint hash or schema mismatch')
        if snapshots['scorecard.json']['season'] != season or snapshots['scorecard.json']['week'] != week:
            raise ValueError('Closeout checkpoint belongs to another week')
    else:
        existing = [name for name in names if (folder/name).exists()]
        if existing:
            # Do not infer the missing portion of an old partial snapshot.
            if len(existing) != len(names):
                raise ValueError('Legacy partial closeout requires reconciliation')
            snapshots = {name: json.loads((folder/name).read_text()) for name in names}
            if snapshots['scorecard.json']['season'] != season or snapshots['scorecard.json']['week'] != week:
                raise ValueError('Legacy closeout belongs to another week')
        else:
            trend, evidence = refresh_callback()
            eligible = [cards[gid] for gid in sorted(slate) if qualified(cards[gid])]
            ranked = sorted(eligible, key=lambda g: (sum(abs(g['grades']['PROJECTION']['errors'][s+'_points']) for s in ('away','home'))/2, g['game_id']))
            summary = {'season': season, 'week': week, 'schedule_games': len(slate),
                       'as_issued_games': len(eligible), 'unqualified_games': sorted(set(slate)-{g['game_id'] for g in eligible}),
                       'reference_lines': trend.get('reference_lines', {'status':'INSUFFICIENT', 'reason':'Reference audit not supplied by report callback'}),
                       'scorecard': metrics(eligible), 'best_five': [g['game_id'] for g in ranked[:5]],
                       'worst_five': [g['game_id'] for g in reversed(ranked[-5:])],
                       'games': [cards[gid] for gid in sorted(slate)]}
            snapshots = dict(zip(names, (summary, trend, evidence)))
        saved = {'snapshots': snapshots, 'sha256': hashlib.sha256(_encode(snapshots)).hexdigest()}
        write_bytes(checkpoint, _encode(saved), immutable=True)
    artifacts = {}
    for name in names:
        path = folder/name
        write_bytes(path, _encode(snapshots[name]), immutable=True)
        artifacts[str(path.relative_to(root))] = digest(path)
    source = _verified_commit(publish_callback())  # Raises unless the push succeeded.
    result = {'schema': 'closeout-publication-v2', 'state': 'PUBLISHED', 'all_games_graded': True, 'season': season, 'week': week,
              'published_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'source_commit': source, 'artifacts': artifacts,
              'publication_surface': 'source_repository'}
    write_bytes(receipt, _encode(result), immutable=True)
    _confirm(receipt, publish_callback)
    publish_index(root, receipt, publish_callback)
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
