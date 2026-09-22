"""Rebuild current features with a frozen v3 fit; refresh only already-pinned public sources."""
import copy,gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection.features import build
from engine.projection.model import hash_value
from engine.projection_v3.qualify import read,save
from engine.projection_v3.personnel import enrich
from scripts.projection_publish import save as write
from engine.projection import prepared, observations, cutoff_pipeline

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

def _prepare():
 if (prepared.current(ROOT) or {}).get('cutoff_mode'):
  raise ValueError('Cutoff preparation requires explicit scheduled state selection; no legacy fallback')
 work=ROOT/'work/projection-v3';active=ROOT/'work/in-season-learning-v1/active-fit-ref.json';ref=json.loads((active if active.exists() else work/'fit-ref.json').read_text());a=read(ref);m=json.loads((ROOT/'work/projection-v1/source-manifest.json').read_text());d=a['selected'][0];stadiums=json.loads((ROOT/'config/stadiums.json').read_text());current=json.loads((ROOT/'outputs/iron-man-v1/source-manifest.json').read_text());signature=hash_value({'fit':ref,'sources':m,'personnel_sources':current,'stadiums':stadiums,'feature_code':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'engine/projection/features.py',ROOT/'engine/projection_v3/personnel.py',Path(__file__),ROOT/'scripts/projection_v3_sources.py']}});p=work/'current-features.json.gz';rp=work/'current-ref.json';cached=json.loads(rp.read_text()) if rp.exists() else {}
 observation_ref=observations.capture(ROOT,m)
 if cached.get('signature')==signature:
  rows,manifest,raw=prepared.load(ROOT,manifest=cached)
  if manifest.get('fit')!=ref:raise ValueError('Cached preparation fit differs')
  manifest={**manifest,'observation_snapshot_ref':observation_ref}
  prepared.commit(ROOT,raw,manifest)
  return rows
 rows=build(read(m['team_games']),read(m['schedule']),stadiums,None if d=='none' else int(d),m['roster_source_hashes'],elo_hfa=a.get('elo_hfa'));future=enrich([r for r in rows if r['season']==2026],current_personnel(a),None if d=='none' else int(d));raw=gzip.compress(json.dumps(future,sort_keys=True,separators=(',',':'),allow_nan=False).encode(),mtime=0);prepared.commit(ROOT,raw,{'observation_snapshot_ref':observation_ref,'elo_hfa':a.get('elo_hfa'),'signature':signature,'sha256':hashlib.sha256(raw).hexdigest(),'source_manifest':m,'fit':ref,'personnel_source_hashes':[{k:r.get(k) for k in ['name','sha256','received_at','refresh_error']} for r in current if r['name'] in ['play_by_play_2026.parquet','depth_charts_2026.parquet']]});return future
def _prepare_cutoff(state_ref,game_ids,role,at=None):
 """Existing writer, explicit candidate state; automatic selection is separate."""
 from engine.projection.lineage import read_artifact
 from engine.forecast_system.calendar import schedule_kickoff,timestamp
 from datetime import timedelta
 if not game_ids or len(set(game_ids))!=len(game_ids):raise ValueError('Explicit unique preparation games required')
 old_rows,old_manifest,_=prepared.load(ROOT)
 ref=prepared.active_fit(ROOT);artifact=read_artifact(ROOT,ref)
 cutoff_pipeline.settings(artifact)
 manifest=json.loads((ROOT/'work/projection-v1/source-manifest.json').read_bytes())
 schedule_ref=cutoff_pipeline.capture_schedule(ROOT,manifest['schedule'])
 at=timestamp(at if at is not None else cutoff_pipeline.now())
 schedule=observations.read_source(ROOT,manifest['schedule'],'schedule')
 slate=[{**{k:g.get(k) for k in cutoff_pipeline.features.GAME_FIELDS},'source_hash':manifest['schedule']['sha256']}
        for g in schedule if g['game_id'] in set(game_ids)]
 if len(slate)!=len(game_ids) or not set(game_ids)<={r['game_id'] for r in old_rows}:
  raise ValueError('Preparation population differs from retained schedule/board')
 stadiums=json.loads((ROOT/'config/stadiums.json').read_bytes())
 body=cutoff_pipeline.from_recorded(ROOT,state_ref,slate,stadiums,at=at,role=role,schedule_ref=schedule_ref)
 # Reuse an unchanged immutable preparation; never refresh its provenance clock.
 mapping=dict(old_manifest.get('cutoff_preparations',{}));previous={json.dumps(mapping[g],sort_keys=True) for g in game_ids if g in mapping}
 prior=cutoff_pipeline.load(ROOT,json.loads(next(iter(previous))),'preparations') if len(previous)==1 and all(g in mapping for g in game_ids) else None
 if prior and all(prior[k]==body[k] for k in ('state','role','render_inputs','schedule_evidence')) and old_manifest['fit']==ref:
  body=prior;body_ref=json.loads(next(iter(previous)))
 else:body_ref=cutoff_pipeline.store(ROOT,'preparations',body)
 replacements={r['row_id']:r for r in body['rows']}
 rows=[copy.deepcopy(replacements.get(r['row_id'],r)) for r in old_rows]
 mapping.update({g:body_ref for g in game_ids})
 raw=gzip.compress(prepared.raw(rows),mtime=0)
 completed=[int(g['week']) for g in schedule if int(g['season'])==int(slate[0]['season']) and g.get('game_type')=='REG'
            and all(g.get(k) not in ('',None) for k in ('home_score','away_score'))
            and schedule_kickoff(g['gameday'],g['gametime'])+timedelta(hours=4)<at]
 meta={k:v for k,v in old_manifest.items() if k not in ('prepared_manifest_ref','features_ref')}
 meta.update(fit=ref,elo_hfa=artifact['elo_hfa'],source_manifest=manifest,sha256=hashlib.sha256(raw).hexdigest(),
             cutoff_mode='RECORDED_CUTOFF_V1',cutoff_preparations=mapping,publication_week=min(18,max(completed+[1])+1))
 meta['signature']=hash_value({k:v for k,v in meta.items() if k!='signature'})
 prepared.commit(ROOT,raw,meta)
 return rows


def prepare(*,cutoff_state_ref=None,game_ids=None,role=None,at=None):
 with prepared.writer(ROOT):
  return _prepare_cutoff(cutoff_state_ref,game_ids,role,at) if cutoff_state_ref else _prepare()

if __name__=='__main__':print(json.dumps({'team_rows':len(prepare()),'credits_spent':0}))
