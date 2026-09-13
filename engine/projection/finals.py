"""Independent, football-only final score feed with last-good retry semantics."""
import csv
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.request

URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'


def parse(raw):
    finals = {}
    for r in csv.DictReader(io.StringIO(raw.decode())):
        try:
            a, h = float(r['away_score']), float(r['home_score'])
            if not all(math.isfinite(x) and x >= 0 and x.is_integer() for x in (a,h)):
                continue
            if float(r['result']) != h-a or float(r['total']) != h+a:
                continue
            finals[r['game_id']] = {'away_score':a, 'home_score':h}
        except (KeyError, ValueError, TypeError):
            continue
    if not finals:
        raise ValueError('No validated finals')
    return finals


def refresh(root, now=None, fetch=None):
    from scripts.projection_publish import save
    root=Path(root); now=now or dt.datetime.now(dt.timezone.utc)
    path=root/'outputs/projection-v3/final-feed.json'
    old=json.loads(path.read_text()) if path.exists() else {}
    if old and (now-dt.datetime.fromisoformat(old['received_at'])).total_seconds()<60:
        return {'state':'FRESH'}
    try:
        raw=fetch() if fetch else urllib.request.urlopen(URL,timeout=8).read()
        finals=parse(raw); digest=hashlib.sha256(raw).hexdigest()
        source=root/'outputs/projection-v3/final-sources'/f'{digest}.csv'
        source.parent.mkdir(parents=True,exist_ok=True)
        if not source.exists(): source.write_bytes(raw)
        save(path,{'received_at':now.isoformat(),'source_sha256':digest,'games':{**old.get('games',{}),**finals}})
        return {'state':'REFRESHED','finals':len(finals)}
    except (OSError, ValueError, TimeoutError):
        # Do not advance received_at: the next capture tick retries immediately.
        return {'state':'RETRY_NEXT_TICK','last_good':old.get('received_at')}


def grade_once(card, path, result):
    from engine.projection_v3.card import finish
    from scripts.projection_publish import save
    path=Path(path)
    if path.exists(): return json.loads(path.read_text())
    if card.get('grades') or not result or not card.get('projection'): return card
    graded=finish(card,result['away_score'],result['home_score'])
    save(path,graded,True)
    return graded
