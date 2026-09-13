"""Pure, reproducible season diagnostics. Errors always mean actual minus predicted."""
import math, statistics
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
 out['home_bias']=statistics.mean(c['grades']['PROJECTION']['errors']['home_points'] for c in graded) if graded else None
 out['total_bias']=statistics.mean(c['grades']['PROJECTION']['errors']['total'] for c in graded) if graded else None
 favorites=defaultdict(list)
 for c in graded:
  p=c['projection'];side='home' if p['margin']>0 else 'away' if p['margin']<0 else None
  if side:favorites[band(abs(p['margin']),[3,7,14])].append(c['grades']['PROJECTION']['errors'][side+'_points'])
 for key in [band(x,[3,7,14]) for x in [0,3,7,14]]:out['favorite_bias_'+key]=statistics.mean(favorites[key]) if favorites[key] else None
 return out

def diagnostics(cards):
 groups=defaultdict(list);teams=defaultdict(list);worst=[]
 for c in cards:
  if not c.get('grades') or 'PROJECTION' not in c['grades']:continue
  err=c['grades']['PROJECTION']['errors'];loss=(abs(err['home_points'])+abs(err['away_points']))/2
  worst.append({'game_id':c['game_id'],'week':c['week'],'version':c['version'],'team_mae':loss,'projection':c['projection'],'actual':c['grades']['PROJECTION']['actual'],'contributions':c.get('contributions',{})})
  for side in ['home','away']:
   e=err[side+'_points'];team=c[side];teams[team].append((c['week'],e,c['game_id']));groups[('team',team)].append(e)
   f=c.get('learning_features',{}).get(side,{}).get('features')
   # Original contribution values are safe even when a full issued snapshot is unavailable.
   if f is None:f={t['input']:t.get('value') for t in c.get('contributions',{}).get(side,[])}
   for name,edges in BANDS.items():groups[(name,band(f.get(name),edges))].append(e)
   for name in ['divisional','dome']:
    v=f.get(name);groups[(name,'unavailable' if v is None else str(bool(v)).lower())].append(e)
   groups[('projected_margin',band(abs(c['projection']['margin']),[3,7,14]))].append(e)
 streaks=[]
 for team,values in sorted(teams.items()):
  last=sorted(values)[-3:]
  if len(last)==3 and last[1][0]==last[0][0]+1 and last[2][0]==last[1][0]+1 and (all(e>0 for _,e,_ in last) or all(e<0 for _,e,_ in last)):
   streaks.append({'team':team,'direction':'underprojected' if last[0][1]>0 else 'overprojected','weeks':[w for w,_,_ in last],'errors':[e for _,e,_ in last],'games':[g for _,_,g in last]})
 return {'buckets':[{'input':k[0],'band':k[1],**bucket(v)} for k,v in sorted(groups.items())],'worst_games':sorted(worst,key=lambda x:(-x['team_mae'],x['game_id']))[:10],'team_streaks':streaks}

