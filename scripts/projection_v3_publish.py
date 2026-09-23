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
from engine.forecast_system.calendar import schedule_kickoff
from engine.projection.lineage import bind,calibration_for
from engine.projection.scoring import prepare_pair
from engine.projection.scoring_process import score_batch
from engine.projection.bundle import release_for,attach,verify_card
from engine.projection.prepared import load as load_prepared_state
from engine.projection import cutoff_publication
OUT=ROOT/'outputs/projection-v3';WORK=ROOT/'work/projection-v3'

def shape_for(card,artifact):
 return calibration_for(card,ROOT)[0]

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
 from engine.projection import prepared,pipeline_release
 with prepared.writer(ROOT):
  pipeline_release.guard(ROOT)
  return _run(now,require_synced_entries)

def _run(now=None,require_synced_entries=False):
 from scripts.projection_learning import active_artifact_with_ref,feature_snapshot,trajectories
 now=now or dt.datetime.now(dt.timezone.utc);artifact_ref,artifact=active_artifact_with_ref()
 shapes=read(artifact['shapes']);rows,prepared_manifest,prepared_raw=load_prepared_state(ROOT)
 if artifact.get('elo_hfa') and prepared_manifest.get('elo_hfa')!=artifact['elo_hfa']:raise ValueError('Active fit and prepared HFA method differ')
 if prepared_manifest.get('fit')!=artifact_ref:raise ValueError('Prepared inputs and active fit differ')
 groups=paired(rows)
 final_path=OUT/'final-feed.json';finals=json.loads(final_path.read_text()).get('games',{}) if final_path.exists() else {}
 legacy_path=ROOT/'outputs/projection-v2/board.json';legacy={g['game_id']:g for g in json.loads(legacy_path.read_text())['games']} if legacy_path.exists() else {}
 fp=ROOT/'outputs/projection-v1/forecast.json';forecasts=json.loads(fp.read_text()) if fp.exists() else {};ep=ROOT/'.cloud-private/projection-entries.json';cache=json.loads(ep.read_text()) if ep.exists() else {};entries=cache.get('entries',[]);colors=json.loads((ROOT/'config/game_card_team_colors.json').read_text());cards=[]
 # One label-free batch. Completed rows, private edits and raw sources never enter the worker.
 latest_week=prepared_manifest.get('publication_week',min(18,max([int(r['week']) for r in rows if r.get('actual_points') is not None]+[1])+1))
 cutoff_refs=prepared_manifest.get('cutoff_preparations',{})
 if prepared_manifest.get('cutoff_mode') not in (None,'RECORDED_CUTOFF_V1') or bool(cutoff_refs)!=bool(prepared_manifest.get('cutoff_mode')):
  raise ValueError('Incomplete or unknown cutoff preparation mode')
 lock_verification={};requests={};qualified_forecasts={};cutoff_calculations={};cutoff_cache={};cutoff_times={};cutoff_forecasts={}
 for gid,pair in sorted(groups.items()):
  g=pair['home']['game'];kickoff=schedule_kickoff(g['gameday'],g['gametime']);cutoff=kickoff-dt.timedelta(minutes=75);old=legacy.get(gid)
  if int(g['week'])>latest_week or now>=cutoff or (OUT/'locks'/f'{gid}.json').exists() or (old and (old['status'] in ('LOCKED','FINAL') or old.get('evidence')=='RETROSPECTIVE')):continue
  if prepared_manifest.get('cutoff_mode'):
   if gid not in cutoff_refs:raise ValueError('Cutoff manifest lacks current forecast game')
   value,reference,issued_at=cutoff_publication.calculation(ROOT,cutoff_refs[gid],artifact_ref,pair,cutoff_cache)
   cutoff_forecasts[gid]=reference;cutoff_times[gid]=issued_at;cutoff_calculations[gid]=value
   requests[gid]=value['input'];qualified_forecasts[gid]=None;continue
  forecast=forecasts.get(gid);qualified=forecast and str(g.get('roof','')).lower() in ('outdoors','open') and stamp(forecast['received_at'])<=now and stamp(forecast['forecast_issued_at'])<=stamp(forecast['request_at'])<=stamp(forecast['received_at'])
  qualified_forecasts[gid]=forecast if qualified else None;requests[gid]=prepare_pair(pair,qualified_forecasts[gid])
 calculations=score_batch(artifact,shapes,[r for gid,r in requests.items() if gid not in cutoff_calculations])
 calculations.update(cutoff_calculations)
 release_ref=release_for(ROOT,artifact_ref,artifact) if requests else None
 for gid,pair in sorted(groups.items()):
  g=copy.deepcopy(pair['home']['game']);week=int(g['week'])
  if week>latest_week:continue
  kickoff=schedule_kickoff(g['gameday'],g['gametime']);cutoff=kickoff-dt.timedelta(minutes=75);g.update(kickoff_at=kickoff.isoformat(),cutoff_at=cutoff.isoformat());lockpath=OUT/'locks'/f'{gid}.json';livepath=OUT/'live'/f'{gid}.json';gradepath=OUT/'grades'/f'{gid}.json';old=legacy.get(gid)
  final=g.get('home_score') not in (None,'') and g.get('away_score') not in (None,'');entry=next((e for e in entries if e['game_id']==gid and not e.get('post_lock') and stamp(e['entered_at'])<cutoff),None)
  if lockpath.exists():card=json.loads(lockpath.read_text())
  elif old and (old['status'] in ('LOCKED','FINAL') or old.get('evidence')=='RETROSPECTIVE'):card=copy.deepcopy(old)
  elif now>=cutoff:
   prior=json.loads(livepath.read_text()) if livepath.exists() else old
   if not prior or not prior.get('projection') or stamp(prior['issued_at'])>=cutoff or prior.get('forecast_role')=='PROVISIONAL' or (prepared_manifest.get('cutoff_mode') and not prior.get('cutoff_forecast_ref')):
    cards.append({'game_id':gid,'week':week,'season':int(g['season']),'home':pair['home']['team'],'away':pair['away']['team'],'kickoff_at':g['kickoff_at'],'cutoff_at':g['cutoff_at'],'status':'MISSED','reason':'No final-eligible cutoff projection recorded' if prepared_manifest.get('cutoff_mode') or (prior and prior.get('forecast_role')) else 'No pre-lock projection recorded','version':artifact['version'],'projection':None});continue
   if require_synced_entries and (not cache.get('synced_at') or stamp(cache['synced_at'])<cutoff):
    card=copy.deepcopy(prior);card['lock_pending']='Awaiting shared entry synchronization';cards.append(card);continue
   frozen_shapes,resolution=calibration_for(prior,ROOT)
   cutoff_publication.before_lock(ROOT,prior,cache=lock_verification)
   card=lock_card(prior,entry,frozen_shapes,cutoff);card['calibration_lineage']=resolution;save(lockpath,card,True)
  else:
   forecast=qualified_forecasts[gid];qualified=forecast is not None
   role=calculations[gid]['role'] if gid in cutoff_forecasts else None
   card=make_card(g,pair,artifact,shapes,cutoff_times.get(gid,now.isoformat()),forecast,entry,
                  evidence='PROVISIONAL' if role=='PROVISIONAL' else 'AS_ISSUED',calculation=calculations[gid])
   if role:card.update(cutoff_forecast_ref=cutoff_forecasts[gid],forecast_role=role)
   card['learning_features']=feature_snapshot(pair)
   if qualified:
    for side in ['home','away']:card['learning_features'][side]['features']['wind']=forecast['wind_mph']
   card=bind(card,artifact_ref,artifact)
   prior=json.loads(livepath.read_text()) if livepath.exists() else None
   if prior:verify_card(ROOT,prior)
   identity_ignored={'issued_at','forecast_bundle_ref','release_ref'}
   if prior and prior.get('release_ref')==release_ref and {k:v for k,v in prior.items() if k not in identity_ignored}=={k:v for k,v in card.items() if k not in identity_ignored}:
    card=prior
   else:card=attach(ROOT,card,requests[gid],release_ref,prepared_manifest)
   if role:cutoff_publication.issuance_receipt(ROOT,card)
   save(livepath,card)
  from engine.projection.finals import grade_once
  result=finals.get(gid) or ({'away_score':float(g['away_score']),'home_score':float(g['home_score'])} if final else None)
  card=grade_once(card,gradepath,result,root=ROOT)
  card['team_colors']={t:colors.get(t,{}).get('color','#384352') for t in [card['away'],card['home']]};cards.append(card)
 # Every publication branch, including pending locks and missing forecasts, has render metadata.
 for card in cards:
  card.setdefault('team_colors',{t:colors.get(t,{}).get('color','#384352') for t in [card['away'],card['home']]})
 prefix=ROOT/'work/in-season-learning-v1/trajectory-history.json'
 history=trajectories((json.loads(prefix.read_text()) if prefix.exists() else [])+rows)
 from engine.projection.card import code
 canonical={code(t):t for t in history}
 for card in cards:
  card['trajectory']={side:[x for x in sorted(history.get(canonical.get(card[side],card[side]),[]),key=lambda x:(x['season'],x['week'])) if (x['season'],x['week'])<=(card['season'],card['week'])][-6:] for side in ['home','away']}
  for folder in ['locks','grades','live']:
   sheet_path=ROOT/'outputs/game-card-v3'/folder/(card['game_id']+'.json')
   if sheet_path.exists():
    card['sheet']=json.loads(sheet_path.read_text()).get('sheet',{});break
  card['trajectory_basis']='Reconstructed pregame weekly adjusted rates; no current-game result used'
 scorecards=[]
 for version in sorted({g['version'] for g in cards}):
  for week in [None]+sorted({g['week'] for g in cards}):
   for evidence in ['AS_ISSUED','RETROSPECTIVE']:
    for source in ['PROJECTION','OURS']:
     samples=[g['grades'][source] for g in cards if g.get('grades') and source in g['grades'] and g['version']==version and g['evidence']==evidence and (week is None or g['week']==week)]
     scorecards.append({'version':version,'season':2026,'week':week,'evidence':evidence,'source':source,**score(samples)})
 board={'schema':'projection-board-v1','version':artifact['version'],'published_at':now.isoformat(),'default_week':1,'games':sorted(cards,key=lambda g:(g['kickoff_at'],g['game_id'])),'scorecards':scorecards,'inactive':artifact['inactive'],'wind_status':artifact['wind_status']};old=OUT/'board.json'
 if old.exists():
  prev=json.loads(old.read_text())
  if {k:v for k,v in prev.items() if k not in ('published_at','content_sha256')}=={k:v for k,v in board.items() if k!='published_at'}:board['published_at']=prev['published_at']
 board['content_sha256']=hashlib.sha256(json.dumps(board,sort_keys=True,separators=(',',':')).encode()).hexdigest();save(old,board);save(OUT/'scorecard.json',scorecards)
 from scripts.board_v7_publish import run as publish_board_evidence
 publish_board_evidence(board)
 return board
if __name__=='__main__':
 if '--sync' in sys.argv:sync()
 b=run(require_synced_entries='--sync' in sys.argv);print(json.dumps({'version':b['version'],'games':len(b['games']),'credits_spent':0}))
