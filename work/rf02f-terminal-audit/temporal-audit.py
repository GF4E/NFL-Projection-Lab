import pathlib,json,hashlib,time,collections,statistics
START=time.monotonic()
R=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k');W=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');P=pathlib.Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02f-v1-7b400dec97ab30c1');O=R/'work/rf02f-observer-c8bfb96705884106'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def raw(p):return json.loads(p.read_bytes())
def ptr(p):return dict(path=str(p),sha256=digest(p),bytes=p.stat().st_size)
idx=raw(P/'completion/artifact-index.json');files=idx['files']
for n,v in files.items():
 p=P/n;assert p.stat().st_size==v['bytes'] and digest(p)==v['sha256'],n
assert not idx['uncommitted_artifacts'] and not idx['uncommitted_staging']
def get(n):assert n in files;return raw(P/n)
m=get('manifest.json');ms=digest(P/'manifest.json');assert ms=='7b400dec97ab30c11928463696ed4f86b8ca496646998f4e15812c0cfd8e381e'
a=R/'.planning/engine-os/research-first/RF-02F-PREFIT-ACCEPTANCE.v1.json';assert digest(a)==m['implementation_acceptance_sha256'];acc=raw(a);assert acc['code_hashes']==m['code_hashes'] and len(acc['code_hashes'])==66
for n,h in m['code_hashes'].items():assert digest(R/n)==h
for v in list(m['stage_acceptances'].values())+list(m['independent_reviews'].values())+[m['qualification']]:
 p=pathlib.Path(v['path']);p=p if p.is_absolute() else R/p;assert digest(p)==v['sha256'] and p.stat().st_size==v['bytes']
t=raw(P/'completion/terminal.json');assert t['status']=='protocol_invalid' and t['reason']=='registered_pilot_cost_screen_failed' and t['completed_origins']==53
assert sorted(x.name for x in (P/'completion').iterdir())==['artifact-index.json','terminal.json']
expected=[(y,w) for y in range(2010,2013) for w in range(1,18)]+[(2013,1),(2013,2)]
assert sorted(n for n in files if n.startswith('origin-evidence-'))==['origin-evidence-%d-%02d.json'%o for o in expected]
assert [n for n in files if n.startswith('selection-')]==['selection-2013.json']
assert not any(n.startswith(('evaluation','origin-index','scorecards','paired-inference')) for n in files)
counts=collections.Counter();samples=[]
for y,w in expected:
 suffix=f'{y}-{w:02}';ev=get('origin-evidence-'+suffix+'.json');b=get('publication-binding-'+suffix+'.json');g=get('grading-provenance-'+suffix+'.json');f=get('forecasts-'+suffix+'.json')
 assert ev['publication_before_grading'] is True and ev['manifest_sha256']==ms and b['manifest_sha256']==ms and g['manifest_sha256']==ms
 assert g['publication']==b['publication']==ev['forecast']
 for v in [b['publication'],b['state'],b['ancestry'],ev['publication_binding']]+list(ev['score_artifacts'].values()): assert files[v['name']]=={'sha256':v['sha256'],'bytes':v['bytes']}
 counts.update(g['counts']);assert (f['origin']['season'],f['origin']['week'])==(y,w) if isinstance(f['origin'],dict) else f['origin']==[y,w]
 if (y,w) in [(2010,6),(2011,1),(2012,17),(2013,1),(2013,2)]:
  s=get('state-'+suffix+'.json');assert len(s['trajectory_state'])==297
  ids=set(f['target_game_ids']);origin=b['origin']
  for win in origin['windows'].values():assert not ids.intersection(win['eligibleInputIds'])
  for state in s['trajectory_state']:
   events=state['output'].get('events',{});assert not ids.intersection(events.get('delivered',[]))
  samples.append({'origin':[y,w],'states':297,'targets':len(ids),'new_inner':g['counts']['scored_inner'],'new_outer':g['counts']['scored_outer'],'binding':ptr(P/('publication-binding-'+suffix+'.json'))})
assert dict(counts)==t['counts']
selection=get('selection-2013.json')['E3'];vals=collections.defaultdict(list);games=set()
for y in [2011,2012]:
 for w in range(1,18):
  rows=get(f'inner-losses-{y}-{w:02}.json')
  for v in rows:
   assert v['game_id'].startswith(str(y)+'_');vals[v['setting']].append(v);games.add(v['game_id'])
