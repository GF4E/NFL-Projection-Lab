import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.quote_capture import ROOT,RUN,fetch,spent
OUT=ROOT/'work/week1-followups-v1'
KEYS=['alternate_spreads','alternate_totals','player_pass_yds_alternate','player_rush_yds_alternate','player_reception_yds_alternate']
if __name__=='__main__':
    main=json.loads((RUN/'main_capture.json').read_text())['receipt'];events=json.loads((ROOT/main['capture']).read_text())
    idx=OUT/'recaptures.jsonl';prior=[json.loads(x) for x in idx.read_text().splitlines()] if idx.exists() else []
    for e in events:
        if any(x['event_id']==e['id'] for x in prior): continue
        d,r=fetch('sports/americanfootball_nfl/events/'+e['id']+'/odds',{'bookmakers':'betmgm,williamhill_us','markets':','.join(KEYS),'oddsFormat':'american'})
        with idx.open('a') as f: f.write(json.dumps({'event_id':e['id'],'receipt':r})+'\n')
        print(e['id'],[(b['key'],[m['key'] for m in b['markets']]) for b in d.get('bookmakers',[])],spent(),flush=True)
