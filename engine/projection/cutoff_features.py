"""Cutoff-driven numerical feature preparation, inactive until release qualification.

The legacy builder remains untouched. Its attribute/feature renderer is retained
below so cutoff observation ordering is the only numerical difference; shared
weighting, adjustment, baseline and Elo implementations are imported directly.
No fit, provider request, current pointer, or production publication occurs here.
"""
import copy
import datetime as dt
from collections import defaultdict
import hashlib
import json
import math
from engine.elo import Elo
from engine.elo_hfa import SeasonElo
from engine.forecast_system.calendar import schedule_kickoff, timestamp
from engine.forecast_system.cadence import cutoff_before, next_cutoff
from .features import DIV, METRICS, SLOTS, avg, weight, adjusted, distance
from .model import baseline

POLICY='approved-method-three-cutoff-v1'
MODES=('HISTORICAL_RECONSTRUCTION','LIVE_RECORDED_AVAILABILITY')
GAME_FIELDS=('game_id','game_type','season','week','gameday','gametime',
             'home_team','away_team','location','stadium_id','roof','source_hash')


def sha(value):
 return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def render(state,slate,stadiums,half_life,extra_hashes):
 season=int(slate[0]['season']);week=int(slate[0]['week'])
 history=state.history;last=state.last;elo=state.elo;teams=sorted(DIV)
 venues={r['stadium_id']:r for r in stadiums['stadiums']};result=[]
 weighted={t:weight(history[t],season,week,half_life) for t in teams}
 allrows=[r for v in weighted.values() for r in v]
 rated=adjusted(allrows,teams) if allrows else {}
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
   score=g.get('home_score') if t==h else g.get('away_score');result.append({'row_id':g['game_id']+':'+t,'game_id':g['game_id'],'team':t,'opponent':o,'home':t==h,'season':season,'week':week,'features':values,'metadata':meta,'actual_points':float(score) if score not in ('',None) else None,'source_hashes':sources,'game':g})
 for row in result:
  row['actual_points']=None
  row['game']={k:row['game'].get(k) for k in GAME_FIELDS}
 return result


class State:
 def __init__(self,elo_hfa=None):
  self.history=defaultdict(list,{t:[] for t in sorted(DIV)})
  self.last=defaultdict(list,{t:[] for t in sorted(DIV)})
  self.elo=SeasonElo({t:1505 for t in sorted(DIV)},65.) if elo_hfa is not None else Elo({t:1505 for t in sorted(DIV)})
  self.elo_hfa=elo_hfa;self.incorporated=[];self.seen=set();self.season=None

 def prepare(self,season):
  for t in sorted(DIV):self.elo.prepare(t,season)
  if self.elo_hfa is not None:self.elo.hfa=float(self.elo_hfa[str(season)])
  self.season=season

 def observe(self,game,rows):
  gid=game['game_id']
  if gid in self.seen:raise ValueError('Duplicate numerical observation: '+gid)
  self.prepare(int(game['season']))
  h,a=game['home_team'],game['away_team'];hs=float(game['home_score']);aws=float(game['away_score'])
  if not all(math.isfinite(v) and v>=0 for v in (hs,aws)):raise ValueError('Invalid final score')
  op={r['team']:r for r in rows}
  if rows and (len(rows)!=2 or set(op)!={h,a}):raise ValueError('Paired team statistics required: '+gid)
  if any(r['opponent']!=(a if r['team']==h else h) for r in rows):raise ValueError('Wrong paired opponent')
  f=self.elo.forecast(h,a,game.get('location')=='Neutral',0.,0.)
  self.elo.update(h,a,hs,aws,f)
  for r in sorted(rows,key=lambda r:r['team']):
   t=r['team'];pf=hs if t==h else aws;pa=aws if t==h else hs
   value=dict(r,points_for=pf,points_against=pa,fg_share=r['fg_points']/pf if pf>0 else None,
              turnover_margin=op[r['opponent']]['turnovers_lost']-r['turnovers_lost'],
              close_win_rate=float(pf>pa) if abs(pf-pa)<=7 else None)
   self.history[t].append(value)
  self.last[h].append(game);self.last[a].append(game)
  self.incorporated.append(gid);self.seen.add(gid)

 def identity(self):
  return sha({'policy':POLICY,'elo':self.elo.teams,'history':dict(self.history),
              'last':dict(self.last),'incorporated':self.incorporated})


