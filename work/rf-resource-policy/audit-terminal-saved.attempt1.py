"""Read-only closed-prefix metadata audit. No project imports or scientific calls."""
import json, math, hashlib, pathlib, collections
Q=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k')
W=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-resource-policy')
D=pathlib.Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data')
R=D/'rfcomp08-v1-6683e6438f3c6077'; OLD=D/'rfcomp04-v1-b7fd5fb240c6cfa8'; P=D/'rf02c-v1-2d9c91d803f1c991'
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
 x=json.loads(b,object_pairs_hook=pairs,parse_constant=bad)
 seen_files[str(path)]={'sha256':sha(b),'bytes':len(b)}
 return x
I=load(R/'completion/artifact-index.json','144bad1e80231cf291f5630a06f7ffa863a379b5875a7883eea3c9c4168fde0b')['files']
OI=load(OLD/'completion/artifact-index.json','1bc24410a4049fe3754e7ce944ab43bc34f311edc2f0bcd7b1f7eaf6d99d4dd9')['files']
PI=load(P/'artifact-index.json','ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab')['files']
def read(name,root=R,index=I):return load(root/name,index[name]['sha256'],index[name]['bytes'])
def pointer(p,index=I):assert p=={'name':p['name'],**index[p['name']]},('pointer',p)
t=read('completion/terminal.json');m=read('manifest.json');assert sha((R/'completion/terminal.json').read_bytes())=='1922fb7be8173333f937dc1f1022c20db5071be099493a6c61c21204d107b4ec'
assert t['manifest_sha256']==I['manifest.json']['sha256']=='6683e6438f3c607711623596ea8d41370e3ba9a3c9bcdd9dbead50703520ae5f'
accept=load(Q/'.planning/engine-os/research-first/RF-COMP-08-PREFIT-ACCEPTANCE.v1.json',m['implementation_acceptance_sha256'])
assert len(m['code_hashes'])==85 and len(m['runtime_files'])==7
for path,h in {**m['code_hashes'],**m['runtime_files']}.items():assert sha((Q/path).read_bytes())==h,('currentpin',path)
for key in ('resource_policy','resource_protocol','compute_protocol','qualification','baseline_acceptance'):
 ptr=m[key];load(Q/ptr['path'],ptr['sha256'],ptr['bytes'])
cfg=load(Q/'config/research-team-score-split.v1.json',m['bound_hashes']['config'])
assert m['scientific_registry']=={k:cfg[k] for k in m['scientific_registry']}
a=load(Q/'.planning/engine-os/research-first/RF-01-ACCEPTANCE.v2.json','a9ec511e1f05935d98a9dd271a5079a4f490d3f020b31a76cbd2661146f7c11e')
d=load(pathlib.Path(a['admittedData']['path']),m['bound_hashes']['admittedData']);orig=d['origins'];records={r['gameId']:r for r in d['records']}
assert len(orig)==277 and len(records)==4175
completed=orig[:113];assert [(o['season'],o['week']) for o in completed][-1]==(2016,11)
assert [n for n in I if n.startswith('origin-evidence-')]==['origin-evidence-%s-%02d.json'%(o['season'],o['week']) for o in completed]
assert not any('2016-12' in n for n in I) and not any(n.startswith(('evaluation','inference','scorecards','decision')) for n in I)
targets=('home','away','margin','total')
base={'joint_energy_score','joint_nll','predicted_covariance','residual_product','grid_cells','grid_transport_bound','grid_probability_bound','double_grid_difference'}|{x+'_'+y for x in targets for y in ('crps','observed','mean','mae','squared_error')}
outer=base|{'home_win_probability','tie_probability','away_win_probability','home_win_observed','home_win_brier','home_win_log_loss','win_tie_loss_brier','win_tie_loss_log_loss','tail_absolute_margin_21','tail_total_70','observed_absolute_margin_21','observed_total_70'}|{x+'_pit' for x in targets}|{f'{x}_{f}_{l}' for x in targets for f in ('lower','upper','coverage','width','boundary_distance') for l in (50,80,95)}
mass={x+'_interval_mass_80' for x in targets};counts=collections.Counter();metric_shapes=collections.Counter();modes=collections.Counter();reasons=collections.Counter();byseason=collections.Counter();firstinner=set();callback_count=collections.Counter();source_rows=0;shared=[];law_count=0
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
  assert c['native_failure'] is None and c['used_fallback'] is False
  assert c['game_id'] in games and c['finished_seconds']-c['started_seconds']==c['seconds']>0
  callback_count[c['kind']]+=1
 stage_rows={}
 for stage,field in [('inner','full_setting_forecasts'),('outer','outer_selected_forecasts')]:
  name=f'{stage}-losses-{suffix}.json'
  rows=read(name) if name in I else [];stage_rows[stage]=rows
  expected=[['E3',s,game] for game in games for s in range(27)] if stage=='inner' and year>=2011 else ([[fam,v,game] for fam,v in cfg['seriesInOrder'] for game in games] if stage=='outer' and year>=2013 else [])
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
  if name in OI:
   assert I[name]==OI[name],('sharedscientificbytes',name)
   assert sha((OLD/name).read_bytes())==OI[name]['sha256'];shared.append(name)
 assert len(g['rows'])==sum(map(len,stage_rows.values()))
 assert len(f['full_setting_forecasts'])+len(f['outer_selected_forecasts'])==sum(map(len,stage_rows.values()))
 for ptr in e['score_artifacts'].values():pointer(ptr)
