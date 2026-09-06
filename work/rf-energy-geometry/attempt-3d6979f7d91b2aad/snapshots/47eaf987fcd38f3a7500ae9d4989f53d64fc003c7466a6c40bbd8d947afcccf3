"""Metadata-only saved callback fixture derivation; no NumPy or model imports."""
import hashlib
import json
import math
from pathlib import Path
import struct

WORK = Path(__file__).resolve().parent
OWNER = WORK.parents[1]
PROFILE = OWNER/'work/rf-origin-profile/profile-685708ac9c57a623'
WITNESS = PROFILE/'plain/scientific-witness.json'


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n').encode()


def pin(path):
    raw = path.read_bytes()
    return {'path': str(path), 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


assert pin(PROFILE/'artifact-index.json')['sha256'] == 'ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b'
assert pin(WITNESS)['sha256'] == 'e695fcbcfc6f1c03754e1186c344cdc42bfa4cc45575ff517ecc4703f75f4db2'
source_index = json.loads((PROFILE/'artifact-index.json').read_bytes())['files']
assert {k: pin(WITNESS)[k] for k in ('sha256', 'bytes')} == source_index['plain/scientific-witness.json']
witness = json.loads(WITNESS.read_bytes())
law_index = {tuple(row['key']): row['fields'] for row in witness['resolved_laws']}
assert len(law_index) == len(witness['resolved_laws']) == 62
row_index = {}
for stage, rows in (('inner', witness['inner_rows']), ('outer', witness['outer_rows'])):
    for row in rows:
        if row['family'] != 'E3':
            continue
        key = (stage, row['setting'] if stage == 'inner' else row['variant'], row['game_id'])
        assert key not in row_index
        row_index[key] = row
laws, metrics, calls = {}, {}, []
mass_fields = {target+'_interval_mass_80' for target in ('home', 'away', 'margin', 'total')}


def flatten(value):
    if type(value) is list:
        return [number for child in value for number in flatten(child)]
    assert type(value) is float and math.isfinite(value)
    return [value]


for callback in witness['callbacks']:
    if callback['kind'] != 'score':
        continue
    assert callback['operation'] == 'score' and callback['error_type'] is None and callback['error_reason'] is None
    assert callback['native_failure'] is None and callback['used_fallback'] is False
    stage = callback['stage']
    key = (stage, callback['setting'] if stage == 'inner' else callback['variant'], callback['game_id'])
    fields, row = law_index[key], row_index[key]
    assert set(fields) == {'alpha','atoms','beta','independent','iterations','rates','theta'}
    for name in ('alpha', 'atoms', 'rates', 'theta'):
        image = fields[name]
        assert set(image) == {'c_bytes_hex','dtype','shape','values','writeable'}
        assert image['dtype'] == '<f8' and image['writeable'] is False
        numbers = flatten(image['values'])
        assert math.prod(image['shape']) == len(numbers)
        assert struct.pack('<'+'d'*len(numbers), *numbers).hex() == image['c_bytes_hex']
    for name in ('beta',):
        image = fields[name]
        assert image['type'] == 'float' and type(image['value']) is float
        assert struct.pack('>d', image['value']).hex() == image['float_bits']
    assert fields['iterations']['type'] == 'int' and type(fields['iterations']['value']) is int
    assert fields['independent']['type'] == 'bool' and type(fields['independent']['value']) is bool
    body = encoded(fields); law_sha = hashlib.sha256(body).hexdigest()
    assert law_sha not in laws or laws[law_sha] == fields
    laws[law_sha] = fields
    expected = dict(row['metrics'])
    if stage == 'outer':
        assert mass_fields <= set(expected)
        for field in mass_fields:
            del expected[field]
    else:
        assert not mass_fields & set(expected)
    assert expected['grid_cells'] == [80, 80]
    observed = [expected['home_observed'], expected['away_observed']]
    assert all(type(value) is float for value in observed) and observed == [21.0, 17.0]
    expected_sha = hashlib.sha256(encoded(expected)).hexdigest()
    assert expected_sha not in metrics or metrics[expected_sha] == expected
    metrics[expected_sha] = expected
    calls.append({'id': f'call-{len(calls)+1:02d}', 'key': list(key), 'callback': callback,
        'law_sha256': law_sha, 'observed': observed, 'game_id': callback['game_id'],
        'flags': {name: callback[name] for name in ('double_grid','diagnostics')},
        'expected_metrics_sha256': expected_sha, 'expected_metric_count': len(expected)})
assert len(calls) == 40 and len({tuple(row['key']) for row in calls}) == 40
assert sum(row['flags']['double_grid'] for row in calls) == 22
assert sum(row['flags']['diagnostics'] for row in calls) == 4
assert sum(row['key'][0] == 'inner' for row in calls) == 36
fixture = {'version':'rfcomp07.saved-score-fixture.v1', 'source':pin(WITNESS),
    'profile_index':pin(PROFILE/'artifact-index.json'), 'builder':pin(Path(__file__).resolve()),
    'law_reconstruction':'Exact saved float64 bytes and scalar bits; derive independent contiguous arrays, preserving read-only state. Original live aliases/strides are not recovered.',
    'excluded_outer_fields':sorted(mass_fields), 'laws':laws, 'expected_metrics':metrics, 'calls':calls,
    'scientific_execution':False, 'fit_calls':0}
destination = WORK/'SCORING-FIXTURES.v1.json'
with destination.open('xb') as output:
    output.write(encoded(fixture))
print(json.dumps({'fixture':pin(destination), 'calls':len(calls),'unique_laws':len(laws),
    'unique_expected_metrics':len(metrics),'metric_field_counts':sorted(set(c['expected_metric_count'] for c in calls)),
    'energy_calls_from_flags':len(calls)+sum(c['flags']['double_grid'] for c in calls),'scientific_execution':False},sort_keys=True))
