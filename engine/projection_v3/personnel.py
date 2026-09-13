"""Chronological pregame personnel identities and strictly earlier player histories."""
import copy,datetime as dt,math
from collections import defaultdict,Counter
from zoneinfo import ZoneInfo
from engine.projection.features import weight

NAMES={'qb_epa':'Pregame QB EPA per dropback','qb_cpoe':'Pregame QB completion over expectation','qb_career_starts':'Pregame QB career start proxy','qb_backup':'Pregame QB backup flag','pressure_generated':'Defense PRESSURE_PROXY generated','pressure_allowed':'Offense PRESSURE_PROXY allowed','career_fg_short':'Pregame kicker career FG below 40 yards','career_fg_medium':'Pregame kicker career FG 40-49 yards','career_fg_long':'Pregame kicker career FG 50+ yards'}

def select_chart(charts,team,position,season,week,cutoff):
 eligible=[]
 for c in charts:
  if c['team']!=team or c['position']!=position or not c.get('id') or c['season']!=season:continue
  if c.get('at'):
   at=dt.datetime.fromisoformat(c['at'].replace('Z','+00:00'))
   if not cutoff-dt.timedelta(days=7)<=at<cutoff:continue
   if season>=2026:
    received=c.get('received_at')
    if not received or dt.datetime.fromisoformat(received.replace('Z','+00:00'))>=cutoff:continue
   eligible.append((at.isoformat(),c))
  elif season>=2009 and c.get('week')==week:eligible.append(('',c))
 if not eligible:return None,'NO_ELIGIBLE_STARTER_CHART'
 latest=max(k for k,c in eligible);rows=[c for k,c in eligible if k==latest];ids={c['id'] for c in rows}
 if len(ids)!=1:return None,'AMBIGUOUS_STARTER_CHART'
 return rows[0],rows[0]['status']

def rate(history,season,week,decay,numerator,denominator):
 # Preserve v2's season weights while weighting player samples by observations.
 rows=weight(history,season,week,decay);value=mass=0.
 for year in [season-1,season]:
  subset=[r for r in rows if r['season']==year and r.get(numerator) is not None and r.get(denominator,0)>0]
  if not subset:continue
  share=sum(r['_w'] for r in rows if r['season']==year);den=sum(r['_w']*r[denominator] for r in subset)
  if den:value+=share*sum(r['_w']*r[numerator] for r in subset)/den;mass+=share
 return value/mass if mass else None

