"""Publish the independent football artifact and preserve prospective T75 records."""
import copy,datetime as dt,gzip,hashlib,json,os,sys,urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection.card import make_card,finish
from engine.projection.train import read,paired
from engine.projection.grade import score
OUT=ROOT/'outputs/projection-v1';WORK=ROOT/'work/projection-v1'
def stamp(x):return dt.datetime.fromisoformat(x.replace('Z','+00:00'))
def save(path,value,immutable=False):
 path.parent.mkdir(parents=True,exist_ok=True);raw=json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n'
 if immutable and path.exists():
  if path.read_text()!=raw:raise ValueError('Frozen projection changed')
  return
 if path.exists() and path.read_text()==raw:return
 tmp=path.with_suffix('.tmp');tmp.write_text(raw);os.replace(tmp,path)
def sync():
 p=ROOT/'.cloud-private/note-access.json';key=os.environ.get('NOTE_SYNC_KEY') or (json.loads(p.read_text()).get('NOTE_SYNC_KEY') if p.exists() else None)
 if not key:return False
 try:
  req=urllib.request.Request('https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/api/projection-entry/sync',headers={'Authorization':'Bearer '+key,'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=10) as r:values=json.load(r)['entries']
  save(ROOT/'.cloud-private/projection-entries.json',{'entries':values,'synced_at':dt.datetime.now(dt.timezone.utc).isoformat()});return True
 except Exception:return False

def run(now=None,root=ROOT,require_synced_entries=False):
 now=now or dt.datetime.now(dt.timezone.utc);artifact=read(json.loads((WORK/'fit-ref.json').read_text()));shapes=read(artifact['shapes']);rows=json.loads(gzip.decompress((WORK/'current-features.json.gz').read_bytes()));groups=paired(rows)
 weather_path=OUT/'forecast.json';forecasts=json.loads(weather_path.read_text()) if weather_path.exists() else {}
 entries_path=ROOT/'.cloud-private/projection-entries.json';entry_cache=json.loads(entries_path.read_text()) if entries_path.exists() else {};entries=entry_cache.get('entries',[])
 colors=json.loads((ROOT/'config/game_card_team_colors.json').read_text());cards=[]
 for gid,pair in sorted(groups.items()):
  g=copy.deepcopy(pair['home']['game']);week=int(g['week'])
  if week>2:continue
  kickoff=dt.datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc);cutoff=kickoff-dt.timedelta(minutes=75);g.update(kickoff_at=kickoff.isoformat(),cutoff_at=cutoff.isoformat())
  lockpath=OUT/'locks'/f'{gid}.json';retro=OUT/'retrospective'/f'{gid}.json';livepath=OUT/'live'/f'{gid}.json';gradepath=OUT/'grades'/f'{gid}.json'
  final=g.get('home_score') not in (None,'') and g.get('away_score') not in (None,'');entry=next((e for e in entries if e['game_id']==gid and not e.get('post_lock') and stamp(e['entered_at'])<cutoff),None)
  if lockpath.exists():card=json.loads(lockpath.read_text())
  elif retro.exists():card=json.loads(retro.read_text())
  elif now>=cutoff and livepath.exists():
   card=json.loads(livepath.read_text())
   if require_synced_entries and (not entry_cache.get('synced_at') or stamp(entry_cache['synced_at'])<cutoff):
    card['lock_pending']='Awaiting shared entry synchronization';card['team_colors']={t:colors.get(t,{}).get('color','#384352') for t in [card['away'],card['home']]};cards.append(card);continue
   if stamp(card['issued_at'])>=cutoff:raise ValueError('Late live projection cannot lock')
   if entry:card.update(ours=None) # Fresh authorized edits are applied below using the frozen original inputs.
   if entry:
    from engine.projection.distribution import summarize
    card['ours']=summarize(entry['away_points'],entry['home_points'],shapes);card['display']=card['ours'];card['source']='OURS';card['entry']=entry;card['winner']=card['home'] if card['ours']['home_win_probability']>=.5 else card['away'];card['winner_probability']=max(card['ours']['home_win_probability'],card['ours']['away_win_probability'])
   card.update(status='LOCKED',freeze_time=cutoff.isoformat());save(lockpath,card,True)
  else:
   forecast=forecasts.get(gid);qualified=forecast and str(g.get('roof','')).lower() in ('outdoors','open') and stamp(forecast['received_at'])<=min(cutoff,now) and stamp(forecast['forecast_issued_at'])<=stamp(forecast['request_at'])<=stamp(forecast['received_at'])
   if now>=cutoff and week!=1:
    cards.append({'game_id':gid,'week':week,'season':int(g['season']),'home':pair['home']['team'],'away':pair['away']['team'],'kickoff_at':g['kickoff_at'],'cutoff_at':g['cutoff_at'],'status':'MISSED','reason':'No pre-lock projection recorded','version':artifact['version'],'projection':None});continue
   card=make_card(g,pair,artifact,shapes,now.isoformat(),forecast if qualified else None,entry,'RETROSPECTIVE' if now>=cutoff else 'AS_ISSUED')
   if now>=cutoff:card['reconstruction_as_of']=kickoff.isoformat();save(retro,card,True)
   else:
    prior=json.loads(livepath.read_text()) if livepath.exists() else None
    if prior and {k:v for k,v in prior.items() if k!='issued_at'}=={k:v for k,v in card.items() if k!='issued_at'}:card['issued_at']=prior['issued_at']
    save(livepath,card)
  if final:
   if gradepath.exists():card=json.loads(gradepath.read_text())
   else:card=finish(card,float(g['away_score']),float(g['home_score']));save(gradepath,card,True)
  card['team_colors']={t:colors.get(t,{}).get('color','#384352') for t in [card['away'],card['home']]};cards.append(card)
 scorecards=[]
 for week in [None,1,2]:
  for evidence in ['AS_ISSUED','RETROSPECTIVE']:
   for source in ['PROJECTION','OURS']:
    samples=[g['grades'][source] for g in cards if g.get('grades') and source in g['grades'] and g['evidence']==evidence and (week is None or g['week']==week)]
    scorecards.append({'season':2026,'week':week,'evidence':evidence,'source':source,**score(samples)})
 board={'schema':'projection-board-v1','version':artifact['version'],'published_at':now.isoformat(),'default_week':1,'games':sorted(cards,key=lambda g:(g['kickoff_at'],g['game_id'])),'scorecards':scorecards,'inactive':artifact['inactive'],'wind_status':'PARTIAL_HISTORY'}
 old=OUT/'board.json'
 if old.exists():
  prev=json.loads(old.read_text())
  if {k:v for k,v in prev.items() if k not in ('published_at','content_sha256')}=={k:v for k,v in board.items() if k!='published_at'}:board['published_at']=prev['published_at']
 board['content_sha256']=hashlib.sha256(json.dumps(board,sort_keys=True,separators=(',',':')).encode()).hexdigest();save(old,board);save(OUT/'scorecard.json',scorecards);return board
if __name__=='__main__':
 if '--sync' in sys.argv:sync()
 b=run(require_synced_entries='--sync' in sys.argv);print(json.dumps({'version':b['version'],'games':len(b['games'])}))
