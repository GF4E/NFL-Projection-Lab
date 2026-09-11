"""Registered weekly and T80 capture transport; shared 60-credit weekly ledger."""
import datetime as dt
import json
import urllib.parse
import urllib.request
from pathlib import Path
from engine.pick_store import pin, put
from engine.pricing import timestamp
from engine.t75_budget import transact


def capture(job, folder, ledger, secret, current=None):
    now=current or dt.datetime.now(dt.timezone.utc)
    if not timestamp(job['start'])<=now<timestamp(job['start'])+dt.timedelta(seconds=60):raise ValueError('Outside registered capture window')
    folder=Path(folder)
    if (folder/'capture.json').exists():return json.loads((folder/'capture.json').read_text())
    if not transact(ledger,job['week_key'],job['request_id']):return {'status':'REFUSED','label':job['label']}
    params={'markets':'spreads,totals','bookmakers':'betmgm,draftkings,fanduel,williamhill_us,pinnacle','oddsFormat':'american','dateFormat':'iso',
            'commenceTimeFrom':min(g['kickoff_at'] for g in job['games']).replace('+00:00','Z'),'commenceTimeTo':max(g['kickoff_at'] for g in job['games']).replace('+00:00','Z')}
    receipt={'status':'ERROR','label':job['label'],'request_at':now.isoformat(),'request_id':job['request_id'],'params':params}
    try:
        with urllib.request.urlopen('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?'+urllib.parse.urlencode({**params,'apiKey':secret}),timeout=35) as response:
            raw=response.read().replace(secret.encode(),b'[REDACTED]');data=json.loads(raw)
            if not isinstance(data,list):raise ValueError('Invalid capture')
            ref=pin(folder/'sources',raw,raw=True);cost=response.headers.get('x-requests-last')
        receipt.update(status='CAPTURED',received_at=dt.datetime.now(dt.timezone.utc).isoformat(),source=ref)
        if cost is not None:transact(ledger,job['week_key'],job['request_id'],'settle',int(cost))
    except Exception as exc:
        receipt.update(error=type(exc).__name__)
        if isinstance(exc,ValueError) and 'provider cost' in str(exc):put(Path(ledger).parent/'HALT.json',{'reason':'UNEXPECTED_PROVIDER_COST','request_id':job['request_id']})
    put(folder/'capture.json',receipt);return receipt
