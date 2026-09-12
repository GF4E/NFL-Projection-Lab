"""Card publication, independent T75 snapshots, and existing-grader adapter.

Source sync is separate from pure card logic. No Odds API calls. Grading opens
only card locks and pinned final results, never captures.
"""
import re,copy,datetime as dt,json,os,urllib.request,hashlib
from pathlib import Path
from engine.live_picks import overwrite
from engine.pick_store import put,read_pinned
from engine.pricing import timestamp
from engine.game_card_v3 import build,VERSION,digest
ROOT=Path(__file__).resolve().parents[1]

def sheet_for(root,week):
 p=Path(root)/('work/game-card-v3/week1-sensors.json' if week==1 else 'outputs/iron-man-v1/sensors.json')
 if not p.exists():return {}
 d=json.loads(p.read_text())
 if d['week']!=week:return {}
 out={str(n):{'name':name,'teams':{},'source_hashes':d['source_hashes'],'data_window':d['data_window']} for n,name in [(4,'Efficiency'),(6,'Matchups'),(7,'Quarterback'),(9,'Momentum'),(10,'Scoring composition and luck')]}
 for team,t in d['teams'].items():
  for n in ('4','6'):out[n]['teams'][team]={k:v for k,v in t['metrics'].items() if (any(x in k for x in ('points_per_drive','yards_per_play','_epa','_success')) if n=='4' else True)}
  out['7']['teams'][team]=t['qb'];out['9']['teams'][team]=t['momentum'];out['10']['teams'][team]=t['composition']
 return out

def sync(root=ROOT):
 root=Path(root);key=os.environ.get('NOTE_SYNC_KEY');p=root/'.cloud-private/note-access.json'
 if not key and p.exists():key=json.loads(p.read_text()).get('NOTE_SYNC_KEY')
 if not key:return False
 req=urllib.request.Request('https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/api/card-entry/sync',headers={'Authorization':'Bearer '+key,'User-Agent':'Mozilla/5.0 NFL-Engine/1.0'})
 try:
  with urllib.request.urlopen(req,timeout=10) as r:entries=json.load(r)['entries']
 except Exception:return False
 # Private local cache. Never commit personal independent entries before reveal.
 overwrite(root/'.cloud-private/card-v3-entries.json',{'entries':entries,'synced_at':dt.datetime.now(dt.timezone.utc).isoformat()});return True

def redact(card):
 return card

