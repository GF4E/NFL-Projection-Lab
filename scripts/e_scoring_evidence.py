"""Read-only E-SCORE control audit; no fitting or mutation of issued artifacts."""
import hashlib,json,statistics,sys
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.board_v7 import metadata
from scripts.projection_v3_publish import shape_for
OUT=ROOT/'work/e-scoring-environment'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def annual_bias(rows):
 pairs=defaultdict(list)
 for r in rows:
  if 2016<=r['season']<=2025:pairs[(r['season'],r['game_id'])].append(r)
 seasons=defaultdict(list)
 for (s,g),pair in sorted(pairs.items()):
  if len(pair)!=2 or {r['home'] for r in pair}!={False,True}:raise ValueError('Unpaired game '+g)
  seasons[s].append(sum(r['actual']-r['point'] for r in pair))
 return [{'season':s,'games':len(v),'signed_total_bias':statistics.mean(v)} for s,v in sorted(seasons.items())]
def run():
 reg=json.loads((OUT/'registration.json').read_text());assert sha(OUT/'registration.json')==(OUT/'registration.sha256').read_text().split()[0]
 for f,h in reg['file_hashes'].items():assert sha(ROOT/f)==h,f
 lockpath=ROOT/'outputs/projection-v3/locks/2026_02_DET_BUF.json';lock=json.loads(lockpath.read_text());original=sha(lockpath);meta=metadata(lock,shape_for(lock,None));actual={'away':31,'home':41}
 after={'lock_path':str(lockpath.relative_to(ROOT)),'lock_sha256':original,'version':lock['version'],'freeze_time':lock['freeze_time'],'final_source':'https://www.buffalobills.com/news/bills-41-lions-31-final-score-recap-highlights','final':{'DET':31,'BUF':41},'distribution_hash':meta['distribution_hash'],'teams':{}}
 for side in actual:
  t=meta['teams'][side];after['teams'][lock[side]]={'projection':t['expected'],'actual':actual[side],'error_actual_minus_projection':actual[side]-t['expected'],'intervals':t['intervals'],'inside':{level:band[0]<=actual[side]<=band[1] for level,band in t['intervals'].items()}}
 after['buffalo_contributions']=lock['contributions']['home'];assert abs(sum(c['points'] for c in after['buffalo_contributions'])-lock['projection']['home_points'])<1e-12
 after['total']={'projected':lock['projection']['total'],'actual':72,'error':72-lock['projection']['total']};after['margin']={'projected_home':lock['projection']['margin'],'actual_home':10,'error':10-lock['projection']['margin']}
 (OUT/'DET-BUF-after-action.json').write_text(json.dumps(after,indent=2)+'\n')
 lines=['# DET at BUF after-action','',f"Frozen {lock['version']}; {lock['freeze_time']}. Source lock SHA256: {original}.",'','Final BUF 41, DET 31, confirmed by official Bills recap. No lock/grade overwritten. Team intervals are reconstructed exactly with the locked version’s pinned distribution, not a new fit. Error means actual minus projection.','','| Team | Locked | Actual | Error | 50% interval / inside | 80% interval / inside |','|---|---:|---:|---:|---|---|']
 for team,t in after['teams'].items():lines.append(f"| {team} | {t['projection']:.4f} | {t['actual']} | {t['error_actual_minus_projection']:+.4f} | {t['intervals']['50']} / {t['inside']['50']} | {t['intervals']['80']} / {t['inside']['80']} |")
 lines+=['',f"Total: {after['total']['projected']:.4f} projected; 72 actual; {after['total']['error']:+.4f} error. BUF margin {after['margin']['projected_home']:.4f} projected; 10 actual; {after['margin']['error']:+.4f} error.",'','## Buffalo complete contribution table','','Additive fitted contributions, not independent causal effects. Zero/inactive rows retained below.','','| Input | Football label | Points | Status |','|---|---|---:|---|']
 for c in after['buffalo_contributions']:lines.append(f"| {c['input']} | {c['label']} | {c['points']:+.6f} | {c.get('status','')} |")
 lines.append(f"| **Sum** | | **{lock['projection']['home_points']:.6f}** | |")
 (OUT/'DET-BUF-after-action.md').write_text('\n'.join(lines)+'\n')
 rows=json.loads((ROOT/'work/projection-governance-v2/e1-calendar-corrected/oof.json').read_text())['linear'];annual=annual_bias(rows);values=[x['signed_total_bias'] for x in annual];mean=statistics.mean(values);se=statistics.stdev(values)/len(values)**.5;ci=[mean-2.2621571628540993*se,mean+2.2621571628540993*se]
 board=json.loads((ROOT/'outputs/projection-v3/board.json').read_text());games=[g for g in board['games'] if g['week']==1 and g.get('final') and g.get('evidence')=='AS_ISSUED'];errors=[g['final']['home_points']+g['final']['away_points']-g['projection']['total'] for g in games];ranked=sorted([{'game_id':g['game_id'],'team':g[s],'error':g['final'][s+'_points']-g['projection'][s+'_points']} for g in games for s in ('home','away')]+[{'game_id':lock['game_id'],'team':lock[s],'error':actual[s]-lock['projection'][s+'_points']} for s in ('away','home')],key=lambda x:abs(x['error']),reverse=True)
 result={'sign':'actual minus projected','source':reg['file_hashes']['work/projection-governance-v2/e1-calendar-corrected/oof.json'],'annual':annual,'equally_weighted_season_mean':mean,'season_mean_95_t_interval':ci,'systematic_under_C08':ci[0]>0 or ci[1]<0,'week1':{'games':len(games),'mean_total_error':statistics.mean(errors),'above_model_total':sum(x>0 for x in errors),'supplied_over_count':9,'supplied_count_verified':False,'board_sha256':sha(ROOT/'outputs/projection-v3/board.json')},'largest_team_misses_including_DET_BUF':ranked[:3],'comparative_candidate_results':None}
 (OUT/'control-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
 report=['# E-SCORE registration and control evidence','','REVIEW REQUESTED: C02/C03 prior exposure and trend; C04 centering; C05 chronological intercept; C08 definition of systematic bias. See GAP-SWEEP.md for decisions and alternatives. Registration only; challengers have not been fitted.','','Next in queue: E-SCORE, ahead of E2. Deadline Tuesday 2026-09-22 06:00 PT.','',f"Preregistration SHA256: {sha(OUT/'registration.json')}",'','## Historical control signed total bias','Positive = actual total above projection. Corrected E1 linear control, reused historical development evidence.','','| Season | Games | Actual minus projected total |','|---|---:|---:|']
 for r in annual:report.append(f"| {r['season']} | {r['games']} | {r['signed_total_bias']:+.3f} |")
 report+=['',f"Equal-season mean {mean:+.3f}; 95% season-level t interval [{ci[0]:+.3f}, {ci[1]:+.3f}]. Systematic level error under preregistered C08: {result['systematic_under_C08']}. This is control evidence only, not a candidate gate decision.",'',f"Week 1: {len(games)} AS_ISSUED games, mean total error {statistics.mean(errors):+.4f}, {sum(x>0 for x in errors)} above our projected total (supplied count 9 not reproduced). Three largest team misses including DET-BUF: {ranked[:3]}.",'','No fit, production method, frozen forecast or grade changed. Credits spent: 0.','Least sure: full-season fitted intercept could leak; candidate c uses only the training prefix, with hindsight season means isolated as descriptive evidence.']
 (OUT/'REPORT.md').write_text('\n'.join(report)+'\n');assert sha(lockpath)==original;print(json.dumps(result,indent=2))
if __name__=='__main__':run()
