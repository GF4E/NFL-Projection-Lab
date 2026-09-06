"""Read saved typed images/outcomes only; no candidate or scientific imports."""
from pathlib import Path
import ast
from collections import Counter
import copy
import hashlib
import json
import math
import struct

WORK = Path(__file__).resolve().parent
A = WORK / 'attempt-0aad650afed462a2'
REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
checks = 0
evidence = {}


def need(value, why):
    global checks
    checks += 1
    if not value:
        raise AssertionError(why)


def digest(raw):
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


def read(path):
    need(path.is_file() and not path.is_symlink(), 'regular evidence: ' + str(path))
    raw = path.read_bytes()
    evidence[str(path)] = digest(raw)
    return raw


def parse(raw):
    def bad(value):
        raise AssertionError('invalid nonfinite JSON: ' + value)
    return json.loads(raw, parse_constant=bad)


completion = parse(read(A / 'completion.json'))
index_raw = read(A / 'artifact-index.json')
need(digest(index_raw) == completion['artifact_index'], 'completion binds index')
index = parse(index_raw)['files']


def saved(name, decode=True):
    raw = read(A / name)
    need(digest(raw) == index[name], 'index binding: ' + name)
    return parse(raw) if decode else raw


pins_raw = saved('INPUT-PINS.json', False)
pins = parse(pins_raw)
need(digest(pins_raw)['sha256'] == '0aad650afed462a2ea23552f9ae6f4f08d4fc05bcf64f3a4ce2df1d9b306b7fb', 'fixed pins')
need(saved('source-map-before.json') == saved('source-map-after.json') == pins, 'before/after source maps')
need(len(pins['code_hashes']) == 79 and len(pins['runtime_files']) == 7, 'frozen closure counts')
fixed = {
    REPO/'scripts/research_score_bank_snapshot.py': 'e327560586f3d938743cb9b44120b8e7206ad16e68c2af2edc277967485e2426',
    REPO/'tests/research-score-bank-snapshot/test_bank_snapshot.py': 'e53a7c2b52215d1d477011c2bfa810b2cfc0a8f376d5ce18c2b2817b40a40165',
    REPO/'.planning/engine-os/research-first/RF-COMP-06-BANK-SNAPSHOT-SCOPE.v1.md': '9f4ff7b1dced4698e48c4be4859893e16ebedb3f66e747913beda174749aff15',
    WORK/'qualify_bank_snapshot.py': 'c87cbfb3222aa953f88c23ca63fbe89877968086ef3079c8cd944b27fcc75259',
}
for path, sha in fixed.items():
    raw = read(path)
    need(digest(raw)['sha256'] == sha == pins['inputs'][str(path)]['sha256'], 'fixed source pin')
    need(saved('snapshots/' + sha, False) == raw, 'fixed source snapshot')
