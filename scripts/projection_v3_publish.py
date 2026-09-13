"""Publish qualified future projections while retaining every original frozen card."""
import copy,datetime as dt,gzip,hashlib,json,sys
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts.projection_publish import save,stamp,sync
from engine.projection_v3.card import make_card,finish
from engine.projection_v3.qualify import read
from engine.projection.train import paired
from engine.projection.grade import score
from engine.projection.distribution import summarize
OUT=ROOT/'outputs/projection-v3';WORK=ROOT/'work/projection-v3'

def shape_for(card,artifact):
 for version in ['v3','v2','v1']:
  for path in sorted((ROOT/f'work/projection-{version}').glob('fit-*.json')):
   if path.name=='fit-ref.json':continue
   a=json.loads(path.read_text())
   if a.get('version')==card['version']:
    if path.stem.rsplit('-',1)[1]!=hashlib.sha256(path.read_bytes()).hexdigest():raise ValueError('Frozen fit hash mismatch')
    return read(a['shapes'])
 raise ValueError('Frozen distribution version unavailable')

def lock_card(card,entry,shapes,cutoff):
 card=copy.deepcopy(card)
 if stamp(card['issued_at'])>=cutoff:raise ValueError('Late projection cannot lock')
 if entry:
  card['ours']=summarize(entry['away_points'],entry['home_points'],shapes);card['display']=card['ours'];card['source']='OURS';card['entry']=entry;card['winner']=card['home'] if card['ours']['home_win_probability']>=.5 else card['away'];card['winner_probability']=max(card['ours']['home_win_probability'],card['ours']['away_win_probability']);card['coin_flip']=card['ours']['home_win_probability']==.5
 if 'score_probability_conflict' in card:
  current=card['display'];leader=card['home'] if current['margin']>0 else card['away'] if current['margin']<0 else None
  conflict=leader is not None and leader!=card['winner'];card['score_probability_conflict']=conflict;card['score_probability_note']=f"Projected scores favor {leader}; the historical residual distribution favors {card['winner']}. The score and winner directions disagree." if conflict else None
 card.update(status='LOCKED',freeze_time=cutoff.isoformat());return card

def run(now=None,require_synced_entries=False):
 now=now or dt.datetime.now(dt.timezone.utc);artifact=read(json.loads((WORK/'fit-ref.json').read_text()));shapes=read(artifact['shapes']);rows=json.loads(gzip.decompress((WORK/'current-features.json.gz').read_bytes()));groups=paired(rows)
 legacy_path=ROOT/'outputs/projection-v2/board.json';legacy={g['game_id']:g for g in json.loads(legacy_path.read_text())['games']} if legacy_path.exists() else {}
 fp=ROOT/'outputs/projection-v1/forecast.json';forecasts=json.loads(fp.read_text()) if fp.exists() else {};ep=ROOT/'.cloud-private/projection-entries.json';cache=json.loads(ep.read_text()) if ep.exists() else {};entries=cache.get('entries',[]);colors=json.loads((ROOT/'config/game_card_team_colors.json').read_text());cards=[]
 for gid,pair in sorted(groups.items()):
  g=copy.deepcopy(pair['home']['game']);week=int(g['week'])
  if week>2:continue
  kickoff=dt.datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc);cutoff=kickoff-dt.timedelta(minutes=75);g.update(kickoff_at=kickoff.isoformat(),cutoff_at=cutoff.isoformat());lockpath=OUT/'locks'/f'{gid}.json';livepath=OUT/'live'/f'{gid}.json';gradepath=OUT/'grades'/f'{gid}.json';old=legacy.get(gid)
  final=g.get('home_score') not in (None,'') and g.get('away_score') not in (None,'');entry=next((e for e in entries if e['game_id']==gid and not e.get('post_lock') and stamp(e['entered_at'])<cutoff),None)
  if lockpath.exists():card=json.loads(lockpath.read_text())
  elif old and (old['status'] in ('LOCKED','FINAL') or old.get('evidence')=='RETROSPECTIVE'):card=copy.deepcopy(old)
  elif now>=cutoff:
   prior=json.loads(livepath.read_text()) if livepath.exists() else old
   if not prior or not prior.get('projection') or stamp(prior['issued_at'])>=cutoff:
    cards.append({'game_id':gid,'week':week,'season':int(g['season']),'home':pair['home']['team'],'away':pair['away']['team'],'kickoff_at':g['kickoff_at'],'cutoff_at':g['cutoff_at'],'status':'MISSED','reason':'No pre-lock projection recorded','version':artifact['version'],'projection':None});continue
   if require_synced_entries and (not cache.get('synced_at') or stamp(cache['synced_at'])<cutoff):
    card=copy.deepcopy(prior);card['lock_pending']='Awaiting shared entry synchronization';cards.append(card);continue
   card=lock_card(prior,entry,shape_for(prior,artifact),cutoff);save(lockpath,card,True)
  else:
   forecast=forecasts.get(gid);qualified=forecast and str(g.get('roof','')).lower() in ('outdoors','open') and stamp(forecast['received_at'])<=now and stamp(forecast['forecast_issued_at'])<=stamp(forecast['request_at'])<=stamp(forecast['received_at'])
   card=make_card(g,pair,artifact,shapes,now.isoformat(),forecast if qualified else None,entry)
   prior=json.loads(livepath.read_text()) if livepath.exists() else None
   if prior and {k:v for k,v in prior.items() if k!='issued_at'}=={k:v for k,v in card.items() if k!='issued_at'}:card['issued_at']=prior['issued_at']
   save(livepath,card)
  if final and card.get('projection'):
   if gradepath.exists():card=json.loads(gradepath.read_text())
   elif card.get('grades'):pass
   else:card=finish(card,float(g['away_score']),float(g['home_score']));save(gradepath,card,True)
  card['team_colors']={t:colors.get(t,{}).get('color','#384352') for t in [card['away'],card['home']]};cards.append(card)
 scorecards=[]
 for version in sorted({g['version'] for g in cards}):
  for week in [None,1,2]:
   for evidence in ['AS_ISSUED','RETROSPECTIVE']:
    for source in ['PROJECTION','OURS']:
     samples=[g['grades'][source] for g in cards if g.get('grades') and source in g['grades'] and g['version']==version and g['evidence']==evidence and (week is None or g['week']==week)]
     scorecards.append({'version':version,'season':2026,'week':week,'evidence':evidence,'source':source,**score(samples)})
 board={'schema':'projection-board-v1','version':artifact['version'],'published_at':now.isoformat(),'default_week':1,'games':sorted(cards,key=lambda g:(g['kickoff_at'],g['game_id'])),'scorecards':scorecards,'inactive':artifact['inactive'],'wind_status':artifact['wind_status']};old=OUT/'board.json'
 if old.exists():
  prev=json.loads(old.read_text())
  if {k:v for k,v in prev.items() if k not in ('published_at','content_sha256')}=={k:v for k,v in board.items() if k!='published_at'}:board['published_at']=prev['published_at']
 board['content_sha256']=hashlib.sha256(json.dumps(board,sort_keys=True,separators=(',',':')).encode()).hexdigest();save(old,board);save(OUT/'scorecard.json',scorecards);return board
if __name__=='__main__':
 if '--sync' in sys.argv:sync()
 b=run(require_synced_entries='--sync' in sys.argv);print(json.dumps({'version':b['version'],'games':len(b['games']),'credits_spent':0}))
