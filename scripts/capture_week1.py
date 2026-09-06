import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.quote_capture import *
if __name__=='__main__':
    p=RUN/'main_capture.json'
    if p.exists():
        saved=json.loads(p.read_text()); data=json.loads((ROOT/saved['receipt']['capture']).read_text());receipt=saved['receipt']
    else:
        data,receipt=fetch('sports/americanfootball_nfl/odds',{'bookmakers':','.join(BOOKS),'markets':'h2h,spreads,totals','oddsFormat':'american','commenceTimeFrom':'2026-09-09T00:00:00Z','commenceTimeTo':'2026-09-16T00:00:00Z'})
        with p.open('x') as f: json.dump({'receipt':receipt},f,indent=2)
    print('Events:',len(data),'Books:',sorted({b['key'] for e in data for b in e.get('bookmakers',[])}),'Credits:',spent())
