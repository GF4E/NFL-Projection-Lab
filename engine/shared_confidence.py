"""Shared, prospective confidence calibration. Frozen beliefs are never rewritten."""
import csv,datetime as dt,hashlib,json
from pathlib import Path
from engine.pick_store import put
from engine.live_picks import overwrite
from engine.pricing import decimal_odds
ROOT=Path(__file__).resolve().parents[1]
def read_config(root=ROOT):return json.loads((Path(root)/'config/confidence_map.json').read_text())
def active_map(root,at):
 config=read_config(root);versions=[json.loads(p.read_text()) for p in (Path(root)/'outputs/game-card-v3/confidence-maps').glob('*.json')]
 valid=[v for v in versions if v['effective_at']<=at]
 return max(valid,key=lambda v:v['effective_at']) if valid else config

def beliefs(card,root=ROOT):
 """Freeze both probabilities; map-derived display withheld below threshold."""
 if not card.get('ours'):return
 config=active_map(root,card.get('generated_at',card['kickoff_utc']));mapping=config.get('values',config['provisional']);records=load_rows(root);visible=sum(r.get('outcome') in ('WIN','LOSS','PUSH') for r in records)>=50
 card['confidence_evidence']={};level=card['ours']['confidence']
 for k,t in card['tiles'].items():
  if k=='WINNER' or t['confidence_source']!='OURS' or t['probability'] is None:continue
  number=t['probability'];nearest=min(range(1,6),key=lambda n:(abs(mapping[str(n)]-number),n));p=mapping[str(level)]
  card['confidence_evidence'][k]={'source':'ours','confidence':level,'confidence_probability':p,'number_probability':number,'map_version':config['version'],'conflict':abs(nearest-level)>1}
  b=decimal_odds(t['price'])-1;stake=min(100,max(0,1000*(p*b-(1-p))/b/4))
  if visible:t['stake_dollars']=round(stake,2)
 stake=sum(t.get('stake_dollars') or 0 for t in card['tiles'].values())
 if stake>100:
  for t in card['tiles'].values():
   if t['stake_dollars'] is not None:t['stake_dollars']=int(t['stake_dollars']/stake*10000)/100
 card['confidence_display_eligible']=visible

def load_rows(root=ROOT):
 out=Path(root)/'outputs/game-card-v3';rows=[]
 for p in sorted((out/'locks').glob('*.json')):
  c=json.loads(p.read_text());gp=out/'grades'/p.name;g=json.loads(gp.read_text()) if gp.exists() else {}
  for k,e in c.get('confidence_evidence',{}).items():
   t=c['tiles'][k]
   if not t.get('pick'):continue
   rows.append({**e,'game_id':c['game_id'],'week':c['week'],'season':c['season'],'market':k,'side':t['side'],'line':t['line'],'book':t['book'],'price':t['price'],'locked_at':c['freeze_timestamp'],'outcome':g.get('grades',{}).get(k),'clv':g.get('clv_by_tile',{}).get(k)})
 return rows

def score(rows,config):
 graded=[r for r in rows if r.get('outcome') in ('WIN','LOSS','PUSH')];visible=len(graded)>=50;levels=[]
 for level in range(1,6):
  pool=[r for r in graded if r['confidence']==level];binary=[r for r in pool if r['outcome']!='PUSH'];wins=sum(r['outcome']=='WIN' for r in binary);prior=config['provisional'][str(level)];n=len(binary)
  levels.append({'confidence':level,'graded':len(pool),'wins':wins,'losses':n-wins,'pushes':len(pool)-n,'hit_rate':wins/n if n else None,**({'provisional':prior,'observed':wins/n if n else None,'posterior':(20*prior+wins)/(20+n)} if visible else {})})
 feedback={'graded':len(graded),'visible':visible,'levels':levels}
 if visible:
  binary=[r for r in graded if r['outcome']!='PUSH'];n=len(binary)
  for key,col in [('confidence_probability','brier_confidence'),('number_probability','brier_number')]:feedback[col]=sum((r[key]-(r['outcome']=='WIN'))**2 for r in binary)/n if n else None
  a,b=feedback['brier_confidence'],feedback['brier_number'];feedback['better_predictor']='confidence' if a<b else 'number' if b<a else 'tie';feedback['conflicts']=sum(r['conflict'] for r in graded)
 return feedback

def publish(root=ROOT,now=None):
 root=Path(root);out=root/'outputs/game-card-v3';now=now or dt.datetime.now(dt.timezone.utc);rows=load_rows(root);config=read_config(root);feedback=score(rows,config)
 # Public pick log uses source ours; raw conflicts are retained privately until eligible.
 out.mkdir(parents=True,exist_ok=True)
 fields=['source','game_id','week','market','side','line','book','price','locked_at','confidence','outcome','clv']
 public=[{k:r.get(k) for k in fields} for r in rows]
 if feedback['visible']:
  fields+=['confidence_probability','number_probability','map_version','conflict']
  public=[{k:r.get(k) for k in fields} for r in rows]
 # Shared wager projection preserves every existing ingested wager's identity and grade.
 wagers=[]
 for p in (root/'outputs/jarrett/grades').glob('*.json'):
  r=json.loads(p.read_text());wagers.append({k:v for k,v in r.items() if k not in ('person','author','approver','executor')}|{'source':'ours'})
 overwrite(out/'wagers.json',wagers)
 for w in wagers:
  public.append({k:None for k in fields}|{'source':'ours','game_id':w.get('game_id'),'week':w.get('week'),'market':w.get('market'),'side':w.get('side'),'line':w.get('line_at_approval'),'book':w.get('executed_book'),'price':w.get('book_price'),'locked_at':w.get('approved_at',w.get('timestamp')),'outcome':{'W':'WIN','L':'LOSS','P':'PUSH','PUSH':'PUSH'}.get(w.get('outcome')),'clv':w.get('clv_cents')})
 with (out/'pick_log.csv').open('w',newline='') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(public)
 if feedback['visible']:
  from zoneinfo import ZoneInfo
  pt=now.astimezone(ZoneInfo('America/Los_Angeles'));monday=(pt-dt.timedelta(days=pt.weekday())).date().isoformat();path=out/'confidence-maps'/f'{monday}.json'
  if not path.exists():
   value={'version':'shared-confidence-'+monday,'effective_at':now.isoformat(),'provisional':config['provisional'],'values':{str(x['confidence']):x['posterior'] for x in feedback['levels']},'prior_weight':20,'graded':feedback['graded'],'evidence_hash':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()};put(path,value)
 overwrite(out/'confidence-scorecard.json',feedback)
 return feedback
