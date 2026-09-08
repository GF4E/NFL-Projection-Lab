"""Append-only joint picks. Live and paper are labeled, with no person roles."""
import csv,datetime as dt,fcntl,json,os
from pathlib import Path
FIELDS=['pick_id','decision_at','status','record_class','executed_book','quote_id','consensus_id','event_id','season','week','home_team','away_team','commence_time','market','player','side','line_at_approval','book_price','fair_probability','fair_price','price_edge_cents','model_probability','probability_source','book_fair_probability_after_vig','quote_updated_at','snapshot_received_at','source_sha256']
def initialize(path):
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    try:
        with p.open('x',newline='') as f: csv.DictWriter(f,fieldnames=FIELDS).writeheader()
    except FileExistsError:
        with p.open(newline='') as f:
            if next(csv.reader(f))!=FIELDS: raise ValueError('Pick log schema mismatch')
def append(path,quote,*,pick_id,status='picked',paper=False):
    if status not in {'picked','declined'}: raise ValueError('Invalid decision')
    if quote['executed_book'] not in {'betmgm','williamhill_us','fanduel','draftkings'}: raise ValueError('Book is not executable')
    for v in [pick_id]:
        if not v.strip() or v[0] in '=+-@' or any(c in v for c in '\r\n'): raise ValueError('Invalid identity field')
    initialize(path)
    row=dict.fromkeys(FIELDS,'')
    row.update({'pick_id':pick_id,'decision_at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':status,'record_class':'paper' if paper else 'live','line_at_approval':quote['line'],'book_fair_probability_after_vig':quote['book_fair_probability']})
    for field in FIELDS:
        if field in quote: row[field]=quote[field]
    kickoff=dt.datetime.fromisoformat(quote['commence_time'].replace('Z','+00:00'))
    row['season']=quote.get('season',kickoff.year-(kickoff.month<3))
    # One joint entry per pick ID; its book and quote remain frozen.
    with Path(path).open('r+',newline='') as f:
        fcntl.flock(f,fcntl.LOCK_EX)
        prior=list(csv.DictReader(f))
        for old in prior:
            if old['pick_id']==pick_id:
                semantic=[k for k in FIELDS if k!='decision_at']
                if all(str(old[k])==str(row[k]) for k in semantic): return 'already_recorded'
                raise ValueError('Pick ID already exists with a different decision; append a new event ID')
        f.seek(0,2);csv.DictWriter(f,fieldnames=FIELDS).writerow(row);f.flush();os.fsync(f.fileno())
    return 'appended'
