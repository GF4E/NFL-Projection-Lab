"""Read-only closed-prefix metadata audit. No project imports or scientific calls."""
import json, math, hashlib, pathlib, collections, argparse
cli=argparse.ArgumentParser(description="Closed COMP09 saved-output audit; never invoke on a live run")
cli.add_argument("--index-sha256",required=True);cli.add_argument("--terminal-sha256",required=True)
args=cli.parse_args()
Q=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k')
W=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-clock-guard')
D=pathlib.Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data')
R=D/'rfcomp09-v1-d78471e3d2ffdb18'; OLD=D/'rfcomp04-v1-b7fd5fb240c6cfa8'; P=D/'rf02c-v1-2d9c91d803f1c991'
seen_files={}
def sha(b):return hashlib.sha256(b).hexdigest()
def enc(x):return (json.dumps(x,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def load(path,expected=None,size=None):
 b=path.read_bytes()
 if expected:assert sha(b)==expected,('hash',str(path))
 if size is not None:assert len(b)==size,('bytes',str(path))
 def pairs(rows):
  out={}
  for k,v in rows:assert k not in out,('duplicate',str(path),k);out[k]=v
  return out
 def bad(v):raise AssertionError(('nonfinite_json',str(path),v))
 x=json.loads(b,object_pairs_hook=pairs,parse_constant=bad) if path.suffix == '.json' else b
 seen_files[str(path)]={'sha256':sha(b),'bytes':len(b)}
 return x
I=load(R/'completion/artifact-index.json',args.index_sha256)['files']
OI=load(OLD/'completion/artifact-index.json','1bc24410a4049fe3754e7ce944ab43bc34f311edc2f0bcd7b1f7eaf6d99d4dd9')['files']
PI=load(P/'artifact-index.json','ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab')['files']
def read(name,root=R,index=I):return load(root/name,index[name]['sha256'],index[name]['bytes'])
def pointer(p,index=I):assert p=={'name':p['name'],**index[p['name']]},('pointer',p)
t=read('completion/terminal.json');m=read('manifest.json');assert sha((R/'completion/terminal.json').read_bytes())==args.terminal_sha256
assert t['manifest_sha256']==I['manifest.json']['sha256'] and t['manifest_sha256'].startswith('d78471e3d2ffdb18')
assert t['version']=='rfcomp09.terminal.v1' and t['status'] in ('protocol_invalid','reject_all','mechanism_supported_distribution_unqualified','research_shadow_candidate')
accept=load(Q/'.planning/engine-os/research-first/RF-COMP-09-PREFIT-ACCEPTANCE.v1.json',m['implementation_acceptance_sha256'])
assert len(m['code_hashes'])==91 and len(m['runtime_files'])==7
assert m['code_hashes']==accept['code_hashes'] and m['runtime_files']==accept['runtime_files']
for path,h in {**m['code_hashes'],**m['runtime_files']}.items():assert sha((Q/path).read_bytes())==h,('currentpin',path)
for key in ('resource_policy','resource_protocol','compute_protocol','qualification','baseline_acceptance','guard_protocol','predecessor_terminal'):
 ptr=m[key];load(Q/ptr['path'],ptr['sha256'],ptr['bytes'])
cfg=load(Q/'config/research-team-score-split.v1.json',m['bound_hashes']['config'])
assert m['scientific_registry']=={k:cfg[k] for k in m['scientific_registry']}
a=load(Q/'.planning/engine-os/research-first/RF-01-ACCEPTANCE.v2.json','a9ec511e1f05935d98a9dd271a5079a4f490d3f020b31a76cbd2661146f7c11e')
d=load(pathlib.Path(a['admittedData']['path']),m['bound_hashes']['admittedData']);orig=d['origins'];records={r['gameId']:r for r in d['records']}
assert len(orig)==277 and len(records)==4175
n=t['completed_origins'];assert type(n)is int and 0<=n<=277
completed=orig[:n]
if t['status']!='protocol_invalid':assert n==277
assert [n for n in I if n.startswith('origin-evidence-')]==['origin-evidence-%s-%02d.json'%(o['season'],o['week']) for o in completed]
# A failed origin can have retained partial publication; only completed evidence enters row totals.
targets=('home','away','margin','total')
base={'joint_energy_score','joint_nll','predicted_covariance','residual_product','grid_cells','grid_transport_bound','grid_probability_bound','double_grid_difference'}|{x+'_'+y for x in targets for y in ('crps','observed','mean','mae','squared_error')}
outer=base|{'home_win_probability','tie_probability','away_win_probability','home_win_observed','home_win_brier','home_win_log_loss','win_tie_loss_brier','win_tie_loss_log_loss','tail_absolute_margin_21','tail_total_70','observed_absolute_margin_21','observed_total_70'}|{x+'_pit' for x in targets}|{f'{x}_{f}_{l}' for x in targets for f in ('lower','upper','coverage','width','boundary_distance') for l in (50,80,95)}
mass={x+'_interval_mass_80' for x in targets};counts=collections.Counter();metric_shapes=collections.Counter();modes=collections.Counter();reasons=collections.Counter();byseason=collections.Counter();firstinner=set();callback_count=collections.Counter();source_rows=0;shared=[];law_count=0
series=tuple(map(tuple,cfg['seriesInOrder']));outer_by_series={key:[] for key in series};metadata=[];outer_pointers=[];native_by_series={key:[] for key in series}
for o in completed:
 year,week=o['season'],o['week'];suffix=f'{year}-{week:02}';games=o['targetGameIds'];byseason[year]+=len(games)
 e=read(f'origin-evidence-{suffix}.json');b=read(f'publication-binding-{suffix}.json');f=read(f'forecasts-{suffix}.json');g=read(f'grading-provenance-{suffix}.json')
 assert e['origin']==b['origin']==o and e['manifest_sha256']==b['manifest_sha256']==g['manifest_sha256']==f['manifest_sha256']==t['manifest_sha256']
 assert e['publication_before_grading'] is True and e['native_states']=={'borrowed':81,'own':216}
 assert f['target_game_ids']==games and f['origin']==g['origin']==[year,week] and f['origin_at']==o['originAt']
 for p in (e['forecast'],e['publication_binding'],b['publication'],g['publication'],b['state'],b['ancestry']):pointer(p)
 assert e['forecast']==b['publication']==g['publication']
 assert g['counts']==e['counts'];counts.update(e['counts'])
 for p in e['source_pointers'].values():pointer(p,PI)
 assert b['source_pointers']==e['source_pointers']
 assert b['parent_index_sha256']==m['parent_index_sha256'] and b['parent_manifest_sha256']==m['parent_manifest_sha256']
 for c in e['callback_records']:
  assert c['error_type'] is None and c['error_reason'] is None and 'budget_stop' not in c
  assert (c['native_failure'] is None or type(c['native_failure']) is str and c['native_failure']) and c['used_fallback'] is (c['native_failure'] is not None)
  assert c['game_id'] in games and c['finished_seconds']-c['started_seconds']==c['seconds']>0
  callback_count[c['kind']]+=1
 stage_rows={}
 for stage,field in [('inner','full_setting_forecasts'),('outer','outer_selected_forecasts')]:
  name=f'{stage}-losses-{suffix}.json'
  rows=read(name) if name in I else [];stage_rows[stage]=rows
  expected=[['E3',s,game] for game in games for s in range(27)] if stage=='inner' and 2011<=year<=2024 else ([[fam,v,game] for fam,v in cfg['seriesInOrder'] for game in games] if stage=='outer' and year>=2013 else [])
  keys=[[r['family'],r['setting' if stage=='inner' else 'variant'],r['game_id']] for r in rows]
  assert keys==expected,(suffix,stage,'order')
  assert [[r['family'],r['setting' if stage=='inner' else 'variant'],r['game_id']] for r in f[field]]==expected
  assert [p['key'] for p in b['grading_plan'][stage]]==expected
  law_count+=len(f[field]);prov=[p for p in g['rows'] if p['stage']==stage];assert len(prov)==len(rows)
  parent_rows=None
  for row,law,p,plan in zip(rows,f[field],prov,b['grading_plan'][stage]):
   metrics=row['metrics'];key=[row['family'],row['setting' if stage=='inner' else 'variant'],row['game_id']]
   assert key==p['key']==plan['key'] and row['native_failure']==law['native_failure']==p['native_failure']
   assert p['mode']==plan['mode'] and p['law_work']==plan['law_work'] and p['source_forecast']==plan['source']
   assert sha(enc(metrics))==p['metrics_sha256']
   expected_fields=base if stage=='inner' else outer|(mass if row['family']=='E3' else set())
   assert set(metrics)==expected_fields,(suffix,stage,'metricfields')
   for k,v in metrics.items():
    if k=='grid_cells':assert type(v) is list and len(v)==2 and all(type(z) is int and 0<z<=1024 for z in v)
    else:assert type(v) in (int,float) and math.isfinite(v),(suffix,key,k)
   record=records[row['game_id']];h,aw=record['homeScore'],record['awayScore']
   assert [metrics[x+'_observed'] for x in targets]==[h,aw,h-aw,h+aw]
   assert metrics['joint_energy_score']>=0
   if stage=='outer' and row['family']=='E3':assert all(0<=metrics[k]<=1 for k in mass)
   metric_shapes[len(metrics)]+=1;modes[p['mode']]+=1;reasons[str(row['native_failure'])]+=1
   if p['mode']=='new_score':
    first=(year,law['setting']) not in firstinner
    assert p['score_flags']=={'double_grid':first if stage=='inner' else True,'diagnostics':stage=='outer'}
    if stage=='inner':firstinner.add((year,law['setting']))
   else:
    assert p['score_flags'] is None and p['source_loss'] is not None
    lp=p['source_loss'];pointer(lp['file'],PI);pointer(p['source_forecast']['forecast_file'],PI)
    if parent_rows is None:parent_rows=read(lp['file']['name'],P,PI);parent_rows={tuple([z['family'],z['setting' if stage=='inner' else 'variant'],z['game_id']]):z for z in parent_rows}
    original=parent_rows[tuple(lp['source_key'])]
    assert original['native_failure']==row['native_failure']
    copied={k:v for k,v in metrics.items() if k not in mass};assert enc(copied)==enc(original['metrics'])
    source_rows+=1
  if stage=='outer' and rows:
   outer_pointers.append({'name':name,**I[name]})
   metadata.extend({'game_id':g,'season':year,'week':week} for g in games)
   for row in rows:
    key=(row['family'],row['variant']);outer_by_series[key].append({k:row[k] for k in ('game_id','metrics','native_failure')});native_by_series[key].append(row['native_failure'])
  if name in OI:
   assert I[name]==OI[name],('sharedscientificbytes',name)
   assert sha((OLD/name).read_bytes())==OI[name]['sha256'];shared.append(name)
 assert len(g['rows'])==sum(map(len,stage_rows.values()))
 assert len(f['full_setting_forecasts'])+len(f['outer_selected_forecasts'])==sum(map(len,stage_rows.values()))
 for ptr in e['score_artifacts'].values():pointer(ptr)
assert dict(counts)==t['counts'];assert callback_count['score']==counts['actual_score_calls']
assert counts['actual_mass_cdf_calls']==sum(byseason[y] for y in byseason if y>=2013)*13*8
selections=[]
for year in sorted(y for y in byseason if y>=2013):
 s=read(f'selection-{year}.json')['E3'];assert s['inner_seasons']==[year-2,year-1] and s['games']==sum(o0['season'] in (year-2,year-1) for o0 in records.values())
 assert [r['setting'] for r in s['candidates']]==list(range(27)) and s['status'] in ('selected','no_eligible_setting')
 assert all((r['mean_energy'] is None or math.isfinite(r['mean_energy'])) and 0<=r['failure_rate']<=1 for r in s['candidates'])
 if s['setting'] is None:assert s['status']=='no_eligible_setting' and not any(r['eligible'] for r in s['candidates'])
 else:assert s['status']=='selected' and s['candidates'][s['setting']]['eligible'] and s['candidates'][s['setting']]['mean_energy']<=min(r['mean_energy'] for r in s['candidates'] if r['eligible'])+1e-8
 selections.append({'season':year,'prior_seasons':s['inner_seasons'],'games':s['games'],'setting':s['setting']})
pilot_result=None
if 'pilot.json' in I:
 p=read('pilot.json');l=p['accounting'];z=p['projection'];pilots=l['origins'][-2:];raw=[c for x in pilots for c in x['callbacks']]
 assert len(l['origins'])==53 and [(x['season'],x['week']) for x in pilots]==[(2013,1),(2013,2)]
 assert z['original_origins_sha256']==sha(enc(orig)) and z['accounting_sha256']==sha(enc(l))
 for row,o in zip(l['origins'],orig):
  assert row['origin_sha256']==sha(enc(o)) and row['game_ids']==o['targetGameIds'] and row['history_count']==len(o['windows']['12']['eligibleInputIds']) and row['complete'] and row['error_type'] is None
  end=row['started_seconds']
  for c in row['callbacks']:
   assert c['started_seconds']>=end and c['finished_seconds']<=row['finished_seconds'] and c['finished_seconds']-c['started_seconds']==c['seconds']>0 and c['error_type'] is None
   end=c['finished_seconds']
  assert row['seconds']==row['finished_seconds']-row['started_seconds']>=math.fsum(c['seconds'] for c in row['callbacks'])
 F=max(c['seconds'] for c in raw if c['kind']=='fit');S=max(c['seconds'] for c in raw if c['kind']=='score');C=max((x['seconds']-math.fsum(c['seconds'] for c in x['callbacks']))/len(x['game_ids']) for x in pilots)
 H=min(x['history_count'] for x in pilots);weighted=math.fsum(len(o['targetGameIds'])*max(1.,len(o['windows']['12']['eligibleInputIds'])/H) for o in orig[53:])
 phases={x['name']:x['seconds'] for x in l['phase_measurements']};A=phases['admission'];T=phases['inference_smoke'];E=l['elapsed_seconds']
 projection=E+weighted*(C+31*(2*F+2*S))+2*T+max(60.,A)
 assert (F,S,C,weighted,projection)==(z['maximum_fit_seconds'],z['maximum_score_seconds'],z['maximum_remainder_seconds_per_game'],z['remaining_weighted_games'],z['projected_total_seconds'])
 anchors={'offdiagonal_full_fit':[],'new_full_outer_score':[]}
 for idx,c in enumerate(raw):
  native=c['error_type'] is None and c['native_failure'] is None and c['used_fallback'] is False
  if native and c['kind']=='fit' and c['operation']=='fit' and c['variant']=='full' and c['setting'] is not None and c['setting']>=9:anchors['offdiagonal_full_fit'].append(idx)
  if native and c['kind']=='score' and c['stage']=='outer' and c['double_grid'] is True and c['diagnostics'] is True:anchors['new_full_outer_score'].append(idx)
 assert anchors==z['required_anchor_indices'] and all(anchors.values())
 assert z['within_time_screen']==(projection<=9000) and z['passed']==(projection<=9000 and l['peak_rss_mib']<=4096)
 pilot_result={'C':C,'F':F,'S':S,'E':E,'A':A,'T':T,'W':weighted,'projected_total_seconds':projection,'fixed_seconds_cap':9000,'headroom_seconds':9000-projection,'passed':z['passed'],'raw_fit_calls':sum(c['kind']=='fit' for c in raw),'raw_score_calls':sum(c['kind']=='score' for c in raw),'native_fit_anchor_count':len(anchors['offdiagonal_full_fit']),'native_full_outer_score_anchor_count':len(anchors['new_full_outer_score']),'remaining_origins_at_pilot':224,'remaining_games_at_pilot':sum(len(o['targetGameIds']) for o in orig[53:])}
last=t.get('last_origin_accounting')
failed=None
if last is not None and not last.get('complete'):
 assert n<277 and last['game_ids']==orig[n]['targetGameIds'] and last['origin_sha256']==sha(enc(orig[n]))
 failed={'origin':[last['season'],last['week']],'callbacks':len(last['callbacks']),'error_type':last.get('error_type'),'budget_stop':last.get('budget_stop')}
if t['status']!='protocol_invalid':
 assert n==277 and counts['inner_rows']==98469 and counts['outer_rows']==64733
 assert len(metadata)==3407 and len(outer_pointers)==226 and all(len(v)==3407 for v in outer_by_series.values())
else:
 assert t.get('reason') and t.get('error_type')
evaluation_summary=None
if 'evaluation.json' in I:
 ev=read('evaluation.json')
 if ev['status']=='protocol_invalid':
  assert t['status']=='protocol_invalid';evaluation_summary={'status':ev['status'],'reason':ev.get('reason')}
 else:
  assert n==277 and t['status']==ev['status']
  ii=read('inference-input-index.json')
  assert ii['metadata']==metadata and ii['source_scores']==outer_pointers
  assert ii['series']==[{'key':list(k),'rows':3407,'sha256':sha(enc(v))} for k,v in outer_by_series.items()]
  assert ii['audit_checks']==ev['audit_checks']==dict.fromkeys(('admission','leakage','falsification','no_new_numerical_failure'),True)
  for key in ('admission','pilot','smoke','origin_index','accounting'):pointer(ii['audit_evidence'][key])
  assert ii['audit_evidence']['prefit_qualification']==m['qualification'] and ii['audit_evidence']['prefit_reviews']==m['independent_reviews']
  assert ev['counts']=={'outer_games':3407,'outer_origins':226,'development_games':3135,'exposed_2025_games':272,'series':19,'energy_comparisons':18,'calibration_cells':8}
  assert all(ev[k] is False for k in ('production_authorized','prospective_evidence','original_publication_verified','external_five_percent_achieved','shadow_activated','original_decisions_overwritten'))
  assert ev['history_informed_exploratory_intervals'] is True
  cards=ev['scorecards'];inf=ev['inference'];assert set(cards)=={':'.join(k) for k in series}
  dev=[i for i,r in enumerate(metadata) if r['season']<=2024];exposed=[i for i,r in enumerate(metadata) if r['season']==2025]
  assert len(dev)==3135 and len(exposed)==272 and inf['population']=='2013-2024_development_only' and inf['games']==3135
  def close(a,b):assert math.isclose(a,b,rel_tol=1e-12,abs_tol=1e-12),('saved_mean_roundoff',a,b)
  def rawmean(key,metric,indices):return math.fsum(outer_by_series[key][i]['metrics'][metric] for i in indices)/len(indices)
  def mean(key,metric,part='development'):return cards[':'.join(key)][part]['metrics'][metric]['mean']
  def gain(reference,candidate,part='development'):return 1-mean(candidate,'joint_energy_score',part)/mean(reference,'joint_energy_score',part)
  for key in series:
   named=cards[':'.join(key)]
   subsets={'development':dev,'exposed_2025':exposed,'all_issued':list(range(3407)),**{str(y):[i for i,r in enumerate(metadata) if r['season']==y] for y in range(2013,2026)}}
   for label,indices in subsets.items():
    card=named['seasons'][label] if label.isdigit() else named[label]
    assert card['games']==len(indices)
    for metric,entry in card['metrics'].items():
     if type(entry)is dict:close(entry['mean'],rawmean(key,metric,indices))
    for target,c in card['calibration'].items():
     assert c['n']==len(indices) and c['status'] in ('available','unavailable_by_design')
     if c['status']=='available':assert math.isfinite(c['intercept']) and math.isfinite(c['slope'])
     else:
      metric='home_win_probability' if target=='home_win' else target+'_mean'
      assert c['reason']=='constant_predictor' and c['prediction_min']==c['prediction_max'] and all(outer_by_series[key][i]['metrics'][metric]==c['prediction_min'] for i in indices)
   native=native_by_series[key];detail=ev['native_failures'][':'.join(key)];assert detail=={'count':sum(v is not None for v in native),'reasons':dict(collections.Counter(v for v in native if v is not None)),'games':[{'game_id':metadata[i]['game_id'],'reason':v} for i,v in enumerate(native) if v is not None]}
   assert ev['all_issued_native_failure_rates'][':'.join(key)]==sum(v is not None for v in native)/3407
   if key[0]=='N0':assert not any(native)
  assert inf['comparison_order']==[v['id'] for v in cfg['energyComparisonsInOrder']] and inf['calibration_cell_order']==cfg['calibrationCellsInOrder']
  assert set(inf['blocks'])=={'1','3','6'} and len(inf['comparisons'])==18 and len(inf['calibration_cells'])==8
  for k,b in inf['blocks'].items():
   assert b['members']==10000 and len(b['coverage'])==19*4*3 and len(b['pit_simultaneous_bands'])==19*4
   assert math.isfinite(b['energy_critical_max_standardized']) and math.isfinite(b['calibration_critical_max_standardized'])
  for row in cfg['energyComparisonsInOrder']:
   v=inf['comparisons'][row['id']];assert v['reference']==row['reference'] and v['candidate']==row['candidate'] and set(v['blocks'])=={'1','3','6'}
   close(v['gain'],gain(tuple(row['reference']),tuple(row['candidate'])))
   assert all(math.isfinite(z['lower']) and math.isfinite(z['upper']) and z['lower']<=z['upper'] and math.isfinite(z['bootstrap_sd']) and z['bootstrap_sd']>=0 for z in v['blocks'].values())
  for family,variant,target,level in cfg['calibrationCellsInOrder']:
   label=':'.join(map(str,(family,variant,target,level)));v=inf['calibration_cells'][label];assert set(v['blocks'])=={'1','3','6'}
   close(v['residual'],rawmean((family,variant),target+'_coverage_80',dev)-rawmean((family,variant),target+'_interval_mass_80',dev))
  def bounds(name,end,positive):return all(inf['comparisons'][name]['blocks'][b][end]>0 if positive else inf['comparisons'][name]['blocks'][b][end]<0 for b in ('1','3','6'))
  def stability(family):
   s=ev['stability'][family+':full'];ref=(family,'full');candidate=('E3','full');close(s['development_gain'],gain(ref,candidate));close(s['exposed_2025_gain'],gain(ref,candidate,'exposed_2025'))
   for year in range(2013,2025):
    ids=[i for i in dev if metadata[i]['season']==year];others=[i for i in dev if metadata[i]['season']!=year]
    close(s['season_gains'][str(year)],1-rawmean(candidate,'joint_energy_score',ids)/rawmean(ref,'joint_energy_score',ids))
    close(s['leave_one_season_out_gains'][str(year)],1-rawmean(candidate,'joint_energy_score',others)/rawmean(ref,'joint_energy_score',others))
   return {'energy_gain_at_least_one_percent':s['development_gain']>=.01,'energy_lower_positive_all_blocks':bounds(family+':full->E3:full','lower',True),'eight_improved_seasons':sum(v>0 for v in s['season_gains'].values())>=8,'all_leave_one_season_out_positive':all(v>0 for v in s['leave_one_season_out_gains'].values()),'exposed_2025_positive':s['exposed_2025_gain']>0}
  mechanism=stability('E2');candidate=stability('N0')
  for variant in cfg['variantsInOrder']:
   if variant in ('full','availability_24h'):continue
   label='E3:full->E3:'+variant;mechanism[variant+':does_not_stably_outperform_full']=not bounds(label,'lower',True)
   if variant in cfg['internalMechanism']['requiredRemovals']:mechanism[variant+':positive_mechanism_all_blocks']=bounds(label,'upper',False)
  for key in series:
   if key[0]=='E3' or key in [(f,v) for f in ('N0','E2') for v in ('full','availability_24h')]:mechanism[':'.join(key)+':native_failure_ceiling']=ev['all_issued_native_failure_rates'][':'.join(key)]<=.005
  for ref in ('N0','E2'):
   v=gain((ref,'availability_24h'),('E3','availability_24h'));close(ev['availability_gains'][ref],v);mechanism[ref+':availability_24h_gain_positive']=v>0
  candidate['E1:energy_lower_positive_all_blocks']=bounds('E1:full->E3:full','lower',True);candidate['not_stably_worse_than_S1']=not bounds('S1:full->E3:full','upper',False)
  for variant in ('full','availability_24h'):
   key=('E3',variant)
   for family in ('N0','E2'):
    ref=(family,variant);prefix=family+':'+variant+':'
    for metric in ['joint_nll']+[t0+'_crps' for t0 in targets]:candidate[prefix+metric]=mean(key,metric)<=1.005*mean(ref,metric)
    for target in ('home','away'):candidate[prefix+target+'_mae']=mean(key,target+'_mae')<=mean(ref,target+'_mae')+.1
    for target in targets:candidate[prefix+target+'_width']=mean(key,target+'_width_80')<=1.1*mean(ref,target+'_width_80') or gain(ref,key)>=.02
   for target in targets:
    label=':'.join((*key,target,'80'));candidate[label+':nominal_range']=.72<=mean(key,target+'_coverage_80')<=.88
    candidate[label+':nominal_intervals']=all(inf['blocks'][b]['coverage'][label]['lower']<=.8<=inf['blocks'][b]['coverage'][label]['upper'] for b in ('1','3','6'))
  for cell in cfg['calibrationCellsInOrder']:
   label=':'.join(map(str,cell));candidate[label+':actual_mass_intervals']=all(inf['calibration_cells'][label]['blocks'][b]['lower']<=0<=inf['calibration_cells'][label]['blocks'][b]['upper'] for b in ('1','3','6'))
  assert mechanism==ev['mechanism_checks'] and candidate==ev['candidate_checks']
  assert [k for k,v in mechanism.items() if not v]==ev['failed_mechanism_checks'] and [k for k,v in candidate.items() if not v]==ev['failed_candidate_checks']
  supported=all(mechanism.values());qualified=supported and all(candidate.values());status='research_shadow_candidate' if qualified else 'mechanism_supported_distribution_unqualified' if supported else 'reject_all'
  assert (supported,qualified,status)==(ev['mechanism_supported'],ev['candidate_qualified'],ev['status'])
  evaluation_summary={'status':status,'mechanism_supported':supported,'candidate_qualified':qualified,'failed_mechanism_checks':ev['failed_mechanism_checks'],'failed_candidate_checks':ev['failed_candidate_checks'],'comparison_count':18,'calibration_cells':8,'bootstrap_blocks_members':{b:10000 for b in ('1','3','6')},'all_registered_gate_booleans_rederived':True,'row_card_mean_crosscheck_tolerance':{'relative':1e-12,'absolute':1e-12},'bootstrap_intervals_reused_not_resampled':True,'regression_fits_reused_not_refit':True}
result={'status':'passed_saved_metadata_checks','scope':'complete_saved_result' if t['status']!='protocol_invalid' else 'closed_invalid_evidence_only','manifest_sha256':t['manifest_sha256'],'terminal_status':t['status'],'terminal_reason':t.get('reason'),'completed_origins':n,'last_complete_origin':None if not completed else [completed[-1]['season'],completed[-1]['week']],'failed_origin':failed,'unstarted_origins':277-n-int(failed is not None),'current_code_pins':91,'current_runtime_pins':7,'state_targets_by_season':dict(byseason),'inner_games_per_setting':counts['inner_rows']//27,'outer_games_per_series':counts['outer_rows']//19,'counts':dict(counts),'metric_schema_counts':dict(metric_shapes),'mode_counts':dict(modes),'native_reason_counts':dict(reasons),'publication_laws_compared':law_count,'direct_parent_metric_copies_verified':source_rows,'completed_callback_counts':dict(callback_count),'shared_COMP04_loss_files_exact':len(shared),'selections':selections,'pilot':pilot_result,'evaluation':evaluation_summary,'authenticated_metadata_inputs':seen_files}
out=W/'actual-numerical-saved-checks.json';out.write_bytes(enc(result));print(json.dumps({k:v for k,v in result.items() if k!='authenticated_metadata_inputs'},sort_keys=True));print('REPORT',str(out),sha(out.read_bytes()),out.stat().st_size)