assert dict(counts)==t['counts'];assert callback_count['score']==counts['actual_score_calls']
assert counts['actual_mass_cdf_calls']==sum(byseason[y] for y in byseason if y>=2013)*13*8
selections=[]
for year in range(2013,2017):
 s=read(f'selection-{year}.json')['E3'];assert s['inner_seasons']==[year-2,year-1] and s['games']==512
 assert [r['setting'] for r in s['candidates']]==list(range(27)) and s['status']=='selected'
 assert all(math.isfinite(r['mean_energy']) and r['failure_rate']==0 and r['eligible'] for r in s['candidates'])
 assert s['candidates'][s['setting']]['mean_energy']<=min(r['mean_energy'] for r in s['candidates'])+1e-8
 selections.append({'season':year,'prior_seasons':s['inner_seasons'],'games':s['games'],'setting':s['setting']})
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
assert projection<=9000 and z['passed'] and z['within_time_screen'] and l['peak_rss_mib']<=4096
last=t['last_origin_accounting'];assert last['game_ids']==orig[113]['targetGameIds'] and last['origin_sha256']==sha(enc(orig[113])) and not last['complete'] and last['budget_stop']=='invalid_monotonic_clock'
assert len(last['callbacks'])==246 and all(c['kind']=='fit' and c['error_type'] is None and c['native_failure'] is None and c['used_fallback'] is False for c in last['callbacks'])
assert t['status']=='protocol_invalid' and t['reason']=='invalid_monotonic_clock' and t['seconds']<9000 and t['peak_rss_mib']<4096
result={'status':'passed_saved_metadata_checks','scope':'closed_invalid_prefix_only','current_code_pins':85,'current_runtime_pins':7,'completed_origins':113,'failed_origin':[2016,12],'unstarted_origins':163,'state_targets_by_season':dict(byseason),'inner_games_per_setting':counts['inner_rows']//27,'outer_games_per_series':counts['outer_rows']//19,'counts':dict(counts),'metric_schema_counts':dict(metric_shapes),'mode_counts':dict(modes),'native_reason_counts':dict(reasons),'publication_laws_compared':law_count,'direct_parent_metric_copies_verified':source_rows,'completed_callback_counts':dict(callback_count),'shared_COMP04_loss_files_exact':len(shared),'shared_COMP04_inner_rows':14688,'shared_COMP04_outer_rows':608,'selections':selections,'pilot':{'C':C,'F':F,'S':S,'E':E,'A':A,'T':T,'W':weighted,'projected_total_seconds':projection,'fixed_seconds_cap':9000,'passed':True,'headroom_seconds':9000-projection,'raw_fit_calls':sum(c['kind']=='fit' for c in raw),'raw_score_calls':sum(c['kind']=='score' for c in raw),'native_fit_anchor_count':len(anchors['offdiagonal_full_fit']),'native_full_outer_score_anchor_count':len(anchors['new_full_outer_score']),'remaining_origins_at_pilot':224,'remaining_games_at_pilot':sum(len(o['targetGameIds']) for o in orig[53:])},'failed_origin':{'origin':[2016,12],'completed_callbacks':246,'callback_kind':'fit','callback_errors':0,'native_failures':0,'last_callback':last['callbacks'][-1],'saved_grade_batch':False},'authenticated_metadata_inputs':seen_files}
out=W/'actual-numerical-saved-checks.json';out.write_bytes(enc(result));print(json.dumps({k:v for k,v in result.items() if k!='authenticated_metadata_inputs'},sort_keys=True));print('REPORT',str(out),sha(out.read_bytes()),out.stat().st_size)
