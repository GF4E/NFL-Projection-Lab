from pathlib import Path
import json,pandas as pd,numpy as np,hashlib,datetime as dt
ROOT=Path(__file__).resolve().parents[3];O=ROOT/'work/e-qb-change-review-v2';I=O/'independent'
g=json.loads((O/'game-ledger.json').read_text());s=json.loads((O/'changed-team-ledger.json').read_text());ind=pd.read_csv(I/'independent-rows.csv').set_index('game_id');raw={(r['game_id'],r['team']):r for r in json.loads((I/'2025-chart-review.json').read_text())['rows']};issues=[]
assert len(g)==2639 and len(set(x['game_id'] for x in g))==2639
assert len(s)==660 and len(set((x['game_id'],x['team']) for x in s))==660
for r in g:
 ref=ind.loc[r['game_id']];assert r['starter_group']==ref['group'];assert abs((r['home']-r['actual_home'])-ref.home_error)<1e-12
for r in s:
 cut=dt.datetime.fromisoformat(r['T75_utc'])
 if r['chart'] and r['chart']['at']:assert dt.datetime.fromisoformat(r['chart']['at'].replace('Z','+00:00'))<cut
 for q in r['reconstructed_quality'].values():
  if q['latest_included_completion_proxy']:assert dt.datetime.fromisoformat(q['latest_included_completion_proxy'])<cut
 assert r['as_issued_engine_qb'] is None and r['as_issued_status']=='NOT_RECORDED_IN_HISTORICAL_CONTROL'
 if r['season']==2025 and r['reconstructed_chart_selector_qb']!=raw[(r['game_id'],r['team'])]['ids'][0]:issues.append({'game_id':r['game_id'],'team':r['team'],'issue':'raw chart selection differs','main':r['reconstructed_chart_selector_qb'],'raw':raw[(r['game_id'],r['team'])]['ids']})
res={'game_count':len(g),'changed_team_sides':len(s),'membership_and_error_checks':'PASS','strict_chart_and_prior_value_chronology':'PASS','reconstructed_identity_not_as_issued':'PASS','chart_disagreements':issues,'ledger_sha256':hashlib.sha256((O/'game-ledger.json').read_bytes()).hexdigest()}
(I/'ledger-check.json').write_text(json.dumps(res,indent=2)+'\n');print(json.dumps(res,indent=2))