tests_raw = read(REPO/'tests/research-score-bank-snapshot/test_bank_snapshot.py')
methods = {n.name for n in ast.walk(ast.parse(tests_raw)) if isinstance(n, ast.FunctionDef) and n.name.startswith('test_')}
result = saved('child-result.json')
log = saved('unittest.log', False).decode()
process = saved('process.json')
need(len(methods) == result['tests']['count'] == 29 and all(result['tests'][k] == 0 for k in ('errors', 'failures', 'skipped')), '29 tests pass')
need(log.count(' ... ok\n') == 29 and '\nOK\n' in log, 'complete passing unittest log')
need(process['exit_code'] == 0 and process['source_error'] is None and process['stop'] is None, 'reported closed success')
counts, decisions, errors, modes = Counter(), Counter(), Counter(), Counter()
observed_methods = set()
names = sorted(str(p.relative_to(A)) for p in (A/'test-observations').glob('*.json'))
need(names == ['test-observations/%04d.json' % i for i in range(1, 136)], '135 ordered observations')
for name in names:
    row = saved(name)
    kind = row['kind']; counts[kind] += 1
    observed_methods.add(row['test'].rsplit('.', 1)[-1])
    if kind in ('paired_bank', 'paired_value'):
        left, right = row['original'], row['candidate']
        need(left['outcome'] == right['outcome'] and left['events'] == right['events'], 'paired decision/error and event parity')
        need(len(left['images']) == len(right['snapshots']), 'capture completion parity')
        for image in left['images']:
            if 'ascii_body' in image:
                body = image['ascii_body'].encode('ascii')
                need(digest(body) == {k: image[k] for k in ('sha256', 'bytes')}, 'exact original bytes/hash')
        for snapshot in right['snapshots']:
            need(snapshot['mode'] in ('supported', 'fallback'), 'valid observed mode')
            modes[snapshot['mode']] += 1
        if row['expected_modes'] is not None:
            need([x['mode'] for x in right['snapshots']] == row['expected_modes'], 'explicit mode expectation')
        out = left['outcome']
        if out['kind'] == 'decision':
            need(type(out['value']) is bool and out['type'] == 'bool' and len(left['images']) == 2, 'completed two captures before decision')
            need((left['images'][0]['sha256'] == left['images'][1]['sha256']) is out['value'], 'original hashes explain decision')
            if row['expected_decision'] is not None:
                need(out['value'] is row['expected_decision'], 'declared decision')
            decisions[str(out['value'])] += 1
        else:
            need(out['kind'] == 'error' and all(type(out[k]) is str for k in ('module', 'type', 'message')), 'error metadata')
            errors[out['module'] + '.' + out['type']] += 1
            need(('assembly' in left['events']) == (len(left['images']) == 1), 'left failure stops assembly/right failure follows assembly')
    elif kind == 'guard_boundary':
        need(row['mode'] == row['expected_mode'] and row['canonical_calls'] == 1 and row['encoded_calls'] == (1 if row['mode'] == 'fallback' else 0), 'guard modes and canonical/fallback counts')
        modes['guard_' + row['mode']] += 1
    elif kind == 'deliberate_injection':
        need(row['calls'] == 1 and row['outcome'] == {'kind': 'error', 'module': 'builtins', 'type': 'RuntimeError', 'message': 'injected ' + row['label'][9:]}, 'explicit injection one propagated call')
    elif kind == 'handle_contract':
        need(row['outcome']['kind'] == 'error' and row['outcome']['type'] == 'TypeError', 'actual handle rejection')
        if row['label'].startswith('invalid-handle'):
            need(row['outcome']['message'] == 'snapshots_required' and row['canonical_calls'] == row['encoded_calls'] == 0, 'invalid handles unread')
        else:
            need(row['retained_mode'] == 'supported', 'read-only mode retained')
    elif kind == 'array_image':
        need(row['before'] == row['after'] and row['mode'] == 'supported', 'array bytes/shape/dtype/strides/writeability unchanged')
    elif kind == 'call_counts':
        need(row['mode'] == 'fallback' and row['canonical_calls'] == row['encoded_calls'] == 1 and row['events'] == ['tolist'] and row['decision'] is True, 'fallback no recanonicalization')
    elif kind == 'decision':
        need(row['value'] is True and row['mode'] == 'supported', 'valid after failure')
    elif kind == 'mutation_decisions':
        if row['label'] == 'owned-alias-capture':
            for field in ('original_before', 'original_after'):
                body = row[field]['ascii_body'].encode('ascii')
                need(digest(body) == {k: row[field][k] for k in ('sha256', 'bytes')}, 'alias original image hash')
            need(row['candidate_before_still_equal'] is True and row['candidate_after_equal'] is False and row['original_before']['sha256'] != row['original_after']['sha256'], 'owned alias before retained')
        elif row['label'] == 'array-owned-before':
            need(row['decisions'] == [True, False] and bytes.fromhex(row['after_bytes_hex']) == struct.pack('<2d', 2., 0.), 'array before retained')
        elif row['label'] == 'mixed-owned-before-image':
            need(row['candidate_same'] is row['candidate_reverse_same'] is True and row['raw_hook_events'] == ['capture-hook'] and row['canonical_calls_during_same'] == 0 and row['before_mode'] == 'supported' and row['after_mode'] == 'fallback', 'mixed comparison owns before and does not reread')
        else:
            need(False, 'unregistered mutation record')
    else:
        need(False, 'unexpected observation kind')
need(observed_methods == methods and sum(counts.values()) == 135, 'all methods observed')

# Independently derive lossless fixture images from the authenticated saved state.
# These are typed metadata trees; no trajectory, model or snapshot is created.
STATE = WORK.parent/'rf-origin-profile/profile-685708ac9c57a623/plain/origin-store/state-2013-01.json'
state_raw = read(STATE)
need(digest(state_raw)['sha256'] == '0be4fb5801dc501d6ebb0a15c764eac82a45edb81dc640db77c6ae2c626bbda1' == pins['inputs'][str(STATE)]['sha256'], 'accepted synthetic state')
need(saved('snapshots/' + digest(state_raw)['sha256'], False) == state_raw, 'saved state snapshot')
state = parse(state_raw)


