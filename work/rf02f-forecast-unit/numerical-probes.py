import copy
from dataclasses import fields, replace
import hashlib
import importlib.util
import json
from pathlib import Path
import resource
import sys
import time
import unittest
from unittest.mock import patch

START = time.monotonic()
REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OUT = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02f-forecast-unit')
EXPECTED = {'scripts/research_score_split_forecast.py': '472d37e25dbf3b8a7ae092e0d86100114064730d0215ae934a2f7ecb14acdb34',
            'tests/research-score-split/test_forecast_unit.py': '1e74451a9c7dd0043e1725f97e634d96f41cc5fee88229eb0b0f69a4a23e0312'}
for name, digest in EXPECTED.items(): assert hashlib.sha256((REPO/name).read_bytes()).hexdigest() == digest
sys.path.insert(0, str(REPO/'scripts'))
spec = importlib.util.spec_from_file_location('author_forecast_fixture', REPO/'tests/research-score-split/test_forecast_unit.py')
fixture = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
import numpy as np
import research_score_split_forecast as f
from research_score_replay import resolve_distribution
from research_score_split_archive import recover_source_law


def assemble(inputs, selected):
    view, bank, outputs, pointers = inputs
    with fixture.measured(view['origin']) as accounting:
        result = f.assemble_forecasts(view, bank, outputs, fixture.choice(view['origin']['season'], selected),
            local_mapper_pointers=pointers, parent_binding=fixture.PARENT, accounting=accounting)
    return result, accounting._origins[0]['callbacks']


def assert_law_exact(actual, expected):
    assert type(actual) is type(expected)
    for field in fields(actual):
        a, b = getattr(actual, field.name), getattr(expected, field.name)
        if isinstance(a, np.ndarray):
            assert a.dtype == b.dtype and a.shape == b.shape and a.tobytes(order='C') == b.tobytes(order='C'), field.name
        else:
            assert type(a) is type(b) and a == b, field.name


results = []
base = fixture.fixture(2025)
for selected in (1, 9, 26):
    inputs = copy.deepcopy(base); view, bank, outputs, pointers = inputs
    result, calls = assemble(inputs, selected)
    counted = 0
    for row, plan in zip(result['outer_selected_forecasts'][:26], result['grading_plan']['outer'][:26]):
        variant, game = row['variant'], row['game_id']
        if selected < 9 and variant == 'full':
            expected = recover_source_law(view['mappers'][12], view['source_laws']['full']['E2', selected, game]['distribution'])
            assert plan['source']['source_population'] == 'full_setting_forecasts'
        else:
            native = next(x for x in bank.selected_output(outputs, 'E3', selected, variant)['forecasts'] if x['game_id'] == game)
            delay = 24 if variant == 'availability_24h' else 12
            expected, reason = resolve_distribution(view['mappers'][delay], native, 'E3', variant, None)
            assert reason is None
        assert_law_exact(result['resolved_laws']['outer', variant, game], expected)
        assert plan['mode'] == 'new_score'
        assert row['distribution']['independent'] is (variant == 'independent_marginals')
        counted += 1
    assert all(c['kind'] == 'fit' and c['seconds'] > 0 and not c['used_fallback'] for c in calls)
    results.append({'probe': 'direct_original_resolver_all_fields', 'selected': selected, 'rows': counted,
                    'fit_callbacks': sum(c['operation']=='fit' for c in calls),
                    'recovery_callbacks': sum(c['operation']=='recovery' for c in calls)})

# Distinguish every auxiliary N0 variant by an actual fitted synthetic law.
# The view is explicitly synthetic; archive authentication is not replaced or
# claimed here, and no production admission function is called.
inputs = copy.deepcopy(base); view, bank, outputs, pointers = inputs
for (family, variant, game), row in view['source_laws']['outer'].items():
    if family != 'N0': continue
    index = f.SPLIT_VARIANTS.index(variant)
    delay = 24 if variant == 'availability_24h' else 12
    law = view['mappers'][delay].fit([17.+index*.31, 13.+index*.17])
    if variant == 'independent_marginals': law = replace(law, independent=True)
    row['distribution'] = fixture.native(f.distribution_descriptor(law, pointers[delay]))
with patch.object(f.JointBase, 'fit', side_effect=AssertionError('no eligible setting must not fit')):
    result, calls = assemble(inputs, None)
for row in result['outer_selected_forecasts'][:26]:
    variant, game = row['variant'], row['game_id']
    wanted_variant = 'full' if variant in ('full','no_offense','no_defense','zero_strength_update','zero_scoring_level_update') else variant
    wanted = view['source_laws']['outer']['N0', wanted_variant, game]
    assert row['distribution'] == wanted['distribution']
    assert row['native_failure'] == 'no_eligible_setting'
    delay = 24 if variant == 'availability_24h' else 12
    assert_law_exact(result['resolved_laws']['outer', variant, game], recover_source_law(view['mappers'][delay], wanted['distribution']))
