"""Saved evidence audit only; no candidate, test, driver or scientific imports."""
from pathlib import Path
import ast
from collections import Counter
import hashlib
import json
import math
import struct

W = Path(__file__).resolve().parent
A = W/'attempt-3d6979f7d91b2aad'
R = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
checks = 0
evidence = {}
read_cache = {}


def need(value, reason):
    global checks
    checks += 1
    if not value:
        raise AssertionError(reason)


def pin(raw):
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


def read(path):
    if path not in read_cache:
        need(path.is_file() and not path.is_symlink(), 'regular evidence '+str(path))
        read_cache[path] = path.read_bytes()
        evidence[str(path)] = pin(read_cache[path])
    return read_cache[path]


def parse(raw):
    return json.loads(raw, parse_constant=lambda value: (_ for _ in ()).throw(AssertionError('nonfinite JSON '+value)))


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n').encode()


completion = parse(read(A/'completion.json'))
index_raw = read(A/'artifact-index.json')
need(pin(index_raw) == completion['artifact_index'], 'completion binds index')
index = parse(index_raw)['files']


def saved(name, decode=True):
    raw = read(A/name)
    need(pin(raw) == index[name], 'indexed artifact '+name)
    return parse(raw) if decode else raw


def body(pointer, decode=True):
    need(set(pointer) == {'path','sha256','bytes'} and pointer['path'] == 'bodies/'+pointer['sha256'], 'content pointer schema')
    raw = saved(pointer['path'], False)
    need(pin(raw) == {k:pointer[k] for k in ('sha256','bytes')}, 'content pointer hash')
    return parse(raw) if decode else raw


pins_raw = saved('INPUT-PINS.json', False)
pins = parse(pins_raw)
need(pin(pins_raw)['sha256'].startswith('3d6979f7d91b2aad'), 'fixed identity prefix')
need(saved('source-map-before.json') == saved('source-map-after.json') == pins, 'retained before/after identity')
fixed = {
 R/'scripts/research_score_energy_geometry.py':'4bc57604fe237cd407b66e59c84c6021f8ed68fe287ecb71cb6cecf5a8cdcb16',
 R/'tests/research-score-energy-geometry/test_energy_geometry.py':'7061193136611105e8b2479025e99d2c60f0a9d0db290639a6ef241447ac5355',
 R/'.planning/engine-os/research-first/RF-COMP-07-ENERGY-GEOMETRY-SCOPE.v1.md':'4170c944f5e3d02a9f176518661d6d6616141cad0f6aafc419bc8bc87b70979e',
 W/'qualify_energy_geometry.py':'644d849b2ae0ee927205213ae100ba3370bdfcbad354ad401eee7867543ffea4'}
for path, sha in fixed.items():
    raw = read(path)
    need(pin(raw)['sha256'] == sha == pins['inputs'][str(path)]['sha256'] and saved('snapshots/'+sha,False) == raw, 'held source/scope snapshot')
methods = {n.name for n in ast.walk(ast.parse(read(R/'tests/research-score-energy-geometry/test_energy_geometry.py'))) if isinstance(n,ast.FunctionDef) and n.name.startswith('test_')}
result = saved('child-result.json'); process = saved('process.json')
log = saved('unittest.log',False).decode()
need(len(methods) == result['tests']['count'] == 25 and all(result['tests'][k] == 0 for k in ('errors','failures','skipped','expected_failures','unexpected_successes')), '25 tests passed')
need(log.count(' ... ok\n') == 25 and '\nOK\n' in log, 'actual complete unittest log')
need(process['exit_code'] == 0 and process['source_error'] is None and process['stop'] is None, 'actual process success evidence')


def cache(info):
    need(set(info) == {'entries','retained_bytes','hits','misses','evictions'}, 'cache metadata schema')
    need(len(info['entries']) <= 2 and len({tuple(x) for x in info['entries']}) == len(info['entries']), 'two unique FIFO keys')
    need(all(len(s)==2 and all(type(n)is int and 0<n<=512 and n&(n-1)==0 for n in s) for s in info['entries']), 'bounded exact shape keys')
    need(info['retained_bytes'] == sum(m*n*8 for m,n in info['entries']) <= 4*1024*1024, 'exact retained bytes')
    need(all(type(info[k])is int and info[k]>=0 for k in ('hits','misses','evictions')), 'nonnegative counters')


