"""Offline joint-pick weekly/cumulative scorecards. No provider calls."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path):
    with Path(path).open(newline='') as f: return list(csv.DictReader(f))

def write(path, rows, fields):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    buf=io.StringIO(newline='');w=csv.DictWriter(buf,fieldnames=fields);w.writeheader();w.writerows(rows)
    path.write_bytes(buf.getvalue().encode())

def scorecard(picks, results=None, grades=(), output=ROOT/'outputs/scorecard.csv'):
    paths=[Path(p) for p in picks]
    outcomes=read(results) if results else []
    if len({r['event_id'] for r in outcomes})!=len(outcomes): raise ValueError('Duplicate event result')
    by_event={r['event_id']:r for r in outcomes}
    clv={}
    for path in grades:
        for r in read(path):
            if r.get('clv_cents','')=='': continue
            if r.get('clv_status')!='EXACT_LINE_EXECUTED_BOOK_CLOSE': raise ValueError('Unsupported CLV evidence')
            value=float(r['clv_cents'])
            if not math.isfinite(value): raise ValueError('Nonfinite CLV')
            key=(r['record_class'],r['pick_id'])
            identity=(r['quote_id'],r['executed_book'],r['event_id'],r['side'],r['line_at_approval'],r['book_price'],value)
            if key in clv and clv[key]!=identity: raise ValueError('Conflicting CLV grades')
            clv[key]=identity
    entries=[];seen=set()
    for path in paths:
        for pick in read(path):
            mode=pick['record_class'];key=(mode,pick['pick_id'])
            if mode not in {'live','paper'}: raise ValueError('Joint pick schema required')
            if key in seen: raise ValueError('Duplicate joint pick ID within class')
            seen.add(key)
            if pick['status'] not in {'picked','declined'}: raise ValueError('Unknown pick status')
            market=pick['market'].replace('alternate_','')
            if market not in {'spreads','totals'}: continue
            result=by_event.get(pick['event_id'],{})
            season=pick.get('season') or result.get('season');week=pick.get('week') or result.get('week')
            if not season or not week: raise ValueError('Season and week required')
            season,week=int(season),int(week)
            for field,value in [('season',season),('week',week)]:
                if result.get(field) and int(result[field])!=value: raise ValueError('Pick/result calendar mismatch')
            outcome='declined' if pick['status']=='declined' else 'pending'
            if outcome!='declined' and result.get('status')=='final':
                home,away=float(result['home_score']),float(result['away_score'])
                if any(not math.isfinite(v) or v<0 or not v.is_integer() for v in (home,away)): raise ValueError('Invalid final score')
                line=float(pick['line_at_approval'])
                if not math.isfinite(line): raise ValueError('Invalid line')
                if market=='spreads':
                    if pick['side']==pick['home_team']: value=home-away+line
                    elif pick['side']==pick['away_team']: value=away-home+line
                    else: raise ValueError('Spread side must match team')
                else:
                    if pick['side'] not in {'Over','Under'}: raise ValueError('Invalid total side')
                    value=(home+away-line)*(1 if pick['side']=='Over' else -1)
                outcome='win' if value>0 else 'loss' if value<0 else 'push'
            value=''
            if key in clv and outcome!='declined':
                expected=tuple(pick[k] for k in ('quote_id','executed_book','event_id','side','line_at_approval','book_price'))
                if clv[key][:-1]!=expected: raise ValueError('CLV does not match frozen pick quote')
                value=clv[key][-1]
            entries.append(dict(pick_id=pick['pick_id'],record_class=mode,is_paper=mode=='paper',season=season,week=week,market=market,event_id=pick['event_id'],executed_book=pick['executed_book'],side=pick['side'],line=pick['line_at_approval'],outcome=outcome,clv_cents=value,clv_available=value!=''))
    rows=[]
    scopes=[('cumulative','ALL','ALL')]+[('week',s,w) for s,w in sorted({(r['season'],r['week']) for r in entries})]
    for scope,season,week in scopes:
        for market in ('spreads','totals'):
            for mode in ('combined','live','paper'):
                group=[r for r in entries if r['market']==market and (mode=='combined' or r['record_class']==mode) and (scope=='cumulative' or (r['season'],r['week'])==(season,week))]
                values=[r['clv_cents'] for r in group if r['clv_cents']!='']
                rows.append(dict(scope=scope,season=season,week=week,market=market,record_class=mode,picks=sum(r['outcome']!='declined' for r in group),wins=sum(r['outcome']=='win' for r in group),losses=sum(r['outcome']=='loss' for r in group),pushes=sum(r['outcome']=='push' for r in group),pending=sum(r['outcome']=='pending' for r in group),declined=sum(r['outcome']=='declined' for r in group),clv_n=len(values),mean_clv_cents=sum(values)/len(values) if values else ''))
    output=Path(output)
    write(output,rows,list(rows[0]))
    details=output.with_name(output.stem+'_picks.csv')
    write(details,entries,['pick_id','record_class','is_paper','season','week','market','event_id','executed_book','side','line','outcome','clv_cents','clv_available'])
    inputs=paths+([Path(results)] if results else [])+[Path(p) for p in grades]
    receipt={'inputs_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},'rows':len(rows),'joint_entries':len(entries),'definition':'Each picked joint entry counts once within its class; combined includes live and paper. Declined entries are shown but excluded from W/L/P and CLV. Missing results are pending; mean CLV uses only available verified exact-line executed-book close grades, in American cents. Cumulative spans supplied seasons; weekly rows include season.','outputs_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in (output,details)}}
    output.with_suffix('.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
    return rows

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scorecard',action='store_true',required=True)
    p.add_argument('--picks',nargs='+',default=[str(ROOT/'outputs/week1-pricing/pick_log.csv'),str(ROOT/'outputs/week1-pricing/paper_pick_log.csv')])
    p.add_argument('--results',help='Final results CSV: event_id,home_score,away_score,status; season/week optional cross-check')
    p.add_argument('--grades',nargs='*',default=[],help='Verified pick_clv.csv outputs from --grade, for live and paper')
    p.add_argument('--output',default=str(ROOT/'outputs/scorecard.csv'))
    a=p.parse_args();scorecard(a.picks,a.results,a.grades,a.output)
    print(a.output)
