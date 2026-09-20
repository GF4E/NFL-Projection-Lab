"""Validate the user-qualified pregame identity rule without current-game labels."""
import collections,csv,datetime as dt,hashlib,json,sys
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));O=ROOT/'work/e-elo-qb-hfa-v1'
def team(t):return {'LA':'LAR','LV':'OAK','WAS':'WSH','STL':'LAR','SD':'LAC'}.get(t,t)
def kickoff(g):return dt.datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc)
def dump(name,obj):(O/name).write_text(json.dumps(obj,indent=2,allow_nan=False)+'\n')
def rank_select(ranks,excluded=()):
 a=[(rank,q) for q,rank in ranks.items() if q not in excluded]
 if not a:return None
 low=min(v[0] for v in a);ids=[q for v,q in a if v==low]
 return ids[0] if len(ids)==1 else None

def select_pregame(previous_two,week,ranks,excluded):
 if week==1:return rank_select(ranks,excluded),'WEEK1_CHART'
 if not previous_two:return None,'NO_PRIOR_GAME'
 v=previous_two[-1];best=max((q['attempts'] for q in v),default=0);leaders=[q['id'] for q in v if q['attempts']==best and best>0]
 if len(leaders)>1:
  sums={q:sum(a['attempts'] for game in previous_two[-2:] for a in game if a['id']==q) for q in leaders};leaders=[q for q in leaders if sums[q]==max(sums.values())]
 if len(leaders)>1:selected=rank_select({q:ranks[q] for q in leaders if q in ranks});reason='CHART_TIEBREAK'
 else:selected=leaders[0] if leaders else None;reason='PREVIOUS_GAME_ATTEMPTS'
 if selected in excluded:return rank_select(ranks,excluded),'INJURY_OVERRIDE_CHART'
 return selected,reason

