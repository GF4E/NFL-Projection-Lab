"""Read saved COMP07 evidence and current pins, without scientific imports."""
import argparse
import hashlib
import json
from pathlib import Path

R = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
W = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--session', type=int, required=True)
parser.add_argument('--elapsed', type=float, required=True)
args = parser.parse_args()

def fp(path):
    h, size = hashlib.sha256(), 0
    with path.open('rb') as stream:
        while raw := stream.read(1048576):
            h.update(raw); size += len(raw)
    return {'sha256': h.hexdigest(), 'bytes': size}

def read(path):
    return json.loads(path.read_bytes())

pins_path = W/'INPUT-PINS.v1.json'
pin_sha = fp(pins_path)['sha256']
pins = read(pins_path)
A, O = W/('attempt-'+pin_sha[:16]), W/('observer-'+pin_sha[:16])
idx = read(A/'artifact-index.json')['files']
assert all(not p.is_symlink() for p in A.rglob('*'))
assert {str(p.relative_to(A)) for p in A.rglob('*') if p.is_file()} == set(idx)|{'artifact-index.json','completion.json'}
for name, pin in idx.items(): assert fp(A/name) == pin, name
completion = read(A/'completion.json')
assert fp(A/'artifact-index.json') == completion['artifact_index']
for name in ('INPUT-PINS.json','source-map-before.json','source-map-after.json'):
    assert read(A/name) == pins, name
