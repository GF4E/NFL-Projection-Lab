"""Human-originated pricing only. Pure inputs; no I/O or autonomous picks."""
import math
from engine.model_pick import probabilities
from engine.pricing import decimal_odds,price_edge
TAGS=('QB_MATCHUP','COORDINATOR','TRENCHES','INJURY','SCHEME','SITUATIONAL','WEATHER','PRICE','YOUNG_QB_SUPPORT','RUSH_VS_EXPLOSIVE','MOMENTUM','CONTINUITY','REFEREE')
PEOPLE=('Gabe','Jarrett')

def validate(entry):
 if entry.get('person') not in PEOPLE:raise ValueError('Unknown person')
 if type(entry.get('confidence')) is not int or not 1<=entry['confidence']<=5:raise ValueError('Confidence must be 1..5')
 if not isinstance(entry.get('tags'),list) or not entry['tags'] or any(t not in TAGS for t in entry['tags']) or len(set(entry['tags']))!=len(entry['tags']):raise ValueError('Use fixed unique tags')
 for field,lo,hi in [('spread',-60,60),('total',0,150)]:
  value=entry.get(field)
  if type(value) not in (int,float) or not math.isfinite(value) or not lo<=value<=hi:raise ValueError('Invalid '+field)
 return entry

def price_number(entry,market,context,shape,confidence):
 validate(entry);game=context['game'];center=context['consensus'][market]['full']['center']
 if center is None:raise ValueError('No consensus')
 location=-entry['spread'] if market=='spreads' else entry['total'];gap=location-center
 if gap==0:return {'market':market,'side':None,'line':None,'person':entry['person'],'confidence':entry['confidence'],'tags':entry['tags'],'gap':0,'band':'STORY','EV':0,'stake_dollars':0,'status':'NO_DIRECTION_AT_MARKET'}
 side=(game['home_team'] if gap>0 else game['away_team']) if market=='spreads' else ('Over' if gap>0 else 'Under')
 candidates=[]
 for q in context['offers']:
  if q['market']!=market or q['side']!=side:continue
  p=probabilities(shape,market,location,q,game['home_team']);c=p['conditional_win'];b=decimal_odds(q['price'])-1
  if c is None:continue
  ev=p['win']*b-p['loss'];fraction=max(0.,(c*b-(1-c))/b)/4
  candidates.append({**q,**p,'fair_probability':c,'EV':ev,'edge_cents':price_edge(c,q['price']),'stake_dollars':min(100.,1000*fraction)})
 if not candidates:raise ValueError('No executable offer on human side')
 selected=max(candidates,key=lambda q:(q['EV'],q['book'],q['line']));mapping=confidence.get('map',confidence['provisional']);level=min(range(1,6),key=lambda x:(abs(mapping[str(x)]-selected['fair_probability']),x));band='STORY' if abs(gap)<1 else 'LEAN' if abs(gap)<=2 else 'BET'
 return {**selected,'gap':gap,'band':band,'person':entry['person'],'confidence':entry['confidence'],'confidence_probability':mapping[str(entry['confidence'])],'confidence_version':confidence['version'],'conflict':abs(level-entry['confidence'])>1,'tags':entry['tags'],'entry_at':entry['submitted_at'],'home_team':game['home_team'],'number':location,'input_class':entry['input_class'],'status':'PRICED_HUMAN_LEAN'}

def resolve(entries,market):
 if len(entries)!=2:return {'verdict':'MISSED','reason':'TWO_INDEPENDENT_ENTRIES_REQUIRED','stake_dollars':0}
 if any(not e.get('side') for e in entries):return {'verdict':'STORY','reason':'At least one entered number equals market; no inferred side','stake_dollars':0}
 a,b=entries
 if a['side']!=b['side']:
  chosen=a if a['confidence']>=4 and b['confidence']<3 else b if b['confidence']>=4 and a['confidence']<3 else None
  if chosen is None:return {'verdict':'PASS_DISAGREE','reason':'Opposite sides without confidence exception','stake_dollars':0}
 else:chosen=min(entries,key=lambda p:(p['confidence'],p['stake_dollars'],p['person']))
 verdict='BET' if chosen['band']=='BET' and chosen['EV']>0 else 'PASS_PRICE' if chosen['band']=='BET' else chosen['band']
 return {**chosen,'verdict':verdict,'stake_dollars':chosen['stake_dollars'] if verdict=='BET' else 0,'sizing_basis':'Lower confidence person on same side; high-confidence exception on opposite sides; entered number probability only'}

def cap_game(verdicts,weekly_remaining=1000):
 total=sum(p['stake_dollars'] for p in verdicts);available=max(0.,min(100.,weekly_remaining));factor=min(1.,available/total) if total else 1.
 return [{**p,'stake_dollars':math.floor(p['stake_dollars']*factor*100)/100,'unit_dollars':50,'game_cap_dollars':100,'weekly_cap_dollars':1000} for p in verdicts]
