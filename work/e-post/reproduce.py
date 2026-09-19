"""Read-only reconciliation; deliberately performs no fitting."""
import collections, hashlib, json, statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def load(p):return json.loads((ROOT/p).read_text())
def metrics(p,y):
 return {'games':len(p)//2,'team_mae':statistics.mean(abs(a-b) for a,b in zip(p,y)),
 'signed_bias_projected_minus_actual':statistics.mean(a-b for a,b in zip(p,y)),
 'projected_sd_population':statistics.pstdev(p)}
def main():
 files={}
 def read(p):
  files[p]=hashlib.sha256((ROOT/p).read_bytes()).hexdigest();return load(p)
 baseline=str(next((ROOT/'work/projection-v3').glob('baseline-oof-bb7a7f0a*.json')).relative_to(ROOT))
 r=read(baseline);result={'baseline':metrics([g[s] for g in r for s in ('away','home')],[g['actual_'+s] for g in r for s in ('away','home')])}
 result['baseline_mean_within_season_sd']=statistics.mean(statistics.pstdev(g[s] for g in r if g['season']==year for s in ('away','home')) for year in range(2016,2026))
 r=[g for g in read('work/projection-governance-v2/e1-calendar-corrected/oof.json')['linear'] if 2016<=g['season']<=2025]
 result['REPLAY']=metrics([g['point'] for g in r],[g['actual'] for g in r])
 cards=[read(str(p.relative_to(ROOT))) for p in sorted((ROOT/'outputs/projection-v3/grades').glob('2026_*.json'))]
 cards=[g for g in cards if g.get('evidence')=='AS_ISSUED']
 result['as_issued']=metrics([g['projection'][s+'_points'] for g in cards for s in ('away','home')],[g['grades']['PROJECTION']['actual'][s+'_points'] for g in cards for s in ('away','home')])
 result['as_issued_versions']=dict(collections.Counter(g['version'] for g in cards))
 ref=read('work/in-season-learning-v1/active-fit-ref.json');artifact=read(ref['path']);board=read('outputs/projection-v3/board.json')
 result['production']={'active_fit':ref,'version':artifact['version'],'groups':artifact['groups'],'board_version':board['version'],'board_published_at':board['published_at'],'upcoming_versions':dict(collections.Counter(g['version'] for g in board['games'] if g['status']=='UPCOMING')),'trace':'scripts/projection_v3_publish.py:run -> scripts/projection_learning.py:active_artifact -> active-fit-ref.json; make_card uses active artifact. Existing locks are preserved.'}
 result['state']='STOPPED_PRODUCTION_CONTROL_MISMATCH';result['sources']=files
 (ROOT/'work/e-post/reproduction.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
 print(json.dumps({k:v for k,v in result.items() if k!='sources'},indent=2))
if __name__=='__main__':main()