def im(value):
    kind = type(value)
    if kind is dict:
        return ['dict', [[im(k), im(v)] for k, v in value.items()]]
    if kind in (tuple, list):
        return [kind.__name__, [im(v) for v in value]]
    if kind is str:
        return ['str_utf8_surrogatepass_hex', value.encode('utf-8', 'surrogatepass').hex()]
    if kind is float:
        need(math.isfinite(value), 'finite saved float')
        return ['float_hex', value.hex()]
    if kind is int:
        return ['int', str(value)]
    need(value is None or kind is bool, 'saved scalar schema')
    return [kind.__name__, value]


def de(node):
    kind = node[0]
    if kind == 'dict':
        return {de(k): de(v) for k, v in node[1]}
    if kind in ('tuple', 'list'):
        return tuple(de(v) for v in node[1]) if kind == 'tuple' else [de(v) for v in node[1]]
    if kind == 'str_utf8_surrogatepass_hex':
        return bytes.fromhex(node[1]).decode('utf-8', 'surrogatepass')
    if kind == 'float_hex':
        return float.fromhex(node[1])
    if kind == 'int':
        return int(node[1])
    if kind == 'ndarray':
        need(node[1:5] == ['<f8', [32], [8], True], 'fixed contiguous float64 array image')
        return list(struct.unpack('<32d', bytes.fromhex(node[5])))
    need(kind in ('NoneType', 'bool'), 'known lossless image tag')
    return node[1]


def get(node, key):
    need(node[0] == 'dict', 'dictionary image')
    return next(v for k, v in node[1] if de(k) == key)


def replace(node, key, value):
    for pair in node[1]:
        if de(pair[0]) == key:
            pair[1] = value
            return
    raise AssertionError('missing image key')


rows = state['trajectory_state']
need(len(rows) == 297 and [r['key'] for r in rows] == sorted(r['key'] for r in rows), 'all297 exact source output keys')
output_nodes, engine_nodes = [], []
for row in rows:
    key = im(tuple(row['key']))
    output_nodes.append([key, im(row['output'])])
    need([r['game_id'] for r in row['output']['forecasts']] == sorted(state['origin']['targetGameIds']), 'original target ordering')
    if 'own_state' in row:
        field_nodes = [[im('last_origin'), im((2013, 1))]]
        for field in ('ratings', 'offense', 'defense'):
            values = row['own_state'][field]
            need(len(values) == 32 and all(type(v) is float and math.isfinite(v) for v in values), 'source own vector')
            field_nodes.append([im(field), ['ndarray', '<f8', [32], [8], True, struct.pack('<32d', *values).hex()]])
        engine_nodes.append([key, ['dict', field_nodes]])
need(len(engine_nodes) == 216, '216 exact owned engines')
baseline = ['dict', [[im('outputs'), ['dict', output_nodes]], [im('engines'), ['dict', engine_nodes]]]]
definitions = saved('pair-definitions.json')
expected_names = ['unchanged', 'last_rating', 'last_output_mean', 'last_origin', 'forecast_order', 'dict_insertion_order', 'signed_zero', 'numeric_type', 'array_list', 'unicode_equivalence']
expected_equal = [True, False, False, False, False, True, False, False, True, True]
need(definitions == [{'name': n, 'expected_equal': b} for n, b in zip(expected_names, expected_equal)], 'registered exact ten definitions')


def last_mean(node):
    outputs = get(node, 'outputs')
    last = outputs[1][-1][1]
    forecasts = get(last, 'forecasts')
    return get(forecasts[1][-1], 'mean')


def set_last_rating(node, value):
    vector = get(get(node, 'engines')[1][-1][1], 'ratings')
    numbers = list(struct.unpack('<32d', bytes.fromhex(vector[5])))
    numbers[-1] = value
    vector[5] = struct.pack('<32d', *numbers).hex()


