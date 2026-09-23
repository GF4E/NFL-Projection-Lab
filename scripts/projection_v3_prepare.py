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
def _cutoff_context(at=None,fit_ref=None):
 from engine.projection.lineage import read_artifact
 from engine.forecast_system.calendar import schedule_kickoff,timestamp
 from datetime import timedelta
 old_rows,old_manifest,_=prepared.load(ROOT)
 ref=fit_ref or prepared.active_fit(ROOT);artifact=read_artifact(ROOT,ref);cutoff_pipeline.settings(artifact)
 manifest=json.loads((ROOT/'work/projection-v1/source-manifest.json').read_bytes())
 schedule_ref=cutoff_pipeline.capture_schedule(ROOT,manifest['schedule'])
 at=timestamp(at if at is not None else cutoff_pipeline.now())
 schedule=observations.read_source(ROOT,manifest['schedule'],'schedule')
 season=max(r['season'] for r in old_rows)
 completed=[int(g['week']) for g in schedule if int(g['season'])==season and g.get('game_type')=='REG'
            and all(g.get(k) not in ('',None) for k in ('home_score','away_score'))
            and schedule_kickoff(g['gameday'],g['gametime'])+timedelta(hours=4)<at]
 return dict(old_rows=old_rows,old_manifest=old_manifest,ref=ref,artifact=artifact,manifest=manifest,
             schedule_ref=schedule_ref,at=at,schedule=schedule,
             stadiums=json.loads((ROOT/'config/stadiums.json').read_bytes()),week=min(18,max(completed+[1])+1))


def _prepare_groups(groups,context,selection=None,stage=False):
 old_rows=context['old_rows'];old_manifest=context['old_manifest'];ref=context['ref']
 mapping=dict(old_manifest.get('cutoff_preparations',{}));replacements={};seen=set()
 for group in groups:
  game_ids=group['game_ids']
  if not game_ids or len(set(game_ids))!=len(game_ids) or seen.intersection(game_ids):raise ValueError('Explicit unique preparation games required')
  seen.update(game_ids)
  slate=[{**{k:g.get(k) for k in cutoff_pipeline.features.GAME_FIELDS},'source_hash':context['manifest']['schedule']['sha256']}
         for g in context['schedule'] if g['game_id'] in set(game_ids)]
  if len(slate)!=len(game_ids) or not set(game_ids)<={r['game_id'] for r in old_rows}:
   raise ValueError('Preparation population differs from retained schedule/board')
  body=cutoff_pipeline.from_recorded(ROOT,group['state_ref'],slate,context['stadiums'],at=context['at'],
                                   role=group['role'],schedule_ref=context['schedule_ref'],availability_ref=group.get('availability_ref'))
  previous={json.dumps(mapping[g],sort_keys=True) for g in game_ids if g in mapping}
  prior=cutoff_pipeline.load(ROOT,json.loads(next(iter(previous))),'preparations') if len(previous)==1 and all(g in mapping for g in game_ids) else None
  if prior and all(prior[k]==body[k] for k in ('state','role','render_inputs','schedule_evidence')) and old_manifest['fit']==ref:
   body=prior;body_ref=json.loads(next(iter(previous)))
  else:body_ref=cutoff_pipeline.store(ROOT,'preparations',body)
  replacements.update({r['row_id']:r for r in body['rows']});mapping.update({g:body_ref for g in game_ids})
 if not groups:
  if stage:raise ValueError('No upcoming games to stage for refit')
  return old_rows
 rows=[copy.deepcopy(replacements.get(r['row_id'],r)) for r in old_rows]
 raw=gzip.compress(prepared.raw(rows),mtime=0)
 meta={k:v for k,v in old_manifest.items() if k not in ('prepared_manifest_ref','features_ref')}
 meta.update(fit=ref,elo_hfa=context['artifact']['elo_hfa'],source_manifest=context['manifest'],sha256=hashlib.sha256(raw).hexdigest(),
             cutoff_mode='RECORDED_CUTOFF_V1',cutoff_preparations=mapping,publication_week=context['week'])
 if selection is not None:
  prior=meta.get('scheduled_selection')
  meta['scheduled_selection']=prior if prior and all(prior[k]==selection[k] for k in ('groups','games','closed_games')) else selection
 meta['signature']=hash_value({k:v for k,v in meta.items() if k!='signature'})
 if stage:return prepared.retain(ROOT,raw,meta)
 prepared.commit(ROOT,raw,meta)
 return rows


