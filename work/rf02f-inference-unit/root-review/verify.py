from pathlib import Path
import hashlib,json,resource,signal,sys,time,types
started=time.monotonic()
class Stop(BaseException):pass
signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(Stop('root_review_120_seconds')))
signal.setitimer(signal.ITIMER_REAL,120)
r=Path('/private/tmp/os01-gen15-rebuild.9ny71k');w=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02f-inference-unit');base=w/'full-943105d923d2043d'
sys.path.insert(0,str(r/'scripts'))
import research_score_split_inference as unit
from research_score_contract import encoded

def sha(raw):return hashlib.sha256(raw).hexdigest()
def bound(directory,p):
 raw=(directory/p['name']).read_bytes();assert len(raw)==p['bytes'] and sha(raw)==p['sha256'];return raw
qraw=(base/'qualification.json').read_bytes();assert sha(qraw)=='19f64845ee65da9631049a218aa19c3379dae873e164bd193a8bde2c874d2eeb';q=json.loads(qraw)
processraw=(w/'full-943105d923d2043d-process.json').read_bytes();assert sha(processraw)=='be3ae98089a18df6c5f907fa86c96a8d9be29f6209b5245d940318bcf88037d9';process=json.loads(processraw)
assert q['status']=='passed' and q['complete_public_evaluator'] is True and q['historical_execution'] is False
for n,h in q['source_hashes'].items():assert sha((r/n).read_bytes())==h
manifest=json.loads(bound(base,q['fixture_pointer']));evaluation=json.loads(bound(base,q['evaluation_pointer']));bridge=json.loads(bound(base,q['bridge_pointer']))
config=json.loads((r/'config/research-team-score-split.v1.json').read_bytes());series,comparisons,cells=unit.registered(config)
rows={k:[] for k in series};digests={k:hashlib.sha256() for k in series};files=3;totalbytes=sum(q[k]['bytes'] for k in ['fixture_pointer','evaluation_pointer','bridge_pointer'])
for pointer in manifest['files']:
 raw=bound(base,pointer);files+=1;totalbytes+=len(raw)
 for row in json.loads(raw):
  key=row['family'],row['variant'];digests[key].update(encoded({'game_id':row['game_id'],'metrics':row['metrics']}));rows[key].append({k:row[k] for k in ['game_id','metrics','native_failure']})
for key in series:
 assert len(rows[key])==3407
 assert digests[key].hexdigest()==manifest['series_digests'][':'.join(key)]['metrics_sha256']
 assert [x['game_id'] for x in rows[key]]==[g['game_id'] for g in manifest['metadata']]
assert len(manifest['files'])==226 and len(rows)==19
assert evaluation['status']=='reject_all' and evaluation['counts']=={'calibration_cells':8,'development_games':3135,'energy_comparisons':18,'exposed_2025_games':272,'outer_games':3407,'outer_origins':226,'series':19}
assert evaluation['inference']['comparison_order']==[r['id'] for r in config['energyComparisonsInOrder']]
assert evaluation['inference']['calibration_cell_order']==config['calibrationCellsInOrder']
for block in evaluation['inference']['blocks'].values():
 assert block['members']==10000 and len(block['coverage'])==228 and len(block['pit_simultaneous_bands'])==76
for card in evaluation['scorecards'].values():
 assert card['development']['games']==3135 and card['all_issued']['games']==3407 and card['exposed_2025']['games']==272
 assert [card['seasons'][str(y)]['games'] for y in unit.YEARS]==list(unit.YEAR_COUNTS)
# A private clone probes the temporal seam only. The accepted real full evaluator
# above is not rerun or replaced; no frozen module/global is changed.
class SeamReached(BaseException):pass
seen={}
def capture(metadata,metrics,diagnostic,raw,contrasts,calibration):
 assert len(metadata)==3135 and all(2013<=g['season']<=2024 for g in metadata)
 assert len(diagnostic)==19 and raw==() and len(contrasts)==18 and len(calibration)==8
 assert all(len(v)==3135 and all(m['joint_energy_score']<1000000 for m in v) for v in metrics.values())
 seen.update(games=len(metadata),series=len(metrics),maximum_year=max(g['season'] for g in metadata))
 raise SeamReached()
for key in series:
 for i,g in enumerate(manifest['metadata']):
  if g['season']==2025:rows[key][i]['metrics']['joint_energy_score']+=1000000
private=types.FunctionType(unit.evaluate.__code__,dict(unit.evaluate.__globals__,_infer=capture),unit.evaluate.__name__)
try:private(config,manifest['metadata'],rows,manifest['audit_checks'])
except SeamReached:pass
else:raise AssertionError('temporal_probe_not_reached_or_BaseException_swallowed')
assert seen=={'games':3135,'series':19,'maximum_year':2024}
assert unit.evaluate.__globals__['_infer'] is not capture
assert sha((r/'scripts/research_score_split_inference.py').read_bytes())==q['source_hashes']['scripts/research_score_split_inference.py']
elapsed=time.monotonic()-started;rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20
assert elapsed<=120 and rss<=2048
out={'status':'accepted_root_artifact_and_temporal_scope_only','qualification_sha256':sha(qraw),'process_report_sha256':sha(processraw),'source_hashes':q['source_hashes'],'authenticated_artifacts':files,'authenticated_bytes':totalbytes,'exact_metric_series_digests':19,'public_saved_counts':evaluation['counts'],'bootstrap_members_inspected':[10000,10000,10000],'temporal_probe':{'scope':'private_clone_inference_call_seam_no_bootstrap','all_272_exposed_rows_in_each_series_injected_with_large_energy_sentinel':True,'captured':seen,'BaseException_propagated':True,'module_globals_unchanged':True},'wall_seconds':elapsed,'peak_rss_mib':rss,'new_fit_calls':0,'new_score_calls':0,'new_bootstrap_calls':0,'historical_execution':False,'limitations':['Original artifact hashes/populations/digests and saved full inference inspected; bootstrap endpoints not regenerated.','The temporal clone proves development-only inference handoff, not authentic historical source timing or issuance.','Synthetic result is capacity/integration evidence only; complete archive/controller acceptance remains required.']}
(w/'root-review/result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2));signal.setitimer(signal.ITIMER_REAL,0)
