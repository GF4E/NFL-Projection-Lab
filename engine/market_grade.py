"""Offline grading, with explicit missing-close evidence rather than invented CLV."""
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
from engine.market_distribution import forecast
from engine.pricing import price_edge, timestamp

def read(path):
    with Path(path).open(newline='') as f: return list(csv.DictReader(f))

def grade(t60, results, picks, closing, output):
    paths=[Path(x) for x in t60]
    rows=[r for p in paths for r in read(p)]
    if any(r.get('evidence_label') != 'T60' for r in rows): raise ValueError('Only T60 forecasts can be graded')
    if any(timestamp(r['frozen_at']) > timestamp(r['cutoff_at']) or timestamp(r['input_received_at']) > timestamp(r['cutoff_at']) for r in rows): raise ValueError('Post-cutoff evidence')
    if any(r.get('model_code_sha256') and r['model_code_sha256'] != hashlib.sha256((Path(__file__).parent/'market_distribution.py').read_bytes()).hexdigest() for r in rows): raise ValueError('Use the pinned model code to grade this artifact')
    outcomes=read(results)
    if len({r['event_id'] for r in outcomes}) != len(outcomes): raise ValueError('Duplicate results')
    actual={r['event_id']:r for r in outcomes}
    events={}
    for row in rows:
        if row.get('model_status') != 'EMPIRICAL_RECONSTRUCTED_HISTORY': continue
        key=row['event_id']
        identity=tuple(row[k] for k in ('model_artifact_path','model_artifact_sha256','model_consensus_spread','model_consensus_total','cutoff_at'))
        if key in events and events[key][0] != identity: raise ValueError('Conflicting T60 event forecasts')
        events[key]=(identity,row)
    coverage=[]
    for event,(_,row) in events.items():
        if event not in actual: continue
        result=actual[event]
        if result.get('status') != 'final': continue
        if row['commence_time'][:4] <= '2025': raise ValueError('Training seasons cannot be prospective grades')
        model=forecast(row['model_consensus_spread'],row['model_consensus_total'],{'path':row['model_artifact_path'],'sha256':row['model_artifact_sha256']})
        h,a=float(result['home_score']),float(result['away_score'])
        for target,value in [('margin',h-a),('total',h+a)]:
            for level in (.5,.8,.95):
                low,high=getattr(model,target).interval(level)
                coverage.append(dict(event_id=event,target=target,level=level,lower=low,upper=high,actual=value,covered=low<=value<=high))
    closes=read(closing) if closing else []
    pickrows=[]
    quotes={r['quote_id']:r for r in rows}
    for pick in read(picks):
        frozen=quotes.get(pick.get('quote_id',''))
        if frozen is None: raise ValueError('Pick does not reference supplied T60 quote')
        for key in ('event_id','executed_book','market','side','book_price'):
            if str(frozen[key]) != str(pick[key]): raise ValueError('Pick differs from frozen executed quote')
        if str(frozen['line']) != str(pick['line_at_approval']): raise ValueError('Pick line differs from frozen quote')
        row=dict(pick,clv_cents='',clv_status='MISSING_EXECUTED_BOOK_CLOSE')
        candidates=[]
        for close in closes:
            if any(close.get(k,'') != pick.get(k,'') for k in ('event_id','executed_book','market','player','side')): continue
            kick=timestamp(close['commence_time']); quoted=timestamp(close['quote_updated_at'])
            if not kick-dt.timedelta(minutes=10)<=quoted<=kick: continue
            if timestamp(pick['decision_at'])>quoted: continue
            if str(close.get('line',''))!=str(pick.get('line_at_approval','')): continue
            candidates.append(close)
        if candidates:
            close=max(candidates,key=lambda r:timestamp(r['quote_updated_at']))
            row.update(clv_cents=price_edge(float(close['book_fair_probability']),float(pick['book_price'])),clv_status='EXACT_LINE_EXECUTED_BOOK_CLOSE',closing_quote_id=close['quote_id'])
        pickrows.append(row)
    hashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths+[Path(results),Path(picks)]+([Path(closing)] if closing else [])}
    summary={'input_sha256':hashes,'clv_definition':'American cents versus devigged closing fair price at exact approved line and executed book. Quotes must be within final 10 minutes before kickoff. Missing closes stay ungraded.','coverage':[],'ungraded_event_ids':sorted(set(events)-{r['event_id'] for r in coverage})}
    for target in ('margin','total'):
        for level in (.5,.8,.95):
            group=[r for r in coverage if r['target']==target and r['level']==level]
            summary['coverage'].append(dict(target=target,level=level,n=len(group),coverage=sum(r['covered'] for r in group)/len(group) if group else None))
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    def put(path,data):
        if path.exists() and path.read_bytes()!=data: raise ValueError('Immutable grade differs')
        if not path.exists(): path.write_bytes(data)
    import io
    for name,data,defaults in [('pick_clv.csv',pickrows,['pick_id','clv_status']),('interval_coverage.csv',coverage,['event_id','target','level','lower','upper','actual','covered'])]:
        buf=io.StringIO(newline='');fields=list(dict.fromkeys(k for r in data for k in r)) or defaults
        writer=csv.DictWriter(buf,fieldnames=fields);writer.writeheader();writer.writerows(data);put(output/name,buf.getvalue().encode())
    put(output/'receipt.json',(json.dumps(summary,indent=2,sort_keys=True)+'\n').encode())
    return summary
