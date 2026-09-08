import argparse,csv,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.pick_log import append
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pricing-csv',required=True);p.add_argument('--quote-id',required=True);p.add_argument('--pick-id',required=True);p.add_argument('--status',choices=['picked','declined'],default='picked');p.add_argument('--paper',action='store_true');a=p.parse_args()
    with open(a.pricing_csv,newline='') as f: rows=[r for r in csv.DictReader(f) if r['quote_id']==a.quote_id]
    if len(rows)!=1: p.error('Quote identity must match exactly one pricing row')
    root=Path(__file__).resolve().parents[1]
    path=root/'outputs/week1-pricing'/('paper_pick_log.csv' if a.paper else 'pick_log.csv')
    print(append(path,rows[0],pick_id=a.pick_id,status=a.status,paper=a.paper))
