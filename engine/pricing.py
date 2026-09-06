"""Deterministic pricing transforms; no forecast fit or network access."""
import csv, datetime as dt, hashlib, json, math, statistics
from collections import defaultdict
from pathlib import Path
BASE_BOOKS={'betmgm','williamhill_us','fanduel','draftkings'}
SHARP_PRIORITY=['pinnacle','betonlineag','lowvig']
EXECUTION={'betmgm','williamhill_us','fanduel','draftkings'}
def decimal_odds(a):
    a=float(a)
    if not math.isfinite(a) or abs(a)<100: raise ValueError('Invalid American odds')
    return 1+(a/100 if a>0 else 100/-a)
def american(p):
    if not 0<p<1: raise ValueError('Invalid probability')
    return -100*p/(1-p) if p>=.5 else 100*(1-p)/p
def cents(a): return a+100 if a<0 else a-100
def price_edge(p,a): return cents(float(a))-cents(american(p))
def power_devig(prices):
    if len(prices) not in (2,3): raise ValueError('Complete two/three-way market required')
    q=[1/decimal_odds(x) for x in prices]
    lo,hi=0.,1.
    while sum(x**hi for x in q)>1:
        hi*=2
        if hi>1024: raise ValueError('Power root not bracketed')
    for _ in range(100):
        mid=(lo+hi)/2
        if sum(x**mid for x in q)>1: lo=mid
        else: hi=mid
    k=(lo+hi)/2; probs=[x**k for x in q]
    assert abs(sum(probs)-1)<1e-12
    return probs,k

def qualifies(p,price,nbooks=2):
    return .60<=p<=.70 and price_edge(p,price)>=10-1e-10

