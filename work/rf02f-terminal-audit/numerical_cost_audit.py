"""Read-only RF-02F retained-prefix numerical/cost audit; no model/scorer calls."""
import collections
import hashlib
import json
import math
from pathlib import Path
import resource
import sys
import time

START = time.monotonic()
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path(__file__).resolve().parent
RUN = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02f-v1-7b400dec97ab30c1')
PARENT = RUN.parent/'rf02c-v1-2d9c91d803f1c991'
OBSERVER = ROOT/'work/rf02f-observer-c8bfb96705884106'
MANIFEST = '7b400dec97ab30c11928463696ed4f86b8ca496646998f4e15812c0cfd8e381e'
INDEX = '30c43545ce4b1cdccc46196df7cc18e215de77b64afdeaf64513788cd3375b19'
TERMINAL = 'ec40d8a78b6c70a4f66759101db8cc0037b8449740f0ecbe31cadcaf4919324e'
PREFIT = 'c8bfb967058841064069b4c7aa47bf42a3e0fe4d82189a43539e543413b8b382'
sys.path.insert(0, str(ROOT/'scripts'))
import research_score_split_preflight as pre
from research_score_split_run import pilot_projection, strict

def check():
    assert time.monotonic()-START < 120
    assert resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2 < 2048

def sha(raw): return hashlib.sha256(raw).hexdigest()

READS = {}
def read(path, digest=None, size=None):
    path = Path(path); check()
    assert path.is_absolute() and '..' not in path.parts
    assert not any(p.is_symlink() for p in (path, *path.parents)) and path.is_file()
    raw = path.read_bytes()
    assert digest is None or sha(raw) == digest, str(path)
    assert size is None or len(raw) == size, str(path)
    value = pre.parse(raw)  # Reject duplicate keys and nonfinite JSON, preserve numeric values.
    READS[str(path)] = {'path': str(path), 'sha256': sha(raw), 'bytes': len(raw)}
    check(); return value

def indexed(base, index, name):
    assert name in index and not Path(name).is_absolute() and '..' not in Path(name).parts
    pointer = index[name]
    assert set(pointer) == {'bytes','sha256'} and type(pointer['bytes']) is int and pointer['bytes'] > 0
    return read(base/name, pointer['sha256'], pointer['bytes'])