def run():
 receipts=json.loads((O/'source-receipts.json').read_text());reg=json.loads((O/'E-ELO-QB.json').read_text());control=json.loads((ROOT/reg['control']).read_text());population={g['game_id'] for g in control}
 schedule=list(csv.DictReader((ROOT/'work/market-distribution-v1/schedules-d64cef660c4b14c74f0e33ecee387343675137ed2f1a1fac2b0c70951b8a4c07.csv').open()));sg=[g for g in schedule if g['game_type']=='REG' and g['home_score'] and g['away_score'] and 2014<=int(g['season'])<=2025];sg.sort(key=lambda g:(kickoff(g),g['game_id']));schedulekey={};games={g['game_id']:g for g in sg}
 for g in sg:
  for side in ['home','away']:schedulekey[int(g['season']),int(g['week']),team(g[side+'_team'])]=g
 stats=collections.defaultdict(list);charts=collections.defaultdict(list);injuries=collections.defaultdict(list);available_inj=set();inj_audit={};chart_audit={};source_schemas=[]
 for r in receipts:
  if r.get('http_status')!=200:continue
  d=pd.read_csv(ROOT/r.get('compressed_path',r['path']),low_memory=False);y=r['season'];kind=r['kind'];source_schemas.append({'season':y,'kind':kind,'rows':len(d),'columns':list(d.columns),'sha256':r['sha256']})
  if kind=='player_stats':
   d=d[(d.season_type=='REG')&(d.position=='QB')]
   for v in d.to_dict('records'):
    t=team(v.get('recent_team') or v.get('team'));key=(int(v['season']),int(v['week']),t);g=schedulekey.get(key)
    if g and pd.notna(v.get('attempts')):
     stats[g['game_id'],t].append({'id':v['player_id'],'name':v.get('player_display_name'),'attempts':float(v['attempts']),'passing_epa':float(v['passing_epa']) if pd.notna(v.get('passing_epa')) else None,'sacks':float(v.get('sacks',v.get('sacks_suffered',0))),'source_sha256':r['sha256']})
  elif kind=='depth_charts':
   if y<=2024:
    allkeys=set(zip(d.season,d.week,d.club_code));q=d[(d.depth_position=='QB')&d.gsis_id.notna()];qb1=set(zip(q[q.depth_team==1].season,q[q.depth_team==1].week,q[q.depth_team==1].club_code));chart_audit[str(y)]={'all_source_team_weeks':len(allkeys),'qb1_team_weeks':len(qb1)}
    for v in q.to_dict('records'):
     if pd.isna(v['week']) or pd.isna(v['depth_team']):continue
     charts[y,int(v['week']),team(v['club_code'])].append({'id':v['gsis_id'],'rank':float(v['depth_team']),'at':None,'source_sha256':r['sha256']})
   else:
    q=d[(d.pos_abb=='QB')&d.gsis_id.notna()]
    for v in q.to_dict('records'):
     charts[y,None,team(v['team'])].append({'id':v['gsis_id'],'rank':float(v['pos_rank']),'at':v['dt'],'source_sha256':r['sha256']})
  elif kind=='injuries':
   available_inj.add(y);a={'raw_rows':len(d),'regular_rows':int((d.game_type=='REG').sum()),'matched_to_regular_game':0,'unmatched':0,'after_kickoff':0,'at_or_after_T75':0,'qb_out_doubtful_after_kickoff':0,'qb_out_doubtful_at_or_after_T75':0,'late_rows':[]}
   for v in d[d.game_type=='REG'].to_dict('records'):
    t=team(v['team']);g=schedulekey.get((int(v['season']),int(v['week']),t))
    if not g:a['unmatched']+=1;continue
    a['matched_to_regular_game']+=1;when=pd.to_datetime(v.get('date_modified'),utc=True,errors='coerce');ko=kickoff(g);qb=v['position']=='QB' and v.get('report_status') in ['Out','Doubtful']
    if pd.notna(when):
     late=when>=ko-dt.timedelta(minutes=75);post=when>ko;a['after_kickoff']+=int(post);a['at_or_after_T75']+=int(late);a['qb_out_doubtful_after_kickoff']+=int(qb and post);a['qb_out_doubtful_at_or_after_T75']+=int(qb and late)
     if late:a['late_rows'].append({'game_id':g['game_id'],'qb_out_doubtful':qb,'id':v.get('gsis_id'),'date_modified':when.isoformat(),'kickoff_utc':ko.isoformat()})
    if v['position']=='QB':injuries[int(v['season']),int(v['week']),t].append({'id':v.get('gsis_id'),'status':v.get('report_status') if pd.notna(v.get('report_status')) else None,'at':when.isoformat() if pd.notna(when) else None,'source_sha256':r['sha256']})
   inj_audit[str(y)]=a
 dump('injury-timestamp-audit.json',inj_audit);dump('source-schema-audit.json',source_schemas);dump('chart-source-coverage.json',chart_audit)
 def getchart(y,w,t,cut):
  rows=charts.get((y,w,t),[]) if y<2025 else charts.get((y,None,t),[])
  if y>=2025:
   rows=[r for r in rows if dt.datetime.fromisoformat(r['at'].replace('Z','+00:00'))<cut]
   if rows:
    latest=max(r['at'] for r in rows);rows=[r for r in rows if r['at']==latest]
  ranks={}
  for r in rows:ranks[r['id']]=min(ranks.get(r['id'],float('inf')),r['rank'])
  return ranks
 rankselect=rank_select
 history=collections.defaultdict(list);qhistory=collections.defaultdict(list);rows=[]
 for g in sg:
  y,w=int(g['season']),int(g['week']);cut=kickoff(g)-dt.timedelta(minutes=75)
  for side in ['home','away']:
   t=team(g[side+'_team']);ranks=getchart(y,w,t,cut);chartqb=rankselect(ranks);qualified={}
   for v in injuries[y,w,t]:
    if v['at'] and dt.datetime.fromisoformat(v['at'])<cut and (v['id'] not in qualified or qualified[v['id']]['at']<v['at']):qualified[v['id']]=v
   excluded={q for q,v in qualified.items() if v['status'] in ['Out','Doubtful']};past=[v for v in history[t] if v['end']<cut and v['season']==y];prior=past[-1] if past else None
   selected,reason=select_pregame([v['stats'] for v in past[-2:]],w,ranks,excluded)
   if y not in available_inj:selected=None;reason='INJURY_SEASON_UNAVAILABLE'
   depthfirst=chartqb if chartqb not in excluded else None
   if depthfirst is None and prior:
    a=sorted(prior['stats'],key=lambda x:-x['attempts']);depthfirst=a[0]['id'] if a and a[0]['id'] not in excluded else rankselect(ranks,excluded)
   current=stats[g['game_id'],t];best=max((q['attempts'] for q in current),default=0);actuals=[q['id'] for q in current if q['attempts']==best and best>0];actual=actuals[0] if len(actuals)==1 else None
   quality=[v for v in qhistory[selected] if v['end']<cut] if selected else [];den=sum(v['attempts'] for v in quality if v['passing_epa'] is not None);epa=sum(v['passing_epa'] for v in quality if v['passing_epa'] is not None)/den if den else None
   rec={'game_id':g['game_id'],'team':t,'season':y,'week':w,'home':side=='home','T75_utc':cut.isoformat(),'selected_qb':selected,'reason':reason,'UNTIMESTAMPED':reason in ['CHART_TIEBREAK','INJURY_OVERRIDE_CHART','WEEK1_CHART'],'chart_qb':chartqb,'depth_first_qb':depthfirst,'actual_most_attempts_qb_ORACLE_ONLY':actual,'correct':selected==actual if selected and actual else None,'source_previous_game':prior['game_id'] if prior else None,'source_previous_completion':prior['end'].isoformat() if prior else None,'injury_exclusions':sorted(excluded),'injury_evidence':list(qualified.values()),'chart_ranks':ranks,'actual_points':float(g[side+'_score']),'prior_four_scoring':float(np.mean([v['points'] for v in past[-4:]])) if len(past)>=4 else None,'starter_prior_epa_per_attempt':epa,'prior_qb_attempts':den,'oracle_attempts':{v['id']:v['attempts'] for v in current},'authoritative_game':g['game_id'] in population}
   if y>=2016:rows.append(rec)
  # Outcomes become usable only after completion proxy; no same-game labels enter selector.
  for side in ['home','away']:
   t=team(g[side+'_team']);end=kickoff(g)+dt.timedelta(hours=4);v=stats[g['game_id'],t];history[t].append({'game_id':g['game_id'],'season':y,'end':end,'stats':v,'points':float(g[side+'_score'])})
   for q in v:qhistory[q['id']].append(dict(q,end=end))
 def acc(a):
  out={'team_games':len(a),'unique_games':len({r['game_id'] for r in a})}
  for k in ['selected_qb','chart_qb','depth_first_qb']:out[k]=sum(r[k]==r['actual_most_attempts_qb_ORACLE_ONLY'] for r in a)/len(a) if a else None
  return out
 targetyears=[2016,2019,2022,2024];complete=[r for r in rows if r['season'] in targetyears and r['week']!=1 and r['actual_most_attempts_qb_ORACLE_ONLY'] and all(r[k] for k in ['selected_qb','chart_qb','depth_first_qb'])]
 full=[r for r in rows if r['season'] in targetyears and r['actual_most_attempts_qb_ORACLE_ONLY'] and all(r[k] for k in ['selected_qb','chart_qb','depth_first_qb'])]
 report={'target_percent':{'selected_qb':89.4,'chart_qb':85.6,'depth_first_qb':89.1},'reported_team_games':1982,'common_nonweek1':acc(complete),'including_week1':acc(full),'by_season':{str(y):acc([r for r in complete if r['season']==y]) for y in targetyears},'coverage':{str(y):{'team_games':len([r for r in rows if r['season']==y]),'selected':sum(r['selected_qb'] is not None for r in rows if r['season']==y),'UNTIMESTAMPED':sum(r['UNTIMESTAMPED'] for r in rows if r['season']==y),'missing_actual':sum(r['actual_most_attempts_qb_ORACLE_ONLY'] is None for r in rows if r['season']==y)} for y in range(2016,2026)},'ambiguity_2022':{'multiple_passers':sum(sum(v>0 for v in r['oracle_attempts'].values())>=2 for r in rows if r['season']==2022),'within_five_attempts':sum(len(a:=sorted([v for v in r['oracle_attempts'].values() if v>0],reverse=True))>=2 and a[0]-a[1]<=5 for r in rows if r['season']==2022)}}
 report['pooled_reproduction_within_1pp']=all(abs(report['common_nonweek1'][k]*100-v)<=1 for k,v in report['target_percent'].items());report['season_targets']={'2016':90.4,'2019':90.8,'2022':87.6,'2024':88.7};report['season_reproduction_within_1pp']=all(report['by_season'][y]['selected_qb'] is not None and abs(report['by_season'][y]['selected_qb']*100-v)<=1 for y,v in report['season_targets'].items())
 raw=(json.dumps(rows,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode();h=hashlib.sha256(raw).hexdigest();path=O/f'starter-table-{h}.json';path.write_bytes(raw);report['table']={'path':str(path.relative_to(ROOT)),'sha256':h};dump('starter-reproduction.json',report);print(json.dumps(report,indent=2))
 regression=[r for r in rows if 2018<=r['season']<=2024 and r['prior_four_scoring'] is not None and r['starter_prior_epa_per_attempt'] is not None];y=np.array([r['actual_points'] for r in regression]);x=np.array([[1,r['prior_four_scoring'],r['starter_prior_epa_per_attempt']] for r in regression]);out={'n_team_games':len(y),'sample':'2018-2024REG;four current-season completedgames;selectedQB cumulative earlier2014+EPA/attempt;common complete cases','in_sample_only':True}
 for key,xx in [('scoring_only',x[:,:2]),('with_qb',x)]:
  b=np.linalg.lstsq(xx,y,rcond=None)[0];out[key]={'coefficients':b.tolist(),'mae':float(np.mean(abs(xx@b-y)))}
 out['relative_gain']=1-out['with_qb']['mae']/out['scoring_only']['mae'];out['row_ids']=[r['game_id']+':'+r['team'] for r in regression];dump('supporting-regression-reproduction.json',out);print({k:v for k,v in out.items() if k!='row_ids'})
if __name__=='__main__':run()