def prepared(name):
    before = copy.deepcopy(baseline)
    if name == 'signed_zero':
        set_last_rating(before, 0.)
    if name == 'numeric_type':
        last_mean(before)[1][-1] = im(1.)
    if name == 'unicode_equivalence':
        get(before, 'outputs')[1][-1][1][1].append([im('diagnostic'), im('😀')])
    after = copy.deepcopy(before)
    last_engine = get(after, 'engines')[1][-1][1]
    last_output = get(after, 'outputs')[1][-1][1]
    if name == 'last_rating':
        values = struct.unpack('<32d', bytes.fromhex(get(last_engine, 'ratings')[5]))
        set_last_rating(after, values[-1] + 1.)
    elif name == 'last_output_mean':
        mean = last_mean(after)
        mean[1][-1] = im(de(mean[1][-1]) + 1.)
    elif name == 'last_origin':
        replace(last_engine, 'last_origin', im((2013, 2)))
    elif name == 'forecast_order':
        get(last_output, 'forecasts')[1].reverse()
    elif name == 'dict_insertion_order':
        last_output[1].reverse()
    elif name == 'signed_zero':
        set_last_rating(after, -0.)
    elif name == 'numeric_type':
        last_mean(after)[1][-1] = im(1)
    elif name == 'array_list':
        for key, engine in get(after, 'engines')[1]:
            for field in ('ratings', 'offense', 'defense'):
                replace(engine, field, im(de(get(engine, field))))
    elif name == 'unicode_equivalence':
        replace(last_output, 'diagnostic', im('\ud83d\ude00'))
    return before, after


