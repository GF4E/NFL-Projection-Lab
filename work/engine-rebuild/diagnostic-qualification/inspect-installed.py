"""Read actual installed diagnostic source and normal scheduled publication."""
import datetime as dt,hashlib,json,subprocess,sys
from pathlib import Path
root=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
base=root/'work/engine-rebuild/diagnostic-qualification'
if not (base/'source-manifest.json').exists():
 print(json.dumps({'status':'WAITING_FOR_NORMAL_SOURCE_SYNC'}));sys.exit(0)
expected=json.loads((base/'source-manifest.json').read_bytes())['files']
files={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ('engine/projection_learning.py','engine/projection/weekly_diagnostics.py','scripts/projection_learning.py')}
assert all(expected[name]==h for name,h in files.items())
report=json.loads((root/'outputs/in-season-learning-v1/trend.json').read_bytes())
reference=json.loads((base/'linux-trend.json').read_bytes())
keys=['populations','learning','forecast_diagnostics','review_requested']
match={k:report.get(k)==reference[k] for k in keys}
protected={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for kind in ('locks','grades') for p in (root/'outputs/projection-v3'/kind).glob('*.json')}
fit=root/'work/in-season-learning-v1/active-fit-ref.json';protected[str(fit.relative_to(root))]=hashlib.sha256(fit.read_bytes()).hexdigest()
result={'status':'INSTALLED_AND_PUBLISHED' if all(match.values()) else 'SOURCE_INSTALLED_REPORT_PENDING','observed_at':dt.datetime.now(dt.timezone.utc).isoformat(),'host_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'source_files':files,'diagnostic_section_parity':match,'protected_records':protected,'active_fit_ref':json.loads(fit.read_bytes()),'trend_sha256':hashlib.sha256((root/'outputs/in-season-learning-v1/trend.json').read_bytes()).hexdigest(),'scope':'Read-only host source and normal scheduler report; no website display or recovery activation claim'}
print(json.dumps(result,indent=2))
