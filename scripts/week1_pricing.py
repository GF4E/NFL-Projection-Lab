"""Default offline replay; explicit refresh makes one capped mainline request."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.quote_capture import RUN,BOOKS,fetch
from build_week1_board import build
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--refresh-mainlines',action='store_true');p.add_argument('--manifest');a=p.parse_args()
    if a.refresh_mainlines and a.manifest: p.error('Choose refresh or replay manifest')
    manifest=a.manifest
    if a.refresh_mainlines:
        data,r=fetch('sports/americanfootball_nfl/odds',{'bookmakers':','.join(BOOKS),'markets':'h2h,spreads,totals','oddsFormat':'american','commenceTimeFrom':'2026-09-09T00:00:00Z','commenceTimeTo':'2026-09-16T00:00:00Z'})
        path=RUN/('manifest-'+r['request_id']+'.json')
        with path.open('x') as f: json.dump({'receipts':[r]},f,indent=2)
        manifest=path
    build(manifest)
