"""Pure, reproducible season diagnostics. Errors always mean actual minus predicted."""
import datetime as dt
import json
import math, statistics
import re
from collections import defaultdict
from engine.projection.grade import score

BANDS={'momentum':[-.5,.5],'luck_index':[-.5,.5],'rest_days':[6,8,14],'wind':[10,20],'elo_difference':[-100,0,100]}

def band(value, edges):
 if value is None:return 'unavailable'
 lower='-inf'
 for edge in edges:
  if value<edge:return f'[{lower},{edge})'
  lower=str(edge)
 return f'[{lower},inf)'

def bucket(errors):
 n=len(errors);mean=statistics.mean(errors) if n else None;se=statistics.stdev(errors)/math.sqrt(n) if n>1 else None
 return {'count':n,'mean_signed_error':mean,'standard_error':se,'flag':se is not None and abs(mean)>2*se}

def metrics(cards):
 graded=[c for c in cards if c.get('grades',{} ) and c['grades'].get('PROJECTION')]
 result=score([c['grades']['PROJECTION'] for c in graded]);out={'games':result['n']}
 for target in ['team_points','margin','total']:
  m=(result['metrics'] or {}).get(target,{})
  for field in ['mae','sigma']:out[target+'_'+field]=m.get(field)
  for level in ['50','80']:
   if target!='team_points':out[target+'_coverage_'+level]=m.get('coverage',{}).get(level,{}).get('rate')
 predicted=[c['projection'][side+'_points'] for c in graded for side in ['home','away']]
 actual=[c['grades']['PROJECTION']['actual'][side+'_points'] for c in graded for side in ['home','away']]
 out['projected_team_points_sd']=statistics.pstdev(predicted) if predicted else None
 out['actual_team_points_sd']=statistics.pstdev(actual) if actual else None
 out['home_bias']=statistics.mean(c['grades']['PROJECTION']['errors']['home_points'] for c in graded) if graded else None
 out['total_bias']=statistics.mean(c['grades']['PROJECTION']['errors']['total'] for c in graded) if graded else None
 favorites=defaultdict(list)
 for c in graded:
  p=c['projection'];side='home' if p['margin']>0 else 'away' if p['margin']<0 else None
  if side:favorites[band(abs(p['margin']),[3,7,14])].append(c['grades']['PROJECTION']['errors'][side+'_points'])
 for key in [band(x,[3,7,14]) for x in [0,3,7,14]]:out['favorite_bias_'+key]=statistics.mean(favorites[key]) if favorites[key] else None
 return out

def instant(value):
 if not isinstance(value,str):raise ValueError('Timezone-qualified timestamp required')
 result=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
 if result.tzinfo is None:raise ValueError('Timezone-qualified timestamp required')
 return result.astimezone(dt.timezone.utc)

def number(value):
 return not isinstance(value,bool) and isinstance(value,(int,float)) and math.isfinite(value)

def qualified_features(card,side):
 row=(card.get('learning_features') or {}).get(side,{})
 terms={t['input']:t for t in card.get('contributions',{}).get(side,[])}
 values={};sources={}
 for name in list(BANDS)+['divisional','dome']:
  value=None;source='INSUFFICIENT'
  if name in row.get('features',{}):
   meta=row.get('metadata',{}).get(name,{})
   if meta.get('status')=='ACTIVE':value=row['features'][name];source='ORIGINAL_ACTIVE_FIELD'
  elif terms.get(name,{}).get('status')=='ACTIVE':
   value=terms[name].get('value');source='ORIGINAL_ACTIVE_CONTRIBUTION'
  if name=='dome':
   roof=str(row.get('game',{}).get('roof') or '').lower()
   if roof in ('dome','closed','outdoors','open'):
    value=int(roof in ('dome','closed'));source='ORIGINAL_EXPLICIT_ROOF'
   else:value=None;source='INSUFFICIENT'
  if name=='wind':
   # A numerical placeholder in an inactive core field is not forecast weather.
   value=None;source='INSUFFICIENT';forecast=card.get('forecast') or {}
   try:
    qualified=(forecast.get('status')=='FORECAST' and
      re.fullmatch('[0-9a-f]{64}',str(forecast.get('source_sha256',''))) and
      instant(forecast.get('forecast_issued_at'))<=instant(forecast.get('received_at'))<instant(card.get('cutoff_at')))
   except (ValueError,TypeError):qualified=False
   if qualified and number(forecast.get('wind_mph')) and forecast['wind_mph']>=0:
    value=forecast['wind_mph'];source='ORIGINAL_PRELOCK_FORECAST'
  if name in ('divisional','dome') and isinstance(value,bool):value=int(value)
  if not number(value) or (name in ('divisional','dome') and value not in (0,1)):
   value=None;source='INSUFFICIENT'
  values[name]=value;sources[name]=source
 return values,sources

