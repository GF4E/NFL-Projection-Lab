"""Read-only incumbent audit. No candidate fits, comparisons or promotion."""
import json,hashlib,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def main():
 source=ROOT/'work/projection-governance-v2/e1-calendar-corrected/oof.json';raw=source.read_bytes()
 ref={'path':str(source.relative_to(ROOT)),'sha256':hashlib.sha256(raw).hexdigest(),'candidate':'linear'}
 by={}
 for r in json.loads(raw)['linear']:
  if 2016<=r['season']<=2025:by.setdefault(r['game_id'],{})[r['home']]=r
 rows=[{'season':p[True]['season'],'home':p[True]['point'],'away':p[False]['point'],'actual_home':p[True]['actual'],'actual_away':p[False]['actual']} for _,p in sorted(by.items())]
 result=[]
 for season in [*range(2016,2026),'all']:
  selected=[r for r in rows if season=='all' or r['season']==season]
  h=np.array([r['actual_home']-r['home'] for r in selected]);a=np.array([r['actual_away']-r['away'] for r in selected]);team=np.concatenate([h,a])
  result.append({'season':season,'games':len(selected),'rho':float(np.corrcoef(h,a)[0,1]),'observed_oof_error_variance':float(np.var(team,ddof=1)),'parameter_variance':None,'irreducible_variance':None,'parameter_to_irreducible_ratio':None,'variance_status':'NOT_IDENTIFIED_BY_SINGLE_OOF_SERIES; includes parameter error, game variation and model discrepancy'})
 out={'source':ref,'population':'Retained linear incumbent OOF 2016–2025, retrospective audit only; not challenger calibration','seasons':result,'predictive_not_mean_confidence':True,'independent_team_interval_combination':False}
 (ROOT/'work/e-unc/audit.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps(result[-1]))
if __name__=='__main__':main()
