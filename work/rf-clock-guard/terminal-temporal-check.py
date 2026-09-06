from pathlib import Path
import json,hashlib,collections
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k');W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-clock-guard');B=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rfcomp09-v1-d78471e3d2ffdb18');O=R/'work/rfcomp09-observer-ba46aa5fdb0df76a'
def ptr(p):
 h=hashlib.sha256();z=0
 with p.open('rb') as f:
  while b:=f.read(1048576):h.update(b);z+=len(b)
 return {'path':str(p),'sha256':h.hexdigest(),'bytes':z}
def js(p):return json.loads(p.read_bytes())
expected={'manifest.json':('d78471e3d2ffdb182266939ee13403a19b894261d9fe67ef47570f3d82d662de',26505),'completion/artifact-index.json':('d9c6742f28e144c2c641cd97034b9ccf72645baf33de772b7e2f3a9530d98220',418718),'completion/terminal.json':('0fe65f37d0739074b48d79a18636636176f062c22c98404ea51515cf949abc20',2148)}
for n,(h,z) in expected.items():p=ptr(B/n);assert p['sha256']==h and p['bytes']==z
idx=js(B/'completion/artifact-index.json');files=idx['files'];assert not idx['uncommitted_artifacts'] and not idx['uncommitted_staging']
def bound(n):
 p=ptr(B/n);assert all(p[k]==files[n][k] for k in ('sha256','bytes')),n
 return js(B/n)
def pointer(p):assert all(p[k]==files[p['name']][k] for k in ('sha256','bytes'))
m=bound('manifest.json');t=bound('completion/terminal.json');oi=bound('origin-index.json');assert t['status']=='reject_all' and t['completed_origins']==277
assert m['implementation_acceptance_sha256']=='ba46aa5fdb0df76a895ba23011848aa8eb3c0a49f43663a60812bc26d00868f0'
assert ptr(R/'.planning/engine-os/research-first/RF-COMP-09-PREFIT-ACCEPTANCE.v1.json')['sha256']==m['implementation_acceptance_sha256']
for n,h in m['code_hashes'].items():assert ptr(R/n)['sha256']==h,n
for n,h in m['runtime_files'].items():assert ptr(Path(n))['sha256']==h,n
for k in ('guard_protocol','resource_protocol','resource_policy','compute_protocol','baseline_acceptance'):
 p=m[k];a=ptr(R/p['path']);assert all(a[x]==p[x] for x in ('sha256','bytes'))
expected_origins=[(y,w) for y in range(2010,2026) for w in range(1,18 if y<=2020 else 19)]
assert len(oi['origins'])==277
counts=collections.Counter();games=collections.Counter();seen=[];lastcallback=0.;selection_names=set()
for ref in oi['origins']:
 pointer(ref);e=bound(ref['name']);o=e['origin'];key=(o['season'],o['week']);seen.append(key)
 assert e['manifest_sha256']==t['manifest_sha256'] and e['publication_before_grading'] is True
 for k in ('forecast','publication_binding'):pointer(e[k])
 for p in e['score_artifacts'].values():pointer(p)
 for delay in ('12','24'):
  for game in o['windows'][delay]['eligibleInputIds']:
   y,w,*_=game.split('_');assert (int(y),int(w))<key
 games['state']+=len(o['targetGameIds'])
 if key[0]>=2013:
  games['outer']+=len(o['targetGameIds']);games['exposed' if key[0]==2025 else 'development']+=len(o['targetGameIds']);pointer(e['selection']);selection_names.add(e['selection']['name'])
 if key[0]==2025:assert o['role']=='exposed_diagnostic' and e['counts']['inner_rows']==0 and e['counts']['scored_inner']==0
 counts.update(e['counts'])
 for c in e['callback_records']:
  assert c['started_seconds']>=lastcallback and c['finished_seconds']>=c['started_seconds'];lastcallback=c['finished_seconds']
assert seen==expected_origins and counts==t['counts']==oi['counts'];assert dict(games)=={'state':4175,'outer':3407,'development':3135,'exposed':272}
annual=[]
for n in sorted(selection_names):
 y=int(n.removeprefix('selection-').removesuffix('.json'));s=bound(n);assert s['E3']['inner_seasons']==[y-2,y-1];annual.append({'season':y,'inner_seasons':s['E3']['inner_seasons'],'setting':s['E3']['setting']})
