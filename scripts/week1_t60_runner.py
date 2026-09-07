"""Launchd clock dispatcher. UTC plan, bounded windows, one charge per group."""
import csv,datetime as dt,fcntl,hashlib,io,json,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.quote_capture import ROOT,RUN,ledger_entries
from engine.pricing import normalize,timestamp
from build_week1_board import encoded_csv,put
PLAN=ROOT/'work/week1-followups-v1/schedule.json'
OUT=ROOT/'outputs/week1-t60'
def heartbeat(current,state_path):
    """Called under the scheduler lock; persisted UTC hour survives process restarts."""
    hour=current.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:00:00Z')
    if state_path.exists():
        try: previous=json.loads(state_path.read_text()).get('hour','')
        except (ValueError,OSError): previous=''
        if previous>=hour: return False
    state_path.write_text(json.dumps({'hour':hour,'at':current.isoformat()})+'\n')
    print(f'{current.isoformat()} HEARTBEAT week1-t60 scheduler alive',flush=True)
    return True

def phase(group,current):
    t=timestamp(group['refresh_at']);cut=timestamp(group['cutoff_at'])
    if current<t: return 'WAIT'
    if current<t+dt.timedelta(seconds=60): return 'REFRESH'
    if current<cut-dt.timedelta(seconds=60): return 'WAIT_FOR_FREEZE'
    if current<=cut: return 'FREEZE'
    return 'MISSED'
def freeze(group,receipt,current,output):
    """No provider calls. Freeze only captured pre-cutoff quotes for this group."""
    cutoff=timestamp(group['cutoff_at'])
    if (output/'receipt.json').exists(): return json.loads((output/'receipt.json').read_text())
    if not cutoff-dt.timedelta(seconds=60)<=current<=cutoff: raise ValueError('Outside T60 freeze window')
    if not timestamp(group['refresh_at'])<=timestamp(receipt['at'])<=current: raise ValueError('Input was not received in T65-to-T60 window')
    raw=(ROOT/receipt['capture']).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=receipt['sha256']: raise ValueError('Capture hash mismatch')
    data=json.loads(raw);data=[data] if isinstance(data,dict) else data
    data=[e for e in data if e['id'] in group['event_ids']]
    if {e['id'] for e in data}!=set(group['event_ids']): raise ValueError('Missing scheduled event')
    if any(timestamp(e['commence_time'])!=timestamp(group['kickoff_at']) for e in data): raise ValueError('Kickoff changed; no backdated T60 artifact')
    output.mkdir(parents=True,exist_ok=True)
    intent=output/'freeze-intent.json'
    if intent.exists():
        saved=json.loads(intent.read_text())
        if saved['capture_sha256']!=receipt['sha256']: raise ValueError('Freeze input changed')
        current=timestamp(saved['frozen_at'])
    else: put(intent,json.dumps({'frozen_at':current.isoformat(),'capture_sha256':receipt['sha256']}).encode())
    rows,issues,sharp,returned=normalize([(e,receipt) for e in data])
    if not rows: raise ValueError('No eligible captured prices')
    for row in rows:
        row.update({'evidence_label':'T60','cutoff_at':group['cutoff_at'],'frozen_at':current.isoformat(),'input_received_at':receipt['at'],'schedule_group':group['id']})
    board=[r for r in rows if r['board_eligible']]
    output.mkdir(parents=True,exist_ok=True)
    put(output/'T60-pricing.csv',encoded_csv(rows,list(rows[0])))
    put(output/'T60-board.csv',encoded_csv(board,list(rows[0])))
    result={'pricing_code_sha256':hashlib.sha256((ROOT/'engine/pricing.py').read_bytes()).hexdigest(),'scheduler_code_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'schedule_sha256':hashlib.sha256(PLAN.read_bytes()).hexdigest(),'status':'T60','group':group,'cutoff_at':group['cutoff_at'],'frozen_at':current.isoformat(),'capture_sha256':receipt['sha256'],'pricing_rows':len(rows),'board_rows':len(board),'issues':issues,'event_ids_with_prices':sorted({r['event_id'] for r in rows}),'missing_books':sorted({'betmgm','williamhill_us','fanduel','draftkings'}-set(returned)),'note':'T60-deadline artifact frozen during the preceding minute from T65 data. Actual freeze time recorded, never backdated. Mainlines only.'}
    put(output/'receipt.json',(json.dumps(result,indent=2,sort_keys=True)+'\n').encode())
    return result

def run():
    OUT.mkdir(exist_ok=True)
    with (OUT/'scheduler.lock').open('a') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: return
        heartbeat(dt.datetime.now(dt.timezone.utc),OUT/'heartbeat.json')
        for group in json.loads(PLAN.read_text())['groups']:
            current=dt.datetime.now(dt.timezone.utc);stage=phase(group,current);folder=OUT/group['id']
            if (folder/'receipt.json').exists(): continue
            if stage in {'WAIT','WAIT_FOR_FREEZE'}: continue
            entries=ledger_entries();dispatch=next((e for e in entries if e.get('live_group')==group['id'] and e['status']=='reserved'),None)
            if stage=='REFRESH':
                if dispatch: continue
                # Persistent intent prevents an uncharged crash from causing repeated dispatches.
                folder.mkdir(exist_ok=True)
                if (folder/'dispatch-intent.json').exists(): continue
                put(folder/'dispatch-intent.json',json.dumps({'at':current.isoformat(),'group':group['id']}).encode())
                proc=subprocess.run(['/opt/anaconda3/bin/python3.12','-B',str(ROOT/'scripts/week1_pricing.py'),'--refresh-mainlines','--scheduled-group',group['id']],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                put(folder/'dispatch-result.json',json.dumps({'exit_code':proc.returncode,'finished_at':dt.datetime.now(dt.timezone.utc).isoformat()}).encode())
                continue
            receipt=next((e for e in entries if dispatch and e.get('request_id')==dispatch['request_id'] and e['status']=='complete' and e.get('http_status')==200),None)
            if stage=='FREEZE' and receipt:
                try:
                    freeze(group,receipt,current,folder);continue
                except (ValueError,RuntimeError) as exc: reason=str(exc)
            else: reason='No successful pre-cutoff capture' if stage=='FREEZE' else 'T60 freeze deadline missed (machine unavailable or scheduler delayed)'
            folder.mkdir(exist_ok=True)
            put(folder/'receipt.json',json.dumps({'status':'MISSED','at':current.isoformat(),'group':group,'reason':reason},indent=2).encode())
if __name__=='__main__': run()
