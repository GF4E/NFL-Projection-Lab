"""Grade lock DTOs only; never opens pre-lock captures or quote ledgers."""
import csv,datetime,hashlib,json,math
from pathlib import Path
from engine.live_scorecard import csv_write
from engine.live_picks import overwrite
from engine.market_distribution import MarketDistribution
from engine.pricing import decimal_odds,american,cents
from engine.pick_store import put
FIELDS=['person','tag','population','week','phase','input_class','confidence','leans','graded','wins','losses','pushes','hit_rate','ci95_low','ci95_high','mean_clv_points','clv_n','brier_confidence','brier_number','confidence_status','conflicts','better_predictor']

def wilson(w,n):
 if not n:return None,None
 z=1.95996398454;p=w/n;d=1+z*z/n;c=(p+z*z/(2*n))/d;h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
 return c-h,c+h

def grade(lean,result):
 if result is None or lean.get('line') is None or not lean.get('side'):return None
 home=float(result['home_score']);away=float(result['away_score']);is_home=lean['side']==lean['home_team']
 value=(home-away if is_home else away-home)+lean['line'] if lean['market']=='spreads' else (home+away-lean['line'])*(1 if lean['side']=='Over' else -1)
 outcome='W' if value>0 else 'L' if value<0 else 'PUSH';win=1 if outcome=='W' else 0
 close=result.get('spread_line' if lean['market']=='spreads' else 'total_line');clv=None
 if close not in (None,''):
  close=float(close);clv=lean['line']-(-close if is_home else close) if lean['market']=='spreads' else (close-lean['line'])*(1 if lean['side']=='Over' else -1)
 return {**lean,'outcome':outcome,'clv_points':clv,'clv_reference':'nflverse_close','brier_confidence':None if outcome=='PUSH' else (lean['confidence_probability']-win)**2,'brier_number':None if outcome=='PUSH' else (lean['fair_probability']-win)**2,'final_score':{'home':home,'away':away},'result_hash':result['source_sha256']}

def summary(pool,eligible):
 graded=[r for r in pool if r.get('outcome')];w=sum(r['outcome']=='W' for r in graded);l=sum(r['outcome']=='L' for r in graded);push=sum(r['outcome']=='PUSH' for r in graded);lo,hi=wilson(w,w+l);clv=[r['clv_points'] for r in graded if r.get('clv_points') is not None]
 def avg(k):
  x=[r[k] for r in graded if r.get(k) is not None];return sum(x)/len(x) if x and eligible else None
 bc,bn=avg('brier_confidence'),avg('brier_number')
 return dict(leans=len(pool),graded=len(graded),wins=w,losses=l,pushes=push,hit_rate=w/(w+l) if w+l else None,ci95_low=lo,ci95_high=hi,mean_clv_points=sum(clv)/len(clv) if clv else None,clv_n=len(clv),brier_confidence=bc,brier_number=bn,confidence_status='VISIBLE' if eligible else 'BELOW_50_GRADED',conflicts=sum(bool(r.get('conflict')) for r in pool) if eligible else None,better_predictor=('confidence' if bc<bn else 'number' if bn<bc else 'tie') if bc is not None and bn is not None else None)

def scorecard(leans,config):
 rows=[];cal=[]
 for person in ('Gabe','Jarrett'):
  for population in ('REGULAR','POSTSEASON'):
   pool=[r for r in leans if r['person']==person and r['population']==population];eligible=sum(bool(r.get('outcome')) for r in pool)>=50
   for tag in ['ALL']+sorted({t for r in pool for t in r['tags']}):
    tp=[r for r in pool if tag=='ALL' or tag in r['tags']]
    for week in ['ALL']+sorted({r['week'] for r in tp}):
     for phase in ('ALL','EARLY','LATE'):
      for cls in ('ALL','PRE_OPEN','POST_OPEN'):
       part=[r for r in tp if (week=='ALL' or r['week']==week) and (phase=='ALL' or r['phase']==phase) and (cls=='ALL' or r['input_class']==cls)]
       if not part and (week,phase,cls)!=('ALL','ALL','ALL'):continue
       for level in ['ALL']+list(range(1,6)):
        pp=[r for r in part if level=='ALL' or r['confidence']==level];rows.append(dict(person=person,tag=tag,population=population,week=week,phase=phase,input_class=cls,confidence=level,**summary(pp,eligible)))
   if eligible:
    for level in range(1,6):
     g=[r for r in pool if r['confidence']==level and r.get('outcome') in ('W','L')];w=sum(r['outcome']=='W' for r in g);prior=config['people'][person]['provisional'][str(level)]
     cal.append({'person':person,'population':population,'level':level,'provisional':prior,'observed':w/len(g) if g else None,'n':len(g),'posterior':(20*prior+w)/(20+len(g)),'prior_weight':20})
 return rows,cal

def run(root,results,shape):
 root=Path(root);out=root/'outputs/iron-man-v1';all_leans=[]
 for path in (out/'locks').glob('*.json'):
  lock=json.loads(path.read_text())
  for i,lean in enumerate(lock.get('leans',[])):
   ident=hashlib.sha256((path.stem+'|'+str(i)).encode()).hexdigest();dest=out/'grades'/(ident+'.json')
   if dest.exists():g=json.loads(dest.read_text())
   else:
    g=grade(lean,results.get(lean['game_id']))
    if g:put(dest,g)
   all_leans.append(g or lean)
 csv_write(out/'pick_log.csv',all_leans,sorted({k for lean in all_leans for k in lean}) or ['game_id','person','market','source','phase','confidence','tags','line','book','price'])
 config=json.loads((root/'config/confidence_map.json').read_text());rows,cal=scorecard(all_leans,config);csv_write(out/'by-tag-scorecard.csv',rows,FIELDS)
 overwrite(out/'feedback.json',{'schema':'suit-feedback-v1','rows':rows,'calibration':cal,'schema_columns':FIELDS,'note':'Pushes are counted as graded leans but excluded from Brier and binary cover rate; populations never pooled; multi-tag rows overlap.'})
 return rows,cal
