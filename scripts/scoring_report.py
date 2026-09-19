"""Additive scoringrules report from saved as-issued distributions, never a fit."""
import sys,json,hashlib,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.scoring import pmf_crps,tail_pmf_crps,interval_score,brier
from engine.projection.distribution import pmf,quantile
from scripts.projection_v3_publish import shape_for

def run():
 path=ROOT/'outputs/projection-v3/board.json';board=json.loads(path.read_text());rows=[];winners=[]
 for g in board['games']:
  if g.get('evidence')!='AS_ISSUED' or not g.get('final') or not g.get('projection'):continue
  shapes=shape_for(g,None);pred=g['projection'];actual=g['final']
  for side in ('away','home'):
   mass=pmf(shapes['team_points'],pred[side+'_points']);lo,hi=quantile(mass,.1),quantile(mass,.9);y=actual[side+'_points'];row={'game_id':g['game_id'],'team':g[side],'version':g['version'],'distribution_sha256':shapes['team_points']['sha256'],'point':pred[side+'_points'],'actual':y,'crps':pmf_crps(mass,y),'tail_twcrps':tail_pmf_crps(mass,y,lo,hi),'tail_bounds80':[lo,hi]}
   for level in (.5,.8):
    l,h=quantile(mass,(1-level)/2),quantile(mass,1-(1-level)/2);row['winkler'+str(int(level*100))]=interval_score(l,h,y,level)
   rows.append(row)
  outcome=1 if actual['home_points']>actual['away_points'] else 0 if actual['home_points']<actual['away_points'] else .5
  winners.append({'game_id':g['game_id'],'brier':brier(pred['home_win_probability'],outcome)})
 result={'label':'ADDITIVE_REPORT_NOT_A_METHOD_GATE','package':'scoringrules==0.10.0','board_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'team_rows':len(rows),'games':len(winners),'mean':{k:statistics.mean(r[k] for r in rows) if rows else None for k in ['crps','tail_twcrps','winkler50','winkler80']},'brier':statistics.mean(r['brier'] for r in winners) if winners else None,'rows':rows,'winner_rows':winners,'tail_weight':'1 outside each issued forecast central80 interval; 0 inside; forecast-specific diagnostic, not a common-weight cross-model gate'}
 out=ROOT/'work/harvest-scan/e-score-tooling/season-report.json';out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ('rows','winner_rows')}))
if __name__=='__main__':run()
