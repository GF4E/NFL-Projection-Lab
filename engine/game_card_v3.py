"""Pure Game Card v3 FINAL adapter; no fetches or mutation of original models."""
import copy,hashlib,json,math,statistics
from engine.market_distribution import MarketDistribution
from engine.pricing import decimal_odds,timestamp,power_devig
from engine.game_card_why import generate
BOOKS={'betmgm':'BetMGM','williamhill_us':'Caesars','draftkings':'DraftKings','fanduel':'FanDuel'}
VERSION='game-card-v3'
def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def side_code(side,g):return g['home_abbr'] if side==g['home_team'] else g['away_abbr'] if side==g['away_team'] else side

def empty_tile(label):
 return dict(label=label,pick=None,side=None,line=None,book=None,book_label=None,price=None,probability=None,push_probability=None,EV=None,confidence_source=None,subtitle='NOT_RECORDED',chip=None,grade='NOT_RECORDED',clv=None,stake_dollars=None,confidence_used=None,probability_percent=None,ring_offset=100)

def best(offers,market,side,line=None):
 rows=[o for o in offers if o['market']==market and o['side']==side and o.get('book') in BOOKS and o.get('price') is not None and (line is None or o.get('line')==line)]
 def key(o):
  point=0 if market=='h2h' else -o['line'] if market=='totals' and side=='Over' else o['line']
  return (-point,-decimal_odds(o['price']),o['book'])
 return sorted(rows,key=key)[0] if rows else None

def eligible(entries,cutoff):
 rows=[e for e in entries if not e.get('post_lock') and e.get('input_class')!='POST_LOCK' and timestamp(e.get('entered_at',e.get('submitted_at'))) < timestamp(cutoff)]
 return copy.deepcopy(max(rows,key=lambda e:e.get('entered_at',e.get('submitted_at')))) if rows else None

def fill(tile,offer,prob,source,g,push=0,ev=None,coin=False):
 side=side_code(offer['side'],g);line=offer.get('line')
 tile.update(side=side,line=line,book=offer.get('book'),book_label=BOOKS.get(offer.get('book')),price=offer.get('price'),probability=prob,push_probability=push,confidence_source=source,EV=ev,subtitle='coin flip' if coin else '',grade=None,probability_percent=round(prob*100,1) if prob is not None else None,ring_offset=100-prob*100 if prob is not None else 100)
 tile['pick']=side if tile['label']=='WINNER' else f'{side.upper() if side in ("Over","Under") else side} '+(f'{line:+g}' if tile['label']=='SPREAD' else f'{line:g}') if line is not None else side
 return tile

def select(market,ctx,shape,ours,g):
 tile=empty_tile('SPREAD' if market=='spreads' else 'TOTAL');center=ctx['centers'].get(market)
 if center is None:return tile
 source=None;prob=None;coin=False;location=center;fixed_line=None
 if ours:
  location=-ours['spread'] if market=='spreads' else ours['total'];gap=location-center
  if gap:
   side=(g['home_team'] if gap>0 else g['away_team']) if market=='spreads' else ('Over' if gap>0 else 'Under');source='OURS'
 if source is None:
  rule=next((r for r in ctx['rules'] if r.get('market')==market),None);model=ctx['model'].get(market)
  if ours:source='OURS';coin=True
  elif rule:side=rule['side'];prob=rule.get('fair_probability',rule.get('probability'));source='RULE';fixed_line=rule.get('line')
  elif model and model.get('edge_source')=='price':side=model['side'];prob=model.get('fair_probability');source='MODEL';fixed_line=model.get('line')
  else:source='MARKET';coin=True
 if coin:
  sides=[g['home_team'],g['away_team']] if market=='spreads' else ['Over','Under'];rows=[q for s in sides if (q:=best(ctx['offers'],market,s))]
  if not rows:return tile
  q=sorted(rows,key=lambda q:(-decimal_odds(q['price']),q['side'],q['book']))[0];side=q['side'];prob=.5
 else:q=best(ctx['offers'],market,side,fixed_line)
 if not q:return tile
 dist=MarketDistribution(shape,-location if market=='spreads' else -ctx['centers']['spreads'],location if market=='totals' else ctx['centers']['totals'])
 p=dist.spread(q['line'],side==g['home_team']) if market=='spreads' else dist.totals(q['line'],side=='Over')
 if source=='OURS':prob=p['conditional_win'];coin=False
 if prob is None:return tile
 ev=(1-p['push'])*(prob*(decimal_odds(q['price'])-1)-(1-prob))
 fill(tile,q,prob,source,g,p['push'],ev,coin);tile['chip']='LEAN'
 # An original registered PLAY is portable only at that model line and better price.
 if source=='MODEL' and ctx['model'][market].get('filtered_subset'):tile['chip']='PLAY'
 if ours:tile['confidence_used']=ours['confidence']
 return tile