def metrics_record(record):
    need(record['kind']=='metrics' and record['type']=='dict', 'full metric return')
    raw=record['ascii_body'].encode('ascii')
    need(pin(raw)=={k:record[k] for k in ('bytes','sha256')}, 'exact metric observation body')


counts=Counter(); errors=Counter(); warnings_seen=Counter(); outcomes=Counter(); observed_methods=set(); labels={}
observation_names=sorted(str(p.relative_to(A)) for p in (A/'test-observations').glob('*.json'))
need(observation_names==['test-observations/%04d.json'%i for i in range(1,129)],'128 ordered observation pointers')
for name in observation_names:
    row=body(saved(name)); kind=row['kind'];counts[kind]+=1;labels[row['label']]=row
    observed_methods.add(row['test'].rsplit('.',1)[-1])
    if kind=='energy_parity':
        old,new=row['original'],row['candidate']
        need(old['result']==new['result'] and old['events']==new['events'],'exact bits/error/warning/hooks parity')
        need(old['input_before']==old['input_after']==new['input_before']==new['input_after'],'lossless current inputs unchanged')
        out=old['result']['outcome'];outcomes[out['kind']]+=1
        if out['kind']=='return':
            need(out['type']=='float' and struct.pack('>d',float.fromhex(out['float_hex'])).hex()==out['float64_bits'],'float type/hex/bits exact')
        else:
            need(out['kind']=='error' and all(type(out[k])is str for k in ('module','type','message')),'exact error metadata')
            errors[out['module']+'.'+out['type']+':'+out['message']]+=1
        if row['expected_error'] is not None:need(out['message']==row['expected_error'],'declared natural error')
        for warn in old['result']['warnings']:warnings_seen[warn['category']+':'+warn['message']]+=1
        cache(row['cache_before']);cache(row['cache_after'])
        need(row['fallback_calls']==int(row['expected_fallback']),'exact original fallback count')
        if row['expected_fallback']:need(row['cache_before']==row['cache_after'],'fallback leaves cache untouched')
    elif kind=='full_metrics_parity':
        need(row['original']==row['candidate'],'full tiny scorer byte/error/warnings parity')
        if row['original']['outcome']['kind']=='metrics':
            metrics_record(row['original']['outcome']);need(row['wrapper_calls']==1 and row['law_before']==row['law_after'],'single wrapper and unchanged law')
        else:need(row['original']['outcome']['message']=='invalid_target_pair','original full scorer invalid target')
        cache(row['cache'])
    elif kind=='cache_contract':
        cache(row['actual'])
        if 'other_owner'in row:need(row['other_owner']=={'entries':[],'retained_bytes':0,'hits':0,'misses':0,'evictions':0},'isolated owner')
    elif kind=='dependency_calls':
        cache(row['cache'])
        if row['label']=='actual-fresh-fft-events':
            need(row['events']==['rfft2','irfft2','distance','rfft2','irfft2','rfft2','irfft2'] and (row['rfft2'],row['irfft2'],row['distance'])==(3,3,1),'actual FFT work fresh on hits')
            need(len(row['matrices'])==1 and row['matrices'][0]['dtype']=='<f8' and row['matrices'][0]['shape']==[8,8] and row['matrices'][0]['strides']==[64,8] and row['matrices'][0]['writeable']is False,'retained matrix dtype/layout/read-only')
        else:need(row['distance']==0,'late failure or hit skips distance build as declared')
    elif kind=='deliberate_injection':
        need(row['calls']==1 and row['result']['outcome']['type']=='RuntimeError' and row['result']['outcome']['message']=='injected '+row['label'][10:],'single propagated injection')
        before,after=row['cache_before'],row['cache_after'];cache(before);cache(after)
        need(before['entries']==after['entries'] and before['evictions']==after['evictions'],'failed construction/FFT does not evict')
        need(after['misses']==before['misses']+int(row['label']=='injection-_build_distance'),'late miss counter')
    elif kind=='ownership':
        need(row['retained_inputs']==[False,False,False],'no grid/probability/observation retained');cache(row['cache'])
    else:need(False,'unknown observation classification')
