"""Render-ready football projections; no data acquisition or label access."""
import copy,math
from .model import Fit
from .distribution import summarize
from .grade import grade

ALIASES={'OAK':'LV','WSH':'WAS','LAR':'LA'}
def code(team):return ALIASES.get(team,team)
def project(rows,artifact,shapes,forecast=None):
 f=Fit(**artifact['fit']);out={};terms={}
 for side in ('away','home'):
  r=rows[side];prediction=f.predict(r['features']);contributions=prediction['contributions']
  for c in contributions:
   c.update(r['metadata'].get(c['input'],{'label':'Fitted scoring intercept','status':'ACTIVE','source_hashes':[]}))
   c['weight']=0. if c['status']=='INACTIVE' else (f.coefficients[f.names.index(c['input'])] if c['input'] in f.names else 1.)
   if c['input']=='wind' and forecast:
    c.update(value=forecast['wind_mph'],points=forecast['wind_mph']*artifact['wind_weight'],weight=artifact['wind_weight'],status='PARTIAL_HISTORY',label=f"{code(r['team'])} kickoff forecast wind",source_hashes=[forecast['source_sha256']])
  terms[side]=sorted(contributions,key=lambda c:(-abs(c['points']),c['input']));out[side]=math.fsum(c['points'] for c in contributions)
 p=summarize(out['away'],out['home'],shapes)
 return p,terms

def why(terms,home,away,projection):
 direction=1 if projection['home_win_probability']>=.5 else -1;favored=home if direction==1 else away;bykey={}
 for side,sign in [('home',1),('away',-1)]:
  for c in terms[side]:
   if c['input']=='fitted_intercept' or c['status']=='INACTIVE':continue
   x=bykey.setdefault(c['input'],{'points':0.,'labels':[]});x['points']+=sign*direction*c['points'];x['labels'].append(c['label'])
 ranked=sorted(bykey.items(),key=lambda v:(-abs(v[1]['points']),v[0]));top=ranked[:3]
 def sentence(x):
  k,v=x;verb='adds' if v['points']>=0 else 'subtracts';label=' / '.join(v['labels']);return f"{label}: {verb} {abs(v['points']):.1f} points to {favored}'s expected margin."
 opposed=[x for x in ranked if x[1]['points']<0]
 return {'lines':[sentence(x) for x in top],'against':'Against: '+(sentence(opposed[0]) if opposed else 'No individual fitted term opposes this direction.')}

def make_card(game,rows,artifact,shapes,issued_at,forecast=None,entry=None,evidence='AS_ISSUED'):
 projection,terms=project(rows,artifact,shapes,forecast);home,away=code(game['home_team']),code(game['away_team'])
 current=copy.deepcopy(projection);ours=None
 if entry:
  ours=summarize(float(entry['away_points']),float(entry['home_points']),shapes);current=ours
 winner=home if current['home_win_probability']>=.5 else away
 return {'game_id':game['game_id'],'season':int(game['season']),'week':int(game['week']),'home':home,'away':away,'kickoff_at':game['kickoff_at'],'cutoff_at':game['cutoff_at'],'version':artifact['version'],'issued_at':issued_at,'freeze_time':None,'status':'UPCOMING','evidence':evidence,'projection':projection,'ours':ours,'display':current,'source':'OURS' if ours else 'PROJECTION','winner':winner,'winner_probability':max(current['home_win_probability'],current['away_win_probability']),'coin_flip':current['home_win_probability']==.5,'contributions':terms,'why':why(terms,home,away,projection),'forecast':forecast,'entry':entry,'grades':None}

def finish(card,away_points,home_points):
 card=copy.deepcopy(card);card['status']='FINAL';card['grades']={'PROJECTION':grade(card['projection'],away_points,home_points)}
 if card['ours']:card['grades']['OURS']=grade(card['ours'],away_points,home_points)
 card['final']={'away_points':away_points,'home_points':home_points,'margin':home_points-away_points,'total':home_points+away_points};return card