def measured_sheet(sheet):
 def mark(x):
  if isinstance(x,list):return [mark(v) for v in x]
  if not isinstance(x,dict):return x
  d={k:mark(v) for k,v in x.items()}
  if any(k in x for k in ('value','adjusted','rank','epa_per_dropback','n_games','n_dropbacks')):
   status=str(x.get('status','')).upper();d['measured']=x.get('measured',True) and status not in ('MEASURE','UNMEASURED') and 'UNKNOWN' not in status and any(isinstance(x.get(k),(int,float)) for k in ('value','adjusted','epa_per_dropback','n_games','n_dropbacks'))
  return d
 d=mark(copy.deepcopy(sheet or {}))
 for b in d.values():b['measured']=bool(b.get('teams'))
 return d

def build(g,record,shape,entries=(),sheet=None,locked=None):
 if locked:return copy.deepcopy(locked)
 r=record or {};game=r.get('game',g);cutoff=game.get('cutoff_at',g.get('cutoff_at',g['kickoff_at']));ours=eligible(entries,cutoff)
 cs=r.get('consensus',{});centers={m:cs.get(m,{}).get('full',{}).get('center') for m in ('spreads','totals')}
 offers=r.get('offers',[]);models={m:next((p for p in r.get('picks',[]) if p['market']==m),None) for m in ('spreads','totals')};rules=r.get('paper_picks',[])
 final=g.get('final_score');historical=g.get('status')=='FINAL' or r.get('status') in ('LOCKED','MISSED')
 status='FINAL' if final else 'MISSED' if r.get('status')=='MISSED' else 'LOCKED' if r.get('status')=='LOCKED' else 'UPCOMING'
 shared=({k:ours.get(k) for k in ('spread','total','confidence','tags','text')}|{'entered_at':ours.get('entered_at',ours.get('submitted_at'))}) if ours else None
 card={'schema':VERSION,'game_id':g['game_id'],'week':g['week'],'season':g['season'],'kickoff_utc':g['kickoff_at'],'home':g['home_abbr'],'away':g['away_abbr'],'venue':game.get('venue',game.get('stadium_id')),'roof':game.get('roof'),'status':status,'final':{'home_score':final['home'],'away_score':final['away'],'margin':final['home']-final['away'],'total':final['home']+final['away']} if final else None,
 'market':{'spread':-centers['spreads'] if centers['spreads'] is not None else None,'total':centers['totals'],'home_win_prob':None,'capture_time':r.get('captured_at',r.get('capture',{}).get('received_at')),'books':{},'teaser_near_miss':{m:g.get('verdicts',{}).get(m,{}).get('teaser_notice') for m in centers}},
 'model':{m:({k:p.get(k) for k in ('side','line','book','price','fair_probability','EV','edge_source')} if (p:=models[m]) else None) for m in centers},'rules':[{'rule_id':p.get('paper_rule',p.get('rule_id')),'pick':p.get('side'),'probability':p.get('fair_probability'),'market':p.get('market')} for p in rules],
 'ours':shared,'post_lock':False,'sheet':measured_sheet(sheet),'wagers':[{**p,'source':'ours'} for p in g.get('executed_picks',[])],'grades':{k:'NOT_RECORDED' for k in ('WINNER','SPREAD','TOTAL')}|{'clv':None},'version':VERSION,'freeze_timestamp':r.get('freeze_timestamp') if r.get('status')=='LOCKED' else None,'distribution_hash':r.get('distribution_hash'),'tiles':{k:empty_tile(k) for k in ('WINNER','SPREAD','TOTAL')},'weather':r.get('forecast'),'notes':r.get('our_note',{}),'analysis':r.get('analysis',{}).get('sentences',[]),'winner_bar':{'home_percent':None,'away_percent':None,'home_width':50,'away_width':50},'why':{},'stale':False}
 for book in BOOKS:
  card['market']['books'][book]={m:{side_code(s,g):best([o for o in offers if o['book']==book],m,s) for s in ([g['home_team'],g['away_team']] if m!='totals' else ['Over','Under'])} for m in ('spreads','totals','h2h')}
 if all(x is not None for x in centers.values()):
  dist=MarketDistribution(shape,-centers['spreads'],centers['totals']);hp=dist.moneyline()['conditional_win'];card['market']['home_win_prob']=hp
  card['market']['home_win_prob_basis']='pinned empirical distribution at captured consensus'
  market_probs=[]
  for book in BOOKS:
   h=best([o for o in offers if o['book']==book],'h2h',g['home_team']);a=best([o for o in offers if o['book']==book],'h2h',g['away_team'])
   if h and a:market_probs.append(power_devig([h['price'],a['price']])[0][0])
  if market_probs:
   card['market']['home_win_prob']=statistics.median(market_probs);card['market']['home_win_prob_basis']='median complete-book power-devig moneyline'
  if not historical:
   ctx={'centers':centers,'offers':offers,'model':models,'rules':rules}
   for m,k in [('spreads','SPREAD'),('totals','TOTAL')]:card['tiles'][k]=select(m,ctx,shape,ours,g)
   wd=MarketDistribution(shape,ours['spread'],centers['totals']) if ours else dist
   hp=wd.moneyline()['conditional_win'] if ours else card['market']['home_win_prob'];ap=1-hp;home=hp>=ap;win_side=g['home_team'] if home else g['away_team'];q=best(offers,'h2h',win_side) or {'side':win_side,'book':None,'price':None}
   fill(card['tiles']['WINNER'],q,hp if home else ap,'OURS' if ours else 'MARKET',g,wd.moneyline()['push'],coin=hp==ap)
   card['winner_bar']={'home_percent':round(hp*100,1),'away_percent':round(ap*100,1),'home_width':hp*100,'away_width':ap*100,'tie_percent':round(wd.moneyline()['push']*100,1)}
 if historical:
  # Original locks are rendered, never reselected under this new version.
  for m,k in [('spreads','SPREAD'),('totals','TOTAL')]:
   p=models[m]
   if p and r.get('status')=='LOCKED':
    fill(card['tiles'][k],p,p['fair_probability'],'MODEL' if p.get('edge_source')=='price' else 'MARKET',g,p.get('push',0),p.get('EV'))
    card['tiles'][k]['subtitle']='original lock';grade=g.get('verdicts',{}).get(m,{}).get('grade');card['tiles'][k]['grade']={'W':'WIN','L':'LOSS','P':'PUSH','PUSH':'PUSH'}.get(grade);card['tiles'][k]['clv']=g.get('verdicts',{}).get(m,{}).get('clv_cents')
  p=r.get('projection',{})
  if p.get('status')=='AVAILABLE' and r.get('status')=='LOCKED':
   fill(card['tiles']['WINNER'],{'side':p['winner']},p['win_probability'],'MARKET',g,p['tie_probability']);card['tiles']['WINNER']['grade']=g.get('prediction',{}).get('winner_grade')
   wp=p['win_probability'];hp=wp if side_code(p['winner'],g)==g['home_abbr'] else 1-wp;card['winner_bar'].update(home_percent=round(hp*100,1),away_percent=round((1-hp)*100,1),home_width=hp*100,away_width=(1-hp)*100)
 for k,t in card['tiles'].items():card['grades'][k]=t['grade']
 card['why']=generate(card) if not historical else {'statement':'','bullets':[],'fields':[]}
 card['version']=VERSION+'-'+digest({'distribution':card['distribution_hash'],'policy':'FINAL-shared-2026-09-12'})[:8]
 return card
