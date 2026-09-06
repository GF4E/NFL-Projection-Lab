import csv,hashlib,io,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.pricing import normalize
from engine.pick_log import initialize
from engine.quote_capture import ROOT,RUN,ledger_entries,spent

def encoded_csv(rows,fields):
    s=io.StringIO(newline='');w=csv.DictWriter(s,fieldnames=fields);w.writeheader();w.writerows(rows);return s.getvalue().encode()
def put(path,data):
    if path.exists():
        if path.read_bytes()!=data: raise ValueError('Immutable output differs: '+str(path))
    else: path.write_bytes(data)
def build(manifest=None):
    if manifest:
        records=json.loads(Path(manifest).read_text())['receipts']
    else:
        main=json.loads((RUN/'main_capture.json').read_text())['receipt']; records=[main]
        records += [json.loads(l)['receipt'] for l in (RUN/'detail_captures.jsonl').read_text().splitlines()]
    captures=[]
    for r in records:
        raw=(ROOT/r['capture']).read_bytes();assert hashlib.sha256(raw).hexdigest()==r['sha256']
        events=json.loads(raw)
        if isinstance(events,dict): events=[events]
        captures.extend((e,r) for e in events)
    rows,issues,sharp,returned=normalize(captures)
    if not rows: raise RuntimeError('No valid pricing rows; prior board preserved')
    snapshot=hashlib.sha256(json.dumps([[r['sha256'] for r in records],hashlib.sha256((ROOT/'engine/pricing.py').read_bytes()).hexdigest(),hashlib.sha256(Path(__file__).read_bytes()).hexdigest()]).encode()).hexdigest()[:16]
    output=ROOT/'outputs/week1-pricing'/snapshot;output.mkdir(parents=True,exist_ok=True)
    for row in rows: row['snapshot_id']=snapshot
    board=[r for r in rows if r['board_eligible']]
    put(output/'pricing.csv',encoded_csv(rows,list(rows[0])))
    put(output/'week1_board.csv',encoded_csv(board,list(rows[0])))
    # A CSV for every individual provider snapshot, in addition to the combined board.
    per_snapshot=output/'snapshots';per_snapshot.mkdir(exist_ok=True)
    for r in records:
        single=[c for c in captures if c[1]['sha256']==r['sha256']]
        sr,_,_,_=normalize(single)
        for row in sr: row['snapshot_id']=r['sha256'][:16]
        put(per_snapshot/(r['sha256'][:16]+'.csv'),encoded_csv(sr,list(rows[0])))
    entries=[entry for entry in ledger_entries() if entry['at']<=max(r['at'] for r in records)];complete=[r for r in entries if r['status']=='complete']
    result={'experiment_id':'week1-pricing-v1','snapshot_id':snapshot,'pricing_csv':str((output/'pricing.csv').relative_to(ROOT)),'board_csv':str((output/'week1_board.csv').relative_to(ROOT)),'event_count':len({r['event_id'] for r in rows}),'pricing_rows':len(rows),'board_rows':len(board),'board_markets':sorted({r['market'] for r in board}),'sharp_reference':sharp,'returned_books':returned,'missing_requested_books':sorted({'betmgm','williamhill_us','fanduel','draftkings'}-set(returned)),'credits_confirmed':sum(r['credits'] for r in complete if r['charge_evidence']=='provider_header'),'credits_uncertain_reserved':sum(r['credits'] for r in complete if r['charge_evidence']!='provider_header'),'credits_total_accounted':spent(entries),'credit_cap':300,'status':'BOARD_READY_WITH_COVERAGE_GAPS' if 'williamhill_us' not in returned else 'BOARD_READY','issues':issues,'capture_sha256':[r['sha256'] for r in records],'probability_source':'consensus_only_no_model','parity_or_model_gate_changed':False}
    put(RUN/('result-'+snapshot+'.json'),(json.dumps(result,indent=2,sort_keys=True)+'\n').encode())
    initialize(ROOT/'outputs/week1-pricing/pick_log.csv');initialize(ROOT/'outputs/week1-pricing/paper_pick_log.csv')
    print(json.dumps({k:v for k,v in result.items() if k not in ['issues','capture_sha256']},indent=2))
    return result
if __name__=='__main__': build()
