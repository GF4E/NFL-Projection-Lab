"""Read-only evidence inventory and descriptive audit; never fits or publishes."""
import collections,csv,datetime as dt,hashlib,json,sys
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection_v3.personnel import select_chart
from scripts.benchmark_gap import margin_band
O=ROOT/'work/e-qb-change-review-v2'
def read(p):return json.loads((ROOT/p).read_text())
def write(n,x):(O/n).write_text(json.dumps(x,indent=2,default=str,allow_nan=False)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def instant(g):return dt.datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc)
def matrix(rows):
 return np.array([[(abs(r['home']-r['actual_home'])+abs(r['away']-r['actual_away']))/2,(r['home']-r['actual_home']+r['away']-r['actual_away'])/2,abs(r['home']-r['away']-r['actual_home']+r['actual_away']),r['home']-r['away']-r['actual_home']+r['actual_away']] for r in rows])
NAMES=['team_mae','team_bias','margin_mae','margin_bias']
def metrics(rows):return dict(games=len(rows),**dict(zip(NAMES,matrix(rows).mean(0).tolist() if rows else [None]*4)))
def compare(rows,stable):
 z=metrics(rows);b=metrics(stable);z['stable_baseline']=b
 if not rows or not stable:return z
 a=matrix(rows);b=matrix(stable);rng=np.random.default_rng(20260919);d=np.array([a[rng.integers(len(a),size=len(a))].mean(0)-b[rng.integers(len(b),size=len(b))].mean(0) for _ in range(2000)])
 z['difference_from_stable']=dict(zip(NAMES,(a.mean(0)-b.mean(0)).tolist()));z['difference_percentile95']=dict(zip(NAMES,np.quantile(d,[.025,.975],axis=0).T.tolist()));return z