def enrich(rows,data,half_life=None):
 result=copy.deepcopy(rows);byweek=defaultdict(list);charts=defaultdict(list)
 for c in data['charts']:charts[(c['season'],c['team'],c['position'])].append(c)
 for r in result:byweek[(r['season'],r['week'])].append(r)
 games=data['games'];team_history=defaultdict(list);qb_history=defaultdict(list);starts=defaultdict(int);kicks=defaultdict(lambda:{b:[0,0] for b in ['short','medium','long']});kicker_sources=defaultdict(set);qb_sources=defaultdict(set);left_qb=set();left_k=set();i=0
 for (season,week),slate in sorted(byweek.items()):
  first=min(r['game']['gameday'] for r in slate)
  while i<len(games) and games[i]['date']<first:
   g=games[i];i+=1
   for team,t in g['teams'].items():
    base={'season':g['season'],'week':g['week'],'date':g['date'],'source_hash':g['source_hash'],'game_id':g['game_id']}
    team_history[team].append({**base,**t})
    if t['first_qb']:starts[t['first_qb']]+=1
    for q,stats in t['qbs'].items():
     qb_history[q].append({**base,**stats});qb_sources[q].add(g['source_hash'])
     if g['season']==1999:left_qb.add(q)
    for k,bands in t['kickers'].items():
     kicker_sources[k].add(g['source_hash'])
     if g['season']==1999:left_k.add(k)
     for b in kicks[k]:
      for j in [0,1]:kicks[k][b][j]+=bands[b][j]
  for r in slate:
   team=r['team'];game=r['game'];cutoff=dt.datetime.fromisoformat(game['gameday']+'T'+(game.get('gametime') or '00:00')).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc)-dt.timedelta(minutes=75)
   prior=team_history[team][-1] if team_history[team] else None
   qc,qstatus=select_chart(charts[(season,team,'QB')],team,'QB',season,week,cutoff)
   kc,kstatus=select_chart(charts[(season,team,'K')],team,'K',season,week,cutoff)
   qb=qc['id'] if qc else prior.get('qb') if prior else None;kicker=kc['id'] if kc else prior.get('kicker') if prior else None
   incumbent_rows=[x for x in team_history[team] if x['season']==season] or [x for x in team_history[team] if x['season']==season-1]
   incumbent_counts=Counter(x['first_qb'] for x in incumbent_rows if x['first_qb']);incumbent=sorted(incumbent_counts,key=lambda q:(-incumbent_counts[q],q))[0] if incumbent_counts else None
   values={n:None for n in NAMES};qh=qb_history.get(qb,[])
   if qb:
    values.update(qb_epa=rate(qh,season,week,half_life,'epa_sum','epa_n'),qb_cpoe=rate(qh,season,week,half_life,'cpoe_sum','cpoe_n'),qb_career_starts=float(starts[qb]) if qb not in left_qb else None,qb_backup=float(qb!=incumbent) if incumbent else None)
   if kicker:
    for b in ['short','medium','long']:
     made,n=kicks[kicker][b];values['career_fg_'+b]=made/n if n and kicker not in left_k else None
   for n in ['pressure_generated','pressure_allowed']:
    ph=[dict(x,pressure_sum=x[n]['sum'],pressure_n=x[n]['n']) for x in team_history[team]]
    values[n]=rate(ph,season,week,half_life,'pressure_sum','pressure_n')
   qb_hashes=sorted(qb_sources.get(qb,set())|({qc['source_hash']} if qc else set())|({prior['source_hash']} if prior else set()))
   k_hashes=sorted(kicker_sources.get(kicker,set())|({kc['source_hash']} if kc else set())|({prior['source_hash']} if prior else set()))
   provenance={'cutoff_at':cutoff.isoformat(),'history_before':first,'prior_game':prior['game_id'] if prior else None,'qb_id':qb,'incumbent_qb_id':incumbent,'backup_definition':'BACKUP_PROXY replacement of historical team incumbent','qb_identity_rule':'EXPLICIT_CHART' if qc else 'PREVIOUS_GAME_MOST_DROPBACKS' if qb else 'UNKNOWN','qb_chart_status':qstatus,'qb_chart':qc,'qb_history_left_censored':qb in left_qb,'career_starts_definition':'CAREER_START_PROXY first offensive dropback identity; full earlier REG/POST games','pre2009_fallback':season<2009,'injury_override':'NO_EXPLICIT_REPLACEMENT_STARTER_FIELD','kicker_id':kicker,'kicker_identity_rule':'EXPLICIT_CHART' if kc else 'PREVIOUS_GAME_KICKER' if kicker else 'UNKNOWN','kicker_chart_status':kstatus,'kicker_chart':kc,'kicker_history_left_censored':kicker in left_k,'career_fg_counts':kicks[kicker] if kicker else None,'source_hashes':sorted(set(qb_hashes+k_hashes))}
   r['personnel']=copy.deepcopy(provenance)
   for n,v in values.items():
    hashes=qb_hashes if n.startswith('qb_') else k_hashes if n.startswith('career_') else sorted({x['source_hash'] for x in team_history[team] if x['season'] in [season-1,season]})
    r['features'][n]=v;r['metadata'][n]={'label':NAMES[n],'status':'ACTIVE' if v is not None else 'INACTIVE','source_hashes':hashes,'qualification':'PRESSURE_PROXY' if n.startswith('pressure_') else 'AUTHORIZED_PREGAME_PROXY','missing_reason':None if v is not None else 'No qualifying pregame identity or prior measurements; see personnel provenance'}
   r['source_hashes']=sorted(set(r['source_hashes']+provenance['source_hashes']))
 return result
