"""Independent arithmetic check of serialized VALUE windows; does not fit models."""
import collections,datetime as dt,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));O=ROOT/'work/e-elo-qb-value-v2'
def run():
 ref=json.loads((O/'value-data-ref.json').read_text());perf=json.loads((ROOT/ref['performance']['path']).read_text());rows=json.loads((ROOT/ref['values']['path']).read_text());byqb=collections.defaultdict(list);bygame=collections.defaultdict(list)
 for r in perf:byqb[r['id']].append(r);bygame[r['game_id'],r['team']].append(r)
 for v in byqb.values():v.sort(key=lambda r:(r['completed_at'],r['game_id']))
 maxdiff=0.;n=0;unknown=collections.Counter();coverage={}
 for row in rows:
  cutoff=dt.datetime.fromisoformat(row['T75_utc']);ts=[p for gid in row['team_game_ids'] for p in bygame[gid,row['team']]]
  for label,q in [('rule',row['selected_qb']),('oracle',row['oracle_qb'])]:
   past=[p for p in byqb[q] if p['attempts']>=5 and dt.datetime.fromisoformat(p['completed_at'])<cutoff][-16:] if q else []
   assert [p['game_id'] for p in past]==row['values'][label]['game_ids']
   if q and len(past)<16 and any(p['season']==2000 for p in past):raise AssertionError('Left-censored QB history reaches dataset start')
   for component in ['epa','combined']:
    v=row['values'][label][component]
    def average(items):
     if not items or any(p['epa'] is None or component=='combined' and p['cpoe'] is None for p in items):return None
     total=0;attempts=0
     for p in items:
      per_attempt=p['epa']/p['attempts']
      if component=='combined':per_attempt+=p['cpoe']/100
      total+=p['attempts']*per_attempt;attempts+=p['attempts']
     return total/attempts
    own=average(past);team=average(ts)
    for expected,stored in [(own,v['own']),(team,v['team'])]:
     assert (expected is None)==(stored is None)
     if expected is not None:maxdiff=max(maxdiff,abs(expected-stored));n+=1
    if v['difference'] is None:unknown[label,component]+=1
 assert maxdiff<1e-12,maxdiff
 result={'windows':len(rows),'independently_checked_means':n,'max_abs_difference':maxdiff,'prior_16_game_selection_matches':True,'left_censoring_into_2000':0,'unknown_differences':{':'.join(k):v for k,v in unknown.items()},'performance_sha256':ref['performance']['sha256'],'values_sha256':ref['values']['sha256']};(O/'independent-arithmetic.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':run()
