"""Football-only support and opposing contributions from qualified inputs."""
import copy,math
from engine.projection.card import code,finish
from engine.projection.distribution import summarize
from .model import GROUPS,predict

LABELS={'quarterback':'Pregame QB production','pressure':'Hit-plus-sack pressure proxy','career_kicking':'Kicker career field goals','calibration':'Scoring calibration','venue':'Venue','efficiency':'Scoring efficiency','pace':'Pace','passing':'Passing matchup','rushing':'Running matchup','explosiveness':'Explosive plays','kicking':'Field goals','target_shares':'Receiving usage','momentum':'Recent form','scoring_composition':'Scoring composition','turnovers_luck':'Turnovers and close-game results','elo':'Pregame Elo','schedule_strength':'Schedule strength','pythagorean':'Points for and against','rest_travel':'Rest and travel','wind':'Kickoff forecast wind','baseline':'Scoring efficiency and pace','baseline_attack':'Offensive production','baseline_defense':'Defensive resistance'}

def project(rows,artifact,shapes,forecast=None):
 terms={};out={}
 for side in ('home','away'):
  row=rows[side];features=copy.deepcopy(row['features']);features['wind']=forecast['wind_mph'] if forecast and 'wind' in artifact['groups'] else None
  result=predict(artifact['fit'],features);present=set()
  for c in result['contributions']:
   present.add(c['input']);meta=row['metadata'].get('baseline' if c['input']=='football_baseline' else c['input'],{});c.update(label=meta.get('label',LABELS.get(c['group'],c['group'])),source_hashes=meta.get('source_hashes',row['source_hashes']))
   if c['input']=='wind' and c['status']=='ACTIVE':c.update(status='PARTIAL_HISTORY',label=f"{code(row['team'])} forecast wind",source_hashes=[forecast['source_sha256']])
  for item in artifact['inactive']:
   n=item['input']
   if n in present:continue
   result['contributions'].append({'input':n,'group':next((g for g,ns in GROUPS.items() if n in ns),'unqualified'),'value':features.get(n),'points':0.,'weight':0.,'status':'INACTIVE','label':row['metadata'].get(n,{}).get('label',n),'reason':item['reason'],'source_hashes':row['metadata'].get(n,{}).get('source_hashes',[])})
  terms[side]=result['contributions'];out[side]=result['points']
 return summarize(out['away'],out['home'],shapes),terms