def timestamp(t): return dt.datetime.fromisoformat(t.replace('Z','+00:00'))
def normalize(captures):
    returned={b['key'] for e,receipt in captures for b in e.get('bookmakers',[])}
    sharp=next((s for s in SHARP_PRIORITY if s in returned),None)
    allowed=BASE_BOOKS|({sharp} if sharp else set())
    chosen={}; issues=[]
    for event,receipt in captures:
        for book in event.get('bookmakers',[]):
            if book['key'] not in allowed: continue
            for market in book.get('markets',[]):
                original=market['key']; kind=original.replace('alternate_','').removesuffix('_alternate')
                if kind not in {'spreads','totals','h2h'} and not kind.startswith('player_'): continue
                groups=defaultdict(list)
                for o in market.get('outcomes',[]):
                    try:
                        point=float(o['point']) if 'point' in o else None
                        if point is not None and not math.isfinite(point): raise ValueError('nonfinite point')
                        if kind=='spreads':
                            if o['name'] not in (event['home_team'],event['away_team']): continue
                            canonical=point if o['name']==event['home_team'] else -point
                        else: canonical=point
                        groups[(o.get('description',''),canonical)].append(o)
                    except (ValueError,TypeError): issues.append({'event_id':event['id'],'book':book['key'],'reason':'invalid_point'})
                for (player,point),outcomes in groups.items():
                    identity=(event['id'],kind,player,point)
                    names={o['name'] for o in outcomes}
                    required={event['home_team'],event['away_team']} if kind in ('h2h','spreads') else {'Over','Under'}
                    if not required.issubset(names) or len(names)!=len(outcomes) or len(outcomes) not in (2,3) or (kind!='h2h' and names!=required):
                        issues.append({'event_id':event['id'],'book':book['key'],'market':original,'reason':'incomplete_or_duplicate_market'});continue
                    if kind=='h2h' and len(names)==3 and names-required!={'Draw'}: continue
                    # Never merge a two-way h2h conditional market with a three-way market.
                    identity=(*identity,len(outcomes))
                    outcomes=sorted(outcomes,key=lambda o:o['name'])
                    try:
                        probs,k=power_devig([o['price'] for o in outcomes])
                        updated=market.get('last_update',book.get('last_update'))
                        age=(timestamp(receipt['at'])-timestamp(updated)).total_seconds()
                        if not 0<=age<=3600: raise ValueError('stale_or_future_quote')
                    except (ValueError,TypeError,KeyError):
                        issues.append({'event_id':event['id'],'book':book['key'],'market':original,'reason':'invalid_price_or_timestamp'});continue
                    rows=[]
                    for o,p in zip(outcomes,probs):
                        qid=hashlib.sha256(json.dumps([receipt['sha256'],identity,book['key'],o],sort_keys=True).encode()).hexdigest()[:24]
                        rows.append({'quote_id':qid,'snapshot_received_at':receipt['at'],'source_sha256':receipt['sha256'],'event_id':event['id'],'week':1,'commence_time':event['commence_time'],'home_team':event['home_team'],'away_team':event['away_team'],'market':kind,'provider_market':original,'player':player,'canonical_line':point,'side':o['name'],'line':o.get('point',''),'executed_book':book['key'],'book_price':o['price'],'decimal_price':decimal_odds(o['price']),'book_fair_probability':p,'devig_power':k,'quote_updated_at':updated,'quote_age_seconds':age,'probability_basis':'conditional_non_push' if kind!='h2h' or len(outcomes)==2 else 'three_way_including_draw','model_probability':'','probability_source':'market_consensus_no_model','evidence_label':'live_snapshot_not_T60','sharp_reference':sharp or ''})
                    key=(identity,book['key'])
                    # Later capture wins; never average the same book twice.
                    if key not in chosen or receipt['at']>chosen[key][0]['snapshot_received_at']: chosen[key]=rows
    markets=defaultdict(list)
    for (identity,book),rows in chosen.items(): markets[identity].append(rows)
    allrows=[]
    for identity,books in sorted(markets.items(),key=lambda x:str(x[0])):
        sides=sorted(r['side'] for r in books[0]); median={s:statistics.median(next(r['book_fair_probability'] for r in rows if r['side']==s) for rows in books) for s in sides}
        mass=sum(median.values()); consensus={s:p/mass for s,p in median.items()}
        cid=hashlib.sha256(json.dumps([identity,sorted(r['quote_id'] for rows in books for r in rows)]).encode()).hexdigest()[:24]
        for rows in books:
            for row in rows:
                p=consensus[row['side']]; matching=[r for bs in books for r in bs if r['side']==row['side']]
                best=max(r['decimal_price'] for r in matching); bestrows=[r for r in matching if r['decimal_price']==best]
                executable=[r for r in matching if r['executed_book'] in EXECUTION]
                bestexec=max(executable,key=lambda r:r['decimal_price']) if executable else None
                row.update({'consensus_id':cid,'consensus_fair_probability':p,'fair_probability':p,'fair_price':american(p),'price_edge_cents':price_edge(p,row['book_price']),'qualifying_books':len(books),'coverage_flag':'FEWER_THAN_TWO_BOOKS' if len(books)<2 else 'OK','best_price':bestrows[0]['book_price'],'best_price_books':'|'.join(sorted(r['executed_book'] for r in bestrows)),'best_executable_price':bestexec['book_price'] if bestexec else '', 'filter_pass':qualifies(p,row['book_price'],len(books)) and row['executed_book'] in EXECUTION,'board_eligible':qualifies(p,row['book_price'],len(books)) and row['executed_book'] in EXECUTION})
                allrows.append(row)
    # Fair line is the offered consensus threshold closest to 50%; no interpolation/model.
    family=defaultdict(list)
    for row in allrows:
        if row['canonical_line'] is not None and row['side'] in (row['home_team'],'Over'):
            family[(row['event_id'],row['market'],row['player'])].append(row)
    fairlines={key:min(rows,key=lambda r:(abs(r['fair_probability']-.5),float(r['canonical_line'])))['canonical_line'] for key,rows in family.items()}
    for row in allrows:
        line=fairlines.get((row['event_id'],row['market'],row['player']),'')
        if row['market']=='spreads' and row['side']==row['away_team'] and line!='': line=-line
        row['consensus_fair_line']=line
        row['fair_line_method']='closest_offered_consensus_to_50pct_no_interpolation' if line!='' else 'not_applicable'
    return sorted(allrows,key=lambda r:(r['event_id'],r['market'],r['player'],str(r['line']),r['side'],r['executed_book'])),issues,sharp,sorted(returned)

def write_csv(path,rows,fields):
    with Path(path).open('x',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
