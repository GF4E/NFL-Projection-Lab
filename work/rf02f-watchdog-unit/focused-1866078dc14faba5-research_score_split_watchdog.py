"""One owned RF-02F worker; external stop evidence is not a scientific result.

The parent can SIGKILL a worker blocked in native code. RSS is sampled outside
the worker, not limited by a kernel memory reservation. Scheduler delays and
sampling gaps are retained; waited-worker high-water RSS is checked at exit.
No unconfirmed worker work is allowed a metadata grace after an external stop.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
import uuid


class ObservationFailure(Exception):
    pass


class _Halt(BaseException):
    pass


def _json(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()


def _read_phase(path):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result: raise ObservationFailure('duplicate_phase_field')
            result[key] = value
        return result
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 4096:
            raise ObservationFailure('invalid_phase_file')
        raw = source.read()
    value = json.loads(raw, object_pairs_hook=pairs,
                       parse_constant=lambda _: (_ for _ in ()).throw(ObservationFailure('nonfinite_phase')))
    if (type(value) is not dict or set(value) != {'version', 'owner', 'phase', 'smoke_started', 'smoke_finished'}
            or value['version'] != 'rf02f.owned-phase.v1'
            or type(value['owner']) is not str or len(value['owner']) != 32
            or any(c not in '0123456789abcdef' for c in value['owner'])
            or value['phase'] not in ('starting', 'smoke', 'science')):
        raise ObservationFailure('invalid_phase_schema')
    a, b = value['smoke_started'], value['smoke_finished']
    number = lambda v: type(v) in (int, float) and math.isfinite(v) and v >= 0
    if not ((value['phase'] == 'starting' and a is b is None)
            or (value['phase'] == 'smoke' and number(a) and b is None)
            or (value['phase'] == 'science' and number(a) and number(b) and b >= a)):
        raise ObservationFailure('invalid_phase_timestamps')
    return value, raw


def _write_phase(path, value, *, initial=False):
    temporary = path.with_name('.phase-staging-' + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(_json(value)); output.flush(); os.fsync(output.fileno())
    if initial:
        os.link(temporary, path); temporary.unlink()
    else:
        os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def transition_phase(path, phase):
    """Owned worker's one-way smoke boundaries; stamps the actual monotonic clock."""
    path = Path(path)
    value, _ = _read_phase(path)
    if (value['phase'], phase) not in (('starting', 'smoke'), ('smoke', 'science')):
        raise ValueError('phase_reentry_or_invalid_transition')
    now = time.monotonic()
    if phase == 'science' and now < value['smoke_started']:
        raise ValueError('invalid_phase_clock')
    value['phase'] = phase
    value['smoke_started' if phase == 'smoke' else 'smoke_finished'] = now
    _write_phase(path, value)


def _observe(pgid, timeout):
    # The pinned production host is Darwin; -g selects this owned process
    # group. Reject other returned groups rather than infer process ownership.
    result = subprocess.run(['/bin/ps', '-g', str(pgid), '-o', 'pid=,pgid=,rss=,stat='],
                            capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode not in (0, 1) or result.stderr.strip():
        raise ObservationFailure('process_group_observation_failed')
    rows = []
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) != 4 or any(not x.isdecimal() for x in fields[:3]) or not fields[3]:
            raise ObservationFailure('malformed_process_group_observation')
        pid, group, kib = map(int, fields[:3])
        if pid <= 0 or group != pgid:
            raise ObservationFailure('foreign_process_group_observation')
        rows.append({'pid': pid, 'pgid': group, 'rss_mib': kib / 1024., 'state': fields[3]})
    if len({r['pid'] for r in rows}) != len(rows):
        raise ObservationFailure('duplicate_process_observation')
    return rows


def supervise(command, *, cwd, output_parent, identity):
    """Run once with fixed7200s/4096MiB and parent-only30s report closure.

    command is an explicit argv list, never a shell command. output_parent must
    exist; identity allocates one exclusive directory containing stdout.log,
    stderr.log, observations.jsonl and process-report.json. No worker terminal
    is inspected or endorsed here. The final controller owns source/manifest
    acceptance and must authenticate its separate Store completion.
    """
    return _supervise(command, cwd=cwd, output_parent=output_parent, identity=identity,
                      limits=(7200., 4096., 30., .05), phase_status=True)


