"""Default offline replay; explicit refresh makes one capped mainline request."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.quote_capture import RUN,BOOKS,fetch
from build_week1_board import build
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--refresh-mainlines',action='store_true');p.add_argument('--manifest');p.add_argument('--scheduled-group');a=p.parse_args()
    if a.refresh_mainlines and a.manifest: p.error('Choose refresh or replay manifest')
    if a.scheduled_group and not a.refresh_mainlines: p.error('Scheduled group requires --refresh-mainlines')
    manifest=a.manifest
    if a.refresh_mainlines:
        params={'bookmakers':','.join(BOOKS),'markets':'h2h,spreads,totals','oddsFormat':'american','commenceTimeFrom':'2026-09-09T00:00:00Z','commenceTimeTo':'2026-09-16T00:00:00Z'}
        if a.scheduled_group:
            groups=json.loads((RUN.parent/'week1-followups-v1/schedule.json').read_text())['groups']
            group=next(g for g in groups if g['id']==a.scheduled_group)
            params['eventIds']=','.join(group['event_ids'])
        data,r=fetch('sports/americanfootball_nfl/odds',params,live_group=a.scheduled_group)
        path=RUN/('manifest-'+r['request_id']+'.json')
        with path.open('x') as f: json.dump({'receipts':[r]},f,indent=2)
        manifest=path
    build(manifest)