manifest = read(RUN/'manifest.json', MANIFEST)
index = read(RUN/'completion/artifact-index.json', INDEX)
assert index['uncommitted_artifacts'] == index['uncommitted_staging'] == []
files = index['files']; assert len(files) == 431
terminal = indexed(RUN, files, 'completion/terminal.json')
assert READS[str(RUN/'completion/terminal.json')]['sha256'] == TERMINAL
assert terminal['manifest_sha256'] == MANIFEST and terminal['status'] == 'protocol_invalid'
assert terminal['reason'] == 'registered_pilot_cost_screen_failed' and terminal['phase'] == 'pilot_cost_screen'
assert terminal['completed_origins'] == 53 and terminal['invalid_finalization_only_cap_seconds'] == 30
assert files['manifest.json']['sha256'] == MANIFEST
for name in files: indexed(RUN, files, name)
actual = {str(path.relative_to(RUN)) for path in RUN.rglob('*') if path.is_file()}
assert actual == set(files) | {'completion/artifact-index.json'}
assert not any(path.is_symlink() for path in RUN.rglob('*'))
assert not any(name in files for name in ('evaluation.json','accounting.json','origin-index.json','inference-input-index.json'))
ready = pre.preflight(ROOT, ROOT/'.planning/engine-os/research-first/RF-02F-PREFIT-ACCEPTANCE.v1.json', PREFIT, check)
assert ready['manifest_sha256'] == MANIFEST and strict(ready['manifest']) == strict(manifest)
assert ready['identity'] == RUN.name and len(manifest['code_hashes']) == 66
assert manifest['runtime'] == pre.actual_runtime()
source_before = {name: sha((ROOT/name).read_bytes()) for name in manifest['code_hashes']}
assert source_before == manifest['code_hashes']
parent_manifest = read(PARENT/'manifest.json', manifest['parent_manifest_sha256'])
parent_index = read(PARENT/'artifact-index.json', manifest['parent_index_sha256'])['files']
rf01 = read(ROOT/'.planning/engine-os/research-first/RF-01-ACCEPTANCE.v2.json', parent_manifest['accepted_receipt_sha256'])
assert rf01['admittedData']['sha256'] == manifest['bound_hashes']['admittedData']
admitted = read(rf01['admittedData']['path'], rf01['admittedData']['sha256'])
origins = admitted['origins']; assert len(origins) == 277
pilot = indexed(RUN, files, 'pilot.json'); ledger = pilot['accounting']; projection = pilot['projection']
assert pilot['retained_prefix_origins'] == 53 and pilot['remaining_origins'] == 224
assert len(ledger['origins']) == 53 and terminal['last_origin_accounting'] == ledger['origins'][-1]
recomputed = pilot_projection(origins, ledger, origins[53:])  # Pure saved-timing/metadata validation only.
assert strict(recomputed) == strict(projection)
assert projection['within_time_screen'] is False and projection['passed'] is False
totals = collections.Counter(); native_failures = collections.Counter(); modes = collections.Counter()
all_calls = []; metric_rows = 0; copied_metric_rows = 0; mass_values = 0
for original, accounting in zip(origins[:53], ledger['origins']):
    y,w = original['season'],original['week']; suffix=f'{y}-{w:02}'
    entry = indexed(RUN,files,'origin-evidence-'+suffix+'.json')
    publication = indexed(RUN,files,'forecasts-'+suffix+'.json')
    grading = indexed(RUN,files,'grading-provenance-'+suffix+'.json')
    assert entry['origin'] == original and entry['manifest_sha256'] == grading['manifest_sha256'] == MANIFEST
    assert publication['target_game_ids'] == original['targetGameIds']
    assert entry['callback_records'] == accounting['callbacks']
    assert entry['counts'] == grading['counts'] and entry['publication_before_grading'] is True
    assert all(call['error_type'] is None and 'budget_stop' not in call for call in accounting['callbacks'])
    all_calls.extend(accounting['callbacks']); totals.update(grading['counts'])
    rows_by_key={}; published={}
    for stage,field in [('inner','full_setting_forecasts'),('outer','outer_selected_forecasts')]:
        wanted = [(row['family'],row['setting'] if stage=='inner' else row['variant'],row['game_id']) for row in publication[field]]
        expected_inner = [('E3',i,game) for game in original['targetGameIds'] for i in range(27)] if 2011<=y<=2024 else []
        expected_outer = [(family,variant,game) for family,variant in ready['config']['seriesInOrder'] for game in original['targetGameIds']] if y>=2013 else []
        assert wanted == (expected_inner if stage=='inner' else expected_outer)
        if not wanted: continue
        rows=indexed(RUN,files,stage+'-losses-'+suffix+'.json')
        keys=[(row['family'],row['setting'] if stage=='inner' else row['variant'],row['game_id']) for row in rows]
        assert keys==wanted
        for key,row,forecast in zip(keys,rows,publication[field]):
            assert row['native_failure']==forecast['native_failure']
            assert all(type(v) in (int,float) and math.isfinite(v) for k,v in row['metrics'].items() if k!='grid_cells')
            cells=row['metrics']['grid_cells']
            assert type(cells) is list and len(cells)==2 and all(type(v) is int and 0<v<=1024 for v in cells)
            assert row['metrics']['joint_energy_score']>=0
            if stage=='outer' and key[0]=='E3':
                for target in ('home','away','margin','total'):
                    assert 0<=row['metrics'][target+'_interval_mass_80']<=1;mass_values+=1
            metric_rows+=1;native_failures[str(row['native_failure'])]+=1
            rows_by_key[stage,key]=row;published[stage,key]=forecast
    parent_losses={}
    for stage in ('inner','outer'):
        if stage+'_losses' in grading['source_pointers']:
            pointer=grading['source_pointers'][stage+'_losses']
            assert parent_index[pointer['name']]=={k:pointer[k] for k in ('bytes','sha256')}
            parent_rows=indexed(PARENT,parent_index,pointer['name'])
            parent_losses[stage]={(r['family'],r['setting'] if stage=='inner' else r['variant'],r['game_id']):r for r in parent_rows}
    for row in grading['rows']:
        key=tuple(row['key']);stage=row['stage'];current=rows_by_key[stage,key];modes[row['mode']]+=1
        assert sha(strict(current['metrics']))==row['metrics_sha256']
        assert row['native_failure']==current['native_failure']
        if row['source_loss'] is not None:
            old=parent_losses[stage][tuple(row['source_loss']['source_key'])]
            # E3 outer adds exactly four own-law interval masses to copied source metrics.
            copied={k:v for k,v in current['metrics'].items() if not k.endswith('_interval_mass_80')}
            assert strict(copied)==strict(old['metrics']) and old['native_failure']==current['native_failure']
            copied_metric_rows+=1
    for call in accounting['callbacks']:
        key=('E3',call['setting'] if call['stage']=='inner' else call['variant'],call['game_id'])
        if call['kind']=='score':
            row=rows_by_key[call['stage'],key]
            assert row['native_failure']==call['native_failure']
            if call['stage']=='outer': assert call['double_grid'] is call['diagnostics'] is True
        elif call['operation']=='fit':
            assert published[call['stage'],key]['native_failure']==call['native_failure']
