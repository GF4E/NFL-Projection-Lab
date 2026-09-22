"""Independent, football-only final score feed with last-good retry semantics."""
import csv
import datetime as dt
from email.utils import parsedate_to_datetime
import hashlib
import io
import json
import math
import os
from pathlib import Path
import socket
import urllib.error
import urllib.request

URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'


def _retry_after(headers,now):
    value=headers.get('Retry-After') if headers else None
    if not value:return None
    try:
        value=value.strip()
        if value.isascii() and value.isdigit():return now+dt.timedelta(seconds=int(value))
        when=parsedate_to_datetime(value)
        return max(now,when.astimezone(dt.timezone.utc)) if when.tzinfo else None
    except OverflowError:
        return dt.datetime.max.replace(tzinfo=dt.timezone.utc)
    except (ValueError,TypeError):
        return None


def parse(raw):
    finals = {}
    for r in csv.DictReader(io.StringIO(raw.decode())):
        try:
            a, h = float(r['away_score']), float(r['home_score'])
            if not all(math.isfinite(x) and x >= 0 and x.is_integer() for x in (a,h)):
                continue
            if float(r['result']) != h-a or float(r['total']) != h+a:
                continue
            finals[r['game_id']] = {'away_score':a, 'home_score':h}
        except (KeyError, ValueError, TypeError):
            continue
    if not finals:
        raise ValueError('No validated finals')
    return finals


def _verified_source(root, feed):
    from engine.projection.source_archive import read_source
    return read_source(root,feed)


def _commit_feed(root,recovery,old,raw,finals):
    from engine.projection.storage import save
    from engine.projection.source_archive import store_source
    sha=hashlib.sha256(raw).hexdigest()
    source_ref=store_source(root,raw)
    value={'received_at':recovery.now.isoformat(),'source_sha256':sha,'source_ref':source_ref,
           'games':{**old.get('games',{}),**finals},
           'refresh_operation_id':recovery.state['operation_id']}
    recovery.output_intent(value)
    save(root/'outputs/projection-v3/final-feed.json',value)
    return recovery.success(value)


def refresh(root, now=None, fetch=None, owner=None):
    """Bounded public GETs; never applies to paid/mutating provider requests."""
    from engine.projection.recovery import FinalFeedRecovery,RecoveryBlocked,ownership,digest
    root=Path(root); fixed_time=now is not None; now=now or dt.datetime.now(dt.timezone.utc)
    owner=owner or f'{socket.gethostname()}:{os.getuid()}'
    path=root/'outputs/projection-v3/final-feed.json'
    folder=root/'outputs/projection-v3/operations'
    with ownership(folder) as acquired:
        if not acquired:return {'state':'LOCAL_JOB_ACTIVE','recovery_state':'DEGRADED'}
        try:recovery=FinalFeedRecovery(folder,owner,now)
        except RecoveryBlocked as error:
            return {'state':'FAILED_CLOSED','recovery_state':'FAILED_CLOSED',
                    'reason':error.reason,'action':'RECONCILE_REQUIRED'}
        old=json.loads(path.read_text()) if path.exists() else {}
        if old:
            try:
                _verified_source(root,old)
                if old.get('refresh_operation_id')==recovery.state.get('operation_id') and old.get('refresh_operation_id'):
                    if digest(old)!=recovery.state.get('expected_feed_sha256'):
                        raise ValueError('Final feed differs from saved intent')
                    if recovery.state['state']=='RECOVERING' and not recovery.state.get('latched'):
                        status=recovery.success(old,reconciled=True)
                        return {'state':'REFRESHED','reconciled':True,**status}
            except (OSError,ValueError,KeyError):
                return {'state':'FAILED_CLOSED',**recovery.fail('LOCAL_IO',False)}
        decision=recovery.ready(old)
        if decision['action']!='FETCH':
            state='FRESH' if decision['action']=='FRESH' else decision['recovery_state']
            return {'state':state,'last_good':old.get('received_at'),**decision}
        try:
            raw=fetch() if fetch else urllib.request.urlopen(URL,timeout=8).read()
        except urllib.error.HTTPError as error:
            recovery.now=now if fixed_time else dt.datetime.now(dt.timezone.utc)
            kind='CREDENTIALS' if error.code in (401,403) else 'NETWORK' if error.code==429 or error.code>=500 else 'CONFIGURATION'
            status=recovery.fail(kind,bool(old),retry_after=_retry_after(error.headers,recovery.now))
            return {'state':'RETRY_NEXT_TICK' if status['recovery_state']=='DEGRADED' else status['recovery_state'],'last_good':old.get('received_at'),**status}
        except (OSError,TimeoutError):
            recovery.now=now if fixed_time else dt.datetime.now(dt.timezone.utc)
            status=recovery.fail('NETWORK',bool(old))
            return {'state':'RETRY_NEXT_TICK' if status['recovery_state']=='DEGRADED' else status['recovery_state'],'last_good':old.get('received_at'),**status}
        try:
            finals=parse(raw)
        except (ValueError,UnicodeError):
            recovery.now=now if fixed_time else dt.datetime.now(dt.timezone.utc)
            return {'state':'FAILED_CLOSED',**recovery.fail('SCHEMA',bool(old))}
        recovery.now=now if fixed_time else dt.datetime.now(dt.timezone.utc)
        # An uncertain commit is reconciled on the next invocation before GET.
        status=_commit_feed(root,recovery,old,raw,finals)
        return {'state':'REFRESHED','finals':len(finals),**status}


