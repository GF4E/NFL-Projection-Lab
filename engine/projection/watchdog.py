"""Read-only operational assessment. No dispatch, fitting, takeover, or repair.

These metrics describe observed artifacts. A logical freeze timestamp cannot
establish the physical commit time, nor can latest retrieval establish the first
time an individual final became available.
"""
import datetime as dt
import hashlib
import json
import math

UTC = dt.timezone.utc
POLICY = {
    'schema': 'projection-watchdog-v1', 'season': 2026,
    'poll_seconds': 60, 'heartbeat_seconds': 180,
    'transient_seconds': 60, 'publication_lag_seconds': 840,
    'final_feed_age_seconds': 900,
    'actions': ['OBSERVE', 'RECORD', 'NOTIFY'],
}


def stamp(value):
    t = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if t.tzinfo is None:
        raise ValueError('Aware observation time required')
    return t.astimezone(UTC)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     allow_nan=False).encode()).hexdigest()


def issue(code, delay=0, **details):
    return {'code': code, 'delay_seconds': delay, 'details': details}


def board_identity(board):
    if not isinstance(board, dict) or board.get('schema') != 'projection-board-v1':
        raise ValueError('Unknown board schema')
    stamp(board['published_at'])
    games = board['games']
    if not isinstance(games, list) or not games or len({g['game_id'] for g in games}) != len(games):
        raise ValueError('Missing or duplicate games')
    calculated = digest({k: v for k, v in board.items() if k != 'content_sha256'})
    if calculated != board['content_sha256']:
        raise ValueError('Board digest mismatch')
    return {'content_sha256': calculated, 'published_at': board['published_at'],
            'games': len(games)}


def valid_points(card):
    p = card.get('projection') or {}
    return all(isinstance(p.get(k), (int, float)) and not isinstance(p[k], bool)
               and math.isfinite(p[k]) for k in ('home_points', 'away_points', 'margin', 'total'))


def assess_source(board, schedule, finals, lock_matches, now, epoch, issuance_evidence=None):
    """Schedule, not existing board rows, supplies the denominator."""
    identity = board_identity(board)
    if stamp(identity['published_at']) > now:
        raise ValueError('Future publication')
    games = {g['game_id']: g for g in board['games']}
    due = [g for g in schedule if stamp(g['cutoff_at']) <= now]
    counts = {'eligible_due_games': len(due), 'valid_pregame_forecasts': 0,
              'matched_frozen_records': 0, 'retrospective_games': 0,
              'missing_or_invalid_pregame_games': 0, 'finals_available': 0,
              'finals_graded': 0, 'grade_latency_unknown_first_seen': 0}
    misses, missing_locks, ungraded, conflicts = [], [], [], []
    all_misses = []
    issuance_evidence = issuance_evidence or {}
    on_time, unknown_issuance, failed_issuance, bad_receipts = [], [], [], []
    for scheduled in due:
        gid = scheduled['game_id']; card = games.get(gid) or {}
        cutoff = stamp(scheduled['cutoff_at'])
        try:
            valid = (card.get('evidence') == 'AS_ISSUED' and valid_points(card)
                     and stamp(card['issued_at']) < cutoff)
        except (KeyError, TypeError, ValueError):
            valid = False
        receipt = issuance_evidence.get(gid, {})
        receipt_valid = False
        if receipt.get('state') == 'VERIFIED':
            try:
                committed = stamp(receipt['committed_at'])
                receipt_valid = (stamp(card['issued_at']) <= committed < cutoff
                                 and committed <= now
                                 and receipt['forecast_bundle_ref'] == card['forecast_bundle_ref'])
            except (KeyError, TypeError, ValueError):
                pass
        new_contract = any(k in card for k in ('cutoff_forecast_ref', 'forecast_role'))
        if valid and receipt_valid and new_contract:
            on_time.append(gid)
        elif valid and not new_contract and receipt.get('state') in (None, 'LEGACY_NOT_RECORDED'):
            unknown_issuance.append(gid)
        else:
            failed_issuance.append(gid)
        if new_contract and not receipt_valid:
            bad_receipts.append(gid)
        counts['valid_pregame_forecasts'] += int(valid)
        counts['retrospective_games'] += int(card.get('evidence') == 'RETROSPECTIVE')
        counts['missing_or_invalid_pregame_games'] += int(not valid)
        if not valid:
            all_misses.append(gid)
            if card.get('evidence') != 'RETROSPECTIVE':
                misses.append(gid)
        frozen = bool(lock_matches.get(gid))
        counts['matched_frozen_records'] += int(frozen)
        if valid and not frozen:
            missing_locks.append(gid)
        if gid in finals:
            counts['finals_available'] += 1
            counts['grade_latency_unknown_first_seen'] += 1
            graded = card.get('status') == 'FINAL' and bool(card.get('grades'))
            counts['finals_graded'] += int(graded)
            if not graded:
                ungraded.append(gid)
            elif (card.get('final', {}).get('home_points') != finals[gid]['home_score']
                  or card.get('final', {}).get('away_points') != finals[gid]['away_score']):
                conflicts.append(gid)
    findings = []
    if misses:
        findings.append(issue('MISSING_PREGAME_FORECAST', games=sorted(misses)))
    if missing_locks:
        findings.append(issue('LOCK_NOT_VERIFIED', games=sorted(missing_locks)))
    if ungraded:
        findings.append(issue('FINAL_NOT_PUBLISHED', POLICY['publication_lag_seconds'], games=sorted(ungraded)))
    if conflicts:
        findings.append(issue('FINAL_SOURCE_CONFLICT', games=sorted(conflicts)))
    counts['all_missing_or_invalid_game_ids'] = sorted(all_misses)
    if bad_receipts:
        findings.append(issue('ISSUANCE_RECEIPT_UNVERIFIED', games=sorted(bad_receipts)))
    counts['on_time_committed_issuance'] = {
        'definition': 'Valid local forecast bundle durably committed strictly before T-75; public delivery measured separately',
        'state': 'PARTIAL' if unknown_issuance else ('MEASURED' if due else 'NO_DUE_GAMES'),
        'eligible_due_games': len(due), 'verified_on_time_games': len(on_time),
        'unknown_games': len(unknown_issuance), 'failed_games': len(failed_issuance),
        'rate': len(on_time)/len(due) if due and not unknown_issuance else None,
        'verified_game_ids': sorted(on_time), 'unknown_game_ids': sorted(unknown_issuance),
        'failed_game_ids': sorted(failed_issuance),
    }
    counts['grade_latency'] = 'UNKNOWN: first verified availability per game not recorded'
    counts['scope'] = 'All due games in the pinned current-season schedule; retrospective included in denominator'
    return {'identity': identity, 'metrics': counts, 'findings': findings}