def paired_bucket(rows,*,qualified=True):
 n=len(rows);groups=defaultdict(list)
 for gid,error in rows:groups[gid].append(error)
 mean=math.fsum(error for _,error in rows)/n if n else None;g=len(groups);se=None
 if g>1:
  # CR1 cluster variance of the team-observation mean; paired teams stay together.
  se=math.sqrt(g/(g-1)*math.fsum(math.fsum(e-mean for e in errors)**2 for errors in groups.values())/(n*n))
 return {'count':n,'games':g,'mean_signed_error':mean,'standard_error':se,
         'flag':bool(qualified and se is not None and abs(mean)>2*se),
         'status':'DESCRIPTIVE' if qualified and g>1 else 'INSUFFICIENT',
         'needs':None if qualified and g>1 else 'Qualified original input' if not qualified else 'At least two distinct graded games'}

def diagnostics(cards):
 groups=defaultdict(list);teams=defaultdict(list);worst=[];coverage=defaultdict(lambda:defaultdict(int))
 for c in sorted(cards,key=lambda x:(x.get('season',0),x['week'],x['game_id'])):
  if not c.get('grades') or 'PROJECTION' not in c['grades']:continue
  err=c['grades']['PROJECTION']['errors'];loss=(abs(err['home_points'])+abs(err['away_points']))/2
  worst.append({'game_id':c['game_id'],'season':c['season'],'week':c['week'],'version':c['version'],'team_mae':loss,'projection':c['projection'],'actual':c['grades']['PROJECTION']['actual'],'contributions':c.get('contributions',{})})
  for side in ['home','away']:
   e=err[side+'_points'];team=c[side];teams[(c['season'],team)].append((c['week'],e,c['game_id']));groups[('team',team)].append((c['game_id'],e))
   f,sources=qualified_features(c,side)
   for name,source in sources.items():coverage[name][source]+=1
   for name,edges in BANDS.items():groups[(name,band(f[name],edges))].append((c['game_id'],e))
   for name in ['divisional','dome']:
    value=f[name];groups[(name,'unavailable' if value is None else str(bool(value)).lower())].append((c['game_id'],e))
   groups[('projected_margin',band(abs(c['projection']['margin']),[3,7,14]))].append((c['game_id'],e))
 streaks=[]
 for (season,team),values in sorted(teams.items()):
  weeks=defaultdict(list)
  for w,e,gid in values:weeks[w].append((e,gid))
  last=sorted(weeks)[-3:];errors=[e for w in last for e,_ in weeks[w]]
  if len(last)==3 and last==list(range(last[0],last[0]+3)) and (all(e>0 for e in errors) or all(e<0 for e in errors)):
   streaks.append({'team':team,'season':season,'direction':'underprojected' if errors[0]>0 else 'overprojected','weeks':last,'errors':errors,'games':[gid for w in last for _,gid in weeks[w]]})
 return {'buckets':[{'input':k[0],'band':k[1],**paired_bucket(v,qualified=k[1]!='unavailable')} for k,v in sorted(groups.items())],
         'input_coverage':{name:dict(sorted(counts.items())) for name,counts in sorted(coverage.items())},
         'worst_games':sorted(worst,key=lambda x:(-x['team_mae'],x['game_id']))[:10],'team_streaks':streaks,
         'definitions':{'standard_error':'Game-cluster CR1 standard error of the team-observation mean; exploratory, not multiplicity-adjusted',
           'input_qualification':'Original active field/contribution or timestamped pre-lock forecast; unknown roof/inactive placeholders remain unavailable. Original snapshot does not prove every historical source vintage.',
           'streak':'Same nonzero direction in every graded game across three consecutive labeled weeks within one season; no cross-season streak'}}

