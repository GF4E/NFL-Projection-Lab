"""Label historical forecast series without rewriting immutable forecast bytes."""
import collections,datetime,gzip,hashlib,json,statistics,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CONTROL='work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json'
def stats(rows,point):
 pairs=[];gids=set()
 for r in rows:
  if not 2016<=int(r.get('season',0))<=2025 or r.get('target','team') not in ('team','team_points'):continue
  if 'actual_home' in r:
   pairs.extend((r[s],r['actual_'+s]) for s in ('home','away'));gids.add(r['game_id'])
  else:
   p=r.get(point);a=r.get('actual',r.get('actual_points'))
   if p is not None and a is not None:pairs.append((p,a));gids.add(r['game_id'])
 if not pairs:return {'status':'NO_TEAM_POINT_ROWS'}
 p,y=zip(*pairs);pm=statistics.mean(p);ym=statistics.mean(y);den=sum((x-pm)**2 for x in p)
 return dict(games=len(gids),team_observations=len(p),mae=statistics.mean(abs(a-b) for a,b in pairs),bias=pm-ym,slope=sum((a-pm)*(b-ym) for a,b in pairs)/den if den else None,sd=statistics.pstdev(p))
def main():
 tracked=subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines();files=[f for f in tracked if ('oof' in Path(f).name and f.endswith('.json'))]
 files += [f for f in tracked if f.endswith(('verified-games.json','verified-games.json.gz','scored-games.json.gz','secondary-games.json.gz')) and any(t in f for t in ['projection-','e-unc'])]
 records=[]
 for f in sorted(set(files)):
  raw=(ROOT/f).read_bytes();v=json.loads(gzip.decompress(raw) if f.endswith('.gz') else raw);batches=v if isinstance(v,dict) else {'series':v}
  date=subprocess.check_output(['git','log','--diff-filter=A','--format=%aI','--',f],cwd=ROOT,text=True).strip().splitlines()[-1:]
  born=subprocess.check_output(['git','log','--diff-filter=A','--format=%H','--',f],cwd=ROOT,text=True).strip().splitlines()[-1:]
  for name,rows in batches.items():
   if not isinstance(rows,list) or not rows or not isinstance(rows[0],dict):continue
   points=['point']
   if 'core_median' in rows[0]:points=['core_median']
   elif 'projected_points' in rows[0]:points=['projected_points']
   elif 'median' in rows[0]:points=[k for k in ('median','raw','v1') if k in rows[0]]
   for point in points:
    m=stats(rows,point)
    if m.get('status'):continue
    status='AUTHORITATIVE' if f==CONTROL else 'INVALIDATED_REPLAY' if 'week-label-run' in f else 'REPLAY' if any(x in f for x in ['e1/','e1-calendar','e-unc']) else 'SUPERSEDED'
    if 'phase-a' in f:code='scripts/forecast_system_phase_a.py; fold fits in core-manifest.json and emos-YYYY.json'
    elif 'e-unc' in f:code='scripts/e_unc_evaluate.py / e_unc_secondary.py; E1 linear point fits and fits.json scale fits'
    elif 'e1' in f:code='scripts/e1_evaluate.py / e1_calendar_run.py; core-<candidate>-<season>.json and state-fit-<season>.json'
    elif 'v2w' in f:code='scripts/deployed_lineage_replay.py using source commit 538ce1f4; production fit 8bd58561 settings; per-issuance training hashes in replay-receipt.json'
    else:code=f"engine/{Path(f).parent.name.replace('-','_')}/qualify.py (v1: train.py); companion experiment/fit references. Per-season fitted lineage, not today's active fit."
    note='Sole future gate control; historical delivery timing approximation disclosed in REPLAY-PLAN.md.' if status=='AUTHORITATIVE' else 'Non-authoritative: never use as current production gate control.'
    if 'baseline-oof' in f:note+=' Stale uncalibrated baseline: its bias and slope are artifacts of the superseded fit, not production. No deployed fit issued this OOF file as current control.'
    records.append(dict(path=f,component=name+'/'+point,sha256=hashlib.sha256(raw).hexdigest(),date_added=date[0] if date else 'UNKNOWN',archive_commit=born[0] if born else 'UNKNOWN',status=status,authoritative=status=='AUTHORITATIVE',producer_and_fit=code,note=note,metrics=m))
 groups=collections.defaultdict(list)
 for r in records:groups[str(Path(r['path']).parent)].append(r)
 for folder,items in groups.items():
  lines=['# Historical series identity','', 'Metrics recomputed on available 2016–2025 team-point rows. Bias = projected minus actual; slope = actual on projected; SD = population SD. File-addition dates and archive commits identify repository provenance, not an invented original fit time. A multi-fold series has multiple fits; producer/manifests are listed below.','', '| File / component | Status | Games | MAE | Bias | Slope | SD |','|---|---|---:|---:|---:|---:|---:|']
  for r in items:
   m=r['metrics'];lines.append(f"| {Path(r['path']).name} / {r['component']} | {r['status']} | {m['games']} | {m['mae']:.4f} | {m['bias']:+.4f} | {m['slope']:.4f} | {m['sd']:.4f} |")
  for r in items:lines+=['',f"**{Path(r['path']).name} / {r['component']}**",f"Date added: {r['date_added']}; archive commit: {r['archive_commit']}; SHA256: {r['sha256']}.",r['producer_and_fit']+'.',r['note']]
  (ROOT/folder/'SERIES.md').write_text('\n'.join(lines)+'\n')
 reg={'authoritative_control':CONTROL,'authority_scope':'All future engine method gates; freeze this control until a separately authorized production-lineage replacement.','metrics_convention':'2016-2025 available team rows; projected-minus-actual bias; population SD; OLS slope actual on projected','series':records,'scope':'Tracked out-of-fold series and derived scored/verified series. Unit-test fixtures, per-game live locks and raw inputs are not rolling-origin evaluation series.'}
 previous=ROOT/'work/series-registry/catalog.json'
 if previous.exists():reg['external_comparators']=json.loads(previous.read_text()).get('external_comparators',{})
 (ROOT/'work/series-registry/catalog.json').write_text(json.dumps(reg,indent=2)+'\n')
 (ROOT/'work/series-registry/SERIES.md').write_text('# Rolling-origin series registry\n\nSole authoritative gate control: '+CONTROL+'\n\nAll other catalogued series are non-authoritative. Full identity, per-fold fit references, dates, metrics and hashes are in catalog.json and each containing directory’s SERIES.md. Raw immutable series remain unchanged.\n\n'+ '\n'.join(f'- {folder}/SERIES.md ({len(items)} components)' for folder,items in sorted(groups.items()))+'\n')
 print('catalogued',len(records),'components in',len(groups),'directories')
if __name__=='__main__':main()
