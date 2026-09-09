"""Offline teaser, calibration and situational study on pinned sources."""
import argparse,json,itertools,statistics
from pathlib import Path
from collections import Counter,defaultdict
import numpy as np
from engine.harvest import ROOT,read,digest
from engine.qb_history import put,encoded
from engine.market_distribution import integer,Distribution,MarketDistribution,wong,load
from engine.harvest_comparison import shift
from engine.teaser import leg,ticket
B=ROOT/'work/teaser-calibration-situations-v1'
def stats(rows,family=1):
 w=sum(r['outcome']=='win' for r in rows);l=sum(r['outcome']=='loss' for r in rows);p=sum(r['outcome']=='push' for r in rows)
 boot=np.zeros((10000,2));rng=np.random.default_rng(20260909);groups=defaultdict(list)
 for r in rows:groups[int(r['season'])].append(r)
 for rs in groups.values():
  weeks=sorted({int(r['week']) for r in rs});v=np.zeros((len(weeks),2))
  for r in rs:
   if r['outcome']!='push':v[weeks.index(int(r['week'])),int(r['outcome']=='loss')]+=1
  boot+=v[rng.integers(0,len(weeks),size=(len(boot),len(weeks)))].sum(axis=1)
 den=boot.sum(axis=1);rate=np.divide(boot[:,0],den,out=np.full(len(boot),np.nan),where=den>0);q=np.nanquantile(rate,[.025,.975,.025/family,1-.025/family,.05/family]).tolist() if w+l else [None]*5
 return dict(n=len(rows),wins=w,losses=l,pushes=p,rate=w/(w+l) if w+l else None,lower95=q[0],upper95=q[1],bonferroni_lower=q[2],bonferroni_upper=q[3],one_sided_adjusted_lower=q[4])