assert len(calls) == 26 and all(c['used_fallback'] and c['native_failure']=='no_eligible_setting' for c in calls)
assert sum(p['law_work']['fit_calls'] for p in result['grading_plan']['outer'][:26]) == 0
results.append({'probe': 'distinct_actual_N0_variant_fallbacks', 'rows': 26, 'new_fit_calls': 0,
                'distinct_N0_descriptor_count_per_game': len({f.strict(r['distribution']) for (family,v,g),r in view['source_laws']['outer'].items() if family=='N0' and g=='z-target'})})

inputs = copy.deepcopy(base)
result, calls = assemble(inputs, 0)
for row, plan in zip(result['outer_selected_forecasts'][:26], result['grading_plan']['outer'][:26]):
    variant, game = row['variant'], row['game_id']
    if variant in f.E2_VARIANTS:
        source = inputs[0]['source_laws']['outer']['E2', variant, game]
        assert row == {**source, 'family': 'E3'}
        assert plan['mode'] == 'source_outer'
        assert plan['source']['source_key'] == ['E2',0,variant,game]
        assert plan['source']['delay_hours'] == (24 if variant=='availability_24h' else 12)
        assert 'loss_file' not in plan['source']
    else:
        assert plan['mode'] == 'new_score' and plan['source'] is None
assert sum(c['operation']=='fit' for c in calls)==4
assert len(result['outer_selected_forecasts'])==38
results.append({'probe':'exact_diagonal_source_reuse_and_newzero_exclusion','reused_rows':22,'new_zero_rows':4,'raw_reference_rows':12})

# Exercise the held unit suite once; no full fixture/bootstrap is invoked.
suite = unittest.defaultTestLoader.loadTestsFromModule(fixture)
run = unittest.TextTestRunner(verbosity=2).run(suite)
assert run.wasSuccessful()
pins = dict(EXPECTED)
for module in tuple(sys.modules.values()):
    path = getattr(module, '__file__', None)
    if path:
        p = Path(path).resolve()
        if p.suffix == '.py' and p.is_relative_to(REPO/'scripts'):
            pins[str(p.relative_to(REPO))] = hashlib.sha256(p.read_bytes()).hexdigest()
for name in ('.planning/engine-os/research-first/RF-02F-HISTORICAL-PROTOCOL.v1.md', 'config/research-team-score-split.v1.json'):
    pins[name] = hashlib.sha256((REPO/name).read_bytes()).hexdigest()
for name, digest in EXPECTED.items(): assert pins[name] == digest
report = {'status':'accepted_numerical_current_origin_unit_only','source_hashes':EXPECTED,'dependency_and_protocol_pins':pins,
    'independent_probes':results,'held_author_tests':run.testsRun,'failures':len(run.failures),'errors':len(run.errors),
    'elapsed_seconds':time.monotonic()-START,'peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2,
    'blockers':[], 'historical_admission_calls':0,'historical_fits':0,'historical_scores':0,'bootstrap_calls':0,
    'review_conclusions':['78 independently resolved laws match every dataclass field, exact ndarray dtype/shape/C-bytes and scalar type/value.',
       'Nine deliberately distinct auxiliary N0 variant laws prove the registered no-eligible fallback map, including independent and24-hour support.',
       'Only exact same diagonal11 old variants reuse outer source rows; both zero controls remain newly resolved. Different diagonal full is marked new_score using its saved inner law.',
       'Fit versus saved-recovery callback roles are retained; zero-fit fallback callbacks are flagged native failures and cannot form a successful off-diagonal-fit anchor.',
       'Per-origin source cache binds game, delay and complete descriptor; raw source-reference pointers name forecast artifacts rather than prematurely claiming a loss artifact.'],
    'limits':['Caller must authenticate archive view, complete prior-two-year annual choice and source/native provenance; this pure assembler does not prove those trust roots.',
       'Grader must authenticate publication and actual source loss pointers, enforce full outer scorer flags and derive interval mass from each exact law.',
       'Synthetic current-origin assembly does not establish historical compatibility, full controller feasibility, statistical improvement or historical run authority.']}
(OUT/'numerical-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'review':str(OUT/'numerical-review.json'),'sha256':hashlib.sha256((OUT/'numerical-review.json').read_bytes()).hexdigest(),
                  'elapsed_seconds':report['elapsed_seconds'],'peak_rss_mib':report['peak_rss_mib'],'probes':results}),flush=True)