def _supervise(command, *, cwd, output_parent, identity, limits, phase_status=False, _smoke_seconds=120.):
    """Private shortened-limit seam for isolated synthetic child tests only."""
    started = time.monotonic()  # Before validation, directory setup or spawn.
    seconds, memory_mib, grace, interval = limits
    if (len(limits) != 4 or any(type(v) not in (int, float) or not math.isfinite(v) or v <= 0 for v in limits)
            or seconds > 7200 or memory_mib > 4096 or grace > 30 or interval > .1
            or type(phase_status) is not bool or type(_smoke_seconds) not in (int, float)
            or not 0 < _smoke_seconds <= 120):
        raise ValueError('invalid_private_test_limits')
    if sys.platform != 'darwin':
        raise ValueError('pinned_darwin_observer_required')
    if signal.getitimer(signal.ITIMER_REAL) != (0., 0.):
        raise ValueError('existing_parent_process_timer')
    deadline = started + seconds
    child = None; folder = None; streams = []; interrupted = None
    stop_at = None; metadata_deadline = None; launching = False; pending_deadline = False
    phase_file = None; phase_owner = None; phase_seen = None; smoke_deadline = None
    report = {'version': 'rf02f.external-process-watchdog.v1', 'status': 'not_started',
              'limits': {'scientific_seconds': seconds, 'rss_mib': memory_mib,
                         'parent_metadata_seconds': grace, 'rss_sample_interval_seconds': interval,
                         'complete_smoke_seconds': _smoke_seconds},
              'started_monotonic': started, 'pid': None, 'pgid': None,
              'exit_code': None, 'exit_signal': None, 'stop_reason': None,
              'sample_count': 0, 'sampled_worker_peak_rss_mib': 0., 'sampled_group_peak_rss_mib': 0.,
              'waited_worker_peak_rss_mib': None, 'kill_requests': [], 'observation_errors': [],
              'worker_grace_seconds': 0, 'automatic_restart': False,
              'phase_handshake_required': phase_status, 'phase_progression': [],
              'scientific_terminal_verified': False, 'historical_invocation_authorized': False,
              'limits_of_observation': ['RSS is sampled, not an instantaneous kernel RSS limit.',
                  'wait4 reports worker high-water RSS; group peak is the maximum observed group sum.',
                  'Parent scheduling can delay observation and signal delivery; timestamps retain that delay.',
                  'A completed process alone does not prove a complete or valid scientific terminal.']}

    def kill_owned(reason):
        # An unreaped owned PID prevents process-group-ID reuse. Never signal
        # this numeric group again after wait4 releases that ownership anchor.
        if child is None or child.returncode is not None or report['kill_requests']:
            return
        event = {'signal': int(signal.SIGKILL), 'reason': reason,
                 'elapsed_seconds': time.monotonic() - started, 'pgid': child.pid}
        try:
            os.killpg(child.pid, signal.SIGKILL)
            event['result'] = 'sent_to_owned_group'
        except ProcessLookupError:
            event['result'] = 'owned_group_already_absent'
        except OSError as exc:
            event['result'] = 'signal_failed'; event['error_type'] = type(exc).__name__
        report['kill_requests'].append(event)

    def halt(reason, at=None):
        nonlocal stop_at
        if stop_at is None:
            stop_at = time.monotonic() if at is None else at
            report['stop_reason'] = reason
            report['scientific_stop_elapsed_seconds'] = stop_at - started
            report['stop_observed_elapsed_seconds'] = time.monotonic() - started
        kill_owned(reason)
        raise _Halt(reason)

    def alarm(_signum, _frame):
        nonlocal pending_deadline
        if metadata_deadline is not None:
            kill_owned('parent_metadata_deadline')
            raise _Halt('parent_metadata_deadline')
        # Popen must first return its owned PID. Never lose that ownership
        # during the constructor; check immediately after assignment below.
        if launching:
            pending_deadline = True
            return
        at = min(deadline, smoke_deadline or deadline)
        halt('complete_smoke_deadline' if at < deadline else 'scientific_wall_deadline', at)

    def check():
        at = min(deadline, smoke_deadline or deadline)
        if pending_deadline or time.monotonic() >= at:
            halt('complete_smoke_deadline' if at < deadline else 'scientific_wall_deadline', at)

    def observe_phase():
        nonlocal phase_seen, smoke_deadline
        if phase_file is None: return
        value, raw = _read_phase(phase_file)
        now = time.monotonic(); rank = {'starting': 0, 'smoke': 1, 'science': 2}
        if value['owner'] != phase_owner or (phase_seen is not None and rank[value['phase']] < rank[phase_seen['phase']]):
            raise ObservationFailure('phase_owner_or_order_mismatch')
        for field in ('smoke_started', 'smoke_finished'):
            stamp = value[field]
            if stamp is not None and not started <= stamp <= now:
                raise ObservationFailure('phase_clock_outside_parent_lifecycle')
            if phase_seen is not None and phase_seen[field] is not None and stamp != phase_seen[field]:
                raise ObservationFailure('phase_clock_reset')
        if value['phase'] == 'science' and value['smoke_finished'] - value['smoke_started'] >= _smoke_seconds:
            halt('complete_smoke_elapsed_limit', value['smoke_started'] + _smoke_seconds)
        smoke_deadline = value['smoke_started'] + _smoke_seconds if value['phase'] == 'smoke' else None
        if value != phase_seen:
            report['phase_progression'].append({'phase': value['phase'], 'smoke_started': value['smoke_started'],
                'smoke_finished': value['smoke_finished'], 'sha256': hashlib.sha256(raw).hexdigest(),
                'observed_elapsed_seconds': now - started})
        phase_seen = value
        check()
        signal.setitimer(signal.ITIMER_REAL, max(.000001, min(deadline, smoke_deadline or deadline) - time.monotonic()))

    def reap():
        if child is None or child.returncode is not None:
            return child is not None
        pid, status, usage = os.wait4(child.pid, os.WNOHANG)
        if pid == 0:
            return False
        child.returncode = os.waitstatus_to_exitcode(status)
        report.update(exit_code=child.returncode, exit_signal=-child.returncode if child.returncode < 0 else None,
                      waited_worker_peak_rss_mib=usage.ru_maxrss / 1024.**2,
                      exit_observed_elapsed_seconds=time.monotonic() - started)
        return True

    previous = signal.signal(signal.SIGALRM, alarm)
    try:
        signal.setitimer(signal.ITIMER_REAL, max(.000001, deadline - time.monotonic()))
        check()
        if (type(command) is not list or not command or any(type(v) is not str or not v or '\0' in v for v in command)
                or type(identity) is not str or not identity or len(identity) > 120
                or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in identity)):
            raise ValueError('invalid_worker_command_or_identity')
        working = Path(cwd).resolve(strict=True)
        parent = Path(output_parent).resolve(strict=True)
        if not working.is_dir() or not parent.is_dir():
            raise ValueError('existing_directories_required')
        candidate = parent / identity
        candidate.mkdir(mode=0o700)  # Refuse every existing identity, even empty.
        folder = candidate
        for name in ('stdout.log', 'stderr.log', 'observations.jsonl'):
            streams.append((folder / name).open('xb', buffering=0))
            os.fchmod(streams[-1].fileno(), 0o600)
        argv = list(command)
        if phase_status:
            phase_file = folder / 'phase.json'; phase_owner = uuid.uuid4().hex
            _write_phase(phase_file, {'version': 'rf02f.owned-phase.v1', 'owner': phase_owner,
                'phase': 'starting', 'smoke_started': None, 'smoke_finished': None}, initial=True)
            argv.extend(['--watchdog-phase-file', str(phase_file)])
            observe_phase()
        report['command'] = argv; report['cwd'] = str(working)
        check()
        launching = True
        try:
            child = subprocess.Popen(argv, cwd=working, stdin=subprocess.DEVNULL,
                                     stdout=streams[0], stderr=streams[1], start_new_session=True, close_fds=True)
        finally:
            launching = False
        report.update(pid=child.pid, pgid=child.pid, spawned_elapsed_seconds=time.monotonic() - started)
        check()
        while True:
            check()
            observe_phase()
            rows = _observe(child.pid, min(.2, max(.001, deadline - time.monotonic())))
            check()
            if not any(row['pid'] == child.pid for row in rows):
                raise ObservationFailure('live_owned_worker_missing_from_observation')
            group_rss = math.fsum(row['rss_mib'] for row in rows)
            worker_rss = next(row['rss_mib'] for row in rows if row['pid'] == child.pid)
            report['sample_count'] += 1
            report['sampled_worker_peak_rss_mib'] = max(report['sampled_worker_peak_rss_mib'], worker_rss)
            report['sampled_group_peak_rss_mib'] = max(report['sampled_group_peak_rss_mib'], group_rss)
            sample = {'elapsed_seconds': time.monotonic() - started, 'members': rows, 'group_rss_mib': group_rss}
            streams[2].write(_json(sample))
            if group_rss > memory_mib:
                halt('sampled_group_rss_limit')
            worker = next(row for row in rows if row['pid'] == child.pid)
            if worker['state'].startswith('Z'):
                if len(rows) > 1:
                    halt('owned_descendants_remain_after_worker_exit')
                if not reap():
                    raise ObservationFailure('observed_exit_not_waitable')
                if report['waited_worker_peak_rss_mib'] > memory_mib:
                    halt('waited_worker_peak_rss_limit')
                observe_phase()
                if phase_status and (phase_seen is None or phase_seen['phase'] != 'science'):
                    halt('incomplete_owned_phase_handshake')
                report['status'] = 'completed_process' if child.returncode == 0 else 'failed_process'
                break
            time.sleep(min(interval, max(0., deadline - time.monotonic())))
    except _Halt:
        report['status'] = 'externally_stopped_process'
    except BaseException as exc:
        if isinstance(exc, (KeyboardInterrupt, SystemExit)):
            interrupted = exc; report['status'] = 'interrupted_parent'
        else:
            interrupted = exc if folder is None else None
            report['status'] = 'observation_or_setup_failure'
        report['observation_errors'].append({'error_type': type(exc).__name__, 'reason': str(exc),
                                              'elapsed_seconds': time.monotonic() - started})
        if stop_at is None:
            stop_at = min(time.monotonic(), deadline)
            report['stop_reason'] = type(exc).__name__
        kill_owned(report['stop_reason'])
    finally:
        # No worker grace. Parent-only closure is capped at the original stop
        # plus30, including reaping, hashes, fsync and atomic report publication.
        signal.setitimer(signal.ITIMER_REAL, 0)
        stop_at = time.monotonic() if stop_at is None else stop_at
        metadata_deadline = stop_at + grace
        try:
            if time.monotonic() >= metadata_deadline:
                raise _Halt('parent_metadata_deadline')
            signal.setitimer(signal.ITIMER_REAL, max(.000001, metadata_deadline - time.monotonic()))
            if child is not None and child.returncode is None:
                kill_owned(report['stop_reason'] or 'parent_cleanup')
                while not reap():
                    if time.monotonic() >= metadata_deadline:
                        raise _Halt('parent_metadata_deadline')
                    time.sleep(.005)
            report['parent_metadata_deadline_elapsed_seconds'] = metadata_deadline - started
            report['elapsed_seconds'] = time.monotonic() - started
            report['limit_failure'] = report['stop_reason'] is not None
            if folder is not None:
                artifacts = {}
                for stream in streams:
                    os.fsync(stream.fileno()); stream.close()
                for name in ('stdout.log', 'stderr.log', 'observations.jsonl', 'phase.json'):
                    path = folder / name
                    if path.exists():
                        h = hashlib.sha256(); size = 0
                        with path.open('rb') as source:
                            for block in iter(lambda: source.read(1024 * 1024), b''):
                                h.update(block); size += len(block)
                        artifacts[name] = {'sha256': h.hexdigest(), 'bytes': size}
                report['artifacts'] = artifacts
                report['report_prepared_elapsed_seconds'] = time.monotonic() - started
                with (folder / '.process-report-staging').open('xb') as destination:
                    os.fchmod(destination.fileno(), 0o600)
                    destination.write(_json(report)); destination.flush(); os.fsync(destination.fileno())
                os.link(folder / '.process-report-staging', folder / 'process-report.json')
                (folder / '.process-report-staging').unlink()
                fd = os.open(folder, os.O_RDONLY | os.O_DIRECTORY)
                try: os.fsync(fd)
                finally: os.close(fd)
        except BaseException as closure_error:
            kill_owned('parent_closure_failed')
            if interrupted is not None:
                raise interrupted from closure_error
            raise
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)
            for stream in streams:
                if not stream.closed: stream.close()
    if interrupted is not None:
        raise interrupted
    return report