def resume_after_repair(root,reason,now=None,fetch=None,owner=None):
    """Explicit operator repair after the CLI verifies the scheduler owner fence.

    A fresh source is fetched, parsed and durably stored before clearing a latch.
    Ownership/policy/clock conflicts are not automatically repaired here.
    """
    from engine.projection.recovery import FinalFeedRecovery,ownership,digest,POLICY
    from engine.projection.storage import save,write_bytes
    if reason not in {'SCHEMA_FIXED','ACCESS_RESTORED','STORAGE_RESTORED'}:
        raise ValueError('Named repair reason required')
    root=Path(root);fixed_time=now is not None;now=now or dt.datetime.now(dt.timezone.utc)
    owner=owner or f'{socket.gethostname()}:{os.getuid()}'
    folder=root/'outputs/projection-v3/operations'
    with ownership(folder) as acquired:
        if not acquired:return {'state':'LOCAL_JOB_ACTIVE'}
        recovery=FinalFeedRecovery(folder,owner,now)
        if not recovery.state.get('latched'):return {'state':'REPAIR_NOT_REQUIRED'}
        previous=digest(recovery.state)
        path=root/'outputs/projection-v3/final-feed.json'
        old=json.loads(path.read_text()) if path.exists() else {}
        if old:
            _verified_source(root,old)
            if old.get('refresh_operation_id')==recovery.state.get('operation_id') and digest(old)!=recovery.state.get('expected_feed_sha256'):
                raise ValueError('Restore the verified last-good feed before resuming')
        raw=fetch() if fetch else urllib.request.urlopen(URL,timeout=8).read()
        finals=parse(raw)  # Failure leaves the existing latch untouched.
        recovery.now=now if fixed_time else dt.datetime.now(dt.timezone.utc)
        sha=hashlib.sha256(raw).hexdigest()
        from engine.projection.source_archive import store_source
        store_source(root,raw)
        proof={'previous_state_sha256':previous,'reason':reason,'owner':owner,
               'validated_at':recovery.now.isoformat(),'source_sha256':sha,
               'source_rows':len(finals),'validation':'parsed public finals; durable source write'}
        proof_sha=digest(proof)
        save(folder/'repairs'/f'{proof_sha}.json',proof,immutable=True)
        # Preserve the old state itself, not only its hash, in the repair record.
        save(folder/'history'/f'{previous}.json',recovery.state,immutable=True)
        recovery.state.update(state='RECOVERING',latched=False,attempts=1,probe=False,
                              operation_id=digest({'repair':proof_sha}),started_at=recovery.now.isoformat(),
                              deadline=(recovery.now+dt.timedelta(seconds=POLICY['burst_seconds'])).isoformat(),
                              next_attempt_at=None,repair_sha256=proof_sha)
        status=_commit_feed(root,recovery,old,raw,finals)
        return {'state':'REPAIRED','repair_sha256':proof_sha,**status}


def grade_once(card, path, result, root=None):
    from engine.projection_v3.card import finish
    from scripts.projection_publish import save
    from engine.projection.bundle import verify_card
    root=Path(root) if root is not None else Path(__file__).resolve().parents[2]
    verify_card(root,card)
    path=Path(path)
    if path.exists():
        existing=json.loads(path.read_text()); verify_card(root,existing); return existing
    if card.get('grades') or not result or not card.get('projection'): return card
    if card.get('cutoff_forecast_ref') and card['status']!='LOCKED':
        raise ValueError('Cutoff forecast must lock before first grade')
    graded=finish(card,result['away_score'],result['home_score'])
    save(path,graded,True)
    return graded
