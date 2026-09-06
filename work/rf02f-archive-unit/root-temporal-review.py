"""Independent tiny temporal probes; no production admission or historical work."""
import time
START = time.monotonic()
import copy
from dataclasses import asdict, replace
import hashlib
import importlib.util
import json
from pathlib import Path
import resource
import signal
import sys
import tempfile
from unittest.mock import patch

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('archive_test_fixtures', ROOT / 'tests/research-score-split/test_archive_unit.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)
a = f.a
from research_score_conditional_run import Store

checks = []
def require(condition, name):
    if not condition:
        raise AssertionError(name)

def rejects(callback, name):
    try:
        callback()
    except (ValueError, KeyError):
        checks.append(name)
    else:
        raise AssertionError('not_rejected:' + name)

def snapshot(view):
    return {
        'bank': {str(d): {k: [asdict(row) for row in rows] for k, rows in p.items()}
                 for d, p in view['bank_prepared'].items()},
        'states': sorted((str(k), v) for k, v in view['diagonal_outputs'].items()),
        'laws': {k: sorted((str(key), val) for key, val in rows.items())
                 for k, rows in view['source_laws'].items()},
        'mappers': view['mapper_sources'],
        'pointers': view['source_pointers'],
    }

x = f.TinyArchive()
try:
    context = a.SourceContext(x.directory, a.encoded({'files': x.archive.index}),
        (x.directory / 'manifest.json').read_bytes(), a.encoded(x.records), (a.encoded(x.origin),),
        f.CONFIG_RAW, (), a.encoded(x.mapper_pointers), (), a.encoded({}), a._SEAL)
    opened = []
    original_raw = a.Archive.raw
    def trace(reader, name):
        opened.append(name)
        return original_raw(reader, name)
    with patch.object(a.Archive, 'raw', trace):
        view = a.forecast_inputs(context, x.origin, lambda: None)
    require(not any('losses' in name for name in opened), 'pregame_read_losses')
    require('labels' not in view and all('losses' not in k for k in view['source_pointers']), 'pregame_exposure')
    for d in (12, 24):
        require([r.context.game_id for r in view['bank_prepared'][d]['history']] == ['old'], 'history_membership')
        require([r.game_id for r in view['bank_prepared'][d]['targets']] == x.origin['targetGameIds'], 'target_order')
        require(all('home_score' not in asdict(r) and 'away_score' not in asdict(r)
                    for r in view['bank_prepared'][d]['targets']), 'target_label_fields')
    checks.append('public_forecast_reads_only_pregame_artifacts_and_outcome_free_targets')

    changed = copy.deepcopy(x.records)
    for row in changed:
        if row['gameId'] in x.origin['targetGameIds']:
            row['homeScore'], row['awayScore'] = 97, 81
    changed.append(f.record('future', 2012, 1, '2012-09-09T17:00:00+00:00', 88, 99))
    future_context = replace(context, _records_bytes=a.encoded(changed), _inner=((2025, 'future', 'E2', 0, -999999, False),))
    require(a.encoded(snapshot(view)) == a.encoded(snapshot(a.forecast_inputs(future_context, x.origin, lambda: None))),
            'future_or_target_labels_changed_forecast_inputs')
    require(a.StrictSelectionFeed(future_context)._selector.rows == {}, 'future_cached_losses_prefilled')
    checks.append('changed_target_and_future_outcomes_do_not_change_forecast_inputs_or_prefill_selection')

    with tempfile.TemporaryDirectory() as directory:
        store = Store(Path(directory).resolve(), 'root-temporal-only')
        try:
            store.write('forecasts.json', f.publication_fixture(x.origin))
            pointer = store.pointer('forecasts.json')
            events = []
            def owner_read(p):
                require(p == store.pointer(p['name']), 'owning_index_mismatch')
                raw = store.read(p['name'])
                require(len(raw) == p['bytes'] and a.sha(raw) == p['sha256'], 'owning_bytes_mismatch')
                events.append('owning_durable_read')
                return raw
            def graded():
                return a.grade_inputs(context, x.origin, pointer, lambda: None,
                    read_publication=owner_read, expected_manifest_sha256='f' * 64)
            def trace_grade(reader, name):
                events.append(name)
                return original_raw(reader, name)
            with patch.object(a.Archive, 'raw', trace_grade):
                result = graded()
            require(events[0] == 'owning_durable_read', 'source_open_before_publication')
            require(any('inner-losses' in name for name in events), 'grader_did_not_read_actual_losses')
            require(result['labels'] == {'z-target': [21, 17], 'a-target': [21, 17]}, 'grader_labels')
            require(len(result['grading_receipt']._diagonal_binding) == 18, 'receipt_population')
            checks.append('real_store_publication_precedes_real_source_grader_and_binds_diagonal_rows')

            opened.clear()
            with patch.object(a.Archive, 'raw', trace):
                rejects(lambda: a.grade_inputs(context, x.origin, pointer, lambda: None,
                    read_publication=owner_read, expected_manifest_sha256='e' * 64), 'wrong_run_publication_rejected')
            require(not opened, 'wrong_run_opened_source')
            prior = (x.directory / 'inner-losses-2011-01.json').read_bytes()
            try:
                (x.directory / 'inner-losses-2011-01.json').write_bytes(b'[]')
                rejects(graded, 'post_admission_loss_tampering_rejected')
            finally:
                (x.directory / 'inner-losses-2011-01.json').write_bytes(prior)

            class Stop(BaseException):
                pass
            def stop():
                raise Stop()
            events.clear()
            try:
                a.grade_inputs(context, x.origin, pointer, stop,
                    read_publication=owner_read, expected_manifest_sha256='f' * 64)
            except Stop:
                require(not events, 'budget_stop_read_publication')
                checks.append('baseexception_budget_stop_propagates_before_publication_read')
            else:
                raise AssertionError('budget_stop_swallowed')
        finally:
            store.close()
finally:
    x.close()

# Exercise the actual strict selector over distinct toy years with complete
# 27-setting batches. Explicit toy receipts are not historical source evidence.
sources = [f.source_fixture(y) for y in (2011, 2012, 2013)]
origins, records = [], []
for rows, origin in sources:
    suffix = '-' + str(origin['season'])
    origin['targetGameIds'] = [g + suffix for g in origin['targetGameIds']]
    origins.append(origin)
    for row in rows[1:]:
        row['gameId'] += suffix
        records.append(row)
ctx = f.context_fixture(origins, records)
feed = a.StrictSelectionFeed(ctx)
rejects(lambda: feed.add(origins[1], f.batch(origins[1]), f.proof(origins[1])), 'future_batch_before_prior_rejected')
require(feed._selector.rows == {}, 'bad_batch_partially_mutated')
for origin in origins[:2]:
    feed.add(origin, f.batch(origin), f.proof(origin))
rejects(lambda: feed.add(origins[2], f.batch(origins[2]), f.proof(origins[2])), 'current_year_grade_before_selection_rejected')
choice = copy.deepcopy(feed.select(2013, ctx.expected_by_season))
new = f.batch(origins[2])
for row in new:
    if row['setting'] >= 9:
        row['metrics']['joint_energy_score'] = 0.
feed.add(origins[2], new, f.proof(origins[2]))
require(feed.select(2013, ctx.expected_by_season) == choice, 'current_year_loss_changed_frozen_choice')
checks.append('complete_prior_two_year_selection_stays_frozen_after_current_year_grading')

pins = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in (
    'scripts/research_score_split_archive.py', 'tests/research-score-split/test_archive_unit.py',
    'scripts/research_score_conditional_run.py', 'scripts/research_score_conditional_admission.py',
    'scripts/research_score_contract.py', 'config/research-team-score.v2.json')}
result = {'status': 'accepted_synthetic_temporal_boundary_only', 'checks': checks, 'source_hashes': pins,
    'seconds_including_imports': time.monotonic() - START,
    'peak_rss_mib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2,
    'historical_admission_calls': 0, 'historical_fit_calls': 0, 'score_calls': 0, 'bootstrap_calls': 0,
    'prior_attempt': 'Attempt1 used HistoricalResult.game_id instead of HistoricalResult.context.game_id in this probe. Only the reviewer accessor was corrected; failed script, log and process report retained.',
    'limits': ['Tiny explicit synthetic contexts, not production source admission.',
        'Private fields/seals guard accidental API misuse, not arbitrary Python introspection.',
        'Publication recipe semantics and all277-origin controller/runtime remain unqualified.',
        'Retrospective order is not proof of original contemporaneous issuance.']}
(OUT / 'root-temporal-review.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
