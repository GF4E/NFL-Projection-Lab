"""Budgeted Odds API capture. No secret is written to a tracked artifact."""
import datetime as dt, fcntl, hashlib, json, math, os
from pathlib import Path
import subprocess
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'work/week1-pricing-v1'
KEYFILE=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/app/.env.local')
BOOKS=['betmgm','williamhill_us','fanduel','draftkings','pinnacle','betonlineag','lowvig']
MARKETS=['h2h','spreads','totals','alternate_spreads','alternate_totals','player_pass_yds','player_pass_tds','player_rush_yds','player_reception_yds','player_receptions']
def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def key():
    value=os.environ.get('ODDS_API_KEY','')
    if not value and KEYFILE.exists():
        for line in KEYFILE.read_text().splitlines():
            if line.startswith('ODDS_API_KEY='): value=line.split('=',1)[1].strip().strip('\"\'')
    if not value: raise RuntimeError('Odds API credential unavailable')
    return value

def ledger_entries():
    p=RUN/'credits.jsonl'
    return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []
def spent(entries=None):
    entries=ledger_entries() if entries is None else entries
    reservations={x['request_id']:x for x in entries if x['status']=='reserved'}
    results={x['request_id']:x for x in entries if x['status']=='complete'}
    return sum(results[k]['credits'] if k in results else v['reserved_credits'] for k,v in reservations.items())
def fetch(path, params, *, live_group=None):
    RUN.mkdir(parents=True,exist_ok=True)
    secret=key()
    with (RUN/'capture.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        entries=ledger_entries()
        if any(x['status']=='reserved' and not any(y.get('request_id')==x['request_id'] and y['status']=='complete' for y in entries) for x in entries): raise RuntimeError('Unresolved prior charge; no additional dispatch')
        cost=1 if path.endswith('/markets') else len(params.get('markets','').split(','))*(math.ceil(len(params['bookmakers'].split(','))/10) if params.get('bookmakers') else len(params['regions'].split(',')))
        schedule_path=ROOT/'work/week1-followups-v1/schedule.json'
        groups=json.loads(schedule_path.read_text())['groups'] if schedule_path.exists() else []
        dispatched={x.get('live_group') for x in entries if x['status']=='reserved'}
        if live_group:
            group=next((g for g in groups if g['id']==live_group),None)
            if not group or live_group in dispatched: raise RuntimeError('Unknown or already dispatched live group')
            delta=(dt.datetime.fromisoformat(now())-dt.datetime.fromisoformat(group['refresh_at'])).total_seconds()
            if not 0<=delta<60: raise RuntimeError('Outside T65 dispatch window')
            if set(params.get('eventIds','').split(','))!=set(group['event_ids']) or params.get('markets')!='h2h,spreads,totals' or cost!=3: raise RuntimeError('Live request differs from registered group')
        reserve=sum(g['reserved_credits'] for g in groups if g['id'] not in dispatched and g['id']!=live_group)
        if spent(entries)+cost+reserve>300: raise RuntimeError('300-credit cap including remaining live reservations reached')
        rid=hashlib.sha256((now()+path+json.dumps(params,sort_keys=True)).encode()).hexdigest()[:20]
        def log(x):
            with (RUN/'credits.jsonl').open('a') as f: f.write(json.dumps(x,sort_keys=True)+'\n'); f.flush(); os.fsync(f.fileno())
        log({'request_id':rid,'status':'reserved','reserved_credits':cost,'at':now(),'path':path,'params':params,'live_group':live_group})
        url='https://api.the-odds-api.com/v4/'+path+'?'+urlencode({**params,'apiKey':secret})
        config='url = "'+url+'"\n'
        proc=subprocess.run(['/usr/bin/curl','-q','--silent','--show-error','--max-time','30','--include','--config','-'],input=config.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if proc.returncode:
            log({'request_id':rid,'status':'complete','credits':cost,'charge_evidence':'conservative_reservation_transport_failure','transport_error':proc.returncode,'at':now()})
            raise RuntimeError(f'Transport failure code {proc.returncode}; full cost retained')
        packet=proc.stdout
        while True:
            header,raw=packet.split(b'\r\n\r\n',1)
            status=int(header.splitlines()[0].split()[1])
            if status==200 and b'Connection established' in header.splitlines()[0]: packet=raw; continue
            break
        headers={}
        for line in header.splitlines()[1:]:
            if b':' in line:
                k,v=line.split(b':',1);headers[k.decode().lower()]=v.decode().strip()
        digest=hashlib.sha256(raw).hexdigest()
        if secret.encode() in raw: raise RuntimeError('Response contains credential; not persisted')
        data_path=RUN/'captures'/f'{digest}.json'; data_path.parent.mkdir(exist_ok=True)
        if not data_path.exists(): data_path.write_bytes(raw)
        else: assert data_path.read_bytes()==raw
        charge=headers.get('x-requests-last')
        actual=int(charge) if charge is not None else cost
        receipt={'request_id':rid,'status':'complete','credits':actual,'charge_evidence':'provider_header' if charge is not None else 'conservative_reservation','http_status':status,'at':now(),'sha256':digest,'capture':str(data_path.relative_to(ROOT)),'headers':{k:v for k,v in headers.items() if k.lower() in ['x-requests-last','x-requests-used','x-requests-remaining','date','content-type']}}
        log(receipt)
        if status!=200: raise RuntimeError(f'Provider HTTP {status}; receipt persisted, no automatic retry')
        if spent()>300: raise RuntimeError('Provider charge exceeded documented reservation; further dispatch forbidden')
        return json.loads(raw),receipt