assert [x['season'] for x in annual]==list(range(2013,2026))
samples=[]
for y,w in ((2013,1),(2016,11),(2025,1),(2025,18)):
 suffix=f'{y}-{w:02}';e=bound('origin-evidence-'+suffix+'.json');b=bound(e['publication_binding']['name']);f=bound(e['forecast']['name']);g=bound('grading-provenance-'+suffix+'.json');bound(b['state']['name']);bound(b['ancestry']['name'])
 assert b['publication']==g['publication']==e['forecast'] and b['origin']==e['origin'];assert f['target_game_ids']==e['origin']['targetGameIds'];assert g['score_artifacts']=={k:p for k,p in e['score_artifacts'].items() if k!='grading_provenance'}
 series=collections.Counter((r['family'],r['variant']) for r in f['outer_selected_forecasts']);assert len(series)==19 and set(series.values())=={len(f['target_game_ids'])};assert ('E3','availability_24h') in series and ('E2','availability_24h') in series and ('N0','availability_24h') in series
 if y==2025:assert not f['full_setting_forecasts'] and not b['grading_plan']['inner']
 samples.append({'origin':[y,w],'targets':len(f['target_game_ids']),'series':19,'availability_windows':['12','24'],'publication_and_grader_binding':'verified'})
obs=js(O/'process-report.json');a=ptr(O/'process-report.json');assert a['sha256']=='90bf6f4c43bf66dc87dd4fa5886ed372c5a2fc24b2e2a74236ad99e053919bb2' and a['bytes']==3049
for n,p in obs['artifacts'].items():a=ptr(O/n);assert all(a[k]==p[k] for k in ('sha256','bytes'))
assert obs['status']=='completed_process' and obs['exit_code']==0 and not obs['kill_requests'] and not obs['observation_errors'] and not obs['process_ownership_lost'] and not obs['limit_failure'] and obs['worker_grace_seconds']==0
phase=js(O/'phase.json');assert phase['phase']=='science';smoke=phase['smoke_finished']-phase['smoke_started'];assert smoke<120;assert obs['elapsed_seconds']<9000 and obs['waited_worker_peak_rss_mib']<=4096
pilot=bound('pilot.json');p=pilot.get('projection',pilot);assert p['passed'] and p['projected_total_seconds']<=9000
for ref in t['artifacts'].values():pointer(ref)
ev=t['artifacts']['evaluation'];assert ev['sha256']=='83fd47af1839660d47c4aca0053a32f509dcc23c9faa6cff175bff0cd05e6101' and ev['bytes']==11136356
report={'version':'rfcomp09.actual-temporal-review.v1','status':'accepted_complete_retained_temporal_evidence','reported_scientific_status':'reject_all','evidence':[ptr(B/n) for n in expected]+[ptr(B/'origin-index.json'),ptr(B/'pilot.json'),ptr(O/'process-report.json'),ptr(O/'phase.json')],'source_hashes_verified':len(m['code_hashes']),'runtime_files_verified':len(m['runtime_files']),'budget':m['budget'],'completed_origins':277,'unstarted_origins':0,'games':dict(games),'counts':dict(counts),'annual_selections':annual,'sample_bindings':samples,'complete_smoke_seconds':smoke,'pilot_projected_seconds':p['projected_total_seconds'],'worker_seconds':t['seconds'],'observer_seconds':obs['elapsed_seconds'],'peak_rss_mib':obs['waited_worker_peak_rss_mib'],'blockers':[],'findings':['Root reports actualtool session34188 closedexit0; independently authenticated ownedobserver confirms completedprocess/exit0 with no kill, observationerror, resourcefailure or ownershiploss.','Authoritative atomiccompletion pair, criticalindexedmetadata, all277origin-evidence files and13annualselection files authenticated. Everyorigin in original2010–2025weekly order; all12/24eligible input gameIDs precede origin; completecallbacktimestamps globally ordered.','All277publication/score pointers matchindex and retainedbefore-grading markers. Four nontrivial sampleorigins independently bind state/ancestry/publication/grader with19complete series and bothavailabilitypaths.','Exposed2025 retains272outergames, noinnerforecasts/rows/scoring;2025annualselection uses2023–2024. All13seasonselections useprior2years. Development3135andfull3407outerpopulations unchanged.','Counts aggregate exactly acrossall277savedgrading batches and matchoriginindex/terminal. No uncommittedartifacts/staging declared. Evaluationpointer binds fullsavedresult; numericalreview ownsitsarithmetic/decision.'],'limitations':['No fitting,recovery,scoring,bootstrap orscientificrerun. Annualchoices not independently re-estimated.','Root owns complete2655-file physicalmembership/hash audit; thisreview authenticatescriticalmetadata and sampled fullpublicationbodies, notalllaw/scorebytes.','Temporal source-admission andunchangedcontroller routing evidence reused. Strictdate/cutoff availability beyondgameweekorder reliesonacceptedsourceadmission; no newclaimoforiginalTuesdayissuance.','Publicationbeforegrading inferredfromauthenticatedbindings andqualifieddurablewrite ordering, notexternalper-write timestamptrace.','ObserverRSSissampled/waited; processcompletion doesnotalone establishscientificacceptance. Separatefullnumericalreview required; reject_all isnotpromotion,external5percent/prospective/productacceptance.']}
(W/'actual-temporal-review.v1.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n');print(ptr(W/'actual-temporal-review.v1.json'))
