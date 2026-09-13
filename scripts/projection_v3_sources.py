"""Sanitize pinned player/pressure evidence; never use current-game identities as pregame inputs."""
import collections,datetime,hashlib,json,sys
from pathlib import Path
import pandas as pd
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts.projection_prepare import canonical,clean
from engine.projection_v3.qualify import save
COLS='game_id season season_type week game_date play_id posteam defteam home_team away_team play_type qtr wp qb_dropback qb_scramble qb_spike qb_kneel passer_player_id rusher_player_id epa cpoe qb_hit sack kicker_player_id field_goal_result extra_point_result kick_distance'.split()

def aggregate(frame,source):
 p=frame.copy()
 for c in COLS:
  if c not in p:p[c]=None
 for c in ['posteam','defteam','home_team','away_team']:p[c]=p[c].map(canonical)
 p=p[p.season_type.isin(['REG','POST']) & p.play_type.ne('no_play')];games=[];overlap={'dropbacks':0,'hit_and_sack':0,'missing_hit':0,'missing_sack':0}
 for gid,g in p.groupby('game_id',sort=True):
  head=g.iloc[0];record={'game_id':gid,'season':int(head.season),'week':int(head.week),'date':str(head.game_date),'type':head.season_type,'source_hash':source,'teams':{}}
  for team in [head.home_team,head.away_team]:
   z=g[g.posteam.eq(team)];db=z[z.qb_dropback.eq(1)].copy();db['qb_id']=db.passer_player_id.where(~db.qb_scramble.eq(1),db.rusher_player_id);db['qb_id']=db.qb_id.where(db.qb_id.notna(),db.rusher_player_id.where(db.qb_scramble.eq(1)))
   ids=db.dropna(subset=['qb_id']);counts=ids.qb_id.value_counts().to_dict();lead=sorted(counts,key=lambda q:(-counts[q],q))[0] if counts else None
   perf=db[~(db.qtr.eq(4)&(db.wp.lt(.05)|db.wp.gt(.95))) & db.qb_kneel.ne(1)&db.qb_spike.ne(1)]
   qbs={}
   for q,v in perf.dropna(subset=['qb_id']).groupby('qb_id'):
    qbs[q]={'epa_sum':float(v.epa.sum()),'epa_n':int(v.epa.notna().sum()),'cpoe_sum':float(v.cpoe.sum()),'cpoe_n':int(v.cpoe.notna().sum())}
   kicks=z[z.kicker_player_id.notna()];fg=kicks[kicks.field_goal_result.isin(['made','missed','blocked'])];xp=kicks[kicks.extra_point_result.notna()];ks={}
   for k in sorted(set(fg.kicker_player_id)|set(xp.kicker_player_id)):
    a=fg[fg.kicker_player_id.eq(k)];item={'fg_n':len(a),'xp_n':int(xp.kicker_player_id.eq(k).sum())}
    for lo,hi,band in [(0,39,'short'),(40,49,'medium'),(50,1000,'long')]:
     b=a[a.kick_distance.between(lo,hi)];item[band]=[int(b.field_goal_result.eq('made').sum()),len(b)]
    ks[k]=item
   kicker=sorted(ks,key=lambda k:(-ks[k]['fg_n'],-ks[k]['xp_n'],k))[0] if ks else None
   complete=len(perf)>0 and perf.qb_hit.notna().all() and perf.sack.notna().all()
   pressure={'n':len(perf),'sum':float(perf.qb_hit.sum()+perf.sack.sum()) if complete else None}
   overlap['dropbacks']+=len(perf);overlap['hit_and_sack']+=int((perf.qb_hit.eq(1)&perf.sack.eq(1)).sum());overlap['missing_hit']+=int(perf.qb_hit.isna().sum());overlap['missing_sack']+=int(perf.sack.isna().sum())
   record['teams'][team]={'qb':lead,'qb_counts':counts,'first_qb':ids.sort_values('play_id').qb_id.iloc[0] if len(ids) else None,'qbs':qbs,'kicker':kicker,'kickers':ks,'pressure_allowed':pressure}
  keys=list(record['teams'])
  for t in keys:record['teams'][t]['pressure_generated']=record['teams'][next(x for x in keys if x!=t)]['pressure_allowed']
  games.append(record)
 return games,overlap

def run():
 manifest=json.loads((ROOT/'work/projection-v3/raw-manifest.json').read_text());games=[];charts=[];audit=[];injury=[]
 for r in manifest:
  if r.get('status'):audit.append(r);continue
  path=ROOT/r['path'];h=hashlib.sha256(path.read_bytes()).hexdigest()
  if h!=r['sha256']:raise ValueError('Source hash mismatch')
  year=int(r['name'].split('_')[-1].split('.')[0]);schema=pq.ParquetFile(path).schema.names
  if r['kind']=='pbp':
   p=pq.read_table(path,columns=[c for c in COLS if c in schema]).to_pandas();a,b=aggregate(p,h);games.extend(a);audit.append({'season':year,'kind':'pbp','games':len(a),'source_hash':h,**b});print('sanitized',year,len(a),flush=True)
  elif r['kind']=='depth_charts':
   p=pd.read_parquet(path)
   if 'dt' in p:
    p=p[p.pos_abb.isin(['QB','K','PK']) & p.pos_rank.eq(1)]
    for x in p.to_dict('records'):
     charts.append({'season':year,'team':canonical(x['team']),'position':'QB' if x['pos_abb']=='QB' else 'K','id':x['gsis_id'],'at':x['dt'],'week':None,'source_hash':h,'received_at':r.get('received_at'),'status':'TIMESTAMPED_CHART'})
   elif 'week' in p:
    audit.append({'kind':'depth_schema','season':year,'columns':schema})
    pos='position' if 'position' in p else 'depth_position';rank='depth_team'
    p=p[p.week.notna() & p.game_type.eq('REG') & p[pos].isin(['QB','K','PK']) & pd.to_numeric(p[rank],errors='coerce').eq(1)]
    for x in p.to_dict('records'):
     charts.append({'season':year,'team':canonical(x['club_code']),'position':'QB' if x[pos]=='QB' else 'K','id':x['gsis_id'],'at':None,'week':int(x['week']),'source_hash':h,'received_at':r.get('received_at'),'status':'WEEKLY_PROXY_ISSUANCE_UNVERIFIED'})
  else:
   p=pd.read_parquet(path);injury.append({'season':year,'rows':len(p),'columns':schema,'source_hash':h,'explicit_starter_field':False,'decision':'Injury status does not identify replacement starter; no fabricated override'})
 data={'games':sorted(games,key=lambda x:(x['date'],x['game_id'])),'charts':clean(charts),'audit':audit,'injuries':injury,'sources':manifest,'history_start':1999,'code_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
 ref=save('personnel',clean(data));(ROOT/'work/projection-v3/personnel-ref.json').write_text(json.dumps(ref,indent=2)+'\n');print(json.dumps(ref));return data
if __name__=='__main__':run()