need(observed_methods==methods and sum(counts.values())==128,'all test methods observed')
for label, expected in {
 'shared-padded-counts':{'entries':[[32,32]],'retained_bytes':8192,'hits':2,'misses':1,'evictions':0},
 'base-double-cache':{'entries':[[256,256],[512,512]],'retained_bytes':2621440,'hits':2,'misses':2,'evictions':0},
 'fifo-result':{'entries':[[8,8],[16,16]],'retained_bytes':2560,'hits':1,'misses':3,'evictions':1},
 'failed-miss-retained-fifo':{'entries':[[4,4],[8,8]],'retained_bytes':640,'hits':0,'misses':3,'evictions':0},
 'failed-hit-state':{'entries':[[8,8]],'retained_bytes':512,'hits':1,'misses':1,'evictions':0}}.items():
    need(labels[label]['actual']==expected,'exact held FIFO/counter case '+label)

# Authenticate all40 source occurrences and their law/metric bodies without
# constructing a distribution or invoking any model/numerical scoring function.
references=saved('fixture-references.json');fixture_raw=body(references['fixture'],False);fixture=parse(fixture_raw)
need(pin(fixture_raw)['sha256']=='1b1730b099eed2dd84eeb97f65b89a162dc7c4c9fcd4f5472aeee8a5dcede3aa','fixed complete fixture')
witness_path=Path(fixture['source']['path']); witness_raw=read(witness_path); witness=parse(witness_raw)
need(pin(witness_raw)=={k:fixture['source'][k]for k in ('sha256','bytes')} and pin(witness_raw)['sha256']=='e695fcbcfc6f1c03754e1186c344cdc42bfa4cc45575ff517ecc4703f75f4db2','authenticated scientific witness')
profile_index_raw=read(Path(fixture['profile_index']['path']))
need(pin(profile_index_raw)['sha256']=='ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b' and parse(profile_index_raw)['files']['plain/scientific-witness.json']==pin(witness_raw),'accepted profile index binds witness')
calls=fixture['calls'];need(references['calls']==calls and len(calls)==40,'complete40 call identities')
callbacks=[r for r in witness['callbacks']if r['kind']=='score']
rows={('inner',r['setting'],r['game_id']):r for r in witness['inner_rows']}
rows.update({('outer',r['variant'],r['game_id']):r for r in witness['outer_rows']if r['family']=='E3'})
laws={tuple(r['key']):r['fields']for r in witness['resolved_laws']}
excluded=sorted(t+'_interval_mass_80'for t in ('home','away','margin','total'))
need(fixture['excluded_outer_fields']==excluded and len(fixture['laws'])==1 and len(fixture['expected_metrics'])==4,'fixed unique bodies and exact excluded fields')
for group in ('laws','expected_metrics'):
    for sha,value in fixture[group].items():need(body(references[group][sha],False)==encoded(value) and pin(encoded(value))['sha256']==sha,'full fixture body')
for i,(c,cb)in enumerate(zip(calls,callbacks,strict=True),1):
    key=(cb['stage'],cb['setting']if cb['stage']=='inner'else cb['variant'],cb['game_id'])
    need(c['id']==f'call-{i:02d}' and c['key']==list(key) and c['callback']==cb and cb['error_type']is None and cb['operation']=='score','original ordered callback')
    need(c['flags']=={k:cb[k]for k in ('double_grid','diagnostics')} and c['game_id']==cb['game_id'],'exact score flags/game')
    metrics=dict(rows[key]['metrics'])
    if key[0]=='outer':
        for field in excluded:del metrics[field]
    need(encoded(metrics)==encoded(fixture['expected_metrics'][c['expected_metrics_sha256']]) and len(metrics)==c['expected_metric_count']==(28 if key[0]=='inner' else 104),'entire saved score fields')
    need(c['observed']==[metrics['home_observed'],metrics['away_observed']] and encoded(laws[key])==encoded(fixture['laws'][c['law_sha256']]),'source law bytes and actual target')
