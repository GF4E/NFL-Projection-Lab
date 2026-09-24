"""SYNTHETIC_ONLY_NOT_AN_EXPERIMENT: full-size retained runner resource probe."""
import datetime as dt
import gc
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import random
import resource
import stat
import sys
import time
from unittest.mock import patch

LABEL = 'SYNTHETIC_ONLY_NOT_AN_EXPERIMENT'
CAP = 1024**3
RESERVE = 1536*1024**2


def generate(methods):
    """Artificial scores, complete paired seasons and expanding manifest sizes."""
    from engine.projection.calibration_admission import digest
    rng = random.Random(9132026)
    roles = {role: {'history': [], 'fits': {}} for role in methods}
    weeks = {}
    for year in range(2013, 2026):
        count = 256 if year <= 2020 else 271 if year == 2022 else 272
        maxweek = 17 if year <= 2020 else 18
        start = dt.datetime(year, 9, 7, 16, 45, tzinfo=dt.timezone.utc)
        for week in range(1, maxweek+1):
            issue = start + dt.timedelta(weeks=week-1)
            amount = count//maxweek + (week <= count % maxweek)
            refs = {}
            for role, source in roles.items():
                if role == 'own' or week == 1:
                    prior = source['history']
                    manifest = {'method_sha256': methods[role]['sha256'],
                        'available_at': (issue-dt.timedelta(days=2)).isoformat(),
                        'last_label_available_at': prior[-1]['label_available_at'] if prior else f'{year}-01-01T00:00:00Z',
                        'training_game_ids': [r['game_id'] for r in prior] or ['SYNTHETIC_PREHISTORY']}
                    key = digest(manifest)
                    source['fits'][key] = manifest
                else:
                    key = next(reversed(source['fits']))
                refs[role] = key
            for j in range(amount):
                gid = f'SYNTHETIC_{year}_{week:02d}_{j:02d}'
                home = 23 + rng.gauss(0, 3)
                away = 21 + rng.gauss(0, 3)
                actual_home = max(0, round(home+rng.gauss(0, 10)))
                actual_away = max(0, round(away+rng.gauss(0, 10)))
                for role, source in roles.items():
                    shift = 0 if role == 'own' else 1.25
                    source['history'].append({'game_id': gid, 'season': year,
                        'home': home+shift, 'away': away+shift,
                        'actual_home': actual_home, 'actual_away': actual_away,
                        'issuance_at': issue.isoformat(),
                        'label_available_at': (issue+dt.timedelta(hours=7)).isoformat(),
                        'fit_evidence_sha256': refs[role]})
                if year >= 2016:
                    weeks[gid] = week
    rows = roles['own']['history']
    folds = [{'season': year,
              'expected_game_ids': [g['game_id'] for g in rows if g['season'] < year],
              'offseason_planned_at': f'{year}-08-30T14:00:00Z',
              'week9_planned_at': f'{year}-11-01T14:00:00Z',
              'current_season_excluded': True} for year in range(2016, 2026)]
    control = [{k: g[k] for k in ('game_id', 'season', 'home', 'away', 'actual_home', 'actual_away')}
               for g in rows if g['season'] >= 2016]
    assert len(rows) == 3407 and len(control) == 2639 and len(weeks) == 2639
    assert len(roles['own']['fits']) == 226 and len(roles['legacy']['fits']) == 13
    return roles, folds, control, weeks


class Observer:
    def __init__(self, parent):
        self.parent = parent
        self.samples = self.allocated = self.logical = self.files = self.staging = 0
        self.seconds = 0.

    def sample(self):
        began = time.monotonic()
        allocated = logical = count = 0
        seen = set()
        for base, dirs, names in os.walk(self.parent):
            for name in names:
                p = Path(base)/name
                s = p.lstat()
                if not stat.S_ISREG(s.st_mode) or (s.st_dev, s.st_ino) in seen:
                    continue
                seen.add((s.st_dev, s.st_ino))
                allocated += s.st_blocks*512
                logical += s.st_size
                count += 1
                if name.endswith('.pending'):
                    self.staging = max(self.staging, s.st_size)
        self.samples += 1
        self.allocated = max(self.allocated, allocated)
        self.logical = max(self.logical, logical)
        self.files = max(self.files, count)
        self.seconds += time.monotonic()-began
        return allocated


