"""Publish measured sheets and quote DTOs. Human entries stay in private D1."""
import datetime,json,hashlib
from pathlib import Path
from zoneinfo import ZoneInfo
from engine.live_picks import overwrite
from engine.pick_store import read_pinned
from engine.harvest import canonical
ROOT=Path(__file__).resolve().parents[1]

def early_at(game):
 t=datetime.datetime.fromisoformat(game['kickoff_at']).astimezone(ZoneInfo('America/Los_Angeles'));m=t-datetime.timedelta(days=t.weekday())
 # Monday night is the last game of the preceding NFL week.
 if t.weekday()==0:m-=datetime.timedelta(days=7)
 return m.replace(hour=9,minute=0,second=0,microsecond=0).isoformat()

def publish(root=ROOT):
 root=Path(root);out=root/'outputs/iron-man-v1';p=out/'sensors.json'
 if not p.exists():return
 sensors=json.loads(p.read_text());schedule=json.loads((out/'schedule.json').read_text());games=[]
 for g in schedule['games']:
  if g['week']!=sensors['week']:continue
  path=out/'markets'/f"{g['game_id']}.json";ctx=json.loads(path.read_text()) if path.exists() else None
  locks=[json.loads(p.read_text()) for p in (out/'locks').glob(g['game_id']+'-*.json')]
  v={'game':g,'early_at':early_at(g),'sheet_status':sensors['status'],'teams':{t:sensors['teams'].get(canonical(t),{}) for t in (g['away_abbr'],g['home_abbr'])},'context':ctx,'locks':[{k:r[k] for k in ('market','phase','locked_at','verdict') if k in r} for r in locks],'no_autonomous_picks':True}
  for record in v['locks']:
   record['verdict']={k:x for k,x in record['verdict'].items() if k in ('verdict','side','line','book','price','stake_dollars','reason','gap','fair_probability','EV','edge_cents')}
  if ctx:
   margin=ctx['consensus']['spreads']['full']['center'];total=ctx['consensus']['totals']['full']['center']
   v['outside_view']=f"Market: {g['home_abbr'] if margin>=0 else g['away_abbr']} by {abs(margin):g}, total {total:g}." if margin is not None and total is not None else 'Market view unavailable: incomplete consensus.'
  else:v['outside_view']='Market view unavailable until the registered capture. Enter your independent number first.'
  v['base_rate']={'status':'MEASURE','n':None,'window':'2016–2025 REG','reason':'No completed situational study promoted; no rate asserted'}
  games.append(v)
 config=json.loads((root/'work/model-pick-v1/runtime-config.json').read_text());shape=read_pinned(config['distribution'])
 feedback=json.loads((out/'feedback.json').read_text()) if (out/'feedback.json').exists() else {'rows':[],'calibration':[]}
 maps=sorted((out/'confidence-maps').glob('*.json'))
 confidence_maps=json.loads(maps[-1].read_text()) if maps else None
 value={'confidence_config':json.loads((root/'config/confidence_map.json').read_text()),'confidence_maps':confidence_maps,'schema':'iron-man-suit-v1','season':sensors['season'],'week':sensors['week'],'as_of':sensors['as_of'],'status':sensors['status'],'definitions':sensors['definitions'],'source_hashes':sensors['source_hashes'],'games':games,'distribution':shape,'distribution_hash':config['distribution']['sha256'],'feedback':feedback,'unit_dollars':50,'weekly_sizing_capital':1000}
 overwrite(out/'board.json',value)