def assess_host(snapshot, external, now):
    findings = list(snapshot.get('source', {}).get('findings', []))
    if snapshot.get('source_error'):
        findings.append(issue('SOURCE_UNVERIFIED', error=snapshot['source_error']))
    disk = snapshot['storage']
    if disk['free_bytes'] <= 0 or disk['free_inodes'] <= 0:
        findings.append(issue('STORAGE_EXHAUSTED'))
    # No percentage invented here: the unresolved capacity plan is explicit.
    if not disk.get('headroom_qualified', False):
        findings.append(issue('STORAGE_HEADROOM_UNQUALIFIED'))
    if snapshot.get('storage_measurement',{}).get('state')=='FAILED':
        findings.append(issue('STORAGE_MEASUREMENT_FAILED'))
    if snapshot.get('prospective',{}).get('state') in ('DEGRADED','UNOBSERVED','UNVERIFIED'):
        findings.append(issue('PROSPECTIVE_COLLECTOR_'+snapshot['prospective']['state']))
    capture = snapshot['services'].get('nfl-engine-capture.service', {})
    if snapshot['services'].get('nfl-engine-capture.timer', {}).get('ActiveState') != 'active':
        findings.append(issue('CAPTURE_TIMER_INACTIVE'))
    if capture.get('Result') not in ('success', None, ''):
        findings.append(issue('CAPTURE_RUN_FAILED', POLICY['transient_seconds']))
    cutoff = snapshot.get('cutoff_state', {})
    if cutoff.get('state') in {'FAILED_CLOSED','OVERDUE','ACKNOWLEDGMENT_MISSING','INPUTS_INCOMPLETE','UNVERIFIED'}:
        findings.append(issue('CUTOFF_STATE_'+cutoff['state'], **{k:v for k,v in cutoff.items() if k not in ('state','mode')}))
    if cutoff.get('state') not in (None,'NOT_CONFIGURED') and snapshot['services'].get('nfl-cutoff-state.timer',{}).get('ActiveState')!='active':
        findings.append(issue('CUTOFF_TIMER_INACTIVE'))
    if cutoff.get('state')=='NOT_CONFIGURED' and snapshot['services'].get('nfl-cutoff-state.timer',{}).get('ActiveState')=='active':
        findings.append(issue('CUTOFF_WORKER_UNCONFIGURED'))
    # Timer ticks can look alive while the reader never completes useful work.
    recovery = snapshot.get('final_reader') or {}
    if recovery.get('state') == 'FAILED_CLOSED':
        findings.append(issue('FINAL_READER_FAILED_CLOSED'))
    try:
        age = (now - stamp(recovery['last_success_at'])).total_seconds()
        if age < 0:
            findings.append(issue('CLOCK_INVALID'))
        elif age > POLICY['final_feed_age_seconds']:
            findings.append(issue('FINAL_READER_STALE'))
    except (KeyError, ValueError, TypeError):
        findings.append(issue('FINAL_READER_UNOBSERVED', POLICY['transient_seconds']))
    if not external:
        if (now-stamp(snapshot['epoch'])).total_seconds() > POLICY['heartbeat_seconds']:
            findings.append(issue('OUTSIDE_OBSERVER_MISSING'))
    else:
        age = (now-stamp(external['received_at'])).total_seconds()
        if age < 0:
            findings.append(issue('CLOCK_INVALID'))
        elif age > POLICY['heartbeat_seconds']:
            findings.append(issue('OUTSIDE_OBSERVER_MISSING'))
    return findings