def main(source, output):
    source = Path(source).resolve()
    output = Path(output).resolve()
    if not sys.platform.startswith('linux') or os.getuid() == 0:
        raise RuntimeError('Linux service user required')
    if output.exists():
        raise RuntimeError('Unique retained attempt directory required')
    output.mkdir()
    os.environ['TMPDIR'] = str(output)
    for name in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
        assert os.environ[name] == '1'
    resource.setrlimit(resource.RLIMIT_AS, (4*1024**3, 4*1024**3))
    # All production data reads are forbidden; synthetic evidence is separate.
    def guard(event, args):
        if event != 'open' or not isinstance(args[0], (str, bytes, os.PathLike)):
            return
        p = Path(os.fsdecode(args[0])).resolve()
        if any(p.is_relative_to(source/d) for d in ('work', 'outputs', '.cloud-private', '.git')):
            raise PermissionError('Synthetic workload cannot open production evidence')
    sys.addaudithook(guard)
    try:
        (source/'outputs/projection-v3/final-feed.json').read_bytes()
        raise AssertionError('Production evidence guard failed')
    except PermissionError:
        pass
    sys.path[:0] = [str(source), str(source/'tests')]
    from test_projection_calibration_admission import AdmissionTests
    from engine.projection import calibration_admission as admission
    from engine.projection import calibration_execute as execution
    from engine.projection import calibration_report as report
    from engine.projection import research_ledger as ledger, storage
    from engine.projection import calibration_json as retained_json
    started = time.monotonic()
    fixture = AdmissionTests()
    fixture.setUp()
    # Preserve every synthetic artifact, including a failed attempt.
    fixture.temp._finalizer.detach()
    assert fixture.root.is_relative_to(output)
    roles, folds, control, weeks = generate(fixture.inputs['methods'])
    fixture.control = control
    fixture.inputs.update(roles=roles, folds=folds, evaluation_game_ids=sorted(weeks))
    fixture.inputs['sources']['schedule'] = fixture.save('work/schedule.json',
        [{'game_id': gid, 'week': week} for gid, week in sorted(weeks.items())])
    ref = fixture.save(fixture.control_ref['path'], control)
    fixture.catalog['series'][0]['sha256'] = ref['sha256']
    fixture.save('work/series-registry/catalog.json', fixture.catalog)
    fixture.r.update(baseline_hash=ref['sha256'], population_game_ids=sorted(weeks), seasons=list(range(2016, 2026)))
    fixture.save_inputs()
    registration = fixture.registration()
    identity = {'scope': LABEL, 'root': str(fixture.root), 'registration_ref': registration,
        'input_ref': fixture.r['inputs'], 'code': fixture.r['evaluation_code'],
        'environment': fixture.r['evaluation_environment'], 'history_games_per_arm': 3407,
        'evaluation_games': 2639, 'warmup_games': 768, 'outer_seasons': 10,
        'fit_manifest_counts': {k: len(v['fits']) for k, v in roles.items()},
        'training_memberships': {k: sum(len(f['training_game_ids']) for f in v['fits'].values()) for k, v in roles.items()},
        'synthetic_receipts': True, 'real_experiment_registered': False,
        'production_evidence_read_forbidden': True, 'activates_method': False}
    (output/'identity.json').write_text(json.dumps(identity, indent=2)+'\n')
    root = fixture.root
    # A real CLI worker reads prepared artifacts; it does not retain the fixture
    # builder's second copy of every training row throughout execution.
    del fixture, roles, folds, control, weeks
    gc.collect()
    observer = Observer(output)
    original_write = storage.write_bytes
    def guarded_write(path, raw, immutable=False):
        p = Path(path).resolve()
        if not p.is_relative_to(output):
            raise PermissionError('Write outside isolated attempt')
        used = observer.sample()
        reserve = os.statvfs(output)
        if used+len(raw) > CAP or reserve.f_bavail*reserve.f_frsize-len(raw) < RESERVE:
            raise RuntimeError('Synthetic storage guard: workspace cap or volume reserve')
        return original_write(path, raw, immutable)
    def watched(operation):
        def call(src, dst, *args, **kwargs):
            observer.sample()
            return operation(src, dst, *args, **kwargs)
        return call
    original_json_save = retained_json.save
    def guarded_json_save(path, value, **kwargs):
        if not Path(path).resolve().is_relative_to(output):
            raise PermissionError('Write outside isolated attempt')
        projected = sum(len(block) for block in retained_json.chunks(value, newline=True))
        used = observer.sample()
        reserve = os.statvfs(output)
        if used+projected > CAP or reserve.f_bavail*reserve.f_frsize-projected < RESERVE:
            raise RuntimeError('Synthetic storage guard: workspace cap or volume reserve')
        return original_json_save(path, value, **kwargs)
    state = 'FAILED'
    phases = {}
    error = None
    try:
        with patch.object(storage, 'write_bytes', side_effect=guarded_write), \
             patch.object(retained_json, 'save', side_effect=guarded_json_save), \
             patch.object(storage.os, 'replace', side_effect=watched(storage.os.replace)), \
             patch.object(storage.os, 'link', side_effect=watched(storage.os.link)):
            began = time.monotonic()
            saved = ledger.run_calibration(root, registration)
            phases['execute_and_ledger'] = time.monotonic()-began
            assert len(saved['attempts']) == 1
            assert saved['attempts'][0]['receipt']['state'] == 'COMPUTED_NOT_RELEASED'
            key = saved['key']
            del saved
            began = time.monotonic()
            retry = ledger.run_calibration(root, registration)
            assert len(retry['attempts']) == 1
            del retry
            phases['exact_retry'] = time.monotonic()-began
            began = time.monotonic()
            published = report.publish(root, key)
            phases['retained_report'] = time.monotonic()-began
            result = execution.read(root, key)['attempts'][0]['result']
            assert len(result['records']) == 2639 and result['pooled']['control']['team']['n'] == 5278
            assert result['pooled']['control']['team']['mae'] == result['pooled']['candidate']['team']['mae']
            assert not result['activates_method']
            state = 'PASS'
    except BaseException as exc:
        error = {'type': type(exc).__name__, 'message': str(exc)[:400]}
        raise
    finally:
        observer.sample()
        summary = {'scope': LABEL, 'status': state, 'error': error,
            'elapsed_seconds': time.monotonic()-started, 'phase_seconds': phases,
            'peak_rss_bytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
            'observed_file_peak': vars(observer) | {'parent': str(output)},
            'workspace_cap_bytes': CAP, 'volume_reserve_bytes': RESERVE,
            'production_writes': False, 'real_experiment_registered': False,
            'activates_method': False, 'real_historical_resource_qualification': False,
            'limitations': ['Artificial values and synthetic prerequisite receipts.',
                'Atomic-boundary file observations omit filesystem metadata and unobserved transients.',
                'No actual calibration decision, live cutoff, review or mean-semantics qualification.']}
        (output/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
        print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main(*sys.argv[1:])