def reconstruct(finals,statistics,elo_hfa=None):
 """Build one state from available facts, once per game in played order."""
 state=State(elo_hfa)
 for game in sorted(finals,key=lambda g:(schedule_kickoff(g['gameday'],g['gametime']),g['game_id'])):
  state.observe(game,statistics.get(game['game_id'],[]))
 return state


def build(team_games,schedule,stadiums,half_life=None,extra_hashes=(),elo_hfa=None,*,
          mode,availability=None,through=None,minimum_season=2015,forecast_ids=None):
 """Return label-free numerical rows plus shared-cutoff observation lineage.

 Historical mode explicitly assumes provider availability at kickoff+4h; it
 cannot establish historical live availability. Live mode separately requires
 final_seen_at for Elo/rest and team_stats_seen_at for paired efficiency data;
 neither clock is replaced by a new retrieval date.
 `through` caps execution time, so future states cannot be generated as live.
 """
 if mode not in MODES:raise ValueError('Explicit source-availability mode required')
 if mode=='LIVE_RECORDED_AVAILABILITY' and through is None:raise ValueError('Live execution time required')
 if mode=='LIVE_RECORDED_AVAILABILITY' and forecast_ids is None:raise ValueError('Explicit live target games required')
 limit=timestamp(through) if through is not None else None
 games=sorted([copy.deepcopy(g) for g in schedule if g['game_type']=='REG'],
              key=lambda g:(schedule_kickoff(g['gameday'],g['gametime']),g['game_id']))
 if len({g['game_id'] for g in games})!=len(games):raise ValueError('Duplicate schedule game')
 targets=set(forecast_ids) if forecast_ids is not None else {g['game_id'] for g in games}
 if not targets<={g['game_id'] for g in games}:raise ValueError('Unknown forecast target')
 stats=defaultdict(list)
 for r in team_games:stats[r['game_id']].append(copy.deepcopy(r))
 forecasts=defaultdict(list);observations=defaultdict(list);stat_events=defaultdict(list);excluded=[];eligibility={}
 for game in games:
  gid=game['game_id'];kickoff=schedule_kickoff(game['gameday'],game['gametime'])
  issuance=kickoff-dt.timedelta(minutes=75);cutoff=cutoff_before(issuance)
  if gid in targets:
   if mode=='LIVE_RECORDED_AVAILABILITY' and issuance<=limit:
    raise ValueError('Past issuance requires reconstruction mode: '+gid)
   if limit is None or cutoff<=limit:forecasts[cutoff].append(game)
   else:excluded.append({'game_id':gid,'reason':'REQUIRED_FORECAST_CUTOFF_NOT_REACHED'})
  if mode=='LIVE_RECORDED_AVAILABILITY' and kickoff+dt.timedelta(hours=4)>=limit:continue
  if game.get('home_score') in ('',None) or game.get('away_score') in ('',None):continue
  proxy=kickoff+dt.timedelta(hours=4);final_at=proxy;stats_at=proxy if stats.get(gid) else None
  record=(availability or {}).get(gid,{})
  if mode=='LIVE_RECORDED_AVAILABILITY':
   if not record.get('final_seen_at'):
    excluded.append({'game_id':gid,'reason':'SOURCE_AVAILABILITY_NOT_RECORDED'});continue
   final_at=max(proxy,timestamp(record['final_seen_at']))
   stats_at=max(proxy,timestamp(record['team_stats_seen_at'])) if stats.get(gid) and record.get('team_stats_seen_at') else None
  if stats_at is None:excluded.append({'game_id':gid,'reason':'TEAM_STATISTICS_UNAVAILABLE_OR_UNTIMESTAMPED'})
  eligible=next_cutoff(final_at)
  if limit is None or eligible<=limit:observations[eligible].append(game)
  stat_cutoff=next_cutoff(stats_at) if stats_at is not None else None
  if stat_cutoff is not None and (limit is None or stat_cutoff<=limit):stat_events[stat_cutoff].append(game)
  eligibility[gid]={'kickoff_plus_four_hours':proxy.isoformat(),
                    'available_after':final_at.isoformat(),'first_eligible_cutoff':eligible.isoformat(),
                    'statistics_available_after':stats_at.isoformat() if stats_at else None,
                    'statistics_first_eligible_cutoff':stat_cutoff.isoformat() if stat_cutoff else None,
                    'source_availability':'UNKNOWN_ASSUMED_FOR_RECONSTRUCTION' if mode==MODES[0] else 'RECORDED',
                    'availability_record':record if mode==MODES[1] else None}
 state=State(elo_hfa);rows=[];lineage=[]
 # Include empty in-season cutoffs, but do not simulate offseason updates.
 finals_available={};stats_available={}
 cuts=set(forecasts)|set(observations)|set(stat_events)
 for season in sorted({int(g['season']) for g in games}):
  season_cuts=[cutoff_before(schedule_kickoff(g['gameday'],g['gametime'])-dt.timedelta(minutes=75)) for g in games if int(g['season'])==season]
  cursor=min(season_cuts);end=max(season_cuts)
  while cursor<=end:
   if limit is None or cursor<=limit:cuts.add(cursor)
   cursor=next_cutoff(cursor)
 for cutoff in sorted(cuts):
  added=sorted(observations[cutoff],key=lambda g:(schedule_kickoff(g['gameday'],g['gametime']),g['game_id']))
  for game in added:
   if timestamp(eligibility[game['game_id']]['available_after'])>=cutoff:raise ValueError('Early numerical observation')
   finals_available[game['game_id']]=game
  changed_stats=sorted(stat_events[cutoff],key=lambda g:(schedule_kickoff(g['gameday'],g['gametime']),g['game_id']))
  for game in changed_stats:stats_available[game['game_id']]=stats[game['game_id']]
  if added or changed_stats:state=reconstruct(list(finals_available.values()),stats_available,elo_hfa)
  by_context=defaultdict(list)
  for g in forecasts[cutoff]:by_context[(int(g['season']),int(g['week']))].append(g)
  contexts=[]
  for (season,week),slate in sorted(by_context.items()):
   state.prepare(season);identity=state.identity()
   produced=render(state,sorted(slate,key=lambda g:g['game_id']),stadiums,half_life,extra_hashes)
   for row in produced:
    row['state_lineage']={'policy':POLICY,'cutoff_at':cutoff.isoformat(),'state_sha256':identity,
                          'incorporated_count':len(state.incorporated),'incorporated_sha256':sha(state.incorporated),
                          'source_availability_mode':mode,'weight_context_week':week}
    if row['season']>=minimum_season:rows.append(row)
   contexts.append({'season':season,'week':week,'state_sha256':identity,'forecast_games':[g['game_id'] for g in slate]})
  lineage.append({'cutoff_at':cutoff.isoformat(),'added_games':[g['game_id'] for g in added],'statistics_games':[g['game_id'] for g in changed_stats],
                  'incorporated_count':len(state.incorporated),'incorporated_sha256':sha(state.incorporated),
                  'forecast_contexts':contexts})
 return {'policy':POLICY,'mode':mode,'rows':rows,'lineage':lineage,'eligibility':eligibility,'excluded':excluded}
