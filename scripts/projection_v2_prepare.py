"""Prepare current football features for the frozen v2 fit, without provider calls."""
import gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection.features import build
from engine.projection.model import hash_value
from engine.projection_v2.qualify import read
from scripts.projection_publish import save

def prepare():
 work=ROOT/'work/projection-v2';ref=json.loads((work/'fit-ref.json').read_text());a=read(ref);m=json.loads((ROOT/'work/projection-v1/source-manifest.json').read_text());d=a['selected'][0];stadiums=json.loads((ROOT/'config/stadiums.json').read_text());signature=hash_value({'fit':ref,'sources':m,'stadiums':stadiums,'feature_code':hashlib.sha256((ROOT/'engine/projection/features.py').read_bytes()).hexdigest()});p=work/'current-features.json.gz';rp=work/'current-ref.json';cached=json.loads(rp.read_text()) if rp.exists() else {}
 if p.exists() and cached.get('signature')==signature and cached.get('sha256')==hashlib.sha256(p.read_bytes()).hexdigest():return json.loads(gzip.decompress(p.read_bytes()))
 rows=build(read(m['team_games']),read(m['schedule']),stadiums,None if d=='none' else int(d),m['roster_source_hashes']);future=[r for r in rows if r['season']==2026];raw=gzip.compress(json.dumps(future,sort_keys=True,separators=(',',':')).encode(),mtime=0);p.write_bytes(raw);save(rp,{'signature':signature,'sha256':hashlib.sha256(raw).hexdigest(),'source_manifest':m,'fit':ref});return future
if __name__=='__main__':print(json.dumps({'team_rows':len(prepare()),'credits_spent':0}))