def edit_learning(edits,cards):
 by={c['game_id']:c for c in cards};latest={};excluded=defaultdict(int);candidates=defaultdict(list)
 for e in edits:
  c=by.get(e.get('game_id'))
  if not c or not (c.get('grades') or {}).get('PROJECTION'):excluded['ungraded']+=1;continue
  if e.get('post_lock'):excluded['post_lock']+=1;continue
  try:
   stamp=instant(e.get('entered_at'));cutoff=instant(c.get('cutoff_at'))
   stored=instant(e['stored_at']) if e.get('stored_at') else stamp
  except (ValueError,TypeError):excluded['unqualified_time']+=1;continue
  if stamp>=cutoff or stored>=cutoff:excluded['post_lock']+=1;continue
  if stored<stamp:excluded['unqualified_time']+=1;continue
  p=e.get('projection')
  if not p or e.get('evidence')!='AS_ISSUED' or c.get('evidence')!='AS_ISSUED':excluded['missing_issued_snapshot_or_retrospective']+=1;continue
  if (not all(number(e.get(k)) and e[k]>=0 for k in ('home_points','away_points')) or
      not all(number(p.get(k)) for k in ('home_points','away_points','margin','total')) or
      abs(p['margin']-(p['home_points']-p['away_points']))>1e-10 or abs(p['total']-(p['home_points']+p['away_points']))>1e-10 or
      not isinstance(e.get('tags',[]),list) or any(not isinstance(t,str) for t in e.get('tags',[]))):
   excluded['invalid_scores_or_tags']+=1;continue
  candidates[e['game_id']].append((stamp,e))
 for gid,values in sorted(candidates.items()):
  stamp=max(t for t,_ in values);tied=[e for t,e in values if t==stamp]
  # Canonicalize equivalent clock spellings; never break conflicting ties by row order.
  unique={json.dumps({**e,'entered_at':stamp.isoformat(),'stored_at':instant(e.get('stored_at') or e['entered_at']).isoformat()},sort_keys=True,allow_nan=False):e for e in tied}
  if len(unique)>1:excluded['ambiguous_latest_revision']+=1;continue
  latest[gid]=json.loads(next(iter(unique)))
 rows=[];tags=defaultdict(list)
 for gid,e in sorted(latest.items()):
  c=by[gid];p=e['projection'];a=c['grades']['PROJECTION']['actual'];ours={'home_points':e['home_points'],'away_points':e['away_points'],'margin':e['home_points']-e['away_points'],'total':e['home_points']+e['away_points']}
  projection_mae=sum(abs(a[k]-p[k]) for k in ['home_points','away_points'])/2;ours_mae=sum(abs(a[k]-ours[k]) for k in ['home_points','away_points'])/2
  row={'game_id':gid,'week':c['week'],'edit_id':e.get('edit_id'),'version':e.get('version'),'entered_at':e['entered_at'],'stored_at':e['stored_at'],'projection':p,'ours':ours,'actual':a,'projection_mae':projection_mae,'ours_mae':ours_mae,'helped':ours_mae<projection_mae,'mae_improvement':projection_mae-ours_mae,'tags':sorted(set(t.strip().lower() for t in e.get('tags',[]) if t.strip()))};rows.append(row)
  for tag in row['tags']:
   for target in ['home_points','away_points','margin','total']:tags[(tag,target)].append({'game_id':gid,'correction':ours[target]-p[target],'helped':abs(a[target]-ours[target])<abs(a[target]-p[target])})
 evidence=[]
 for (tag,target),values in sorted(tags.items()):
  n=len(values);up=sum(v['correction']>0 for v in values);down=sum(v['correction']<0 for v in values);share=max(up,down)/n
  evidence.append({'tag':tag,'target':target,'count':n,'up':up,'down':down,'unchanged':n-up-down,'direction':'up' if up>down else 'down' if down>up else 'mixed','direction_share':share,'helped_count':sum(v['helped'] for v in values),'candidate':n>=20 and share>=.7,'games':values})
 weekly=[]
 for w in [None]+sorted({r['week'] for r in rows}):
  rr=[r for r in rows if w is None or r['week']==w];weekly.append({'week':w,'count':len(rr),'projection_mae':statistics.mean(r['projection_mae'] for r in rr) if rr else None,'ours_mae':statistics.mean(r['ours_mae'] for r in rr) if rr else None,'helped_count':sum(r['helped'] for r in rr)})
 return {'rows':rows,'weekly':weekly,'tags':evidence,'excluded':dict(sorted(excluded.items())),'definitions':{'selection':'Last unambiguous timezone-qualified pre-lock revision per game; identical duplicates count once; optional stored_at must also precede lock','snapshot':'Projection as seen at the edit, ours as recorded, actual from immutable first grade; no current-fit substitution','candidate':'Descriptive investigation flag only; no automatic fitting, registration or promotion'}}

