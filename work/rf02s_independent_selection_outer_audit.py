from pathlib import Path
import json,collections,hashlib
import numpy as np
p=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02s-v1-c4fc78f7beb8c9ee');s=json.loads((p/'selection-2013.json').read_text());acc=collections.defaultdict(dict)
for season in (2011,2012):
 for week in range(1,18):
  for r in json.loads((p/f'inner-losses-{season}-{week:02}.json').read_text()):
   acc[(r['family'],r['setting'])][(season,r['game_id'])]=(r['metrics']['joint_energy_score'],r['native_failure'] is not None)
result={}
for fam,d in s.items():
 assert d['inner_seasons']==[2011,2012] and d['games']==512
 for c in d['candidates']:
  rows=[acc[(fam,c['setting'])][k] for k in sorted(acc[(fam,c['setting'])])];assert len(rows)==512
  e=float(np.mean([r[0] for r in rows]));f=float(np.mean([r[1] for r in rows]));assert e==c['mean_energy'] and f==c['failure_rate'] and c['eligible']==(f<=.005)
 good=[c for c in d['candidates'] if c['eligible']];minimum=min(c['mean_energy'] for c in good);chosen=next(c['setting'] for c in good if c['mean_energy']<=minimum+1e-8);assert chosen==d['setting'];result[fam]={'setting':chosen,'inner_games':512}
count=0;maxerr=0.;failures=0
for week in (1,2):
 st=json.loads((p/f'state-2013-{week:02}.json').read_text());tr={tuple(t['key']):{f['game_id']:f for f in t['output']['forecasts']} for t in st['trajectory_state']};fc=json.loads((p/f'forecasts-2013-{week:02}.json').read_text()); outer=fc['outer_selected_forecasts'];assert len(outer)==640
 for f in outer:
  family,variant,gid,j=f['family'],f['variant'],f['game_id'],f['setting'];assert j==s[family]['setting'];tv='full' if variant in ('independent_marginals','deterministic_noise') else variant
  assert f['native_failure'] is None
  requested=np.array(tr[(family,j,tv)][gid]['mean'])
  if variant=='deterministic_noise':
   for sidei,side in enumerate(('home','away')):
    raw=json.dumps([20260904,'noise',gid,side],ensure_ascii=True,separators=(',',':')).encode();seed=int.from_bytes(hashlib.sha256(raw).digest()[:8],'big');requested[sidei]+=np.random.Generator(np.random.PCG64(seed)).standard_normal()
  dist=f['distribution'];err=float(np.max(np.abs(requested-dist['mean'])));maxerr=max(maxerr,err);assert err<=1e-7
  assert dist['independent']==(variant=='independent_marginals')
  count+=1
report={'selection2013':'all43settings recomputed from saved2011_2012_losses_only; no fitting','families':result,'outer_requested_mean_comparisons':count,'outer_max_requested_fit_error':maxerr,'outer_native_failures':failures,'no_football_fits_or_replay':True}
out=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02s_independent_selection_outer_audit.json');out.write_text(json.dumps(report,sort_keys=True,indent=2)+'\n');print(json.dumps(report,indent=2))
