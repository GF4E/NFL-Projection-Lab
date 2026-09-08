"""Free nflverse release capture. Hash/version every file; no Odds API."""
import concurrent.futures,datetime as dt,hashlib,json,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/harvest-elo-v2/sources'
def capture(asset):
    label=asset['name']
    prior=list(OUT.glob(label.removesuffix('.parquet')+'-*.parquet'))
    if len(prior)>1:raise ValueError('Ambiguous source versions; choose a manifest')
    if prior:raw=prior[0].read_bytes()
    else:raw=urllib.request.urlopen(asset['browser_download_url'],timeout=60).read()
    sha=hashlib.sha256(raw).hexdigest()
    if len(raw)!=asset['size']:raise ValueError('Release size mismatch')
    if asset.get('digest') and asset['digest']!='sha256:'+sha:raise ValueError('Release hash mismatch')
    path=OUT/(label.removesuffix('.parquet')+'-'+sha+'.parquet')
    if not path.exists():path.write_bytes(raw)
    print(label+' pinned '+sha,flush=True)
    return {'path':str(path.relative_to(ROOT)),'sha256':sha,'bytes':len(raw),'url':asset['browser_download_url'],'asset_id':asset['id'],'asset_updated_at':asset['updated_at']}
if __name__=='__main__':
    assets=json.loads((OUT/'pbp-release.json').read_text())['assets']
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:records=list(pool.map(capture,assets))
    data=(json.dumps({'records':records},indent=2,sort_keys=True)+'\n').encode();p=OUT/'manifest.json'
    if p.exists() and p.read_bytes()!=data:raise ValueError('Immutable manifest differs')
    if not p.exists():p.write_bytes(data)