def build_report(cards,reference,edits=()):
 columns=['week','scope','games','team_points_mae','margin_mae','total_mae','team_points_sigma','margin_sigma','total_sigma','margin_coverage_50','margin_coverage_80','total_coverage_50','total_coverage_80','home_bias','total_bias','projected_team_points_sd','actual_team_points_sd']+[k for k in metrics([]) if k.startswith('favorite_bias_')]
 result={'columns':columns,'schema':'projection-trend-v1','season':2026,'reference':reference,'definitions':{'error':'actual minus projected','sigma':'sample standard deviation','coverage':'original issued margin/total intervals','reference':'2016–2025 adaptive OOF; coverage excludes 2016 (no prior residuals)','compression':'population standard deviation of projected and actual team points on identical graded games; reporting only','flags':'abs(mean error) > 2 game-cluster standard errors; at least two games and qualified input; exploratory, not multiplicity-adjusted'},'populations':{}}
 for evidence in ['AS_ISSUED','RETROSPECTIVE']:
  allcards=[c for c in cards if c.get('evidence')==evidence];graded=[c for c in allcards if c.get('grades')];weeks=sorted({c['week'] for c in allcards});tables=[]
  for week in weeks:
   for scope in ['week','cumulative']:
    cc=[c for c in graded if c['week']==week or scope=='cumulative' and c['week']<=week]
    tables.append({'week':week,'scope':scope,**metrics(cc)})
  result['populations'][evidence]={'graded':len(graded),'pending':sum(not c.get('grades') and not c.get('_diagnostic_shortfall') for c in allcards),'unverified_final':sum(bool(c.get('_diagnostic_shortfall')) for c in allcards),'tables':tables,'diagnostics':diagnostics(graded),'weekly_diagnostics':{str(w):diagnostics([c for c in graded if c['week']==w]) for w in weeks}}
 result['learning']=edit_learning(edits,cards)
 result['review_requested']=[
  'Tier 2: bucket standard errors cluster both teams by game; alternative independent-team standard errors ignore within-game dependence. Flags remain exploratory, not gates.',
  'Tier 2: conflicting latest edits at the same instant are excluded as ambiguous; alternative server sequence numbers are unavailable. No input-order tie-break or older-edit fallback.']
 return result

def markdown(report):
 lines=['# Season error trend','',report['definitions']['error']+'. '+report['definitions']['reference']+'.','']
 lines += ['REVIEW REQUESTED — '+item for item in report.get('review_requested',[])]+['']
 for label,p in report['populations'].items():
  lines += ['## '+label,f"{p['graded']} graded games; {p['pending']} pending; {p.get('unverified_final',0)} final cards need immutable first grades.",'']
  tables=p['tables']
  if tables:
   keys=report['columns'];lines+=['| '+' | '.join(keys)+' |','|'+'|'.join(['---']*len(keys))+'|']
   for row in tables:lines.append('| '+' | '.join('—' if row[k] is None else str(row[k]) for k in keys)+' |')
  lines+=['','### Diagnostic buckets','| Input | Band | Team observations | Games | Mean error | Game-cluster standard error | Flag |','|---|---|---|---|---|---|---|']
  for b in p['diagnostics']['buckets']:lines.append('| '+' | '.join(str(b[k]) for k in ['input','band','count','games','mean_signed_error','standard_error','flag'])+' |')
  lines+=['','Input coverage: '+str(p['diagnostics']['input_coverage']),'Flags require two distinct games and qualified input; exploratory and not multiplicity-adjusted.','','### Ten largest game errors']
  for g in p['diagnostics']['worst_games']:
   lines += [f"\n{g['game_id']} · {g['version']} · team MAE {g['team_mae']}",'| Side | Input | Value | Contribution |','|---|---|---|---|']
   for side,terms in g['contributions'].items():
    for t in terms:lines.append(f"| {side} | {t['input']} | {t.get('value')} | {t['points']} |")
  lines+=['','Three-week team streaks: '+str(p['diagnostics']['team_streaks']),'']
 lines+=['## Learning from edits','', '```json',__import__('json').dumps(report['learning'],indent=2),'```']
 return '\n'.join(lines)+'\n'
