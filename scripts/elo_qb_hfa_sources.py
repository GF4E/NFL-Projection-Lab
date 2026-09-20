"""Public source capture for the explicitly registered QB/HFA reproductions."""
import datetime as dt,gzip,hashlib,json,time
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[1];O=ROOT/'work/e-elo-qb-hfa-v1';BASE='https://github.com/nflverse/nflverse-data/releases/download/'
def run():
 out=[];existing={r['url']:r for r in json.loads((O/'source-receipts.json').read_text())} if (O/'source-receipts.json').exists() else {}
 targets=[]
 for year in range(2014,2027):targets.append(('player_stats',year,f'player_stats/player_stats_{year}.csv' if year<=2024 else f'stats_player/stats_player_week_{year}.csv'))
 for kind in ['injuries','depth_charts']:
  for year in range(2016,2027):targets.append((kind,year,f'{kind}/{kind}_{year}.csv'))
 for kind,year,part in targets:
  url=BASE+part
  if url in existing and existing[url].get('path') and ((ROOT/existing[url]['path']).exists() or (ROOT/existing[url].get('compressed_path','__missing__')).exists()):out.append(existing[url]);continue
  try:
   res=requests.get(url,timeout=45);row={'kind':kind,'season':year,'url':url,'http_status':res.status_code,'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(),'etag':res.headers.get('ETag'),'last_modified':res.headers.get('Last-Modified')}
   if res.status_code==200:
    sha=hashlib.sha256(res.content).hexdigest();p=O/'raw'/f'{kind}-{year}-{sha}.csv';p.write_bytes(res.content);z=p.with_suffix('.csv.gz');z.write_bytes(gzip.compress(res.content,mtime=0));row.update(path=str(p.relative_to(ROOT)),sha256=sha,bytes=len(res.content),compressed_path=str(z.relative_to(ROOT)),compressed_sha256=hashlib.sha256(z.read_bytes()).hexdigest())
   else:row['qualification']='UNAVAILABLE_SOURCE_NOT_ZERO'
  except requests.RequestException as exc:row={'kind':kind,'season':year,'url':url,'error':str(exc),'qualification':'UNAVAILABLE_SOURCE_NOT_ZERO'}
  out.append(row);(O/'source-receipts.json').write_text(json.dumps(out,indent=2)+'\n');print(kind,year,row.get('http_status'),row.get('bytes'),flush=True)
 (O/'source-receipts.json').write_text(json.dumps(out,indent=2)+'\n')
if __name__=='__main__':run()
