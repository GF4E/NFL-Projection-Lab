"""Read-only full-population timezone/calendar verification, not a fitted replay."""
import datetime as dt
import hashlib,json,sys
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.forecast_system.calendar import schedule_kickoff
from engine.forecast_system.cadence import plan,audit
from engine.projection_v3.qualify import read
cat=json.loads((ROOT/'work/series-registry/catalog.json').read_text());ref=next(x for x in cat['series'] if x['path']==cat['authoritative_control'] and x['authoritative']);control=read(ref)
v1=read(json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text()));schedule=read(v1['source_manifest']['schedule']);by={g['game_id']:g for g in schedule};games=[];seasons={}
for r in control:
 g=by[r['game_id']];instant=schedule_kickoff(g['gameday'],g['gametime'])
 old=dt.datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc)
 assert instant==old
 games.append({'game_id':r['game_id'],'season':r['season'],'issuance_at':(instant-dt.timedelta(minutes=75)).isoformat(),'assimilation_available_at':(instant+dt.timedelta(hours=4)).isoformat()})
 seasons[str(r['season'])]=seasons.get(str(r['season']),0)+1
batches=plan(games);assert audit(games,batches)==2639
result={'scope':'Source timezone and three-cutoff eligibility only; not a rating/point forecast replay or proof of historical provider availability','control':ref['path'],'control_sha256':ref['sha256'],'schedule':v1['source_manifest']['schedule'],'games_checked':len(games),'by_season':seasons,'changed_kickoffs_vs_shipping_converter':0,'early_or_duplicate_assimilations':0,'cutoffs_checked':len(batches),'lineage_sha256':hashlib.sha256(json.dumps(batches,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
Path(__file__).with_name('calendar-check.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
