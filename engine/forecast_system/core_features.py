# Isolated historical extension of projection/features.py; 2011 warmup, 2012 outputs.
"""Prior-week football state, incidence-matrix ratings and feature attribution metadata."""
import datetime as dt,math,hashlib,json
from collections import defaultdict
import numpy as np
from engine.elo import Elo
from engine.projection.model import baseline

DIVISIONS=[['BUF','MIA','NE','NYJ'],['BAL','CIN','CLE','PIT'],['HOU','IND','JAX','TEN'],['DEN','KC','OAK','LAC'],['DAL','NYG','PHI','WSH'],['CHI','DET','GB','MIN'],['ATL','CAR','NO','TB'],['ARI','LAR','SF','SEA']]
DIV={t:i for i,d in enumerate(DIVISIONS) for t in d}
METRICS=['off_ppd','off_ypp','rush_epa','rush_success','pass_epa','cpoe','explosive']
SLOTS={'continuity':'Staff history unseeded','referee':'Week 5 positive study absent','pressure_generated':'No qualifying training-history pressure series','pressure_allowed':'No qualifying training-history pressure series','qb_epa':'Pregame starter history unqualified','qb_cpoe':'Pregame starter history unqualified','qb_career_starts':'Pregame starter history unqualified','qb_backup':'Pregame starter history unqualified','elo_qb_adjustment':'ANY/A values exist but historical pregame starter availability is unqualified','wind':'Separate PARTIAL_HISTORY correction'}

def avg(rows,key):
 a=[(r[key],r['_w']) for r in rows if r.get(key) is not None and math.isfinite(r[key])]
 return sum(x*w for x,w in a)/sum(w for _,w in a) if a and sum(w for _,w in a)>0 else None

def weight(rows,season,week,half_life):
 selected=[]
 for year in (season-1,season):
  a=[r for r in rows if r['season']==year]
  sw=max(0,(6-week)/5) if year==season-1 else min(1,(week-1)/5)
  if week>=6:sw=0 if year<season else 1
  if not a or sw==0:continue
  latest=max(r['week'] for r in a);raw=[1. if half_life is None else 2**(-(latest-r['week'])/half_life) for r in a];den=sum(raw)
  selected += [dict(r,_w=sw*w/den) for r,w in zip(a,raw)]
 return selected

def adjusted(rows,teams):
 n=len(teams);idx={t:i for i,t in enumerate(teams)};out={t:{} for t in teams}
 for key in METRICS:
  a=[r for r in rows if r.get(key) is not None and r['_w']>0]
  if not a:continue
  x=np.zeros((len(a),1+2*n));x[:,0]=1;w=np.asarray([r['_w'] for r in a]);y=np.asarray([r[key] for r in a])
  for j,r in enumerate(a):x[j,1+idx[r['team']]]=1;x[j,1+n+idx[r['opponent']]]=1
  penalty=np.eye(1+2*n);penalty[0,0]=0;b=np.linalg.solve(x.T@(w[:,None]*x)+penalty,x.T@(w*y))
  for prefix,offset in [('off',1),('def',1+n)]:
   vals={t:float(b[0]+b[offset+idx[t]]) for t in teams};ranks=sorted(teams,key=lambda t:((-1 if prefix=='off' else 1)*vals[t],t))
   for t in teams:out[t][prefix+'_'+key]={'value':vals[t],'rank':ranks.index(t)+1}
 return out

def distance(a,b):
 if a is None or b is None:return None
 lat1,lon1,lat2,lon2=map(math.radians,[a['latitude'],a['longitude'],b['latitude'],b['longitude']]);v=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
 return 3958.8*2*math.asin(min(1,math.sqrt(v)))