def assess_outside(host, public, now):
    findings = []
    if not host:
        findings.append(issue('HOST_OBSERVER_UNREACHABLE'))
    else:
        age = (now-stamp(host['checked_at'])).total_seconds()
        if age < -30:
            findings.append(issue('CLOCK_INVALID'))
        elif age > POLICY['heartbeat_seconds']:
            findings.append(issue('HOST_OBSERVER_STALE'))
        # Copy qualified active findings, not each transient raw sample.
        findings.extend(issue(x['code'], **x['details']) for x in host['assessment']['active'])
    if public.get('state') != 'VERIFIED':
        findings.append(issue('PUBLIC_'+public['state']))
    elif host and host.get('source', {}).get('identity'):
        a, b = host['source']['identity'], public['identity']
        if stamp(b['published_at']) > now:
            findings.append(issue('PUBLIC_CLOCK_INVALID'))
        elif a['content_sha256'] != b['content_sha256']:
            lag = (stamp(a['published_at'])-stamp(b['published_at'])).total_seconds()
            if lag == 0:
                findings.append(issue('PUBLIC_CONTENT_MISMATCH'))
            elif lag > POLICY['publication_lag_seconds']:
                findings.append(issue('PUBLIC_STALE'))
    return findings


def transition(previous, findings, now):
    """Stable incident IDs, persisted first-seen times; no repeated unchanged alarm."""
    previous = previous or {}
    if previous.get('checked_at') and stamp(previous['checked_at']) > now:
        findings = [issue('CLOCK_INVALID')]
    prior = previous.get('assessment', {})
    pending = {}
    for finding in findings:
        # New affected games are new incidents; a changing timestamp/free-byte
        # sample never resets the duration of a persistent condition.
        key = finding['code']
        pending[key] = {**finding, 'first_seen': prior.get('pending', {}).get(key, {}).get('first_seen', now.isoformat())}
    active = [x for x in pending.values()
              if (now-stamp(x['first_seen'])).total_seconds() >= x['delay_seconds']]
    active.sort(key=lambda x: (x['code'], digest(x['details'])))
    fingerprint = digest([{'code': x['code'], 'details': x['details']} for x in active])
    before = prior.get('fingerprint', digest([]))
    return {'pending': pending, 'active': active, 'fingerprint': fingerprint,
            'changed': fingerprint != before, 'state': 'DEGRADED' if active else 'HEALTHY',
            'recovered_codes': sorted({x['code'] for x in prior.get('active', [])}-{x['code'] for x in active})}


def notification_transition(previous, active, now, *, complete=True):
    """Latch each incident until 15 minutes of observed recovery; no flap spam.

    Health assessments and event logs remain immediate. An unavailable observer
    cannot prove recovery. New codes or newly affected games still notify.
    """
    prior=(previous or {}).get('incidents',{})
    observed_gap=(now-stamp(previous['checked_at'])).total_seconds() if previous and previous.get('checked_at') else 0
    current={digest({'code':x['code'],'details':x['details']}):x for x in active}
    retained={};new=[];recovered=[]
    for key,item in current.items():
        retained[key]={'code':item['code'],'details':item['details'],'clear_since':None}
        if key not in prior:new.append({'code':item['code'],'details':item['details']})
    for key,item in prior.items():
        if key in current:continue
        since=item.get('clear_since') if complete and 0<=observed_gap<=POLICY['heartbeat_seconds'] else None
        if complete and since and (now-stamp(since)).total_seconds()>=900:
            recovered.append(item['code'])
        else:
            retained[key]={**item,'clear_since':(since or now.isoformat()) if complete else None}
    recovered=[code for code in recovered if not any(x['code']==code for x in retained.values())]
    return {'schema':'watchdog-notification-latch-v1','checked_at':now.isoformat(),
            'incidents':retained,'new':new,'recovered_codes':sorted(set(recovered)),
            'notify':bool(new or recovered)}
