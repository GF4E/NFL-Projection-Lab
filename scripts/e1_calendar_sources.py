"""Pin football-only completion evidence; never substitute last-play time for finality."""
import csv, datetime as dt, hashlib, json, sys, time
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/projection-governance-v2/e1-calendar-corrected'

def run():
    OUT.mkdir(exist_ok=True)
    schedule=ROOT/'outputs/model-pick-v1/final-sources/c4b302a4e1dc27b0f1db0a2617a353a4f73b5b4ed798b0762dd1403032874b77.csv'
    cache=OUT/'completion-source-rows.jsonl'
    known={r['game_id']:r for r in map(json.loads,cache.read_text().splitlines())} if cache.exists() else {}
    session=requests.Session()
    rows=[r for r in csv.DictReader(schedule.open()) if 2011<=int(r['season'])<=2025 and r['game_type']=='REG' and r['home_score']!='']
    for n,g in enumerate(rows):
        if g['game_id'] in known:continue
        url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+g['espn']
        record=dict(game_id=g['game_id'],season=int(g['season']),week=int(g['week']),gameday=g['gameday'],gametime=g['gametime'],source_url=url,retrieved_at=dt.datetime.now(dt.timezone.utc).isoformat())
        try:
            response=session.get(url,timeout=25);response.raise_for_status();data=response.json()
            drives=data.get('drives',{}).get('previous',[])
            plays=[p for drive in drives for p in drive.get('plays',[])]
            final=[p for p in plays if p.get('type',{}).get('id')=='66' or p.get('text','').strip().upper() in ('END GAME','END OF GAME')]
            # Keep actual source fields, including missing clocks, and no financial fields.
            record['final_events']=[{k:p.get(k) for k in ('id','text','wallclock','modified','clock','period')} for p in final]
            record['completed_status']=data.get('header',{}).get('competitions',[{}])[0].get('status',{}).get('type',{}).get('completed')
            record['source_body_sha256']=hashlib.sha256(response.content).hexdigest()
            record['status']='SOURCED' if final else 'UNKNOWN_NO_FINAL_EVENT'
        except Exception as exc:record.update(status='UNKNOWN_SOURCE_ERROR',error=str(exc))
        with cache.open('a') as f:f.write(json.dumps(record,sort_keys=True)+'\n')
        if n%50==0:print(n+1,len(rows),record['game_id'],record['status'],flush=True)
    print('complete',len(rows),flush=True)
if __name__=='__main__':run()