need(sum(c['flags']['double_grid']for c in calls)==22 and sum(c['flags']['diagnostics']for c in calls)==4,'source flag populations')


def typed(value):
    if type(value)is dict:return ['dict',[[typed(k),typed(v)]for k,v in value.items()]]
    if type(value)is list:return ['list',[typed(v)for v in value]]
    if type(value)is float:return ['float',struct.pack('>d',value).hex()]
    return [type(value).__name__,value]


def expected_input(c):
    fields=fixture['laws'][c['law_sha256']]; items=[]
    for name in ('atoms','alpha','beta','rates','theta','iterations','independent'):
        field=fields[name]
        if name in ('atoms','alpha','rates','theta'):
            shape=field['shape'];stride=8;strides=[]
            for n in reversed(shape):strides.insert(0,stride);stride*=n
            data=bytes.fromhex(field['c_bytes_hex'])
            need(field['dtype']=='<f8' and field['writeable']is False and len(data)==math.prod(shape)*8,'law array field domain')
            value=['ndarray','<f8',shape,strides,False,True,True,field['c_bytes_hex']]
        elif name=='beta':
            need(struct.pack('>d',field['value']).hex()==field['float_bits'],'beta value bits')
            value=['float',field['float_bits']]
        else:value=[field['type'],field['value']]
        items.append([['str',name],value])
    return ['dict',[[['str','law'],['dict',items]],[['str','observed'],typed(c['observed'])],[['str','game_id'],typed(c['game_id'])],[['str','flags'],typed(c['flags'])]]]


def decode_typed(node):
    kind=node[0]
    if kind=='dict':return {decode_typed(k):decode_typed(v)for k,v in node[1]}
    if kind in ('list','tuple'):return [decode_typed(v)for v in node[1]]
    if kind=='float':return struct.unpack('>d',bytes.fromhex(node[1]))[0]
    if kind=='numpy':
        need(node[1]=='float64' and node[2]=='<f8','registered scalar result type')
        return struct.unpack('<d',bytes.fromhex(node[3]))[0]
    need(kind in ('str','int','bool','NoneType'),'known metric typed leaf')
    return node[1]