def enrich(board,records,root=ROOT,now=None):
 root=Path(root);now=now or dt.datetime.now(dt.timezone.utc);out=root/'outputs/game-card-v3'
 activation=root/'work/game-card-v3/runtime.json'
 if not activation.exists():return board
 activated=timestamp(json.loads(activation.read_text())['activated_at'])
 cfg=json.loads((root/'work/model-pick-v1/runtime-config.json').read_text());shape=read_pinned(cfg['distribution']);byid={r['game']['game_id']:r for r in records}
 p=root/'.cloud-private/card-v3-entries.json';private=json.loads(p.read_text()) if p.exists() else {};entries=private.get('entries',[])
 colors_path=root/'config/game_card_team_colors.json';colors=json.loads(colors_path.read_text()) if colors_path.exists() else {}
 all_sheets={};cards=[]
 for g in board['games']:
  path=root/'outputs/model-pick-v1/live'/f'{g["game_id"]}.json';suit=root/'outputs/iron-man-v1/markets'/f'{g["game_id"]}.json'
  r=byid.get(g['game_id']) or (json.loads(path.read_text()) if path.exists() else json.loads(suit.read_text()) if suit.exists() else {})
  if 'game' not in r:r['game']=g
  r.setdefault('status','LIVE');r.setdefault('distribution_hash',cfg['distribution']['sha256'])
  all_sheets.setdefault(g['week'],sheet_for(root,g['week']));sheet=copy.deepcopy(all_sheets[g['week']])
  from engine.harvest import canonical
  for block in sheet.values():block['teams']={t:block['teams'][canonical(t)] for t in (g['home_abbr'],g['away_abbr']) if canonical(t) in block['teams']}
  entry=[e for e in entries if e['game_id']==g['game_id']]
  lockpath=out/'locks'/f'{g["game_id"]}.json';livepath=out/'live'/f'{g["game_id"]}.json'
  cutoff=timestamp(r['game'].get('cutoff_at',g.get('cutoff_at',g['kickoff_at'])))
  existing=json.loads(lockpath.read_text()) if lockpath.exists() else None
  if existing:card=existing
  elif g['status']!='FINAL' and r['status']!='MISSED' and now<cutoff+dt.timedelta(seconds=60) and all(r.get('consensus',{}).get(m,{}).get('full',{}).get('center') is not None for m in ('spreads','totals')):
   # Build from cutoff-qualified quotes/entries only, even if the legacy lock ran seconds earlier.
   rr=copy.deepcopy(r);rr['status']='LIVE';card=build(g,rr,shape,entry,sheet)
   card['generated_at']=now.isoformat();card['scheduled_cutoff']=cutoff.isoformat()
   from engine.shared_confidence import beliefs
   beliefs(card,root)
   fingerprint=digest({k:v for k,v in card.items() if k not in ('generated_at','input_hash')})
   prior=json.loads(livepath.read_text()) if livepath.exists() else None
   if prior and prior.get('input_hash')==fingerprint:card['generated_at']=prior['generated_at']
   card['input_hash']=fingerprint
   if now>=cutoff:
    fresh=private.get('synced_at') and timestamp(private['synced_at'])>=cutoff
    capture=r.get('captured_at',r.get('capture',{}).get('received_at'))
    if fresh and capture and timestamp(capture)<=cutoff:
     card.update(status='LOCKED',freeze_timestamp=now.isoformat());redact(card);put(lockpath,card)
   else:redact(card);overwrite(livepath,card)
  else:
   rr=copy.deepcopy(r)
   if cutoff>=activated:rr.update(status='MISSED',picks=[],projection={})
   card=build(g,rr,shape,(),sheet)
  gradepath=out/'grades'/f'{g["game_id"]}.json'
  if gradepath.exists():
   grades=json.loads(gradepath.read_text());card=copy.deepcopy(card);card.update(status='FINAL',final=grades['final'],grades=grades['grades'])
   for k,v in grades['grades'].items():
    if k in card['tiles']:card['tiles'][k].update(grade=v,clv=grades.get('clv_by_tile',{}).get(k))
  card['stale']=g['status']!='FINAL' and card['status']!='LOCKED' and (not card['market']['capture_time'] or (now-timestamp(card['market']['capture_time'])).total_seconds()>3600)
  if card['stale']:
   for t in card['tiles'].values():
    if t['chip']=='PLAY':t['chip']='LEAN'
  card['team_colors']={t:colors.get(t,{}).get('color','#121820') for t in (g['away_abbr'],g['home_abbr'])}
  card.pop('confidence_evidence',None)
  def shared(v):
   if isinstance(v,str):return re.sub(r'\b(?:Gabe|Jarrett)\b','our',v,flags=re.I)
   if isinstance(v,list):return [shared(x) for x in v]
   if isinstance(v,dict):return {k:shared(x) for k,x in v.items() if k not in ('author','person','approver','executor')}
   return v
  card['notes']=shared(card.get('notes'));card['analysis']=shared(card.get('analysis'))
  g['card_v3']=card;cards.append(card)
 from engine.shared_confidence import publish as confidence_publish
 feedback=confidence_publish(root,now);board['shared_confidence']=feedback
 records={}
 for w in sorted({g['week'] for g in board['games']}):
  wr=board.get('week_records',{}).get(str(w),{});rows=[]
  for label,key in [('MODEL','model'),('PRICE','price'),('RULES','paper')]:
   r=wr.get(key,{});clv=r.get('mean_clv_cents');rows.append({'label':label,'text':f"{r.get('wins',0)}–{r.get('losses',0)}–{r.get('pushes',0)}"+(f" · CLV {clv:+.1f}¢" if clv is not None else '')})
  ours=[t for c in cards if c['week']==w for t in c['tiles'].values() if t.get('confidence_source')=='OURS' and t.get('grade') in ('WIN','LOSS','PUSH')]
  wagers=[x for c in cards if c['week']==w for x in c['wagers']];counts={k:sum(t['grade']==k for t in ours) for k in ('WIN','LOSS','PUSH')}
  for p in wagers:
   k={'W':'WIN','L':'LOSS','P':'PUSH','PUSH':'PUSH'}.get(p.get('outcome'))
   if k:counts[k]+=1
  rows.append({'label':'OURS','text':f"{counts['WIN']}–{counts['LOSS']}–{counts['PUSH']}"});records[str(w)]=rows
 board['card_records']=records
 board['game_card_version']=VERSION
 return board

def grade(root=ROOT):
 root=Path(root);out=root/'outputs/game-card-v3';refs=list((root/'outputs/model-pick-v1/result-refreshes').glob('*.json'))+list((root/'outputs/model-pick-v1/daily').glob('*/results-ref.json'))
 if not refs:return 0
 ref=max((json.loads(p.read_text()) for p in refs),key=lambda r:r.get('received_at',''))
 from engine.t75_report import final_feed
 raw=Path(ref['path']).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('Final source hash mismatch')
 results=final_feed(raw,ref['sha256'])
 shape=read_pinned(json.loads((root/'work/model-pick-v1/runtime-config.json').read_text())['distribution'])
 from engine.t75_grade import grade as grade_existing
 count=0
 for p in (out/'locks').glob('*.json'):
  c=json.loads(p.read_text());target=out/'grades'/p.name;res=results.get(c['game_id'])
  if target.exists() or not res or not res.get('final'):continue
  grades={k:'NOT_RECORDED' for k in ('WINNER','SPREAD','TOTAL')}|{'clv':None};clvs={}
  for k,t in c['tiles'].items():
   if not t['side']:continue
   if k=='WINNER':grades[k]='PUSH' if res['home_score']==res['away_score'] else 'WIN' if (res['home_score']>res['away_score'])==(t['side']==c['home']) else 'LOSS'
   elif t['price'] is not None:
    row=grade_existing({'market':'spreads' if k=='SPREAD' else 'totals','side':t['side'],'home_team':c['home'],'line':t['line'],'price':t['price'],'fair_probability':t['probability']},res,shape)
    grades[k]={'W':'WIN','L':'LOSS','P':'PUSH'}.get(row.get('outcome'));clvs[k]=row.get('clv_cents')
  vals=[v for v in clvs.values() if v is not None];grades['clv']=sum(vals)/len(vals) if vals else None
  put(target,{'grades':grades,'clv_by_tile':clvs,'final':{'home_score':res['home_score'],'away_score':res['away_score'],'margin':res['home_score']-res['away_score'],'total':res['home_score']+res['away_score']},'source':ref['sha256']});count+=1
 return count
