"""Verify immutable source hashes, full coverage, chronology and baseline reproduction offline."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.harvest import digest,read
from engine.weather import run,BASE
m=json.loads((BASE/'weather-manifest.json').read_text())
assert digest(Path(m['table']))==m['sha256']
assert digest(BASE/'sources/stadiums.csv')==m['venues_sha256']
for path,sha in json.loads((BASE/'source-pins.json').read_text()).items():
 assert digest(Path(path))==sha
receipts=list((BASE/'requests').glob('*.json'))
for p in receipts:
 r=json.loads(p.read_text());assert digest(Path(r['path']))==r['sha256']
rows=read(m['table']);assert len(rows)==2895 and len({r['game_id'] for r in rows})==2895
assert all(r['wind_mph']!='' and r['temperature_c']!='' and r['precip_mm']!='' for r in rows if r['dome']=='0')
assert all(r['wind_mph']=='' and r['temperature_c']=='' and r['precip_mm']=='' for r in rows if r['dome']=='1')
result=run(BASE/'run-2')
assert all(r['training_max_season']<r['evaluation_season'] for r in result['coefficients'])
assert not result['promotion']
print(json.dumps(dict(status='PASS',table_rows=len(rows),responses_verified=len(receipts),paired_n=result['comparisons'][0]['paired_n'],immutable_replay=True)))