def why(terms,rows,projection,fitted=None):
 direction=1 if projection['home_win_probability']>=.5 else -1;win_side='home' if direction==1 else 'away';lose_side='away' if direction==1 else 'home';winner=code(rows[win_side]['team']);loser=code(rows[lose_side]['team']);values={}
 for side,sign in [('home',direction),('away',-direction)]:
  for c in terms[side]:
   if c['status']=='INACTIVE':continue
   values[c['group']]=values.get(c['group'],0.)+sign*c['points']
 f=rows[win_side]['features'];o=rows[lose_side]['features']
 # Exact algebraic decomposition of the calibrated PPD-times-pace baseline.
 # This changes the explanation only; the fitted projection is unchanged.
 if fitted is not None:
  pace=(f['drives']+f['opponent_drives'])/2;factor=1.
  if 'calibration' in fitted['groups']:
   i=fitted['names'].index('baseline');factor+=fitted['coefficients'][i]/fitted['scales'][i]
  attack=.5*(f['off_off_ppd']-o['off_off_ppd'])*pace*factor
  defense=.5*(f['def_off_ppd']-o['def_off_ppd'])*pace*factor
  expected=values.get('baseline',0.)+values.get('calibration',0.)
  if not math.isclose(attack+defense,expected,abs_tol=1e-9):raise ValueError('WHY baseline decomposition does not reconcile')
  values.pop('baseline',None);values.pop('calibration',None);values.update(baseline_attack=attack,baseline_defense=defense)
 def number(v,places=1):return f'{v:.{places}f}' if v is not None and math.isfinite(v) else 'unknown'
 def evidence(group):
  if group=='baseline_attack':return f"{winner}'s adjusted offense scores {number(f.get('off_off_ppd'),2)} points per drive versus {loser}'s {number(o.get('off_off_ppd'),2)}, at {number((f['drives']+f['opponent_drives'])/2)} expected drives"
  if group=='baseline_defense':return f"{winner}'s adjusted defense allows {number(o.get('def_off_ppd'),2)} points per drive versus {loser}'s {number(f.get('def_off_ppd'),2)}"
  if group=='baseline':return f"{winner}'s adjusted attack scores {number(f.get('off_off_ppd'),2)} points per drive against {loser}'s {number(f.get('def_off_ppd'),2)} allowed; expected pace is {number((f['drives']+f['opponent_drives'])/2)} drives"
  if group=='elo':return f"{winner}'s pregame Elo is {number(f.get('elo_difference'),0)} points relative to {loser}"
  if group in ('rushing','passing','efficiency','explosiveness'):
   key={'rushing':'rush_epa','passing':'pass_epa','efficiency':'off_ppd','explosiveness':'explosive'}[group];unit='EPA per play' if key.endswith('epa') else ('points per drive' if key=='off_ppd' else 'explosive-play share')
   return f"{winner} attack {number(f.get('off_'+key),3)} versus {loser} defense {number(f.get('def_'+key),3)} {unit}; reverse matchup {number(o.get('off_'+key),3)} versus {number(o.get('def_'+key),3)}"
  if group=='venue':return f"{'Neutral venue' if f.get('neutral') else code(rows['home']['team'])+' has home field'}; {'division' if f.get('divisional') else 'non-division'} matchup"
  if group=='pace':return f"{winner} averages {number(f.get('drives'))} drives and {number(f.get('plays_per_drive'))} plays per drive; {loser} averages {number(o.get('drives'))} drives"
  if group=='rest_travel':return f"{winner} has {number(f.get('rest_days'),0)} days rest and {number(f.get('travel_miles'),0)} travel miles; {loser} has {number(o.get('rest_days'),0)} days and {number(o.get('travel_miles'),0)} miles"
  if group=='calibration':return 'The retained scoring correction adjusts the per-drive estimates'
  names=GROUPS.get(group,[]);details=[]
  for name in names[:2]:
   label=name.replace('_',' ');details.append(f"{label}: {winner} {number(f.get(name),3)}, {loser} {number(o.get(name),3)}")
  return '; '.join(details)
 def sentence(group,points):
  verb='supports' if points>0 else 'reduces';return f"{evidence(group)}. {LABELS[group]} {verb} {winner}'s projected margin by {abs(points):.1f} points."
 positive=sorted(((g,p) for g,p in values.items() if p>=.05),key=lambda x:(-x[1],x[0]));negative=sorted(((g,p) for g,p in values.items() if p<=-.05),key=lambda x:(x[1],x[0]));support=positive[:3]
 return {'lines':[sentence(g,p) for g,p in support],'against':'Against: '+(sentence(*negative[0]) if negative else 'No retained measured contribution opposes this direction by at least 0.1 displayed point.'),'support':[{'group':g,'margin_points':p} for g,p in support],'counterevidence':{'group':negative[0][0],'margin_points':negative[0][1]} if negative else None,'basis':'Additive fitted contributions, not independent causal effects.'}

def make_card(game,rows,artifact,shapes,issued_at,forecast=None,entry=None,evidence='AS_ISSUED',calculation=None):
 projection,terms=(calculation['projection'],calculation['contributions']) if calculation is not None else project(rows,artifact,shapes,forecast);home,away=code(game['home_team']),code(game['away_team']);ours=summarize(float(entry['away_points']),float(entry['home_points']),shapes) if entry else None;current=ours or projection;winner=home if current['home_win_probability']>=.5 else away
 score_leader=home if current['margin']>0 else away if current['margin']<0 else None
 conflict=score_leader is not None and score_leader!=winner
 note=f'Projected scores favor {score_leader}; the historical residual distribution favors {winner}. The score and winner directions disagree.' if conflict else None
 return {'probability_semantics':'P(win) plus half P(tie)', 'score_probability_note':note,'score_probability_conflict':conflict,'personnel':{side:rows[side].get('personnel') for side in ['home','away']},'game_id':game['game_id'],'season':int(game['season']),'week':int(game['week']),'home':home,'away':away,'kickoff_at':game['kickoff_at'],'cutoff_at':game['cutoff_at'],'version':artifact['version'],'issued_at':issued_at,'freeze_time':None,'status':'UPCOMING','evidence':evidence,'projection':projection,'ours':ours,'display':current,'source':'OURS' if ours else 'PROJECTION','winner':winner,'winner_probability':max(current['home_win_probability'],current['away_win_probability']),'coin_flip':current['home_win_probability']==.5,'contributions':terms,'why':calculation['why'] if calculation is not None else why(terms,rows,projection,artifact['fit']),'forecast':forecast,'entry':entry,'grades':None}