expected_cache={'entries':[[256,256],[512,512]],'retained_bytes':2621440,'hits':60,'misses':2,'evictions':0}
pass_summaries=[]; reference={}; previous_end=-math.inf
for pass_index,(phase,route)in enumerate((('parity','original'),('parity','candidate'),('timed','original'),('timed','candidate'))):
    record=saved(phase+'/'+route+'/pass-result.json')
    need(record==result['passes'][pass_index] and record['status']=='complete_exact' and len(record['calls'])==40 and record['profile_restored']is True,'complete retained pass')
    need(record['event_observer']is(phase=='parity') and record['callback_timing_eligible']is(phase=='timed'),'parity trace versus eligible timing')
    for c,row in zip(calls,record['calls'],strict=True):
        need(saved(phase+'/'+route+'/'+c['id']+'-outcome.json')==row,'complete per-occurrence outcome')
        need(row['id']==c['id'] and row['key']==c['key'] and row['flags']==c['flags'] and row['law_sha256']==c['law_sha256'] and row['expected_metrics_sha256']==c['expected_metrics_sha256'],'occurrence identities')
        need(row['outcome']=='returned' and row['return_type']=='builtins.dict' and row['metric_count']==c['expected_metric_count'] and row['warnings']==[] and row['warning_policy']=='always_per_callback','actual complete return')
        before=body(row['before_input']);after=body(row['after_input'])
        need(before==after==expected_input(c) and row['inputs_unchanged']is True,'every lossless input matches source fields/flags/game and remains unchanged')
        metric_bytes=body(row['metrics'],False); typed_bytes=body(row['typed_return'],False)
        need(metric_bytes==encoded(fixture['expected_metrics'][c['expected_metrics_sha256']]),'full actual metric bytes versus saved fixture')
        need(encoded(decode_typed(parse(typed_bytes)))==metric_bytes,'typed return bits/types decode to exact metric bytes')
        current=(row['before_input'],row['metrics'],row['typed_return'],row['warnings'])
        if pass_index==0:reference[c['id']]=current
        else:need(current==reference[c['id']],'actual input/metric/typed-result parity across all four passes')
        need(all(type(row[k])is float and math.isfinite(row[k])for k in ('seconds','started_monotonic','finished_monotonic')) and row['seconds']>0 and row['seconds']==row['finished_monotonic']-row['started_monotonic'],'finite exact callback interval')
        need(row['started_monotonic']>=previous_end,'all callbacks sequential');previous_end=row['finished_monotonic']
    duration=sum(r['seconds']for r in record['calls']);stable=math.fsum(r['seconds']for r in record['calls']);maximum=max(r['seconds']for r in record['calls'])
    need(duration==stable==record['callback_seconds'] and duration+record['owner_seconds']==record['aggregate_seconds_including_owner'] and maximum==record['maximum_callback_seconds'],'full pass sum owner cost/max')
    if route=='candidate':need(record['owner_seconds']>0 and record['cache_info']==record['cache_info_after_attempt']==expected_cache,'fresh owner/cold-fill final cache')
    else:need(record['owner_seconds']==0,'no original owner cost')
    if phase=='parity':
        trace=saved(phase+'/'+route+'/fft-events.json');expected=[]
        for c in calls:
            for cells in ([80,160]if c['flags']['double_grid']else[80]):
                n=1<<(2*cells-2).bit_length()
                expected.extend([{'call_id':c['id'],'operation':'rfft2','input_shape':[cells,cells],'input_dtype':'<f8','s':[n,n],'axes':[-2,-1],'norm':None},
                                 {'call_id':c['id'],'operation':'irfft2','input_shape':[n,n//2+1],'input_dtype':'<c16','s':[n,n],'axes':[-2,-1],'norm':None}])
        need(trace['events']==expected and len(expected)==124 and trace['performance_attribution']is False,'62 real FFT pairs exact original order/shapes/dtypes/args')
        need(record['actual_fft_pairs']==62 and record['actual_probability_grid_shapes']=={'80x80':40,'160x160':22},'actual grid count')
    pass_summaries.append({'phase':phase,'route':route,'owner_seconds':record['owner_seconds'],'callback_seconds':duration,'aggregate_seconds':duration+record['owner_seconds'],'maximum_callback_seconds':maximum,
                           'maximizing_calls':[r['id']for r in record['calls']if r['seconds']==maximum]})
old,new=pass_summaries[2:]
aggregate_ratio=new['aggregate_seconds']/old['aggregate_seconds'];maximum_ratio=new['maximum_callback_seconds']/old['maximum_callback_seconds']; threshold=.7738077598151377
need(result['materiality']=={'aggregate_candidate_original_ratio':aggregate_ratio,'maximum_callback_candidate_original_ratio':maximum_ratio,'threshold_lte':threshold,'aggregate_passed':False,'maximum_passed':False,'passed':False} and aggregate_ratio>threshold and maximum_ratio>threshold,'both fixed materiality screens fail')
need(result['complete_saved_callback_invocations']==160 and result['complete_parity_passes']==2 and result['decision']=='defer_immediate_integration_materiality_not_met' and result['fit_calls']==0 and result['historical_execution']is False and result['integration_accepted']is False,'negative bounded disposition')
need(result['bindings_restored_after_tests']is True and result['bindings_restored_after_all_passes']is True,'retained binding checks')

report={'version':'rfcomp07.saved-numerical-review.v1','status':'accepted_exact_synthetic_equivalence_and_negative_materiality_result','attempt':str(A),
 'authorship_disclosure':'Reviewer authored the25 focused tests and earlier static numerical assessments. Candidate and driver have other authors; fixed40-call fixture/qualification were independently assembled and run. This is a saved-output numerical audit, not independently authored tests.',
 'scope':'Read-only retained observations, exact input/metric/typed-return bodies, source-fixture membership, parity FFT events and arithmetic recomputation of saved timings. No candidate/test/driver/model imports or reruns; no fit, scorer, FFT, CDF, bootstrap, profiling or retiming.',
 'input_pins_sha256':pin(pins_raw)['sha256'],'held_source_scope_pins':{str(p):sha for p,sha in fixed.items()},'metadata_checks_passed':checks,
 'focused_tests':{'run':25,'passed':25,'observations':128,'classifications':dict(counts),'energy_outcomes':dict(outcomes),'energy_errors':dict(errors),'warnings_by_category_message':dict(warnings_seen)},
 'complete_sequence':{'source_calls':40,'inner':36,'outer':4,'doubled_calls':22,'diagnostic_calls':4,'unique_saved_laws':1,'unique_expected_metric_bodies':4,
                      'actual_scorer_invocations':160,'full_metric_comparisons':160,'lossless_before_after_input_checks':320,'typed_return_comparisons':160,
                      'exact_source_witness_sha256':pin(witness_raw)['sha256'],'fixture_sha256':pin(fixture_raw)['sha256'],'exact_excluded_post_callback_fields':excluded,
                      'parity_fft_pairs_each_route':62,'parity_fft_events_total':248,'actual_grid_shapes_each_parity_route':{'80x80':40,'160x160':22},'candidate_cache_each_pass':expected_cache},
 'passes':pass_summaries,'materiality':{'aggregate_ratio':aggregate_ratio,'maximum_ratio':maximum_ratio,'threshold_lte':threshold,'aggregate_reduction_percent':(1-aggregate_ratio)*100,'maximum_reduction_percent':(1-maximum_ratio)*100,'aggregate_passed':False,'maximum_passed':False},
 'disposition':'Defer/remove from immediate integration: exactness passed, but both frozen engineering screens failed. No threshold adjustment, combined unmeasured bank-snapshot gain, historical retry or predictive acceptance.',
 'blockers':[],
 'limits':['Single fixed-order timing pass after parity, no retiming. Maximum observed callback is a synthetic panel maximum, not the historical maximum or a robust estimate.',
           'Parity uses call-event observation only; those durations are excluded from materiality. Untraced timed passes rely on source/binding integrity and whole-output parity rather than additional timed FFT instrumentation.',
           'Reconstructed laws have derived independent contiguous read-only arrays; original live alias/stride relationships are not recovered. Input bits, shapes, dtype and scalar fields are authenticated.',
           'Serialized errors establish category/type/message/order; passing focused tests enforce live exception class identity. Retained warning records omit source-line locations intentionally.',
           'Private read-only flags/FIFO/ownership are covered by source and focused observations, not an adversarial security boundary or proof for every possible unsupported object/runtime.',
           'Whole archive/current-source/runtime/ownership/resource audit is separate and performed by root/operational reviewer; every artifact used here was individually authenticated.',
           'An initial metadata inspection assumed inline test rows and raised KeyError; observations are content-addressed pointers. The review followed and verified those pointers. No qualification/source change or scientific repeat occurred.'],
 'evidence':[{'path':str(p),**pin(read(p))} for p in (A/'completion.json',A/'artifact-index.json',A/'INPUT-PINS.json',A/'child-result.json',A/'process.json',A/'unittest.log',A/'fixture-references.json',witness_path,W/'review_saved_numerics.attempt1.py',W/'saved-numerical-review.attempt1.log')], 'audit_tooling_correction':'The first audit script had a syntax-only missing space in a conditional expression. Its source/log are retained; corrected metadata audit does not execute scientific code or change qualification evidence.'}
out=W/'actual-numerical-review.json'
with out.open('x')as stream:json.dump(report,stream,sort_keys=True,indent=2,allow_nan=False);stream.write('\n')
print(json.dumps({'path':str(out),**pin(out.read_bytes()),'checks':checks,'observations':dict(counts),'outcomes':dict(outcomes),'aggregate_ratio':aggregate_ratio,'maximum_ratio':maximum_ratio,'timed_passes':pass_summaries[2:]},sort_keys=True))
