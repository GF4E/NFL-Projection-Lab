"""Scheduled quote-only transport. Never imports a results feed or scorer."""
import datetime as dt
import json
import urllib.parse
import urllib.request
from email.utils import parsedate_to_datetime
from pathlib import Path
from engine.pick_store import put, pin
from engine.pricing import timestamp
from engine.t75_budget import transact


def now():
    return dt.datetime.now(dt.timezone.utc)


def capture(group, folder, ledger, secret):
    current = now()
    start, cutoff = timestamp(group['capture_at']), timestamp(group['cutoff_at'])
    if not start <= current < start+dt.timedelta(seconds=60):
        raise ValueError('Provider call outside registered T80 window')
    request_id = str(group['season'])+'-'+str(group['week'])+'-'+group['kickoff_at']
    week = str(group['season'])+'-W'+str(group['week']).zfill(2)
    if not transact(ledger, week, request_id):
        return {'status': 'REFUSED', 'reason': 'BUDGET_OR_DUPLICATE', 'request_at': current.isoformat()}
    # A five-book/two-market request costs at most two documented credits; three
    # remain reserved until an authoritative cost header arrives. No retries.
    params = {'apiKey': secret, 'markets': 'spreads,totals', 'bookmakers': 'betmgm,draftkings,fanduel,williamhill_us,pinnacle',
              'oddsFormat': 'american', 'dateFormat': 'iso',
              'commenceTimeFrom': group['kickoff_at'].replace('+00:00','Z'),
              'commenceTimeTo': group['kickoff_at'].replace('+00:00','Z')}
    endpoint = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds'
    receipt = {'request_at': current.isoformat(), 'endpoint': endpoint, 'status': 'ERROR', 'request_id': request_id}
    try:
        with urllib.request.urlopen(endpoint+'?'+urllib.parse.urlencode(params), timeout=35) as response:
            raw = response.read(); received = now()
            # Never retain the request URL, headers with secrets, or error bodies.
            raw = raw.replace(secret.encode(), b'[REDACTED]')
            data = json.loads(raw)
            if not isinstance(data, list):
                raise ValueError('Unexpected provider payload')
            ref = pin(Path(folder)/'sources', raw, raw=True)
            headers = {k.lower(): v for k,v in response.headers.items() if k.lower() in ('date','x-requests-last','x-requests-remaining','x-requests-used')}
        receipt.update(received_at=received.isoformat(), source=ref, headers=headers,
                       provider_snapshot_at=None, provider_snapshot_status='LIVE_ENDPOINT_NO_GLOBAL_SNAPSHOT_TIME',
                       provider_response_at=parsedate_to_datetime(headers['date']).isoformat() if 'date' in headers else None,
                       book_last_updates={e['id']:{b['key']:{m['key']:m.get('last_update',b.get('last_update')) for m in b.get('markets',[])} for b in e.get('bookmakers',[])} for e in data},
                       status='LATE' if received > cutoff else 'CAPTURED')
        if 'x-requests-last' in headers:
            transact(ledger, week, request_id, 'settle', int(headers['x-requests-last']))
    except Exception as exc:
        receipt.update(error=type(exc).__name__, received_at=now().isoformat())
        # Uncertain provider costs keep reservation. Invalid costs block all calls.
        if isinstance(exc, ValueError) and 'provider cost' in str(exc):
            put(Path(ledger).parent/'HALT.json', {'reason': 'UNEXPECTED_PROVIDER_COST', 'request_id': request_id})
    put(Path(folder)/'capture.json', receipt)
    return receipt