def _prepare_cutoff(state_ref,game_ids,role,at=None):
 if (prepared.current(ROOT) or {}).get('scheduled_selection'):
  raise ValueError('Scheduled preparation cannot fall back to manual state selection')
 return _prepare_groups([dict(state_ref=state_ref,game_ids=game_ids,role=role)],_cutoff_context(at))


def _prepare_scheduled(at=None,fit_ref=None,stage=False):
 from engine.projection.cutoff_selection import select
 context=_cutoff_context(at,fit_ref);ids={r['game_id'] for r in context['old_rows'] if int(r['week'])<=context['week']}
 ids={g for g in ids if not (ROOT/'outputs/projection-v3/locks'/f'{g}.json').exists()}
 games=[g for g in context['schedule'] if g['game_id'] in ids]
 if {g['game_id'] for g in games}!=ids:raise ValueError('Scheduled preparation population differs')
 selection=select(ROOT,games,context['at'])
 return _prepare_groups(selection['groups'],context,selection,stage=stage)


def stage_refit(shadow_ref,*,at):
 """Build a weight-only checkpoint; no active fit/preparation/release writes."""
 from engine.projection import refit_release, pipeline_release
 from engine.forecast_system.calendar import timestamp
 with prepared.writer(ROOT):
  pipeline_release.guard(ROOT)
  ref=refit_release.retain(ROOT,shadow_ref)
  artifact=refit_release.verify(ROOT,ref)
  if artifact['parent_fit_ref']!=prepared.active_fit(ROOT):
   raise ValueError('Staged refit parent is not active')
  if timestamp(artifact['issued_at'])>timestamp(at):
   raise ValueError('Staged refit unavailable at preparation')
  meta=_prepare_scheduled(at,fit_ref=ref,stage=True)
  selected=meta['scheduled_selection']['games']
  refs={meta['cutoff_preparations'][gid]['sha256']:meta['cutoff_preparations'][gid] for gid in selected}
  for preparation_ref in refs.values():
   cutoff_pipeline.recorded_scores(ROOT,preparation_ref,ref,purpose='ISSUER_PREPARATION')
  return pipeline_release.checkpoint(ROOT,label='RECORDED_WEIGHT_ONLY_STAGED',
                                     prepared_ref=meta['prepared_manifest_ref'])


def prepare(*,cutoff_state_ref=None,game_ids=None,role=None,at=None,select_scheduled=None):
 if select_scheduled and any(v is not None for v in (cutoff_state_ref,game_ids,role)):
  raise ValueError('Scheduled selection cannot accept hand-picked state or games')
 with prepared.writer(ROOT):
  from engine.projection.pipeline_release import guard
  release=guard(ROOT)
  if release:
   scheduled=release['mode']=='SCHEDULED'
   if any(v is not None for v in (cutoff_state_ref,game_ids,role)) or (select_scheduled is not None and select_scheduled!=scheduled):
    raise ValueError('Preparation request differs from active pipeline release')
   select_scheduled=scheduled
  if select_scheduled:return _prepare_scheduled(at)
  return _prepare_cutoff(cutoff_state_ref,game_ids,role,at) if cutoff_state_ref else _prepare()

if __name__=='__main__':print(json.dumps({'team_rows':len(prepare()),'credits_spent':0}))
