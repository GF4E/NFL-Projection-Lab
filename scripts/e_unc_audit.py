"""Read-only incumbent audit. No candidate fits, comparisons or promotion."""
import json,hashlib,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def main():
 ref=json.loads((ROOT/'work/in-season-learning-v1/reference.json').read_text())['oof'];raw=(ROOT/ref['path']).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('OOF hash mismatch')
 rows=json.loads(raw);result=[]
 for season in [*range(2016,2026),'all']:
  selected=[r for r in rows if season=='all' or r['season']==season]
  h=np.array([r['actual_home']-r['home'] for r in selected]);a=np.array([r['actual_away']-r['away'] for r in selected]);team=np.concatenate([h,a])
  result.append({'season':season,'games':len(selected),'rho':float(np.corrcoef(h,a)[0,1]),'observed_oof_error_variance':float(np.var(team,ddof=1)),'parameter_variance':None,'irreducible_variance':None,'parameter_to_irreducible_ratio':None,'variance_status':'NOT_IDENTIFIED_BY_SINGLE_OOF_SERIES; includes parameter error, game variation and model discrepancy'})
 out={'source':ref,'population':'Existing incumbent adaptive OOF 2016–2025, retrospective audit only; not challenger calibration','seasons':result,'predictive_not_mean_confidence':True,'independent_team_interval_combination':False}
 (ROOT/'work/e-unc/audit.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps(result[-1]))
if __name__=='__main__':main()