accepted = read(R/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json')
for key in ('code_hashes','runtime_files','runtime'): assert pins[key] == accepted[key], key
for name, sha in pins['code_hashes'].items():
    assert fp(R/name)['sha256'] == fp(A/'snapshots'/sha)['sha256'] == sha, name
for name, sha in pins['runtime_files'].items(): assert fp(Path(name))['sha256'] == sha, name
for name, pin in pins['inputs'].items():
    expected = {k: pin[k] for k in ('sha256','bytes')}
    assert fp(Path(name)) == expected, name
    if pin['snapshot']: assert fp(A/'snapshots'/pin['sha256']) == expected, name
fixture = read(W/'SCORING-FIXTURES.v1.json')
assert fp(W/'SCORING-FIXTURES.v1.json') == fp(A/'saved-inputs/SCORING-FIXTURES.v1.json')
process, watch, child = (read(A/name) for name in ('process.json','watchdog.json','child-result.json'))
assert process['stop'] is process['source_error'] is None
assert process['exit_code'] == watch['exit_code'] == 0
assert watch == read(O/'process-report.json')
assert watch['status'] == 'completed_process' and watch['limit_failure'] is False and watch['stop_reason'] is None
assert watch['kill_requests'] == watch['observation_errors'] == [] and watch['process_ownership_lost'] is False
assert process['command'] == watch['command']
for name, pin in watch['artifacts'].items(): assert fp(O/name) == pin, name
for name in ('stdout.log','stderr.log'): assert (A/name).read_bytes() == (O/name).read_bytes()
assert process['parent_peak_rss_mib'] < 128 and process['child_group_peak_rss_mib'] < 896
assert process['conservative_combined_rss_mib'] == process['parent_peak_rss_mib']+process['child_group_peak_rss_mib'] < 1024
assert completion['elapsed_seconds_before_completion'] < args.elapsed < 60
assert child['tests']['count'] == 25
for key in ('errors','failures','skipped','expected_failures','unexpected_successes'): assert child['tests'][key] == 0
observations = sorted((A/'test-observations').glob('*.json'))
assert child['test_observation_count'] == len(observations)
for path in observations:
    pin = read(path); assert fp(A/pin['path']) == {k: pin[k] for k in ('sha256','bytes')}
assert child['bindings_restored_after_tests'] and child['bindings_restored_after_all_passes']
assert child['complete_parity_passes'] == 2 and child['complete_saved_callback_invocations'] == 160
assert [(p['phase'],p['route']) for p in child['passes']] == [('parity','original'),('parity','candidate'),('timed','original'),('timed','candidate')]
reference = {}
previous_finish = 0.
for p in child['passes']:
    assert p['status'] == 'complete_exact' and p['profile_restored'] and len(p['calls']) == 40
    assert read(A/p['phase']/p['route']/'pass-result.json') == p
    for row, call in zip(p['calls'],fixture['calls'],strict=True):
        assert row['id'] == call['id'] and row['key'] == call['key'] and row['flags'] == call['flags']
        assert row['seconds'] == row['finished_monotonic']-row['started_monotonic'] > 0
        assert previous_finish <= row['started_monotonic']; previous_finish = row['finished_monotonic']
        assert row['outcome'] == 'returned' and row['return_type'] == 'builtins.dict'
        assert row['inputs_unchanged'] and row['before_input'] == row['after_input']
        assert read(A/p['phase']/p['route']/(row['id']+'-outcome.json')) == row
        for key in ('before_input','after_input','typed_return','metrics'):
            pin = row[key]; assert fp(A/pin['path']) == {k: pin[k] for k in ('sha256','bytes')}
        assert read(A/row['metrics']['path']) == fixture['expected_metrics'][call['expected_metrics_sha256']]
        assert row['metric_count'] == call['expected_metric_count']
        actual = {k: row[k] for k in ('before_input','metrics','typed_return','warnings')}
        if p['phase'] == 'parity' and p['route'] == 'original': reference[row['id']] = actual
        else: assert reference[row['id']] == actual
    assert sum(row['seconds'] for row in p['calls']) == p['callback_seconds']
    assert p['aggregate_seconds_including_owner'] == p['callback_seconds']+p['owner_seconds']
    assert p['maximum_callback_seconds'] == max(row['seconds'] for row in p['calls'])
    if p['route'] == 'candidate':
        assert p['cache_info'] == p['cache_info_after_attempt'] == {'entries':[[256,256],[512,512]],'retained_bytes':2621440,'hits':60,'misses':2,'evictions':0}
    if p['phase'] == 'parity':
        assert p['actual_fft_pairs'] == 62 and p['actual_probability_grid_shapes'] == {'80x80':40,'160x160':22}
        assert len(read(A/'parity'/p['route']/'fft-events.json')['events']) == 124
old, new = child['passes'][-2:]
ratios = {'aggregate_candidate_original_ratio':new['aggregate_seconds_including_owner']/old['aggregate_seconds_including_owner'],
          'maximum_callback_candidate_original_ratio':new['maximum_callback_seconds']/old['maximum_callback_seconds']}
for key, value in ratios.items(): assert child['materiality'][key] == value
threshold = 0.7738077598151377
passed = all(value <= threshold for value in ratios.values())
assert child['materiality']['threshold_lte'] == threshold and child['materiality']['passed'] == passed
assert child['decision'] == ('isolated_scoring_integration_lead_only' if passed else 'defer_immediate_integration_materiality_not_met')
report = {'version':'rfcomp07.root-integrity-review.v1','status':'accepted_saved_integrity_and_registered_decision',
          'blockers':[],'root_observed_tool_session':args.session,'root_observed_actual_exit':0,
          'root_observed_full_command_seconds':args.elapsed,'attempt_identity':A.name,
          'indexed_files':len(idx),'indexed_bytes':sum(p['bytes'] for p in idx.values()),
          'physical_membership_exact':True,'frozen_code_files_unchanged':len(pins['code_hashes']),
          'runtime_files_unchanged':len(pins['runtime_files']),'input_files_and_snapshots_unchanged':len(pins['inputs']),
          'tests':child['tests'],'test_observations':len(observations),'saved_callback_invocations':160,
          'materiality':child['materiality'],'decision':child['decision'],
          'conservative_combined_rss_mib':process['conservative_combined_rss_mib'],
          'index':fp(A/'artifact-index.json'),'completion':fp(A/'completion.json'),
          'child_result':fp(A/'child-result.json'),'pins':fp(pins_path),'audit_source':fp(Path(__file__).resolve()),
          'scientific_rerun':False,'candidate_or_test_execution':False,'historical_capacity_accepted':False,'predictive_accepted':False}
with (W/'actual-root-review.json').open('x') as stream:
    stream.write(json.dumps(report,indent=2,sort_keys=True)+'\n')
print(json.dumps(report,sort_keys=True))