assert len(games)==512 and set(vals)==set(range(27))
for cand in selection['candidates']:
 v=vals[cand['setting']];assert len(v)==512 and len(set(x['game_id'] for x in v))==512
 mean=sum(x['metrics']['joint_energy_score'] for x in sorted(v,key=lambda x:x['game_id']))/512
 assert abs(mean-cand['mean_energy'])<1e-12
 assert cand['failure_rate']==sum(x['native_failure'] is not None for x in v)/512
assert selection['inner_seasons']==[2011,2012] and selection['setting']==6 and min(selection['candidates'],key=lambda x:x['mean_energy'])['setting']==6
pilot=get('pilot.json');orig=pilot['accounting']['origins'];assert [(v['season'],v['week']) for v in orig]==expected
assert all(v['complete'] and v['error_type'] is None for v in orig)
assert all(orig[i]['finished_seconds']<=orig[i+1]['started_seconds'] for i in range(52));assert pilot['remaining_origins']==224
ob=raw(O/'process-report.json')
for n,v in ob['artifacts'].items():assert digest(O/n)==v['sha256'] and (O/n).stat().st_size==v['bytes']
assert ob['exit_code']==1 and ob['process_ownership_lost'] is False and ob['automatic_restart'] is False and not ob['kill_requests'] and not ob['observation_errors']
assert [x['phase'] for x in ob['phase_progression']]==['starting','smoke','science'];assert ob['exit_observed_elapsed_seconds']>=t['scientific_stop_elapsed_seconds']
report={'status':'accepted_invalid_terminal_temporal_scope','run_status':'protocol_invalid','reason':t['reason'],'scope':'authenticated_retained53_origin_prefix_and_sampled_temporal_interfaces','blockers':[],'evidence':[ptr(P/'manifest.json'),ptr(P/'completion/artifact-index.json'),ptr(P/'completion/terminal.json'),ptr(a),ptr(O/'process-report.json'),ptr(P/'selection-2013.json'),ptr(P/'admission.json'),ptr(P/'pilot.json')],'code_hashes':m['code_hashes'],'indexed_files':len(files),'indexed_bytes':sum(v['bytes'] for v in files.values()),'completed_origins':53,'unstarted_origins':224,'counts':dict(counts),'prior_selection':{'seasons':[2011,2012],'unique_games':512,'settings':27,'selected':6,'all27_means_and_failure_rates_reproduced_from_saved_rows':True},'sampled_interfaces':samples,'process':{'exit_code':1,'seconds':ob['elapsed_seconds'],'rss_mib':ob['waited_worker_peak_rss_mib'],'ownership_lost':False,'restart':False},'findings':['All indexed files authenticated;66 source pins, prefit receipt and stage/review/qualification bindings match.','Full53 origin/order and grading-publication pointer composition verified. No later origin or final inference artifacts exist.','Actual2013 selection uses complete512-game2011–2012 saved rows;27 candidate means/failure rates independently reproduced, setting6 selected.','Five sample origins span initialization boundary, first inner scoring, prior-season finish and both outer pilots;297 states and both availability windows exclude current target IDs from eligible/delivered history.','Observed terminal is a cooperative registered-cost stop, not external timeout/RSS kill. Watchdog reaped exit1 without ownership loss, observation errors or restart.'],'limitations':['No new model fitting, scoring, bootstrap, source-admission rerun or historical experiment. Audit-only drafts stopped on incorrect metric-key assumptions and remaining_origins type; corrected against saved schema, no scientific data altered.','Publication-before-grading is supported by authenticated pointers, accepted exact source controlflow and immutable run evidence; filesystem records alone are not an independent syscall trace or power-loss durability experiment.','Parent1909-file admission is reused through retained authenticated receipt and accepted implementation, not independently reread in this audit.','Full law/numerical recalculation and cost-formula reproduction are separate numerical scope; this report does not validate predictive performance.','No2025/full cohort inference exists; retain protocol_invalid and do not interpret32 outer games as model acceptance.'],'seconds':time.monotonic()-START}
p=W/'work/rf02f-terminal-audit/temporal-review.json';p.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n');print(ptr(p))
