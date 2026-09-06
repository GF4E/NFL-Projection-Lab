import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.quote_capture import *
if __name__=='__main__':
    m=json.loads((RUN/'main_capture.json').read_text()); events=json.loads((ROOT/m['receipt']['capture']).read_text())
    returned={b['key'] for e in events for b in e.get('bookmakers',[])}
    sharp=next((b for b in ['pinnacle','betonlineag','lowvig'] if b in returned),None)
    books=['betmgm','williamhill_us','fanduel','draftkings']+([sharp] if sharp else [])
    index=RUN/'detail_captures.jsonl'
    saved=[json.loads(l) for l in index.read_text().splitlines()] if index.exists() else []
    for event in events:
        if any(x['event_id']==event['id'] for x in saved): continue
        data,receipt=fetch('sports/americanfootball_nfl/events/'+event['id']+'/odds',{'bookmakers':','.join(books),'markets':','.join(MARKETS),'oddsFormat':'american'})
        row={'event_id':event['id'],'sharp_reference':sharp,'receipt':receipt}
        with index.open('a') as f: f.write(json.dumps(row,sort_keys=True)+'\n');f.flush();os.fsync(f.fileno())
        print('Captured',event['id'],'reserved/charged total',spent(),flush=True)