def outcome(x):return 'win' if x>0 else 'loss' if x<0 else 'push'
def run(output):
 protocol=json.loads((B/'protocol.json').read_text())
 for p,s in protocol['inputs'].items():
  if digest(ROOT/p)!=s:raise ValueError('Input hash changed')
 source=json.loads((ROOT/'work/harvest-weather-v1/protocol.json').read_text());assert digest(ROOT/source['schedule'])==source['schedule_sha256']
 schedule=read(ROOT/source['schedule']);games=[r for r in schedule if r['game_type']=='REG' and 2015<=int(r['season'])<=2025 and r['home_score'] and r['away_score'] and r['spread_line'] and r['total_line']]
 ref=json.loads((ROOT/'work/market-distribution-v1/model.json').read_text());artifact=load(ref['path'],ref['sha256'])
 wm=json.loads((ROOT/'work/harvest-weather-v1/weather-manifest.json').read_text());assert digest(ROOT/wm['table'])==wm['sha256'];weather={r['game_id']:r for r in read(ROOT/wm['table'])}
 legs=[];calibration=[];situations=defaultdict(list);scheduled=defaultdict(set)
 for r in schedule:
  if r['game_type']=='REG':
   for team in (r['home_team'],r['away_team']):scheduled[int(r['season']),team].add(int(r['week']))
 for year in range(2015,2026):
  train=[r for r in games if int(r['season'])<year];current=[r for r in games if int(r['season'])==year]
  shapes={target:Counter(integer(float(g['home_score'])+sgn*float(g['away_score'])-float(g[field])) for g in train) for target,sgn,field in [('margin',-1,'spread_line'),('total',1,'total_line')]}
  cov=defaultdict(list);res=defaultdict(list)
  for g in current:
   margin=float(g['home_score'])-float(g['away_score']);total=float(g['home_score'])+float(g['away_score']);market=float(g['spread_line']);line=float(g['total_line']);week=int(g['week']);model=MarketDistribution(artifact,-market,line)
   for target,actual,center in [('margin',margin,market),('total',total,line)]:
    res[target].append(actual-center)
    for mode,dist in [('fitted_descriptive',getattr(model,target)),('rolling',Distribution(shift(shapes[target],center,target=='total')) if train else None)]:
     if dist:
      for level in (.5,.8,.95):
       lo,hi=dist.interval(level);cov[target,mode,level].append(lo<=actual<=hi)
   for home,handicap in [(True,-market),(False,market)]:
    if wong(handicap):
     p=leg(model,handicap,home);legs.append(dict(game_id=g['game_id'],season=year,week=week,home=home,line=handicap,outcome=outcome((margin if home else -margin)+handicap+6),model_win=p['win'],model_push=p['push'],model_loss=p['loss']))
   def add(name,condition,side=1):
    if condition:
     for target,value in [('Under',line-total),('ATS',(margin-market)*side)]:
      if target=='ATS' and side==0:continue
      situations[name,target].append(dict(game_id=g['game_id'],season=year,week=week,outcome=outcome(value),residual=value))
   w=weather.get(g['game_id']);add('temperature_under_35F',year>=2016 and w is not None and w['dome']=='0' and float(w['temperature_c'])*9/5+32<35)
   add('Thursday',g['weekday']=='Thursday')
   bye=[week>1 and week-1 not in scheduled[year,t] and any(k<week for k in scheduled[year,t]) for t in (g['home_team'],g['away_team'])]
   add('off_bye',any(bye),int(bye[0])-int(bye[1]))
  for target in ('margin','total'):
   row=dict(season=year,target=target,n=len(current),residual_sd=statistics.stdev(res[target]))
   for mode in ('fitted_descriptive','rolling'):
    for level in (.5,.8,.95):
     vals=cov[target,mode,level];c=sum(vals)/len(vals) if vals else None;row[f'{mode}_{int(level*100)}']=c;row[f'{mode}_{int(level*100)}_flag']=abs(c-level)>.03 if c is not None else None
   calibration.append(row)
 leg_seasons=[dict(season=y,**stats([r for r in legs if y=='ALL' or r['season']==y])) for y in ['ALL']+list(range(2015,2026))]
 groups=defaultdict(list)
 for l in legs:groups[l['season'],l['week']].append(l)
 tickets=[];prices=[]
 for k in (2,3):
  for (year,week),ls in groups.items():
   for combination in itertools.combinations(ls,k):
    if len({l['game_id'] for l in combination})<k:continue
    outcomes=[l['outcome'] for l in combination];o='loss' if 'loss' in outcomes else 'push' if 'push' in outcomes else 'win'
    ticketlegs=[dict(game_id=l['game_id'],win=l['model_win'],push=l['model_push'],loss=l['model_loss']) for l in combination]
    priced=ticket(ticketlegs,-120)
    tickets.append(dict(season=year,week=week,legs=k,game_ids='|'.join(l['game_id'] for l in combination),outcome=o,model_win=priced['win'],model_void=priced['void'],model_fair_probability=priced['fair_probability'],model_fair_american=priced['fair_american'],model_edge_cents_at_minus110=-110-priced['fair_american'] if priced['fair_american'] is not None else None,model_edge_cents_at_minus120=priced['price_edge_cents'],model_edge_cents_at_minus130=-130-priced['fair_american'] if priced['fair_american'] is not None else None,model_label='FITTED_DESCRIPTIVE_INDEPENDENCE_NOT_BACKTEST_FORECAST'))
  st=stats([r for r in tickets if r['legs']==k],6)
  for odds in (-110,-120,-130):
   be=-odds/(-odds+100);prices.append(dict(legs=k,odds=odds,break_even_ticket=be,break_even_leg_no_push_independent=be**(1/k),**st,point_estimate_clears=st['rate']>be,adjusted_clears=st['one_sided_adjusted_lower']>be))
 buckets=[]
 for (name,target),rs in sorted(situations.items()):
  st=stats(rs,6);buckets.append(dict(bucket=name,target=target,**st,mean_residual_toward_side=statistics.mean(r['residual'] for r in rs),mean_total_residual=-statistics.mean(r['residual'] for r in rs) if target=='Under' else None,break_even=110/210,clears=st['bonferroni_lower']>110/210,evidence='OBSERVED_WEATHER_NOT_T60' if name.startswith('temperature') else 'RECONSTRUCTED_MARKET_LINES_NOT_T60'))
 result=dict(experiment_id='teaser-calibration-situations-v1',protocol_sha256=digest(B/'protocol.json'),leg_seasons=leg_seasons,teaser_prices=prices,calibration=calibration,situations=buckets,credits_spent=0,promotion=False,live_model_unchanged=True)
 output=Path(output)
 for name,data in [('teaser-legs',legs),('teaser-tickets',tickets),('leg-seasons',leg_seasons),('teaser-prices',prices),('calibration',calibration),('situations',buckets)]:put(output/f'{name}.csv',encoded(data))
 put(output/'experiment.json',(json.dumps(result,indent=2,sort_keys=True)+'\n').encode());return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();r=run(a.output);print(json.dumps({'situations':r['situations'],'prices':r['teaser_prices']},indent=2))
