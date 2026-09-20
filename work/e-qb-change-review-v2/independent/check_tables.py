"""Independent metrics/whole-game bootstrap from pinned forecast bytes and ledger cells."""
import json,hashlib
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[3];O=ROOT/'work/e-qb-change-review-v2';I=O/'independent'
def load(p):return json.loads(p.read_text())
reg=load(ROOT/'work/e-qb-change/registration.json');control=load(ROOT/reg['control']);assert hashlib.sha256((ROOT/reg['control']).read_bytes()).hexdigest()==reg['files'][reg['control']]
games=load(O/'game-ledger.json');res=load(O/'results.json');extra=load(O/'additional-sensitivities.json');point={r['game_id']:r for r in control};names=['team_mae','team_bias','margin_mae','margin_bias'];cache={};checks=[];failures=[]
# Team pair preserved in each single four-metric game row.
def arr(rows):
 out=[]
 for r in rows:
  x=point[r['game_id']];e=np.subtract([x['home'],x['away']],[x['actual_home'],x['actual_away']]);out.append([np.mean(np.abs(e)),np.mean(e),abs(e[0]-e[1]),e[0]-e[1]])
 return np.asarray(out).reshape((-1,4))
def stats(rows):
 a=arr(rows);return {'games':len(rows),**dict(zip(names,a.mean(axis=0).tolist() if len(rows) else [None]*4))}
def calc(rows,base):
 key=(tuple(r['game_id'] for r in rows),tuple(r['game_id'] for r in base))
 if key in cache:return cache[key]
 out=stats(rows);out['stable_baseline']=stats(base)
 if rows and base:
  a,b=arr(rows),arr(base);gen=np.random.default_rng(20260919);samples=np.empty((2000,4))
  for k in range(2000):
   ia=gen.integers(0,len(a),len(a));ib=gen.integers(0,len(b),len(b));samples[k]=a[ia].mean(0)-b[ib].mean(0)
  out['difference_from_stable']=dict(zip(names,(a.mean(0)-b.mean(0)).tolist()));out['difference_percentile95']=dict(zip(names,np.percentile(samples,[2.5,97.5],axis=0).T.tolist()))
 cache[key]=out;return out
maxerr=0.
def check(path,a,b):
 global maxerr
 if isinstance(a,dict):
  for k in a:check(path+'/'+k,a[k],b[k])
 elif a is None:assert b is None,path
 elif isinstance(a,(int,float,list)):
  delta=float(np.max(np.abs(np.asarray(a)-np.asarray(b))));maxerr=max(maxerr,delta)
  if delta>1e-10:failures.append({'path':path,'max_error':delta})
 else:assert a==b,path

def compare(path,rows,base,target):
 check(path,calc(rows,base),target);checks.append({'path':path,'games':len(rows),'stable_games':len(base)})
C=[r for r in games if r['starter_group']=='CHANGED'];B=[r for r in games if r['starter_group']=='STABLE']
for group in res['groups']:check('groups/'+group,stats([r for r in games if r['starter_group']==group]),res['groups'][group])
compare('changed_vs_stable',C,B,res['changed_vs_stable'])
for y,v in res['seasons'].items():compare('seasons/'+y,[r for r in C if r['season']==int(y)],[r for r in B if r['season']==int(y)],v)
for y,v in res['leave_one_season_out'].items():compare('leave_one_season_out/'+y,[r for r in C if r['season']!=int(y)],[r for r in B if r['season']!=int(y)],v)
for dim,cells in res['cells'].items():
 for value,target in cells.items():
  if dim in ['knowledge','role','observed_history']:
   c=[r for r in C if any(z[dim]==value for z in r['changed_teams'])];b=B
  else:c=[r for r in C if str(r[dim])==value];b=[r for r in B if str(r[dim])==value]
  compare('cells/'+dim+'/'+value,c,b,target)
compare('disputed_exclusion',[r for r in C if r['game_id']!='2025_18_NYJ_BUF'],B,res['disputed_exclusion'])
Q=[r for r in C if any(z['announcement'] for z in r['changed_teams'])];V=[r for r in Q if any(z['announcement'] and z['announcement'].get('timestamp_strength')=='PUBLISH_AND_MODIFIED_METADATA_BEFORE_T75' for z in r['changed_teams'])]
for name,c in [('qualified_any_side',Q),('unqualified_all_sides',[r for r in C if r not in Q]),('strongest_provenance',V)]:compare('availability/'+name,c,B,res['availability_sensitivity'][name])
assert len(V)==res['availability_sensitivity']['strict_exact_timestamp_announcement_games']
disputes={'2025_04_WAS_ATL','2025_16_NYJ_NO','2025_18_NYJ_BUF'};mismatches={r['game_id'] for r in load(O/'source-cross-checks.json')['mismatches']}
compare('extra/three_verified_disputes_excluded',[r for r in C if r['game_id'] not in disputes],B,extra['three_verified_disputes_excluded'])
compare('extra/all_pbp_disagreements_excluded',[r for r in C if r['game_id'] not in mismatches],[r for r in B if r['game_id'] not in mismatches],extra['all_pbp_disagreements_excluded'])
ann=load(O/'announcement-qualification.json');liberal={(r['game_id'],r['team']) for r in ann['accepted']+ann['unaccepted'] if 'CONTRADICT' not in r.get('support','') and r.get('game_id') not in disputes}
# Explicit original-publication eligibility; reject source identity contradictions and retain before-lock published articles.
import datetime as dt
lib=set()
for a in ann['accepted']+ann['unaccepted']:
 gid=a['game_id'];gr=next((r for r in games if r['game_id']==gid),None)
 if not gr or gid in disputes:continue
 pubs=[x.get('datePublished') for x in a.get('structured_metadata',[]) if x.get('datePublished')]
 if pubs and min(dt.datetime.fromisoformat(t.replace('Z','+00:00')) for t in pubs)<dt.datetime.fromisoformat(gr['T75_utc']):lib.add((gid,a['team']))
L=[r for r in C if any((r['game_id'],z['team']) in lib for z in r['changed_teams'])]
compare('extra/liberal_original_publication_sensitivity_NOT_QUALIFIED',L,B,extra['liberal_original_publication_sensitivity_NOT_QUALIFIED'])
out={'central':'All descriptive metric cells and game-bootstrap intervals independently recomputed; coverage/source qualification reviewed separately','control_sha256':hashlib.sha256((ROOT/reg['control']).read_bytes()).hexdigest(),'ledger_sha256':hashlib.sha256((O/'game-ledger.json').read_bytes()).hexdigest(),'results_sha256':hashlib.sha256((O/'results.json').read_bytes()).hexdigest(),'additional_sha256':hashlib.sha256((O/'additional-sensitivities.json').read_bytes()).hexdigest(),'comparisons':checks,'count':len(checks),'max_abs_discrepancy':maxerr,'failures':failures}
(I/'full-table-recomputation.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k!='comparisons'},indent=2));assert not failures
