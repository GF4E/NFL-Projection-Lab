"""Independent RF-COMP-04 terminal metadata audit; no scientific imports/calls."""
from pathlib import Path
from datetime import datetime
from collections import Counter
import json,hashlib,stat,time
W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
D=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rfcomp04-v1-b7fd5fb240c6cfa8')
P=D.parent/'rf02c-v1-2d9c91d803f1c991'
O=R/'work/rfcomp04-observer-9aaaa23ebc2b002c'
E={}; checks=0; started=time.monotonic()
def must(x,why):
 global checks
 checks+=1
 if not x: raise AssertionError(why)
def sha(b): return hashlib.sha256(b).hexdigest()
def enc(v): return (json.dumps(v,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def pairs(items):
 d={}
 for k,v in items:
  if k in d: raise ValueError('duplicate_json_key:'+k)
  d[k]=v
 return d
def parse(b): return json.loads(b,object_pairs_hook=pairs,parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
def raw(path,h=None,size=None):
 path=Path(path);must(stat.S_ISREG(path.lstat().st_mode),'nonregular:'+str(path));b=path.read_bytes();s=sha(b)
 if h is not None: must(s==h,'sha:'+str(path))
 if size is not None: must(len(b)==size,'size:'+str(path))
 E[str(path)]={'path':str(path),'sha256':s,'bytes':len(b)}
 return b
def obj(path,h=None,size=None):return parse(raw(path,h,size))
idx=obj(D/'completion/artifact-index.json','1bc24410a4049fe3754e7ce944ab43bc34f311edc2f0bcd7b1f7eaf6d99d4dd9')
files=idx['files']
def local(name):
 p=files[name];return obj(D/name,p['sha256'],p['bytes'])
def ptr(p):
 must(type(p) is dict and set(p)=={'name','sha256','bytes'},'local pointer schema')
 must(p['name'] in files and files[p['name']]=={k:p[k] for k in ['sha256','bytes']},'local pointer binding')
def parentptr(p):
 must(p['name'] in pi and pi[p['name']]=={k:p[k] for k in ['sha256','bytes']},'parent pointer binding')
terminal=local('completion/terminal.json');must(sha(enc(terminal))=='b52a904de1aad0303c1b662eec2bb4a9624695344991a94949248fd2048c170d','terminal canonical')
m=local('manifest.json');mh=sha(enc(m));must(mh=='b7fd5fb240c6cfa8abcc5f147b28ab37286e83e82ac41c37eb4f44b685d2caa8'==terminal['manifest_sha256'],'manifest')
must(D.name=='rfcomp04-v1-'+mh[:16] and m['version']=='rfcomp04.manifest.v1','identity')
must(terminal['status']=='protocol_invalid' and terminal['reason']=='registered_pilot_cost_screen_failed' and terminal['error_type']=='ValueError' and terminal['phase']=='pilot_cost_screen','terminal stop reason')
must(terminal['automatic_restart'] is False and terminal['production_authorized'] is False and terminal['provider_requests']==0,'terminal prohibitions')
must(terminal['independent_actual_result_acceptance'] is False,'terminal provisional')
pre=obj(R/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json',m['implementation_acceptance_sha256'])
must(m['implementation_acceptance_sha256']=='9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e','prefit identity')
qptr=m['qualification'];q=obj(qptr['path'],qptr['sha256'],qptr['bytes'])
must(q['code_hashes']==m['code_hashes'] and q['runtime']==m['runtime'] and q['runtime_files']==m['runtime_files'],'qualification source closure')
must(len(m['code_hashes'])==79,'79 sources')
for n,h in m['code_hashes'].items():raw(R/n,h)
cp=m['compute_protocol'];raw(R/cp['path'],cp['sha256'],cp['bytes'])
for v in m['independent_reviews'].values():
 review=obj(v['path'],v['sha256'],v['bytes']);must(review['qualification_sha256']==qptr['sha256'] and review['blockers']==[],'prefit review binding')
pi=obj(P/'artifact-index.json',m['parent_index_sha256'])['files']
local('admission.json');smoke=local('smoke.json');began=local('started.json')
pilot=local('pilot.json');ledger=pilot['accounting'];projection=pilot['projection'];records=ledger['origins']
must(len(records)==53==pilot['retained_prefix_origins']==terminal['completed_origins'] and pilot['remaining_origins']==224,'prefix count')
must(projection['within_time_screen'] is False and projection['failed_callback_count']==0 and projection['projected_total_seconds']==7933.312174588717 and projection['projected_total_seconds']>7200,'registered cost failure')
must(sha(enc(ledger))==projection['accounting_sha256'],'accounting digest')
must(terminal['last_origin_accounting']==records[-1],'terminal last origin ledger')
expected=[(y,w) for y in range(2010,2013) for w in range(1,18)]+[(2013,1),(2013,2)]
must([(x['season'],x['week']) for x in records]==expected,'exact origin prefix')
suffixes=[f'{y}-{w:02}' for y,w in expected]
for prefix in ('origin-evidence','publication-binding','grading-provenance','forecasts','state','ancestry'):
 must(sorted(n for n in files if n.startswith(prefix+'-'))==[prefix+'-'+s+'.json' for s in suffixes],prefix+' complete suffix only')
must(sorted(n for n in files if n.startswith('selection-'))==['selection-2013.json'],'one annual choice')
must(sorted(n for n in files if n.startswith('inner-losses-'))==['inner-losses-'+s+'.json' for s,(y,w) in zip(suffixes,expected) if y>=2011],'inner scope')
must(sorted(n for n in files if n.startswith('outer-losses-'))==['outer-losses-2013-01.json','outer-losses-2013-02.json'],'outer scope')
for absent in ['origin-index.json','accounting.json','inference-input-index.json','evaluation.json']:
 must(absent not in files and not (D/absent).exists(),'unstarted final stage:'+absent)
# Physical inventory, without reading scientific state, mapper objects or score bodies.
physical={}
for path in D.rglob('*'):
 if path.is_file():
  must(not path.is_symlink(),'symlink in retained run');physical[path.relative_to(D).as_posix()]=path.stat().st_size
must(set(physical)==set(files)|{'completion/artifact-index.json'},'physical complete index names')
must(all(physical[n]==p['bytes'] for n,p in files.items()),'physical sizes')
must(idx['uncommitted_artifacts']==[] and idx['uncommitted_staging']==[],'no uncommitted closure')
must(sorted(p.name for p in D.iterdir() if p.is_dir())==['completion'],'one completion no staging')
selection=local('selection-2013.json')['E3']
must(selection['inner_seasons']==[2011,2012] and selection['games']==512 and selection['setting']==6 and selection['status']=='selected','prior two complete seasons choice')
counts=Counter();year_games=Counter();modes=Counter();flags=Counter();seen_inputs={'12':set(),'24':set()};seen_games=set();seen_inner=set();summary=[];last_end=0.;first_score_flags=[]
code_sha=sha(enc(m['code_hashes']))
for rec,(y,w),suffix in zip(records,expected,suffixes):
 ev=local('origin-evidence-'+suffix+'.json');origin=ev['origin'];ids=origin['targetGameIds'];year_games[y]+=len(ids)
 must((origin['season'],origin['week'])==(y,w) and len(ids)==len(set(ids)) and not (set(ids)&seen_games),'origin ids')
 must(rec['origin_sha256']==sha(enc(origin)) and rec['game_ids']==ids and rec['history_count']==len(origin['windows']['12']['eligibleInputIds']),'origin accounting identity')
 must(rec['complete'] is True and rec['error_type'] is None and rec['started_seconds']>=last_end and rec['finished_seconds']-rec['started_seconds']==rec['seconds'],'origin chronology')
 last_end=rec['finished_seconds']
 must(ev['manifest_sha256']==mh and ev['publication_before_grading'] is True and ev['callback_records']==rec['callbacks'],'evidence callback identity')
 for d in ('12','24'):
  window=origin['windows'][d];eligible=window['eligibleInputIds'];current=set(eligible)
  must(current<=seen_games and seen_inputs[d]<=current and not current.intersection(ids),'prior available scope')
  must(sha(enc(eligible))==window['inputIdSha256'],'input order hash')
  must(set(window['firstDeliveryIds'])==current-seen_inputs[d],'first delivery progression')
  seen_inputs[d]=current
 seen_games.update(ids)
 ptr(ev['forecast']);ptr(ev['publication_binding'])
 for p in ev['score_artifacts'].values():ptr(p)
 for p in ev['source_pointers'].values():parentptr(p)
 binding=local(ev['publication_binding']['name']);grade=local(ev['score_artifacts']['grading_provenance']['name'])
 must(binding['manifest_sha256']==grade['manifest_sha256']==mh and binding['origin']==origin and grade['origin']==[y,w],'publication grader owner')
 must(binding['publication']==grade['publication']==ev['forecast'] and binding['source_pointers']==ev['source_pointers'],'publication source binding')
 for p in [binding['state'],binding['ancestry']]:ptr(p)
 for p in grade['source_pointers'].values():parentptr(p)
 must(all(grade['source_pointers'][k]==v for k,v in ev['source_pointers'].items()) if y>=2011 else grade['source_pointers']=={},'graded original source consistency')
 for k,p in grade['score_artifacts'].items():must(p==ev['score_artifacts'][k],'saved score pointer')
 must(grade['counts']==ev['counts'],'origin count consistency');counts.update(ev['counts'])
 must(ev['counts']['inner_rows']==(27*len(ids) if y>=2011 else 0) and ev['counts']['outer_rows']==(19*len(ids) if y>=2013 else 0),'origin population')
 must(ev['native_states']=={'borrowed':81,'own':216},'state declaration')
 if y<2013:must(ev['selection'] is None,'no early selection')
 else:
  ptr(ev['selection']);must(ev['selection']['name']=='selection-2013.json','fixed saved annual choice')
 ancestry=local(binding['ancestry']['name']);must(set(ancestry)=={'12','24'},'both delays')
 for d,v in ancestry.items():
  nodes=v['nodes'];byid={n['id']:n for n in nodes};must(len(nodes)==len(byid)==6,'ancestry population')
  for n in nodes:
   must(n['sha256']==sha(enc({k:x for k,x in n.items() if k!='sha256'})),'ancestry hash')
   for p in n['parents']:must(byid[p['id']]['sha256']==p['sha256'],'ancestry edge')
   must(n['available_at'] is None or datetime.fromisoformat(n['available_at'])<=datetime.fromisoformat(origin['originAt']),'ancestor availability')
  must(v['expected_root']==byid['forecast']['sha256'],'forecast ancestry root')
  must(byid['eligible-football']['body']['ids']==origin['windows'][d]['eligibleInputIds'] and byid['eligible-football']['body']['admission_manifest']==mh,'source ancestry current owner')
  must(byid['model']['body']['code_sha256']==code_sha and byid['configuration']['body']['sha256']==m['bound_hashes']['config'],'source code/config ancestry')
  must(byid['forecast']['body']=={'delay_hours':int(d),'forecast_bytes_sha256':ev['forecast']['sha256']},'forecast delay/hash')
 plan=binding['grading_plan'];expected_inner=[['E3',i,g] for g in ids for i in range(27)] if y>=2011 else []
 expected_outer=[[f,v,g] for f,v in m['scientific_registry']['seriesInOrder'] for g in ids] if y>=2013 else []
 must([p['key'] for p in plan['inner']]==expected_inner and [p['key'] for p in plan['outer']]==expected_outer,'exact grading target order')
 rows=grade['rows'];must(len(rows)==len(expected_inner)+len(expected_outer),'graded key population')
 for row,(stage,p) in zip(rows,[(s,p) for s in ('inner','outer') for p in plan[s]]):
  must(row['stage']==stage and row['key']==p['key'] and row['mode']==p['mode'] and row['source_forecast']==p['source'] and row['law_work']==p['law_work'],'graded saved plan linkage')
  must(row['native_failure'] is None,'no prefix native failure');modes[stage+':'+row['mode']]+=1
  if row['mode']=='new_score':
   first=(y,row['key'][1]) not in seen_inner
   want={'double_grid':first if stage=='inner' else True,'diagnostics':stage=='outer'}
   must(row['score_flags']==want,'original first-inner/full-outer flags')
   flags[(stage,str(want['double_grid']),str(want['diagnostics']))]+=1
   if stage=='inner':seen_inner.add((y,row['key'][1]))
  else:
   must(row['score_flags'] is None and row['source_loss'] is not None,'copied rows not scored');parentptr(row['source_loss']['file'])
 prior=rec['started_seconds']
 for cb in rec['callbacks']:
  must(cb['error_type'] is None and cb['error_reason'] is None and cb['native_failure'] is None,'no numerical callback failure')
  must(cb['game_id'] in ids and cb['started_seconds']>=prior and cb['finished_seconds']<=rec['finished_seconds'] and cb['finished_seconds']-cb['started_seconds']==cb['seconds'],'disjoint origin callback range');prior=cb['finished_seconds']
 scorecalls=[c for c in rec['callbacks'] if c['kind']=='score'];newrows=[r for r in rows if r['mode']=='new_score']
 must(len(scorecalls)==len(newrows)==ev['counts']['actual_score_calls'],'physical scorer count')
 for cb,row in zip(scorecalls,newrows):must(cb['game_id']==row['key'][-1] and cb['stage']==row['stage'] and all(cb[k]==v for k,v in row['score_flags'].items()),'score provenance callback flags')
 # File times are corroborating only; authenticated code and pointer closure establish the ordering contract.
 ns=lambda n:(D/n).stat().st_mtime_ns
 must(max(ns(binding[k]['name']) for k in ('state','ancestry'))<=ns(ev['publication_binding']['name'])<=ns(ev['forecast']['name'])<=ns(ev['score_artifacts']['grading_provenance']['name'])<=ns('origin-evidence-'+suffix+'.json'),'corroborating publication mtime order')
 for p in grade['score_artifacts'].values():must(ns(ev['forecast']['name'])<=ns(p['name'])<=ns(ev['score_artifacts']['grading_provenance']['name']),'corroborating score persistence order')
 summary.append({'origin':[y,w],'target_count':len(ids),'history12':len(origin['windows']['12']['eligibleInputIds']),'history24':len(origin['windows']['24']['eligibleInputIds']),'origin_sha256':rec['origin_sha256'],'origin_evidence':E[str(D/('origin-evidence-'+suffix+'.json'))],'callbacks':len(rec['callbacks']),'counts':ev['counts']})
must(dict(counts)==terminal['counts'],'terminal complete counts')
must(dict(year_games)=={2010:256,2011:256,2012:256,2013:32} and len(seen_games)==800,'actual prefix game scope')
must((D/'origin-evidence-2012-17.json').stat().st_mtime_ns<=(D/'selection-2013.json').stat().st_mtime_ns<=(D/'forecasts-2013-01.json').stat().st_mtime_ns,'prior choice time corroboration')
# External observer closes one owned worker. No process queries or signals issued by this audit.
observer=obj(O/'process-report.json')
for n,p in observer['artifacts'].items():raw(O/n,p['sha256'],p['bytes'])
must(observer['status']=='failed_process' and observer['exit_code']==1 and observer['exit_signal'] is None,'process failed normally')
must(observer['kill_requests']==[] and observer['observation_errors']==[] and observer['process_ownership_lost'] is False and observer['stop_reason'] is None and observer['automatic_restart'] is False,'owned process no external kill/retry')
must(observer['waited_worker_peak_rss_mib']==terminal['peak_rss_mib']<4096,'peak consistent below cap')
must([p['phase'] for p in observer['phase_progression']]==['starting','smoke','science'],'one-way smoke handshake')
ph=observer['phase_progression'][-1];smoke_wall=ph['smoke_finished']-ph['smoke_started'];must(0<smoke_wall<=smoke['complete_smoke_seconds']<120,'whole smoke cap')
must(observer['command'][3]=='--repository-root' and '--implementation-acceptance-sha256' in observer['command'],'fixed worker launch')
must(m['implementation_acceptance_sha256'] in observer['command'] and str(R/'scripts/research_score_split_compute_controller.py') in observer['command'],'worker acceptance source identity')
must(began['watchdog_phase_path']==str(O/'phase.json') and abs(observer['started_monotonic']-began['envelope_started_monotonic'])<.001,'owned shared clock')
must(terminal['scientific_stop_elapsed_seconds']>=last_end and terminal['seconds']>=terminal['scientific_stop_elapsed_seconds'] and terminal['seconds']<observer['elapsed_seconds']<terminal['scientific_stop_elapsed_seconds']+30,'bounded invalid closure')
obs=[parse(line) for line in (O/'observations.jsonl').read_bytes().splitlines()];must(len(obs)==observer['sample_count'],'observer sample count')
# Intentionally no original score parsing, model reconstruction, selection recomputation, or numerical formula invocation.
result={'checks_passed':checks,'metadata_seconds':time.monotonic()-started,'prefix':summary,'counts':dict(counts),'year_games':dict(year_games),'modes':dict(modes),'new_score_flags':{':'.join(k):v for k,v in flags.items()},'feed_batches_inferred_from_bound_controller_and_complete_postgrade_evidence':36,'annual_choice':{k:selection[k] for k in ('inner_seasons','games','setting','status')},'last_origin':[2013,2],'remaining_origins':224,'remaining_games':3375,'terminal_status':terminal['status'],'reason':terminal['reason'],'manifest_sha256':mh,'code_hashes':m['code_hashes'],'runtime':m['runtime'],'runtime_files':m['runtime_files'],'observer_summary':{k:observer[k] for k in ('status','exit_code','elapsed_seconds','sample_count','kill_requests','observation_errors','process_ownership_lost','sampled_group_peak_rss_mib','waited_worker_peak_rss_mib')},'smoke_interval_seconds':smoke_wall,'evidence':list(E.values())}
out=W/'work/rf-comp-04/terminal-temporal-audit/metadata-verification.json'
with out.open('xb') as f:f.write(enc(result))
print(json.dumps({'status':'passed_metadata_only','checks':checks,'output':str(out),'sha256':sha(out.read_bytes()),'bytes':out.stat().st_size,'seconds':result['metadata_seconds'],'flags':result['new_score_flags'],'counts':result['counts']}))
