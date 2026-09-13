"""One evidenced input-group change per week; immutable comparisons and decision log."""
import copy,json
from engine.projection_v3.model import GROUPS,fit,predict
from engine.projection_v3.qualify import paired,prior_shapes,read
from engine.projection.distribution import summarize
from engine.projection.grade import grade
from engine.projection_learning import metrics
from scripts.projection_learning import ROOT,WORK,OUT,active_artifact,pinned
from scripts.projection_publish import save
ALIASES={'roll':'momentum','roll index':'momentum','momentum':'momentum','luck':'turnovers_luck','luck index':'turnovers_luck','rest':'rest_travel','wind':'wind','elo':'elo','elo gap':'elo','divisional':'venue','dome':'venue'}

def passes(before,after):
 if not before.get('team_points_mae') or after.get('team_points_mae') is None:return False
 coverage=[after.get(t+'_coverage_'+level) for t in ['margin','total'] for level in ['50','80']]
 return (before['team_points_mae']-after['team_points_mae'])/before['team_points_mae']>=.01-1e-12 and all(v is not None and abs(v-int(level)/100)<=.03+1e-12 for v,level in zip(coverage,['50','80','50','80']))

def evaluate(rows,groups,penalty):
 predictions=[];cards=[]
 calibration_history=read(json.loads((WORK/'reference.json').read_text())['oof'])
 for year in range(2016,2026):
  train=[r for r in rows if r['season']<year and r.get('actual_points') is not None and r['features'].get('baseline') is not None];test=[r for r in rows if r['season']==year and r.get('actual_points') is not None and r['features'].get('baseline') is not None];f=fit(train,groups,penalty);predictions+=paired(test,[predict(f,r['features'])['points'] for r in test])
 for p in predictions:
  shapes=prior_shapes(calibration_history,p['season'])
  # All-year MAE, strictly prior-season interval reference where available.
  use=shapes or read(active_artifact()['shapes']);projection=summarize(p['away'],p['home'],use)
  cards.append({'season':p['season'],'projection':projection,'grades':{'PROJECTION':grade(projection,p['actual_away'],p['actual_home'])}})
 result=metrics(cards);covered=metrics([c for c in cards if c['season']>2016])
 for k in result:
  if '_coverage_' in k:result[k]=covered[k]
 return result,predictions

def counterfactual(cards,historical,groups,penalty,shapes):
 out=[];seen=[]
 for week in sorted({c['week'] for c in cards}):
  training=[r for r in historical+seen if r.get('actual_points') is not None and r['features'].get('baseline') is not None];f=fit(training,groups,penalty)
  for c in [c for c in cards if c['week']==week]:
   pair=c.get('learning_features')
   if not pair or not c.get('grades') or c.get('evidence')!='AS_ISSUED':continue
   p=summarize(predict(f,pair['away']['features'])['points'],predict(f,pair['home']['features'])['points'],shapes);a=c['grades']['PROJECTION']['actual'];out.append({'game_id':c['game_id'],'projection':p,'grades':{'PROJECTION':grade(p,a['away_points'],a['home_points'])}})
   for side in ['home','away']:
    row=copy.deepcopy(pair[side]);row['actual_points']=a[side+'_points'];seen.append(row)
 return metrics(out),out

def log(decision):
 p=ROOT/'CHANGELOG.md';prior=p.read_text() if p.exists() else '# Projection change log\n'
 marker=f"<!-- learning-2026-{decision['week']} -->"
 if marker in prior:return
 lines=['',marker,f"## Learning proposal · Week {decision['week']} · {decision['state']}",decision.get('reason',''),f"Evidence: `{decision['evidence_ref']['path']}`",'']
 for population,table in decision.get('tables',{}).items():
  lines += [f'### {population}','| Metric | Before | After |','|---|---|---|']
  for key in table['before']:lines.append(f"| {key} | {table['before'][key]} | {table['after'].get(key)} |")
 if not decision.get('tables'):lines+=['| Comparison | Before | After |','|---|---|---|','| Not tested: no supported candidate | unchanged | unchanged |']
 lines+=['',f"Decision receipt: `{decision['receipt_path']}`",''];p.write_text(prior+'\n'.join(lines))