def build(team_games,schedule,stadiums,half_life=None,extra_hashes=(),calendar_batches=None):
 games=sorted([g for g in schedule if g['game_type']=='REG'],key=lambda g:(int(g['season']),int(g['week']),g['game_id']))
 bygame=defaultdict(list)
 for r in team_games:bygame[r['game_id']].append(r)
 teams=sorted(DIV);history=defaultdict(list);last=defaultdict(list);elo=Elo({t:1505 for t in teams});result=[];groups=defaultdict(list);venues={r['stadium_id']:r for r in stadiums['stadiums']}
 for g in games:groups[(int(g['season']),int(g['week']))].append(g)
 def assimilate(slate):
  for g in slate:
   h,a=g['home_team'],g['away_team'];hs=g.get('home_score');aws=g.get('away_score')
   if hs in ('',None) or aws in ('',None):continue
   hs=float(hs);aws=float(aws);f=elo.forecast(h,a,g.get('location')=='Neutral',0.,0.);elo.update(h,a,hs,aws,f)
   rr=bygame[g['game_id']];op={r['team']:r for r in rr}
   for r in rr:
    t=r['team'];pf=hs if t==h else aws;pa=aws if t==h else hs;r=dict(r,points_for=pf,points_against=pa,fg_share=r['fg_points']/pf if pf>0 else None,turnover_margin=op.get(r['opponent'],{}).get('turnovers_lost',0)-r['turnovers_lost'],close_win_rate=float(pf>pa) if abs(pf-pa)<=7 else None);history[t].append(r)
   last[h].append(g);last[a].append(g)
 if calendar_batches is None:
  batches=[dict(season=season,decay_week=week,forecasts=slate,observations=None) for (season,week),slate in sorted(groups.items())]
 else:
  from .calendar import timestamp
  first={}
  for batch in calendar_batches:
   for g in batch['forecasts']:first.setdefault(int(g['season']),timestamp(batch['cutoff']))
  batches=[]
  for batch in calendar_batches:
   assimilated=batch['observations']
   slate=batch['forecasts']
   if not slate:
    # Preserve availability events even at cutoffs with no forecasts.
    batches.append(dict(season=None,decay_week=None,forecasts=[],observations=assimilated));continue
   season=int(slate[0]['season'])
   # Calendar distance, not schedule labels, advances the existing linear decay.
   elapsed=(timestamp(batch['cutoff']).date()-first[season].date()).days//7
   batches.append(dict(season=season,decay_week=elapsed+1,forecasts=slate,observations=assimilated,cutoff=batch['cutoff']))
 for batch in batches:
  if batch['observations'] is not None:assimilate(batch['observations'])
  season,week,slate=batch['season'],batch['decay_week'],batch['forecasts']
  if not slate:continue
  weighted={t:weight(history[t],season,week,half_life) for t in teams};allrows=[r for v in weighted.values() for r in v];rated=adjusted(allrows,teams) if allrows else {}
  for t in teams:elo.prepare(t,season)
  for g in slate:
   h,a=g['home_team'],g['away_team'];neutral=g.get('location')=='Neutral';venue=venues.get(g.get('stadium_id'));div=DIV[h]==DIV[a]
   for t,o in [(a,h),(h,a)]:
    wh=weighted[t];rh=rated.get(t,{});ro=rated.get(o,{});values={};meta={};sources=sorted({r['source_hash'] for r in allrows})+[g['source_hash']]+list(extra_hashes)+[hashlib.sha256(json.dumps(stadiums,sort_keys=True).encode()).hexdigest()]
    def add(k,v,label,status=None):
     values[k]=v;meta[k]={'label':label,'status':status or ('ACTIVE' if v is not None else 'INACTIVE'),'source_hashes':sources}
    drives=avg(wh,'drives');other_drives=avg(weighted[o],'drives');off=rh.get('off_off_ppd',{}).get('value');defense=ro.get('def_off_ppd',{}).get('value')
    add('baseline',baseline(off,defense,drives,other_drives) if all(v is not None for v in [off,defense,drives,other_drives]) else None,f'{t} scoring efficiency against {o}, at expected pace')
    add('home_divisional',float(t==h and not neutral and div),f'{t} divisional home field');add('home_nondivisional',float(t==h and not neutral and not div),f'{t} non-divisional home field');add('divisional',float(div),f'{t} division matchup');add('neutral',float(neutral),'Neutral venue')
    for key in METRICS:
     for who,prefix,rr in [(t,'off',rh),(o,'def',ro)]:
      item=rr.get(prefix+'_'+key,{});pretty={'off_ppd':'points per drive','off_ypp':'yards per play','rush_epa':'run efficiency','rush_success':'run success','pass_epa':'pass efficiency','cpoe':'completion over expectation','explosive':'explosive play rate'}[key]
      add(prefix+'_'+key,item.get('value'),f'{who} {"offense" if prefix=="off" else "defense"} {pretty}, rank {item.get("rank","unknown")}')
    add('drives',drives,f'{t} offensive drives per game');add('opponent_drives',other_drives,f'{o} offensive drives per game');add('plays_per_drive',avg(wh,'plays_per_drive'),f'{t} plays per drive')
    for band in ['short','medium','long']:
     for career,rows in [(False,wh),(True,history[t])]:
      den=sum(r.get('fg_'+band+'_attempts',0)*(1. if career else r['_w']) for r in rows);v=sum(r.get('fg_'+band+'_made',0)*(1. if career else r['_w']) for r in rows)/den if den else None
      # Team historical kicking is not an identified kicker's career record.
      add(('career_' if career else 'season_')+'fg_'+band,None if career else v,f'{t} {band}-distance field goals',status='INACTIVE' if career else None)
    for k in ['te_share','rb_share','redzone_td','return_points','fg_share','turnover_margin','fumble_recovery','close_win_rate']:
     add(k,avg(wh,k),f'{t} '+k.replace('_',' '))
    components=[]
    for key,sign in [('off_ypp',1),('points_for',1),('points_against',-1)]:
     mean=avg(wh,key);usable=[r for r in wh if r.get(key) is not None];den=sum(r['_w'] for r in usable);sd=math.sqrt(sum(r['_w']*(r[key]-mean)**2 for r in usable)/den) if usable and mean is not None else 0
     recent=[r[key] for r in history[t][-4:] if r.get(key) is not None];components.append(sign*(sum(recent)/len(recent)-mean)/sd if recent and sd>0 else None)
    add('momentum',sum(components)/3 if all(x is not None for x in components) else None,f'{t} last-four-game momentum')
    luck=[(avg(wh,'fumble_recovery'),.5),(avg(wh,'close_win_rate'),.5)]
    add('luck_index',sum(v-center for v,center in luck) if all(v is not None for v,c in luck) else None,f'{t} fumble and close-game luck')
    add('elo',elo.teams[t]['elo']-1505,f'{t} pregame Elo');add('elo_difference',elo.teams[t]['elo']-elo.teams[o]['elo'],f'{t} Elo advantage over {o}')
    curr=[r for r in history[t] if r['season']==season];strength=[rated[r['opponent']]['off_off_ppd']['value']-rated[r['opponent']]['def_off_ppd']['value'] for r in curr if rated.get(r['opponent'])]
    add('schedule_strength',sum(strength)/len(strength) if strength else None,f'{t} opponent-adjusted schedule strength')
    pf=avg(wh,'points_for');pa=avg(wh,'points_against');add('pythagorean',pf**2.37/(pf**2.37+pa**2.37) if pf is not None and pa is not None and pf+pa>0 else None,f'{t} points-based expected win rate')
    previous=last[t][-1] if last[t] else None;rest=(dt.date.fromisoformat(g['gameday'])-dt.date.fromisoformat(previous['gameday'])).days if previous else None
    add('rest_days',rest,f'{t} rest days since last game')
    home_venues=[v for v in last[t] if v['home_team']==t and v.get('location')!='Neutral'];home_venue=venues.get(home_venues[-1].get('stadium_id')) if home_venues else None
    add('travel_miles',0. if t==h and not neutral else distance(home_venue,venue),f'{t} travel from home stadium')
    for k,reason in SLOTS.items():add(k,None,reason,'INACTIVE')
    score=g.get('home_score') if t==h else g.get('away_score');result.append({'row_id':g['game_id']+':'+t,'game_id':g['game_id'],'team':t,'opponent':o,'home':t==h,'season':season,'week':int(g['week']),'features':values,'metadata':meta,'actual_points':float(score) if score not in ('',None) else None,'source_hashes':sources,'game':g})
   # Elo update is deferred until every game in this week's slate has been forecast.
  if calendar_batches is None:assimilate(slate)
 return [r for r in result if r['season']>=2012]
