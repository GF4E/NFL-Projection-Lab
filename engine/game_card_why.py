"""Deterministic football-only explanations from measured sheet values."""
import re
BANNED=re.compile(r'price|book|cents|break-even|\bEV\b|cushion|reference|filter|stale|Jarrett|Gabe|\$',re.I)
TAGS={'QB_MATCHUP':'QB matchup','COORDINATOR':'coordinator','TRENCHES':'trenches','INJURY':'injury','SCHEME':'scheme','SITUATIONAL':'situation','WEATHER':'weather','YOUNG_QB_SUPPORT':'young QB support','RUSH_VS_EXPLOSIVE':'pressure vs explosives','MOMENTUM':'momentum','CONTINUITY':'continuity','REFEREE':'officiating'}
def safe(s):return not BANNED.search(s)
def measured(x):return isinstance(x,dict) and x.get('measured') is True and x.get('status') not in ('MEASURE','UNMEASURED')
def generate(card):
 candidates=[];ours=card.get('ours');team=card['tiles']['SPREAD'].get('side') or card['tiles']['WINNER'].get('side') or card['home'];opp=card['away'] if team==card['home'] else card['home'];sheet=card.get('sheet',{})
 def add(text,field,priority,magnitude,support=0):
  if len(text)<100 and safe(text):candidates.append(dict(text=text,field=field,priority=priority,magnitude=abs(magnitude),support=support))
 def teams(n):
  b=sheet.get(str(n),{});return b.get('teams',{}) if b.get('measured') is True else {}
 if ours:
  for tag in ours.get('tags') or []:
   text=TAGS.get(tag,tag)
   if safe(text):add(text,'ours.tags',0,0,1)
  text=ours.get('text') or ''
  if text and safe(text):add(text,'ours.text',0,1,1)
 qbs=teams(7)
 for t,sign in ((team,1),(opp,-1)):
  q=qbs.get(t,{})
  if measured(q):
   for key,label in [('epa_per_dropback','QB EPA/dropback'),('cpoe','QB completion over expectation')]:
    v=q.get(key)
    if isinstance(v,(int,float)):add(f'{t} {label} {v:+.3f} (n={q.get("n_dropbacks",0)})',f'7.{t}.{key}',1,v,sign if v>0 else -sign)
   if q.get('starter') and safe(str(q['starter'])):add(f'{t} starting QB: {q["starter"]}',f'7.{t}.starter',1,0,sign)
   if q.get('backup') is True:add(f'{t} is starting a backup QB',f'7.{t}.backup',1,1,-sign)
 match=teams(6)
 for t,o,sign in ((team,opp,1),(opp,team,-1)):
  for a,b,label in [('off_rush_epa','def_rush_epa','rush offense vs rush defense'),('off_pass_epa','def_pass_epa','pass offense vs pass defense'),('def_pressure_rate','off_pressure_rate','pass rush vs protection'),('off_explosive_rate','def_explosive_rate','explosive offense vs defense')]:
   x,y=match.get(t,{}).get(a,{}),match.get(o,{}).get(b,{})
   if measured(x) and measured(y) and x.get('rank') and y.get('rank'):
    gap=y['rank']-x['rank'];add(f'{t} {label}: #{x["rank"]} vs {o} #{y["rank"]}',f'6.{t}.{a};6.{o}.{b}',2,gap,sign if gap>0 else -sign)
 efficiency=teams(4)
 for t,sign in ((team,1),(opp,-1)):
  for key,label in [('off_epa','offensive EPA/play'),('def_epa','defensive EPA allowed/play'),('off_points_per_drive','offensive points/drive'),('def_points_per_drive','points allowed/drive')]:
   v=efficiency.get(t,{}).get(key,{})
   if measured(v) and v.get('adjusted') is not None and v.get('rank'):
    rank=v['rank'];add(f'{t} adjusted {label} {v["adjusted"]:.3f}, #{rank}',f'4.{t}.{key}',3,abs(16.5-rank),sign if rank<=16 else -sign)
 for t,v in teams(9).items():
  if measured(v) and v.get('value') is not None:
   add(f'{t} momentum index {v["value"]:+.2f} over {v.get("n_games",0)} games',f'9.{t}.value',4,v['value'],(1 if t==team else -1)*(1 if v['value']>0 else -1))
   rate=v.get('base_rates',{})
   if measured(rate) and rate.get('value') is not None:add(f'{t} momentum regression rate {rate["value"]:.1%} (n={rate.get("n",0)})',f'9.{t}.base_rates',4,rate['value'],-1 if t==team else 1)
 for t,v in teams(10).items():
  for key,label in [('fumble_recovery','fumble recovery share'),('turnover_margin','turnover margin'),('fg_share','field-goal scoring share')]:
   x=v.get(key,{})
   if measured(x) and x.get('value') is not None:add(f'{t} {label} {x["value"]:.2f} (n={x.get("n_games",x.get("n_fumbles",0))})',f'10.{t}.{key}',5,x['value'],0)
 for n in (3,8):
  for t,v in teams(n).items():
   for key in ('continuity','rest_days','travel_miles','divisional','home_road_split'):
    x=v.get(key,{})
    if measured(x) and x.get('value') is not None:add(f'{t} {key.replace("_"," ")} {x["value"]}',f'{n}.{t}.{key}',6 if n==3 else 8,0,0)
 w=card.get('weather') or {}
 if w.get('status')=='FORECAST' and w.get('measured',True) and isinstance(w.get('wind_mph'),(int,float)) and (w['wind_mph']>10 or any('WIND' in str(x.get('rule_id','')) for x in card.get('rules',[]))):add(f'Kickoff wind {w["wind_mph"]:.1f} mph can limit downfield passing','weather.wind_mph',7,w['wind_mph'],0)
 candidates.sort(key=lambda x:(x['priority'],-x['magnitude'],x['text']))
 support=next((x for x in candidates if x['support']>0),None);against=next((x for x in candidates if x['support']<0),None)
 source=card['tiles']['SPREAD'].get('confidence_source') or card['tiles']['WINNER'].get('confidence_source')
 first=f'The market favors {team}; '+(support['text'] if support else 'a measured football advantage is not recorded') if source=='MARKET' else f'Our lean is {team}: '+(support['text'] if support else 'a measured football advantage is not recorded')
 second='Against that lean, '+(against['text'] if against else 'no measured counter-reason is recorded')
 selected=candidates[:5]
 if ours:
  if against and against not in selected:selected=(selected[:4]+[against])
  bullets=[('Against: ' if x is against else '')+x['text'] for x in selected]
  # Coverage is an explicit absence, not invented football evidence.
  if not against:bullets=(bullets[:4]+['Against: no measured counter-reason is recorded.'])
 else:bullets=[x['text'] for x in selected]
 bullets=[x for x in bullets if len(x)<100 and safe(x)]
 return {'statement':first.rstrip('.')+'. '+second.rstrip('.')+'.','bullets':bullets,'fields':[x['field'] for x in selected]}
