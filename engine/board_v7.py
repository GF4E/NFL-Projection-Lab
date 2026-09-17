"""Read-only presentation evidence. Never writes a forecast, lock, grade or fit."""
import statistics
from collections import defaultdict
from engine.projection.distribution import pmf,quantile

def qualified(g):
 return bool(g.get('projection') and g.get('freeze_time') and g.get('evidence')=='AS_ISSUED' and g.get('status') in ('LOCKED','FINAL'))

def metadata(g,shapes):
 if not g.get('projection'):return {'qualified_lock':False,'teams':{}}
 roof=(g.get('forecast') or {}).get('roof') or g.get('learning_features',{}).get('home',{}).get('game',{}).get('roof')
 out={'outdoors':None if roof is None else str(roof).lower() in ('outdoors','open'),'qualified_lock':qualified(g),'distribution_hash':shapes['team_points']['sha256'],'interval_kind':'single-game predictive','spread_model':'constant_within_issuing_version','teams':{}}
 for side in ('away','home'):
  expected=g['projection'][side+'_points'];mass=pmf(shapes['team_points'],expected)
  bands={str(level):[quantile(mass,(1-level/100)/2),quantile(mass,1-(1-level/100)/2)] for level in (50,80)}
  actual=g.get('final',{}).get(side+'_points') if qualified(g) else None
  out['teams'][side]={'quantile_dots':[{'value':quantile(mass,(i+.5)/10),'mass':.1,'probability_lo':i/10,'probability_hi':(i+1)/10} for i in range(10)],'expected':expected,'actual':actual,'intervals':bands,'error':None if actual is None else actual-expected,'hits':{k:None if actual is None else lo<=actual<=hi for k,(lo,hi) in bands.items()},'pit':None if actual is None else sum(p for x,p in mass.items() if x<actual)+sum(p for x,p in mass.items() if x==actual)/2}
 return out

def summary(games,meta,source='PROJECTION'):
 rows=[];hits={t:{l:[] for l in ('50','80')} for t in ('margin','total')};teamhits=[];pit=[0]*10
 for g in games:
  if not meta[g['game_id']]['qualified_lock'] or not g.get('final'):continue
  pred=g.get('projection' if source=='PROJECTION' else 'ours')
  if not pred:continue
  actual=g['final']; errors=[actual[s+'_points']-pred[s+'_points'] for s in ('away','home')];rows+=errors
  vals={'margin':actual['home_points']-actual['away_points'],'total':actual['home_points']+actual['away_points']}
  for t in hits:
   for l in hits[t]:
    band=pred.get('intervals',{}).get(t,{}).get(l)
    if band:hits[t][l].append(band[0]<=vals[t]<=band[1])
  if source=='PROJECTION':
   for team in meta[g['game_id']]['teams'].values():
    teamhits.append(team['hits']['80']);pit[min(9,int(team['pit']*10))]+=1
 return {'teams':len(rows),'mae':statistics.mean(map(abs,rows)) if rows else None,'inside80':sum(teamhits),'eligible80':len(teamhits),'coverage':{t:{l:{'hit':sum(v),'n':len(v),'rate':statistics.mean(v) if v else None} for l,v in levels.items()} for t,levels in hits.items()},'pit':pit}

def build(board,shape_loader,historical,climatology_training=()):
 games=board['games'];meta={g['game_id']:metadata(g,shape_loader(g)) if g.get('projection') else {'qualified_lock':False,'teams':{}} for g in games}
 weeks=[]
 for week in sorted({g['week'] for g in games}):
  for scope in ('week','cumulative'):
   subset=[g for g in games if g['week']==week or scope=='cumulative' and g['week']<=week]
   weeks.append({'week':week,'scope':scope,'engine':summary(subset,meta),'ours':summary(subset,meta,'OURS')})
 ranked=[]
 for g in games:
  if not meta[g['game_id']]['qualified_lock'] or not g.get('final'):continue
  for side,t in meta[g['game_id']]['teams'].items():ranked.append({'game_id':g['game_id'],'team':g[side],'expected':t['expected'],'actual':t['actual'],'error':t['error'],'contributions':g.get('contributions',{}).get(side,[])})
 ranked.sort(key=lambda x:(abs(x['error']),x['game_id'],x['team']))
 historical_weeks=defaultdict(list)
 for r in historical:
  historical_weeks[(r['season'],r['week'])].extend([abs(r['actual_home']-r['home']),abs(r['actual_away']-r['away'])])
 prior=[{'season':s,'week':w,'mae':statistics.mean(v)} for (s,w),v in sorted(historical_weeks.items()) if board['games'][0]['season']-5<=s<board['games'][0]['season']]
 allerrors=[v for values in historical_weeks.values() for v in values]
 # Expanding earlier-season league mean is the climatology reference, never all-history future data.
 baseline=[]
 means={season:statistics.mean([p['actual_points'] for p in climatology_training if p['season']<season and p.get('actual_points') is not None]) for season in {r['season'] for r in historical} if any(p['season']<season and p.get('actual_points') is not None for p in climatology_training)}
 for r in historical:
  if r['season'] in means:baseline.extend(abs(r[k]-means[r['season']]) for k in ('actual_home','actual_away'))

 return {'schema':'board-v7-evidence','board_sha256':board['content_sha256'],'published_at':board['published_at'],'games':meta,'trust':summary(games,meta),'weeks':weeks,'closest':ranked[:5],'furthest':list(reversed(ranked[-5:])),'prior_seasons':prior,'reference':{'oof_mae':statistics.mean(allerrors) if allerrors else None,'climatology_mae':statistics.mean(baseline) if baseline else None,'floor':None,'floor_status':'Uncomputed — governed E4 experiment'},'edits':{'engine':summary([g for g in games if g.get('ours')],meta),'ours':summary(games,meta,'OURS'),'best_tags':[],'worst_tags':[]}}
