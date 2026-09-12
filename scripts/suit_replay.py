"""Replay iron-man-week2-synthetic-v1 offline; no provider or live entry calls."""
import datetime as dt,hashlib,json,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts.suit_runner import lock
from engine.suit_feedback import grade
from engine.pick_store import put

def run():
 game={'game_id':'SYNTHETIC_SUIT_V1','season':2026,'week':2,'home_team':'Home','away_team':'Away','kickoff_at':'2026-09-20T17:00:00+00:00','capture_at':'2026-09-20T15:40:00+00:00','cutoff_at':'2026-09-20T15:45:00+00:00'}
 context={'game':game,'consensus':{'spreads':{'full':{'center':3}},'totals':{'full':{'center':45}}},'offers':[{'market':'spreads','side':'Home','line':-3,'price':-110,'book':'betmgm'},{'market':'totals','side':'Over','line':45,'price':-110,'book':'betmgm'}],'capture_label':'EARLY','captured_at':'2026-09-14T16:00:10+00:00','capture_source_hash':hashlib.sha256(b'synthetic-not-provider').hexdigest()}
 entries=[{'game_id':game['game_id'],'person':p,'spread':-10,'total':52,'confidence':c,'tags':['PRICE'],'input_class':'PRE_OPEN','submitted_at':'2026-09-13T20:00:00+00:00'} for p,c in [('Gabe',4),('Jarrett',3)]]
 with tempfile.TemporaryDirectory() as tmp:
  root=Path(tmp);(root/'config').mkdir();(root/'work/model-pick-v1').mkdir(parents=True)
  for path in ('config/confidence_map.json','work/model-pick-v1/runtime-config.json'):(root/path).write_bytes((ROOT/path).read_bytes())
  now=dt.datetime.fromisoformat('2026-09-14T16:00:15+00:00');lock(game,context,entries,'EARLY',now,root)
  paths=sorted((root/'outputs/iron-man-v1/locks').glob('*.json'));before={p.name:p.read_bytes() for p in paths};lock(game,context,entries,'EARLY',now,root);assert all(p.read_bytes()==before[p.name] for p in paths)
  records=[json.loads(p.read_text()) for p in paths];assert len(records)==2 and all(r['verdict']['verdict']=='BET' and r['verdict']['person']=='Jarrett' for r in records)
  grades=[grade(l,{'home_score':30,'away_score':21,'spread_line':4,'total_line':46,'source_sha256':'synthetic-finals'}) for r in records for l in r['leans']];assert all(g['outcome']=='W' for g in grades)
  report={'experiment':'iron-man-week2-synthetic-v1','evidence':'SYNTHETIC_OFFLINE_NOT_LIVE','credits_spent':0,'locks':len(records),'graded_leans':len(grades),'combined_stake':sum(r['verdict']['stake_dollars'] for r in records),'immutable_replay':True,'result':'PASS','lock_hashes':{k:hashlib.sha256(v).hexdigest() for k,v in before.items()}}
  assert report['combined_stake']<=100
  return report
if __name__=='__main__':
 report=run();put(ROOT/'work/iron-man-v1/synthetic-replay.json',report);print(json.dumps(report,sort_keys=True))
