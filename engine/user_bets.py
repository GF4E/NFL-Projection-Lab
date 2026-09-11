"""Append explicitly reported executions; unknown placement metadata stays blank."""
import csv
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
from engine.slip_ingest import SLIP_FIELDS, DEFAULT_LOG
from engine.pick_store import sha


def record(game, side, line, price, book, evidence, stake=None, log=DEFAULT_LOG):
    if side not in (game['home_team'], game['away_team']): raise ValueError('Unknown side')
    if book not in ('williamhill_us','betmgm','fanduel','draftkings'): raise ValueError('Unknown book')
    if abs(price) < 100: raise ValueError('Invalid American price')
    identity = sha(json.dumps([game['game_id'], side, line, price, book, evidence],sort_keys=True).encode())
    row = dict.fromkeys(SLIP_FIELDS, '')
    row.update(pick_id='jarrett:'+identity, slip_id=identity, source='jarrett', status='executed', record_class='live',
               game_id=game['game_id'],event_id=game['game_id'],season=game['season'],week=game['week'],
               home_team=game['home_team'],away_team=game['away_team'],commence_time=game['kickoff_at'],
               executed_book=book,market='spreads',side=side,line_at_approval=line,book_price=price,
               stake=stake if stake is not None else '',stake_currency='USD' if stake is not None else '',
               source_sha256=identity,quote_id='user-report:'+identity,
               ingested_at=dt.datetime.now(dt.timezone.utc).isoformat(),
               probability_source='USER_REPORTED_EXECUTION; placement time unknown; no as-placed probability',
               confirmation_fields=json.dumps({'confirmed':['game','side','line','price','book'], 'unknown':['placed_at']+([] if stake is not None else ['stake','stake_currency']), 'evidence':evidence}))
    log=Path(log);log.parent.mkdir(parents=True,exist_ok=True)
    with log.open('a+',newline='') as f:
        fcntl.flock(f,fcntl.LOCK_EX);f.seek(0);reader=csv.DictReader(f);old=list(reader)
        if reader.fieldnames and reader.fieldnames != SLIP_FIELDS: raise ValueError('Schema mismatch')
        if any(r['pick_id']==row['pick_id'] for r in old): return identity
        f.seek(0,2);writer=csv.DictWriter(f,fieldnames=SLIP_FIELDS)
        if not reader.fieldnames: writer.writeheader()
        writer.writerow(row);f.flush();os.fsync(f.fileno())
    return identity