def run():
 reg=read('work/e-qb-change/registration.json');control=read(reg['control']);assert sha(ROOT/reg['control'])==reg['files'][reg['control']]
 sp=next(p for p in reg['files'] if 'schedules-' in p);schedule=list(csv.DictReader((ROOT/sp).open()));sch={g['game_id']:g for g in schedule}
 pref=read('work/projection-v3/personnel-ref.json');p=read(pref['path']);assert sha(ROOT/pref['path'])==pref['sha256']
 ann=read('work/e-qb-change-review-v2/primary-metadata.json')
 ann+=read('work/e-qb-change-review-v2/independent/primary-announcements.json')
 accepted={};rejected=[]
 for r in ann:
  gid=r['game_id'];cut=instant(sch[gid])-dt.timedelta(minutes=75)
  meta=r.get('structured_metadata',[]);meta=next((m for m in meta if m.get('datePublished')),None)
  if meta:
   published=dt.datetime.fromisoformat(meta['datePublished'].replace('Z','+00:00'));modified=dt.datetime.fromisoformat((meta.get('dateModified') or meta['datePublished']).replace('Z','+00:00'))
   if max(published,modified)>=cut:
    rejected.append(dict(r,rejection='PUBLISHED_OR_CURRENT_REVISION_AFTER_T75'));continue
   r=dict(r,latest_publication_bound_utc=max(published,modified).isoformat(),first_supported_announcement_time=max(published,modified).isoformat(),knowledge='ESTABLISHED_BEFORE_T75',timestamp_strength='PUBLISH_AND_MODIFIED_METADATA_BEFORE_T75')
  elif r.get('latest_publication_bound_utc'):
   r=dict(r,timestamp_strength='DATE_BOUND_ONLY')
  else:
   rejected.append(dict(r,rejection='UNQUALIFIED_TIMESTAMP'));continue
  sg=sch[gid];side='home' if sg['home_team']==r['team'] else 'away';name=sg[side+'_qb_name']
  if r.get('qb_name') and r['qb_name'].replace(' ','').lower()!=name.replace(' ','').lower():
   rejected.append(dict(r,rejection='ANNOUNCED_IDENTITY_DISAGREES_WITH_SCHEDULE_QB',schedule_qb=name));continue
  accepted[(gid,r['team'])]=r
 ann=accepted;write('announcement-qualification.json',{'accepted':list(accepted.values()),'unaccepted':rejected})
 previous={};history=collections.defaultdict(list);flags={};details={}
 for g in sorted((g for g in schedule if g['game_type']=='REG' and g['home_score'] and g['away_score']),key=lambda g:(g['gameday'],g['gametime'],g['game_id'])):
  ds={};fs={}
  for s in ['home','away']:
   t=g[s+'_team'];q=g[s+'_qb_id'];last=previous.get(t);fs[s]=None if not q or not last or not last[0] else last[0]!=q
   ds[s]={'previous_qb_id':last[0] if last else None,'previous_qb_name':last[1] if last else None,'actual_schedule_qb_id':q or None,'actual_schedule_qb_name':g[s+'_qb_name'],'observed_history':'PRIOR_SAME_SEASON_START' if any(a==int(g['season']) and b==q for a,b in history[t]) else 'PRIOR_EARLIER_SEASON_START' if any(b==q for a,b in history[t]) else 'NO_PRIOR_TEAM_START'}
   previous[t]=(q,g[s+'_qb_name']);history[t].append((int(g['season']),q))
  flags[g['game_id']]=fs;details[g['game_id']]=ds
 sources=[];inj=collections.defaultdict(list)
 for source in p['sources']:
  f=ROOT/source['path'];rec=dict(source,exists=f.exists())
  if source['kind'] in ['depth_charts','injuries'] and f.exists():
   assert sha(f)==source['sha256'];frame=pd.read_parquet(f);rec.update(rows=len(frame),columns=list(frame.columns))
   rec['season_counts']={str(k):int(v) for k,v in frame.groupby('season').size().items()} if 'season' in frame else {}
   if source['kind']=='injuries':
    for r in frame[frame.position=='QB'].to_dict('records'):
     at=r.get('date_modified');at=pd.Timestamp(at).isoformat() if pd.notna(at) else None
     inj[(int(r['season']),int(r['week']),r['team'])].append({'qb_id':r.get('gsis_id'),'name':r.get('full_name'),'report_status':r.get('report_status') if pd.notna(r.get('report_status')) else None,'date_modified':at,'source_sha256':source['sha256']})
   rec['qualification']='LOAD_TIME_LISTED_IDENTITY_NOT_ANNOUNCEMENT' if source['kind']=='depth_charts' and 'dt' in frame else 'WEEKLY_PROXY_NO_PUBLICATION_TIME' if source['kind']=='depth_charts' else 'MODIFICATION_TIME_INJURY_STATUS_NOT_REPLACEMENT_IDENTITY'
  else:rec['qualification']='REVISED_HISTORICAL_PLAY_OUTCOMES_NOT_CONTEMPORANEOUS_EPA_VINTAGE'
  sources.append(rec)
 write('source-inventory.json',sources)
 # Full local artifact filename census. Exclude Git metadata, raw binary stores; never invent historical locks.
 paths=[]
 for folder in ['outputs','work']:
  for f in (ROOT/folder).rglob('*'):
   if f.is_file() and any(k in str(f.relative_to(ROOT)).lower() for k in ['lock','forecast','inactive','receipt','personnel','injur','depth_chart']):
    paths.append({'path':str(f.relative_to(ROOT)),'bytes':f.stat().st_size})
 write('artifact-census.json',paths)
 games=[];sides=[]
 for g in control:
  gid=g['game_id'];sg=sch[gid];cut=instant(sg)-dt.timedelta(minutes=75);f=flags[gid];group='CHANGED' if True in f.values() else 'STABLE' if all(x is False for x in f.values()) else 'UNKNOWN'
  row={**g,'starter_group':group,'T75_utc':cut.isoformat(),'week_band':'1–5' if g['week']<=5 else '6+','favorite_band':margin_band(g['home']-g['away']),'roof':'DOME' if sg['roof'] in ['dome','closed'] else 'OUTDOOR' if sg['roof'] in ['open','outdoors'] else 'UNKNOWN','season_opener':g['week']==1,'changed_teams':[]}
  for s in ['home','away']:
   if f[s] is not True:continue
   t=sg[s+'_team'];d=details[gid][s];ct={'LA':'LAR','LV':'OAK','WAS':'WSH'}.get(t,t);ch,status=select_chart(p['charts'],ct,'QB',g['season'],g['week'],cut);a=ann.get((gid,t))
   if a:assert dt.datetime.fromisoformat(a['latest_publication_bound_utc'])<cut
   z=dict(game_id=gid,season=g['season'],week=g['week'],team=t,side=s,T75_utc=cut.isoformat(),**d,knowledge=a['knowledge'] if a else 'INSUFFICIENT_EVIDENCE',announcement=a,first_supported_announcement_time=a.get('first_supported_announcement_time') if a else None,announcement_time_note='Earliest located publication date; exact first announcement not established',role=a['role'] if a else 'UNRESOLVED',as_issued_engine_qb=None,as_issued_status='NOT_RECORDED_IN_HISTORICAL_CONTROL',chart_status=status,chart=ch,listed_qb_matches_schedule=(ch['id']==d['actual_schedule_qb_id']) if ch else None,reconstructed_chart_selector_qb=ch['id'] if ch else None,reconstruction_status='CHART_SELECTOR_ONLY_NOT_ACTUAL_LOCK',injury_records=inj[(g['season'],g['week'],t)],qualified_quality_gap=None,quality_status='UNRESOLVED_CONTEMPORANEOUS_VALUE_VINTAGE',public_search_status='PRIMARY_SOURCE_ACCEPTED' if a else 'LOCAL_SOURCES_REVIEWED_PRIMARY_SEARCH_INCOMPLETE',disputed=gid=='2025_18_NYJ_BUF')
   # Observed prior outcomes only: values cannot be represented as historical issued EPA.
   values={}
   for name,q in [('previous',d['previous_qb_id']),('incoming',d['actual_schedule_qb_id'])]:
    n=0;v=0.;latest=None
    for pg in p['games']:
     if not g['season']-2<=pg['season']<=g['season'] or pg['game_id'] not in sch:continue
     end=instant(sch[pg['game_id']])+dt.timedelta(hours=4)
     if end>=cut:continue
     for team in pg['teams'].values():
      stat=team.get('qbs',{}).get(q)
      if stat:n+=stat['epa_n'];v+=stat['epa_sum'];latest=max(latest or end,end)
    values[name]={'epa_per_dropback':v/n if n else None,'dropbacks':n,'latest_included_completion_proxy':latest.isoformat() if latest else None,'qualification':'RECONSTRUCTED_REVISED_PBP_NOT_QUALIFIED_PREGAME'}
   z['reconstructed_quality']=values;sides.append(z);row['changed_teams'].append(z)
  games.append(row)
 write('game-ledger.json',games);write('changed-team-ledger.json',sides)
 stable=[g for g in games if g['starter_group']=='STABLE'];changed=[g for g in games if g['starter_group']=='CHANGED']
 result={'groups':{k:metrics([g for g in games if g['starter_group']==k]) for k in ['CHANGED','STABLE','UNKNOWN']},'changed_vs_stable':compare(changed,stable),'seasons':{},'coverage':{},'cells':{},'leave_one_season_out':{},'disputed_exclusion':compare([g for g in changed if g['game_id']!='2025_18_NYJ_BUF'],stable)}
 for y in range(2016,2026):
  c=[g for g in changed if g['season']==y];b=[g for g in stable if g['season']==y];ss=[z for z in sides if z['season']==y]
  result['seasons'][str(y)]=compare(c,b);result['leave_one_season_out'][str(y)]=compare([g for g in changed if g['season']!=y],[g for g in stable if g['season']!=y]);result['coverage'][str(y)]={'changed_games':len(c),'changed_team_sides':len(ss),'chart_available':sum(z['chart'] is not None for z in ss),'knowledge_counts':dict(collections.Counter(z['knowledge'] for z in ss)),'qualified_quality_values':0,'as_issued_locks':0}
 for dimension in ['week_band','favorite_band','roof','season_opener']:
  result['cells'][dimension]={str(v):compare([g for g in changed if g[dimension]==v],[g for g in stable if g[dimension]==v]) for v in sorted({g[dimension] for g in games})}
 for dimension in ['knowledge','role','observed_history']:
  result['cells'][dimension]={v:compare([g for g in changed if any(z[dimension]==v for z in g['changed_teams'])],stable) for v in sorted({z[dimension] for z in sides})}
 qualified=[g for g in changed if any(z['announcement'] for z in g['changed_teams'])]
 result['availability_sensitivity']={'qualified_any_side':compare(qualified,stable),'unqualified_all_sides':compare([g for g in changed if g not in qualified],stable),'strict_exact_timestamp_announcement_games':len([g for g in qualified if any(z['announcement'] and z['announcement'].get('timestamp_strength')=='PUBLISH_AND_MODIFIED_METADATA_BEFORE_T75' for z in g['changed_teams'])]),'strongest_provenance':compare([g for g in qualified if any(z['announcement'] and z['announcement'].get('timestamp_strength')=='PUBLISH_AND_MODIFIED_METADATA_BEFORE_T75' for z in g['changed_teams'])],stable),'date_bound_reclassification':'Date-only announcements revert to insufficient; metadata-qualified records retained, metadata is not immutable revision archive.'}
 result['diagnosis']='UNRESOLVED';result['remaining_primary_search_team_sides']=sum(z['public_search_status'].endswith('INCOMPLETE') for z in sides)
 write('results.json',result)
 write('manifest.json',{'plan':read('work/e-qb-change-review-v2/plan-receipt.json'),'control':reg['control'],'control_sha256':sha(ROOT/reg['control']),'personnel_sha256':pref['sha256'],'schedule_sha256':sha(ROOT/sp),'files':{str(f.relative_to(ROOT)):sha(f) for f in O.glob('*.json') if f.name!='manifest.json'}})
 print(json.dumps({'groups':result['groups'],'coverage':result['coverage'],'remaining_primary_search_team_sides':result['remaining_primary_search_team_sides']},indent=2))
if __name__=='__main__':run()
