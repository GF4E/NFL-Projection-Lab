"""Rebuild current features with a frozen v3 fit; refresh only already-pinned public sources."""
import copy,gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection.features import build
from engine.projection.model import hash_value
from engine.projection_v3.qualify import read,save
from engine.projection_v3.personnel import enrich
from scripts.projection_publish import save as write

def current_personnel(artifact):
 import pandas as pd
 import pyarrow.parquet as pq
 from scripts.projection_v3_sources import aggregate,COLS
 from scripts.projection_prepare import canonical,clean
 data=read(artifact['source_manifest']['personnel']);current=json.loads((ROOT/'outputs/iron-man-v1/source-manifest.json').read_text());known={r['name']:r for r in data['sources']}
 for source in current:
  name=source['name']
  if name not in ['play_by_play_2026.parquet','depth_charts_2026.parquet']:continue
  if known.get(name,{}).get('sha256')==source['sha256']:continue
  path=ROOT/source['path']
  if hashlib.sha256(path.read_bytes()).hexdigest()!=source['sha256']:raise ValueError('Current personnel source hash mismatch')
  if name.startswith('play_by_play'):
   schema=pq.ParquetFile(path).schema.names;rows,audit=aggregate(pq.read_table(path,columns=[c for c in COLS if c in schema]).to_pandas(),source['sha256']);data['games']=[g for g in data['games'] if g['season']!=2026]+rows
  else:
   p=pd.read_parquet(path);p=p[p.pos_abb.isin(['QB','K','PK']) & p.pos_rank.eq(1)];charts=[]
   for x in p.to_dict('records'):charts.append({'season':2026,'team':canonical(x['team']),'position':'QB' if x['pos_abb']=='QB' else 'K','id':x['gsis_id'],'at':x['dt'],'week':None,'source_hash':source['sha256'],'received_at':source.get('received_at'),'status':'TIMESTAMPED_CHART'})
   data['charts']=[c for c in data['charts'] if c['season']!=2026]+clean(charts)
  data['sources']=[r for r in data['sources'] if r['name']!=name]+[source]
 data['games'].sort(key=lambda g:(g['date'],g['game_id']));return data

def prepare():
 work=ROOT/'work/projection-v3';active=ROOT/'work/in-season-learning-v1/active-fit-ref.json';ref=json.loads((active if active.exists() else work/'fit-ref.json').read_text());a=read(ref);m=json.loads((ROOT/'work/projection-v1/source-manifest.json').read_text());d=a['selected'][0];stadiums=json.loads((ROOT/'config/stadiums.json').read_text());current=json.loads((ROOT/'outputs/iron-man-v1/source-manifest.json').read_text());signature=hash_value({'fit':ref,'sources':m,'personnel_sources':current,'stadiums':stadiums,'feature_code':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'engine/projection/features.py',ROOT/'engine/projection_v3/personnel.py',Path(__file__),ROOT/'scripts/projection_v3_sources.py']}});p=work/'current-features.json.gz';rp=work/'current-ref.json';cached=json.loads(rp.read_text()) if rp.exists() else {}
 if p.exists() and cached.get('signature')==signature and cached.get('sha256')==hashlib.sha256(p.read_bytes()).hexdigest():return json.loads(gzip.decompress(p.read_bytes()))
 rows=build(read(m['team_games']),read(m['schedule']),stadiums,None if d=='none' else int(d),m['roster_source_hashes'],elo_hfa=a.get('elo_hfa'));future=enrich([r for r in rows if r['season']==2026],current_personnel(a),None if d=='none' else int(d));raw=gzip.compress(json.dumps(future,sort_keys=True,separators=(',',':'),allow_nan=False).encode(),mtime=0);p.write_bytes(raw);write(rp,{'elo_hfa':a.get('elo_hfa'),'signature':signature,'sha256':hashlib.sha256(raw).hexdigest(),'source_manifest':m,'fit':ref,'personnel_source_hashes':[{k:r.get(k) for k in ['name','sha256','received_at','refresh_error']} for r in current if r['name'] in ['play_by_play_2026.parquet','depth_charts_2026.parquet']]});return future
if __name__=='__main__':print(json.dumps({'team_rows':len(prepare()),'credits_spent':0}))
