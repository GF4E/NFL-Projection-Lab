import csv,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.quote_capture import ROOT,RUN,fetch,spent,MARKETS
OUT=ROOT/'work/week1-followups-v1'
if __name__=='__main__':
    main=json.loads((RUN/'main_capture.json').read_text())['receipt'];events=json.loads((ROOT/main['capture']).read_text())
    idx=OUT/'market-discovery.jsonl';existing=[json.loads(l) for l in idx.read_text().splitlines()] if idx.exists() else []
    for event in events:
        if any(x['event_id']==event['id'] for x in existing): continue
        data,receipt=fetch('sports/americanfootball_nfl/events/'+event['id']+'/markets',{'regions':'us,us2'})
        row={'event_id':event['id'],'receipt':receipt}
        with idx.open('a') as f: f.write(json.dumps(row,sort_keys=True)+'\n')
        print(event['id'],spent(),flush=True)
    discoveries=[json.loads(l) for l in idx.read_text().splitlines()]
    rows=[]
    for x in discoveries:
        d=json.loads((ROOT/x['receipt']['capture']).read_text());books={b['key']:b for b in d.get('bookmakers',[])}
        for book in ['betmgm','williamhill_us','fanduel','draftkings']:
            markets={m['key'] for m in books.get(book,{}).get('markets',[])}
            for m in MARKETS[3:]: rows.append({'event_id':x['event_id'],'book':book,'market':m,'listed':m in markets,'book_returned':book in books,'regions':'us,us2','available_keys':'|'.join(sorted(markets)),'source_sha256':x['receipt']['sha256']})
    with (OUT/'coverage-matrix.csv').open('x',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    summary={book:{m:sum(r['listed'] for r in rows if r['book']==book and r['market']==m) for m in MARKETS[3:]} for book in ['betmgm','williamhill_us','fanduel','draftkings']}
    with (OUT/'coverage-summary.json').open('x') as f: json.dump(summary,f,indent=2)
    print(json.dumps(summary,indent=2))