def propose(week,now):
 path=OUT/'changes'/f'2026-w{week}.json'
 if path.exists():
  decision=json.loads(path.read_text());log(decision)
  if decision.get('promoted_fit') and active_artifact()['version']==decision.get('parent_version'):save(WORK/'active-fit-ref.json',decision['promoted_fit'])
  return decision
 proposal_path=OUT/'changes'/f'2026-w{week}-proposal.json';prior_proposal=json.loads(proposal_path.read_text()) if proposal_path.exists() else None
 trend=read(prior_proposal['evidence_ref'])['trend'] if prior_proposal else json.loads((OUT/'trend.json').read_text());candidates=[]
 for tag in trend['learning']['tags']:
  if tag['candidate']:
   group=ALIASES.get(tag['tag'],tag['tag'] if tag['tag'] in GROUPS else None)
   if group:candidates.append((0,-tag['count'],group,tag))
 for b in trend['populations']['AS_ISSUED']['diagnostics']['buckets']:
  if b['flag'] and b['band']!='unavailable':
   group=next((g for g,names in GROUPS.items() if b['input'] in names),ALIASES.get(b['input']))
   if group:candidates.append((1,-b['count'],group,b))
 evidence_ref=pinned('proposal-evidence',{'through_week':week,'candidates':candidates,'trend':trend});decision={'week':week,'at':now.isoformat(),'evidence_ref':evidence_ref,'receipt_path':str(path.relative_to(ROOT)),'state':'DEFERRED','reason':'No mapped, supported input candidate; weights/settings unchanged.'}
 if candidates:
  _,_,group,evidence=sorted(candidates,key=lambda x:(x[0],x[1],x[2]))[0]
  proposal={'week':week,'state':'PROPOSED','group':group,'at':prior_proposal['at'] if prior_proposal else now.isoformat(),'evidence_ref':evidence_ref};save(OUT/'changes'/f'2026-w{week}-proposal.json',proposal,True)
  changelog=ROOT/'CHANGELOG.md';marker=f'<!-- proposal-2026-{week} -->';prior=changelog.read_text() if changelog.exists() else '# Projection change log\n'
  if marker not in prior:changelog.write_text(prior+f'\n{marker}\n## Proposed input change · Week {week} · {group}\n\nEvidence: `{evidence_ref["path"]}`. Evaluation pending; no activation.\n\n| Comparison | Before | After |\n|---|---|---|\n| OOF/current-season | Pending paired evaluation | Pending paired evaluation |\n')
  a=active_artifact();groups=sorted(set(a['groups'])^{group});historical=read(json.loads((WORK/'historical-ref.json').read_text()));before,bp=evaluate(historical,a['groups'],a['selected'][1]);after,ap=evaluate(historical,groups,a['selected'][1]);cards=json.loads((ROOT/'outputs/projection-v3/board.json').read_text())['games'];cards=[c for c in cards if c['week']<=week];shapes=read(a['shapes']);current_after,cp=counterfactual(cards,historical,groups,a['selected'][1],shapes);ids={c['game_id'] for c in cp};current_before=metrics([c for c in cards if c['game_id'] in ids]);accepted=passes(before,after) and bool(ids)
  decision.update(state='PROMOTED' if accepted else 'REJECTED',reason=f"One group {'removed' if group in a['groups'] else 'added'}: {group}. Requires >=1% OOF team MAE gain, four coverage rates within 3pp of nominal, and a comparable current-season as-issued sample.",group=group,evidence=evidence,tables={'OOF 2016–2025 (coverage 2017–2025)':{'before':before,'after':after},'Current season as-issued vs retrospective candidate':{'before':current_before,'after':current_after}},comparison=pinned('comparison',{'before_oof':bp,'after_oof':ap,'current_candidate':cp}))
  if accepted:
   from scripts.projection_learning import current_rows
   train=[r for r in historical+current_rows() if (r['season']<2026 or r['week']<=week) and r.get('actual_points') is not None and r['features'].get('baseline') is not None];updated=copy.deepcopy(a);updated.update(groups=groups,fit=fit(train,groups,a['selected'][1]),parent_version=a['version'],version=f'projection-v2.w{week+1}',learning_method={'group_change':group,'week':week,'evidence':evidence_ref},issued_at=now.isoformat());updated['inactive']=[i for i in a['inactive'] if i['input'] not in {n for g in groups for n in GROUPS[g]}]
   if group in a['groups']:updated['inactive'] += [{'input':n,'reason':'Removed by in-season improvement gate','status':'INACTIVE'} for n in GROUPS[group]]
   updated['wind_status']='PARTIAL_HISTORY' if 'wind' in groups else 'INACTIVE';ref=pinned('fit',updated);decision['promoted_fit']=ref;decision['parent_version']=a['version']
 save(path,decision,True);log(decision)
 if decision.get('promoted_fit'):save(WORK/'active-fit-ref.json',decision['promoted_fit'])
 return decision
