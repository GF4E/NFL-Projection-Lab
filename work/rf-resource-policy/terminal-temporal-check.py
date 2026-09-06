from pathlib import Path
import json,hashlib
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k');W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-resource-policy');B=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rfcomp08-v1-6683e6438f3c6077');O=R/'work/rfcomp08-observer-3bbc98b3645782ba'
def ptr(p):
 b=p.read_bytes();return {'path':str(p),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
def js(p):return json.loads(p.read_bytes())
i=js(B/'completion/artifact-index.json');files=i['files'];t=js(B/'completion/terminal.json');m=js(B/'manifest.json');o=js(O/'process-report.json')
def bound(n):
 p=ptr(B/n);assert {k:p[k] for k in ('sha256','bytes')}==files[n],n
 return js(B/n)
def pointer(p):assert {k:p[k] for k in ('sha256','bytes')}==files[p['name']]
assert ptr(B/'manifest.json')['sha256']==t['manifest_sha256']=='6683e6438f3c607711623596ea8d41370e3ba9a3c9bcdd9dbead50703520ae5f'
bound('manifest.json');bound('completion/terminal.json');assert not i['uncommitted_artifacts'] and not i['uncommitted_staging']
for n,h in m['code_hashes'].items():assert ptr(R/n)['sha256']==h
for n,h in m['runtime_files'].items():assert ptr(Path(n))['sha256']==h
for key in ('resource_protocol','resource_policy','compute_protocol','baseline_acceptance'):
 p=m[key];a=ptr(R/p['path']);assert a['sha256']==p['sha256'] and a['bytes']==p['bytes']
assert ptr(R/'.planning/engine-os/research-first/RF-COMP-08-PREFIT-ACCEPTANCE.v1.json')['sha256']==m['implementation_acceptance_sha256']=='3bbc98b3645782ba088d814c61505a86041f0a5c82e6a32d6430b62c58fd1bbe'
for n,p in o['artifacts'].items():a=ptr(O/n);assert all(a[k]==p[k] for k in ('sha256','bytes'))
assert o['exit_code']==1 and o['status']=='failed_process' and not o['kill_requests'] and not o['observation_errors'] and not o['process_ownership_lost'] and not o['limit_failure']
assert o['limits']['scientific_seconds']==9000 and o['limits']['rss_mib']==4096 and o['worker_grace_seconds']==0
phase=js(O/'phase.json');assert phase['phase']=='science';smoke=phase['smoke_finished']-phase['smoke_started'];assert smoke<120
names=sorted(n for n in files if n.startswith('origin-evidence-'));assert len(names)==113
expected=[(y,w) for y in range(2010,2017) for w in range(1,18) if (y,w)<=(2016,11)]
actual=[];targets=0
for n in names:
 e=bound(n);orig=e['origin'];actual.append((orig['season'],orig['week']));assert e['publication_before_grading'] is True and e['manifest_sha256']==t['manifest_sha256']
 for key in ('forecast','publication_binding'):pointer(e[key])
 for p in e['score_artifacts'].values():pointer(p)
 if orig['season']>=2013:pointer(e['selection']);targets+=len(orig['targetGameIds'])
assert actual==expected
samples=[]
for suffix in ('2013-1','2014-1','2016-11'):
 y,w=map(int,suffix.split('-'));s=f'{y}-{w:02}';e=bound('origin-evidence-'+s+'.json');b=bound(e['publication_binding']['name']);g=bound('grading-provenance-'+s+'.json');f=bound(e['forecast']['name']);sel=bound(e['selection']['name']);bound(b['state']['name']);bound(b['ancestry']['name']);assert g['publication']==b['publication']==e['forecast'];assert b['origin']==e['origin'] and f['target_game_ids']==e['origin']['targetGameIds'];assert sel['E3']['inner_seasons']==[y-2,y-1];assert g['score_artifacts']=={k:v for k,v in e['score_artifacts'].items() if k!='grading_provenance'};samples.append({'origin':[y,w],'inner_seasons':sel['E3']['inner_seasons'],'published_targets':len(f['target_game_ids'])})
last=t['last_origin_accounting'];assert (last['season'],last['week'])==(2016,12) and last['complete'] is False and last['budget_stop']=='invalid_monotonic_clock';assert not any('2016-12' in n for n in files);assert not any('evaluation' in n for n in files)
pilot=bound('pilot.json');projection=pilot.get('projection',pilot);assert projection['passed'] and projection['projected_total_seconds']<=9000
out={'version':'rfcomp08.actual-temporal-review.v1','status':'accepted_retained_protocol_invalid_operational_evidence_only','evidence':[ptr(B/'manifest.json'),ptr(B/'completion/terminal.json'),ptr(B/'completion/artifact-index.json'),ptr(B/'pilot.json'),ptr(O/'process-report.json'),ptr(O/'phase.json')],'source_count_verified':len(m['code_hashes']),'runtime_count_verified':len(m['runtime_files']),'budget':m['budget'],'completed_origins':113,'last_completed_origin':[2016,11],'attempted_incomplete_origin':[2016,12],'remaining_not_completed':164,'unstarted_after_attempt':163,'outer_games_in_complete_prefix':targets,'sample_publication_bindings':samples,'complete_smoke_seconds':smoke,'observer_seconds':o['elapsed_seconds'],'worker_scientific_stop_seconds':t['scientific_stop_elapsed_seconds'],'worker_terminal_seconds':t['seconds'],'observer_report_prepared_seconds':o['report_prepared_elapsed_seconds'],'rss_mib':o['waited_worker_peak_rss_mib'],'reason':t['reason'],'pilot_projection':projection['projected_total_seconds'],'blockers':[],'findings':['Actual tool session30065 closure exit1 supplied by root; saved owned observer independently reports exit1, no kill/resource failure/observation error/ownership loss.','Authenticated atomic completion pair and indexed critical metadata; index contains no uncommitted artifact/staging and no2016W12 publication or final evaluation. Root owns full physical membership/large artifact audit.','All113 complete origin evidence files authenticated in exact2010W1–2016W11 order. All recorded publication/score pointers match index; selected2013W1/2014W1/2016W11 state, ancestry, publication and grader bindings authenticated with prior-two-season selection.','Invalid terminal preserved; monotonic-clock cause is not established by this audit. No inference or model conclusion is inferred.'],'limitations':['No fitting, recovery, scoring, bootstrap, tests or scientific execution.','Sampled temporal binding verification is not independent recomputation of every law or annual selection. Existing qualified chronology/source-admission semantics reused.','Filesystem hashes/pointers and qualified write ordering support publication-before-grading; no external per-write timestamp trace exists.','Observer RSS is sampled/waited; interpreter startup and scheduling caveats remain. Completion persistence is inferred from retained atomic files and accepted Store semantics, not crash testing.','Pilot formula not independently recomputed here; numerical reviewer owns full ledger arithmetic. No restart or historical/predictive acceptance.']}
(W/'actual-temporal-review.v1.json').write_text(json.dumps(out,sort_keys=True,indent=2)+'\n');print(ptr(W/'actual-temporal-review.v1.json'))