def edit_learning(edits,cards):
 from datetime import datetime
 by={c['game_id']:c for c in cards};latest={};excluded=defaultdict(int)
 for e in edits:
  c=by.get(e.get('game_id'))
  if not c or not c.get('grades'):excluded['ungraded']+=1;continue
  if e.get('post_lock') or not e.get('entered_at') or datetime.fromisoformat(e['entered_at'].replace('Z','+00:00'))>=datetime.fromisoformat(c['cutoff_at'].replace('Z','+00:00')):excluded['post_lock']+=1;continue
  if not e.get('projection') or e.get('evidence')!='AS_ISSUED':excluded['missing_issued_snapshot_or_retrospective']+=1;continue
  if e['game_id'] not in latest or e['entered_at']>=latest[e['game_id']]['entered_at']:latest[e['game_id']]=e
 rows=[];tags=defaultdict(list)
 for gid,e in sorted(latest.items()):
  c=by[gid];p=e['projection'];a=c['grades']['PROJECTION']['actual'];ours={'home_points':e['home_points'],'away_points':e['away_points'],'margin':e['home_points']-e['away_points'],'total':e['home_points']+e['away_points']}
  projection_mae=sum(abs(a[k]-p[k]) for k in ['home_points','away_points'])/2;ours_mae=sum(abs(a[k]-ours[k]) for k in ['home_points','away_points'])/2
  row={'game_id':gid,'week':c['week'],'edit_id':e.get('edit_id'),'version':e.get('version'),'projection':p,'ours':ours,'actual':a,'projection_mae':projection_mae,'ours_mae':ours_mae,'helped':ours_mae<projection_mae,'mae_improvement':projection_mae-ours_mae,'tags':sorted(set(t.strip().lower() for t in e.get('tags',[]) if t.strip()))};rows.append(row)
  for tag in row['tags']:
   for target in ['home_points','away_points','margin','total']:tags[(tag,target)].append({'game_id':gid,'correction':ours[target]-p[target],'helped':abs(a[target]-ours[target])<abs(a[target]-p[target])})
 evidence=[]
 for (tag,target),values in sorted(tags.items()):
  n=len(values);up=sum(v['correction']>0 for v in values);down=sum(v['correction']<0 for v in values);share=max(up,down)/n
  evidence.append({'tag':tag,'target':target,'count':n,'up':up,'down':down,'unchanged':n-up-down,'direction':'up' if up>down else 'down' if down>up else 'mixed','direction_share':share,'helped_count':sum(v['helped'] for v in values),'candidate':n>=20 and share>=.7,'games':values})
 weekly=[]
 for w in [None]+sorted({r['week'] for r in rows}):
  rr=[r for r in rows if w is None or r['week']==w];weekly.append({'week':w,'count':len(rr),'projection_mae':statistics.mean(r['projection_mae'] for r in rr) if rr else None,'ours_mae':statistics.mean(r['ours_mae'] for r in rr) if rr else None,'helped_count':sum(r['helped'] for r in rr)})
 return {'rows':rows,'weekly':weekly,'tags':evidence,'excluded':dict(excluded)}

def build_report(cards,reference,edits=()):
 result={'schema':'projection-trend-v1','season':2026,'reference':reference,'definitions':{'error':'actual minus projected','sigma':'sample standard deviation','coverage':'original issued margin/total intervals','reference':'2016–2025 adaptive OOF; coverage excludes 2016 (no prior residuals)','flags':'abs(mean error) > 2 sample standard errors; exploratory, not multiplicity-adjusted'},'populations':{}}
 for evidence in ['AS_ISSUED','RETROSPECTIVE']:
  allcards=[c for c in cards if c.get('evidence')==evidence];graded=[c for c in allcards if c.get('grades')];weeks=sorted({c['week'] for c in allcards});tables=[]
  for week in weeks:
   for scope in ['week','cumulative']:
    cc=[c for c in graded if c['week']==week or scope=='cumulative' and c['week']<=week]
    tables.append({'week':week,'scope':scope,**metrics(cc)})
  result['populations'][evidence]={'graded':len(graded),'pending':sum(not c.get('grades') for c in allcards),'tables':tables,'diagnostics':diagnostics(graded),'weekly_diagnostics':{str(w):diagnostics([c for c in graded if c['week']==w]) for w in weeks}}
 result['learning']=edit_learning(edits,cards)
 return result

def markdown(report):
 lines=['# Season error trend','',report['definitions']['error']+'. '+report['definitions']['reference']+'.','']
 for label,p in report['populations'].items():
  lines += ['## '+label,f"{p['graded']} graded games; {p['pending']} pending.",'']
  tables=p['tables']
  if tables:
   keys=list(tables[0]);lines+=['| '+' | '.join(keys)+' |','|'+'|'.join(['---']*len(keys))+'|']
   for row in tables:lines.append('| '+' | '.join('—' if row[k] is None else str(row[k]) for k in keys)+' |')
  lines+=['','### Diagnostic buckets','| Input | Band | Count | Mean error | Standard error | Flag |','|---|---|---|---|---|---|']
  for b in p['diagnostics']['buckets']:lines.append('| '+' | '.join(str(b[k]) for k in ['input','band','count','mean_signed_error','standard_error','flag'])+' |')
  lines+=['','### Ten largest game errors']
  for g in p['diagnostics']['worst_games']:
   lines += [f"\n{g['game_id']} · {g['version']} · team MAE {g['team_mae']}",'| Side | Input | Value | Contribution |','|---|---|---|---|']
   for side,terms in g['contributions'].items():
    for t in terms:lines.append(f"| {side} | {t['input']} | {t.get('value')} | {t['points']} |")
  lines+=['','Three-week team streaks: '+str(p['diagnostics']['team_streaks']),'']
 lines+=['## Learning from edits','', '```json',__import__('json').dumps(report['learning'],indent=2),'```']
 return '\n'.join(lines)+'\n'