assert dict(totals)==terminal['counts']
assert metric_rows==14688+608 and copied_metric_rows==4896+352+192 and mass_values==416*4
assert sum(call['kind']=='score' for call in all_calls)==9856
assert not any('2013-03' in name or name.startswith(('evaluation','scorecard','inference-input')) for name in files)
calls=[call for o in ledger['origins'][-2:] for call in o['callbacks']]
fits=[c for c in calls if c['kind']=='fit'];scores=[c for c in calls if c['kind']=='score']
F=max(c['seconds'] for c in fits);S=max(c['seconds'] for c in scores)
pilot_rows=[]
for o in ledger['origins'][-2:]:
    fit=math.fsum(c['seconds'] for c in o['callbacks'] if c['kind']=='fit')
    score=math.fsum(c['seconds'] for c in o['callbacks'] if c['kind']=='score')
    remainder=o['seconds']-math.fsum(c['seconds'] for c in o['callbacks'])
    pilot_rows.append({'season':o['season'],'week':o['week'],'games':len(o['game_ids']),'history':o['history_count'],'seconds':o['seconds'],'fit_seconds':fit,'score_seconds':score,'remainder_seconds':remainder})
C=max(row['remainder_seconds']/row['games'] for row in pilot_rows)
W=math.fsum(len(o['targetGameIds'])*max(1,len(o['windows']['12']['eligibleInputIds'])/768) for o in origins[53:])
phases={p['name']:p['seconds'] for p in ledger['phase_measurements']};T=phases['inference_smoke'];A=phases['admission'];E=ledger['elapsed_seconds']
manual=E+W*(C+31*(2*F+2*S))+2*T+max(60,A)
assert manual==projection['projected_total_seconds']==12765.113383447922
terms={'elapsed':E,'future_remainder':W*C,'future_fit':W*62*F,'future_score':W*62*S,'inference_reserve':2*T,'publication_reserve':max(60,A)}
threshold=((7200-E-2*T-max(60,A))/W-C)/62
observer=read(OBSERVER/'process-report.json','0e3b81aa4eaebbab34814813de7362cf9079179f61432a51c05e6d84d792aa67')
for name,pointer in observer['artifacts'].items():
    raw=(OBSERVER/name).read_bytes();assert sha(raw)==pointer['sha256'] and len(raw)==pointer['bytes']
assert observer['status']=='failed_process' and observer['exit_code']==1
assert observer['limit_failure'] is False and observer['observation_errors']==observer['kill_requests']==[]
assert observer['waited_worker_peak_rss_mib']==terminal['peak_rss_mib']<4096
assert observer['elapsed_seconds']<7200 and observer['exit_observed_elapsed_seconds']-terminal['scientific_stop_elapsed_seconds']<30
assert source_before=={name:sha((ROOT/name).read_bytes()) for name in source_before}
report={'version':'rf02f.saved-prefix-cost-verification.v1','status':'passed','manifest_sha256':MANIFEST,'terminal_sha256':TERMINAL,'index_sha256':INDEX,'prefit_sha256':PREFIT,'code_hashes':source_before,'runtime':pre.actual_runtime(),'whole_run_json_files':len(files),'whole_run_indexed_bytes':sum(p['bytes'] for p in files.values()),'finite_json_and_exact_inventory':True,'source_prefix_copy_rows_equal':copied_metric_rows,'metric_rows_checked':metric_rows,'actual_mass_values_checked':mass_values,'row_native_failure_counts':dict(native_failures),'row_modes':dict(modes),'completed_counts':dict(totals),'remaining_origins':224,'remaining_games':3375,'all_prefix_callback_count':len(all_calls),'all_prefix_callback_failures':0,'pilot_callback_counts':{'fit':len(fits),'score':len(scores)},'pilot_operation_counts':dict(collections.Counter(c['kind']+':'+c['operation']+':'+c['stage'] for c in calls)),'pilot':pilot_rows,'F':F,'S':S,'C':C,'W':W,'T':T,'A':A,'E':E,'manual_projection':manual,'registered_helper_projection_exact':True,'projection_terms':terms,'max_fit_record':max(fits,key=lambda c:c['seconds']),'max_score_record':max(scores,key=lambda c:c['seconds']),'eligible_anchor_counts':{key:len(values) for key,values in projection['required_anchor_indices'].items()},'callback_sum_threshold_if_other_terms_fixed':threshold,'required_combined_maximum_reduction_fraction':1-threshold/(F+S),'zero_remainder_counterfactual_projection':manual-W*C,'observer_elapsed_seconds':observer['elapsed_seconds'],'worker_peak_rss_mib':terminal['peak_rss_mib'],'verified_files':list(READS.values()),'scientific_calls':{'fit':0,'score':0,'distribution_recovery':0,'bootstrap':0,'public_evaluate':0,'historical_admission':0},'scope_limits':['No actual forecast or scalar was recomputed.','CDF interval mass values were checked for finite bounds and saved provenance, not recalculated from distributions.','No within-callback or within-remainder profiling is present in the saved clock ledger.','The frozen pilot is a conservative capacity screen, not measured whole-run runtime.'],'audit_wall_seconds':time.monotonic()-START,'audit_peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2}
check();out=WORK/'numerical-cost-verification.json';out.write_bytes(strict(report))
print(json.dumps({'path':str(out),'sha256':sha(out.read_bytes()),'seconds':report['audit_wall_seconds'],'rss_mib':report['audit_peak_rss_mib'],'projection':manual,'rows':metric_rows}))