def original_hash(node):
    value = de(node)
    payload = {'outputs': [{'key': list(k), 'output': value['outputs'][k]} for k in sorted(value['outputs'])],
               'own': [{'key': list(k), 'last_origin': list(v['last_origin']),
                        **{f: v[f] for f in ('ratings', 'offense', 'defense')}} for k, v in sorted(value['engines'].items())]}
    body = (json.dumps(payload, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()
    return digest(body)


parity = saved('parity-results.json')
need([r['name'] for r in parity] == expected_names, 'complete parity order')
events = ['before_capture_started', 'before_capture_finished', 'mutation_finished', 'after_capture_finished', 'comparison_finished']
panel_summary = []
for i, name in enumerate(expected_names):
    before, after = prepared(name)
    before_hash, after_hash = original_hash(before), original_hash(after)
    need((before_hash['sha256'] == after_hash['sha256']) is expected_equal[i], 'reconstructed declared mutation decision')
    for phase in ('parity', 'timed'):
        for route in ('original', 'candidate'):
            path = phase+'/'+name+'/'+route if phase == 'parity' else phase+'/'+route+'/'+name
            need(saved(path+'/before-input.json') == before, 'complete before image matches authenticated source plus setup')
            need(saved(path+'/after-input.json') == after, 'complete after image matches only exact declared mutation')
            outcome = saved(path+'/outcome.json')
            actual = outcome if phase == 'parity' else outcome['actual']
            need(actual['name'] == name and actual['route'] == route and actual['events'] == events and actual['outcome'] == {'kind': 'comparison', 'type': 'bool', 'equal': expected_equal[i]}, 'all real panel outcomes and sequencing')
            if route == 'original':
                need(actual['before'] == {'sha256': before_hash['sha256']} and actual['after'] == {'sha256': after_hash['sha256']}, 'actual original digest reconstructed from saved typed inputs')
            else:
                mode = 'fallback' if name == 'unicode_equivalence' else 'supported'
                need(actual['before'] == actual['after'] == {'mode': mode}, 'registered full-pair mode')
            if phase == 'parity':
                need(actual == parity[i][route] and parity[i]['input_images_equal'] is True, 'parity summary binds individual outcome')
            else:
                position = i + (10 if route == 'candidate' else 0)
                need(outcome == result['timings'][position], 'timing summary binds retained outcome')
    panel_summary.append({'name': name, 'expected_equal': expected_equal[i], 'reconstructed_original_before': before_hash, 'reconstructed_original_after': after_hash})

timings = result['timings']
need(len(timings) == 20 and [(r['route'], r['name']) for r in timings] == [(r,n) for r in ('original','candidate') for n in expected_names], 'fixed all20 order')
previous = -math.inf
for row in timings:
    need(all(type(row[k]) is float and math.isfinite(row[k]) for k in ('seconds','started_monotonic','finished_monotonic')), 'finite timings')
    need(row['seconds'] > 0 and row['seconds'] == row['finished_monotonic'] - row['started_monotonic'] and row['started_monotonic'] >= previous, 'exact disjoint intervals')
    previous = row['finished_monotonic']
totals = {route: sum(r['seconds'] for r in timings if r['route'] == route) for route in ('original','candidate')}
fsums = {route: math.fsum(r['seconds'] for r in timings if r['route'] == route) for route in ('original','candidate')}
need(totals == fsums == result['aggregate_seconds'], 'independently summed complete pair timings')
ratio = totals['candidate']/totals['original']
need(ratio == result['candidate_original_ratio'] and ratio < 1 and result['candidate_observed_faster'] is True, 'isolated faster result')
need(result['pair_count_per_route'] == result['parity_pairs'] == 10 and result['test_observation_count'] == 135 and result['complete_input_images_unchanged_except_declared_mutations'] is True, 'reported populations')
need(result['historical_execution'] is False and result['integration_accepted'] is False, 'no historical/integration claim')

report = {
 'version':'rfcomp06.saved-numerical-review.v1', 'status':'accepted_exact_synthetic_snapshot_equivalence_with_isolated_timing_lead',
 'scope':'Saved typed input images, actual original hashes, snapshot outcomes, focused errors/hooks/guards, and fixed timing sums only. No candidate, model, driver, test or scientific import/call; no retiming.',
 'authorship_disclosure':'Reviewer authored the 29 focused tests and previously reviewed candidate statically; source and qualification driver have other authors. The retained full-bank panel was authored by root.',
 'attempt':str(A),'input_pins_sha256':digest(pins_raw)['sha256'],'held_sources':{str(p):h for p,h in fixed.items()},'runtime':pins['runtime'],
 'tests':{'run':29,'passed':29,'observations':135,'classifications':dict(counts),'pair_decisions':dict(decisions),'pair_error_types':dict(errors),'capture_modes':dict(modes)},
 'metadata_checks_passed':checks,
 'complete_panel':{'pairs':10,'routes_per_phase':2,'phases':['parity','timed'],'actual_complete_comparisons':40,'lossless_input_images':80,
                   'outputs_per_input':297,'owned_engines_per_input':216,'own_vectors_per_input':648,'own_float_values_per_input':20736,
                   'reconstructed_original_digest_checks':40,'mutation_results':panel_summary,
                   'reconstruction':'Independent typed-tree derivation from pinned saved state plus exactly the registered setup/mutation. All 80 images matched including dict insertion order, array dtype/shape/strides/writeability/C bytes, float hex, tuple/list type and UTF8 surrogatepass strings. Stdlib decoding and JSON formatting reconstructed actual original digest bytes without invoking original or candidate functions.'},
 'timing':{'fixed_order':['original','candidate'],'pair_order':expected_names,'call_intervals':20,'aggregate_seconds':totals,'math_fsum_seconds':fsums,
           'candidate_original_ratio':ratio,'observed_reduction_percent':(1-ratio)*100,'observed_seconds_saved':totals['original']-totals['candidate'],
           'per_pair':[{'name':n,'original_seconds':timings[i]['seconds'],'candidate_seconds':timings[i+10]['seconds']} for i,n in enumerate(expected_names)]},
 'disposition':{'isolated_hypothesis_passed':True,'remove_immediate_candidate':False,'controller_integration_accepted':False,'historical_capacity_established':False,
                'recommendation':'Retain only as a measured partial-cost lead eligible for a separately scoped integration decision. Do not infer the remaining historical capacity gap is closed, expand callsites, or retime this fixed panel.'},
 'blockers':[],
 'limits':['One fixed-order unprofiled original pass then candidate pass after equivalence checks; timing includes both captures, mutation and comparison/helper dispatch but excludes fixture/image construction inside the setup-inclusive command. Cache/order/OS uncertainty remains.',
           'Saved fixture reconstructs only the bank comparison payload, not runnable trajectories, history or engine.stored. No fit/scorer/callback term or whole-origin capacity measured.',
           'The candidate targets only two ephemeral bank digest calls; prior instrumentation attribution is qualitative and eliminating the whole bucket would still not establish sufficient capacity.',
           'JSON errors preserve module/type/message and event order; exact live exception class identity comes from the passing frozen test assertions and cannot be independently recovered from serialized metadata.',
           'Input images prove equality of captured before/after content, not unobserved transient mutation or live pointer identities; pinned source structure and mutation tests supply the ownership evidence.',
           'Whole archive/current source/runtime/process ownership/resource acceptance is separately performed by root and operational reviewer; this report authenticates each artifact it uses.',
           'One initial read-only inspection referred to nonexistent parity.json and stopped with FileNotFoundError; corrected to the existing parity-results.json. This was an auditor filename error, not a candidate/qualification failure; no execution was repeated.'],
 'evidence':[{'path':p,**d} for p,d in sorted(evidence.items())]
}
output=WORK/'actual-numerical-review.json'
with output.open('x') as stream:
    json.dump(report,stream,sort_keys=True,indent=2,allow_nan=False);stream.write('\n')
print(json.dumps({'report':str(output),**digest(output.read_bytes()),'checks':checks,'observations':dict(counts),'decisions':dict(decisions),'errors':dict(errors),'totals':totals,'ratio':ratio},sort_keys=True))
