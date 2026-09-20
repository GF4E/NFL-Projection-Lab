"""Pin missing public QB histories and exact CPOE aggregates; no fitting."""
import datetime as dt,gzip,hashlib,json,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));O=ROOT/'work/e-elo-qb-value-v2';(O/'raw').mkdir(exist_ok=True)
def run():
 receipts=[]
 for kind,years in [('player_stats',range(1999,2014)),('injuries',[2014,2015]),('depth_charts',[2014,2015])]:
  for y in years:
   url=f'https://github.com/nflverse/nflverse-data/releases/download/{kind}/{kind}_{y}.csv';p=O/'raw'/f'{kind}_{y}.csv.gz'
   if p.exists():continue
   try:
    with urllib.request.urlopen(url,timeout=60) as r:raw=r.read();status=r.status
    compressed=gzip.compress(raw,mtime=0);p.write_bytes(compressed);receipt={'kind':kind,'season':y,'url':url,'http_status':status,'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'compressed_path':str(p.relative_to(ROOT)),'compressed_sha256':hashlib.sha256(compressed).hexdigest()}
   except Exception as e:receipt={'kind':kind,'season':y,'url':url,'error':type(e).__name__}
   receipts.append(receipt);print(kind,y,receipt.get('http_status',receipt.get('error')),flush=True)
 old=O/'extra-source-receipts.json';prior=json.loads(old.read_text()) if old.exists() else [];old.write_text(json.dumps(prior+receipts,indent=2)+'\n')
if __name__=='__main__':run()
