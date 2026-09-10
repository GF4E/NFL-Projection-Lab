"""Read-only projection of immutable T75 locks and first grades for the website.

No provider requests, fitting, selection, or mutation of locks/grades. Teaser
quotes must already exist in the lock: straight-bet prices are not ticket prices.
"""
import datetime as dt
import json
import os
import tempfile
from pathlib import Path
from engine.pick_store import encode, put, sha
from engine.t75_report import final_feed

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/model-pick-v1'
BOOKS = {'betmgm', 'williamhill_us', 'fanduel', 'draftkings'}
SCHEMA = 'locked-board-v1'


def time(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timezone required')
    return parsed


def teaser_leg(pick):
    line = pick['line']
    if pick['market'] == 'spreads':
        moved = line + 6
        wong = -8.5 <= line <= -7.5 or 1.5 <= line <= 2.5
        keys = [k for k in (3, 7) if line < (k if line > 0 else -k) < moved]
        return moved, keys if wong and len(keys) == 2 else []
    moved = line + (6 if pick['side'] == 'Under' else -6)
    return moved, [k for k in (41, 44, 47, 51) if min(line, moved) < k < max(line, moved)]


def verdict(record, market, grade=None):
    base = {'state': None, 'grade': None, 'edge_source': None}
    if record['status'] == 'MISSED':
        return {**base, 'availability': 'MISSED', 'reason': record.get('reason', 'No lock')}
    pick = next((p for p in record.get('picks', []) if p['market'] == market), None)
    if not pick:
        return {**base, 'availability': 'MISSED', 'reason': 'No locked pick for this target'}
    base.update({k: pick[k] for k in ('side', 'line', 'book', 'price', 'fair_probability', 'EV', 'edge_source')})
    base['availability'] = 'LOCKED'
    base['grade'] = {'P': 'PUSH', 'W': 'W', 'L': 'L'}.get(grade.get('outcome')) if grade else None
    base['grade_source'] = grade.get('result_source') if grade else None
    base['grade_basis'] = 'LOCKED_STRAIGHT_PICK'
    # Read the registered filter decision; guard the exported fields as well.
    if (pick.get('filtered_subset') is True and pick['book'] in BOOKS and
            .60 <= pick['fair_probability'] <= .70 and pick.get('price_edge_cents', -1) >= 10):
        return {**base, 'state': 'PLAY'}
    moved, crossed = teaser_leg(pick)
    if len(crossed) >= 2:
        valid = []
        for quote in record.get('teaser_quotes', []):
            try:
                if (quote['book'] in BOOKS and quote['points'] == 6 and quote['legs'] in (2, 3)
                        and quote['market'] == market and quote['side'] == pick['side']
                        and quote['line'] == pick['line'] and quote['price'] >= -110
                        and abs(quote['price']) >= 100 and quote['source_sha256']
                        and time(quote['issued_at']) <= time(record['freeze_timestamp'])
                        and time(record['freeze_timestamp'])-time(quote['issued_at']) <= dt.timedelta(hours=1)):
                    valid.append(quote)
            except (KeyError, TypeError, ValueError):
                continue
        if valid:
            q = max(valid, key=lambda q: (q['price'], q['book']))
            # A standalone leg is not an executed ticket. Keep the original
            # straight-pick grade so the website agrees with the scorecard.
            return {**base, 'state': 'TEASE', 'leg': pick['side'], 'teased_line': moved,
                    'key_numbers_crossed': crossed, 'best_book': q['book'], 'teaser_price': q['price'],
                    'ticket_legs': q['legs'], 'partner_status': 'NEEDS_PARTNER',
                    'teaser_quote_sha256': q['source_sha256']}
        reason = 'Qualifying teaser leg; no frozen teaser ticket price at -110 or better.'
    else:
        reason = 'Locked pick fails the 60–70% / 10-cent filter and teaser crossing criteria.'
    return {**base, 'state': 'HARD PASS', 'reason': reason}


def project(games, records, grades, feeds, latest_feed, version, now):
    locks = {r['game']['game_id']: r for r in records}
    grade_map = {(g['version'], g['game_id'], g['market']): g for g in grades if g['kind'] == 'actual'}
    output = []
    for game in sorted(games, key=lambda g: (g['kickoff_at'], g['game_id'])):
        identity = game['game_id']; record = locks.get(identity)
        v = record['version'] if record else version
        actual = [grade_map.get((v, identity, m)) for m in ('spreads', 'totals')]
        sources = {g['result_source'] for g in actual if g}
        if len(sources) > 1:
            raise ValueError('First grades disagree on final source: ' + identity)
        source = next(iter(sources), latest_feed)
        result = feeds.get(source, {}).get(identity)
        if sources and not result:
            raise ValueError('Missing first-grade result source: ' + identity)
        available = record['status'] if record else 'WAITING_T75'
        final = bool(result)
        # The original lock remains history after kickoff, but it is no longer
        # an executable offer. Finals always take precedence over stale quotes.
        stale = not final and (not record or now >= time(game['kickoff_at']))
        row = {k: game[k] for k in ('game_id', 'season', 'week', 'home_team', 'away_team', 'home_abbr', 'away_abbr', 'kickoff_at')}
        row.update({'version': v, 'freeze_time': record.get('freeze_timestamp') if record and record['status'] == 'LOCKED' else None,
                    'recorded_at': record.get('freeze_timestamp') if record else None,
                    'cutoff_at': game.get('cutoff_at'),
                    'expires_at': game['kickoff_at'], 'lock_status': available,
                    'status': 'FINAL' if final else 'MISSED' if available == 'MISSED' else 'STALE' if stale else 'LOCKED',
                    'record_class': 'paper_model_pick', 'verdicts': {}})
        for market, g in zip(('spreads', 'totals'), actual):
            if record:
                item = verdict(record, market, g)
            else:
                item = {'state': None, 'availability': 'WAITING_T75', 'reason': 'Waiting for the T75 lock.', 'edge_source': None, 'grade': None}
            if stale and available != 'MISSED':
                item = {'state': None, 'availability': 'STALE', 'reason': 'No current executable locked quote.', 'edge_source': None, 'grade': None}
            row['verdicts'][market] = item
        if final:
            row.update({'final_score': {'home': result['home_score'], 'away': result['away_score']},
                        'margin': result['home_score']-result['away_score'],
                        'total': result['home_score']+result['away_score'],
                        'final_source': {'provider': 'nflverse', 'sha256': source},
                        'grade_status': 'MISSED' if available == 'MISSED' else 'SCORED' if all(actual) else 'PENDING_GRADE'})
        output.append(row)
    upcoming = [g for g in output if time(g['kickoff_at']) >= now]
    week = upcoming[0]['week'] if upcoming else (output[-1]['week'] if output else 1)
    return {'schema': SCHEMA, 'version': version, 'default_week': week, 'games': output}


def build(root=ROOT, now=None):
    root = Path(root); out = root/'outputs/model-pick-v1'
    config = json.loads((root/'work/model-pick-v1/runtime-config.json').read_text())
    def pinned(ref):
        path = Path(ref['path'])
        if not path.exists():
            # Portable clone: locate immutable source by hash, not original host.
            paths = list(out.rglob(ref['sha256']+'.csv')) + list((root/'work/model-pick-v1').rglob(ref['sha256']+'.json'))
            if len(paths) != 1: raise ValueError('Pinned source unavailable')
            path = paths[0]
        raw = path.read_bytes()
        if sha(raw) != ref['sha256']: raise ValueError('Source hash mismatch')
        return raw
    refs = sorted((root/'work/model-pick-v1/daily').glob('*/schedule-ref.json'))
    if not refs: raise ValueError('No pinned schedule')
    schedule = json.loads(pinned(json.loads(refs[-1].read_text())))
    games = {g['game_id']: g for group in schedule['groups'] for g in group['games']}
    paths = sorted((out/'locks').glob('*/T75-picks.json'))
    records = [json.loads(p.read_text()) for p in paths]
    hashes = {(r['version'], r['game']['game_id']): sha(p.read_bytes()) for r,p in zip(records,paths)}
    for r in records: games[r['game']['game_id']] = r['game']
    grades = [json.loads(p.read_text()) for p in (out/'grades').glob('*/*.json')]
    for g in grades:
        if g['pick_sha256'] != hashes.get((g['version'], g['game_id'])):
            raise ValueError('Grade/lock hash mismatch')
    feeds = {}; latest = None
    for path in sorted((out/'daily').glob('*/results-ref.json')):
        ref = json.loads(path.read_text()); latest = ref['sha256']
        feeds[latest] = final_feed(pinned(ref), latest)
    for g in grades:
        source = g['result_source']
        if source not in feeds:
            feeds[source] = final_feed(pinned({'path': str(out/'final-sources'/(source+'.csv')), 'sha256': source}), source)
    return project(list(games.values()), records, grades, feeds, latest, config['version'], now or dt.datetime.now(dt.timezone.utc))


def publish(root=ROOT, now=None):
    root = Path(root); out = root/'outputs/model-pick-v1'; board = build(root, now)
    digest = sha(encode(board)); path = out/'board.json'
    if path.exists() and json.loads(path.read_text()).get('content_sha256') == digest:
        return {'changed': False, 'path': str(path), 'sha256': digest}
    board.update({'content_sha256': digest, 'published_at': (now or dt.datetime.now(dt.timezone.utc)).isoformat()})
    put(out/'board-versions'/(digest+'.json'), board)
    # Atomic mutable last-good pointer; no immutable source is overwritten.
    with tempfile.NamedTemporaryFile(mode='wb', dir=out, prefix='.board-', delete=False) as f:
        f.write(encode(board)); f.flush(); os.fsync(f.fileno()); temporary = f.name
    os.replace(temporary, path)
    return {'changed': True, 'path': str(path), 'sha256': digest}


if __name__ == '__main__':
    print(json.dumps(publish()))
