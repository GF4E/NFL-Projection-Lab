"""Bounded recovery for one free, idempotent public GET workflow.

This is not a retry wrapper for paid requests. The scheduler's committed owner
fence remains mandatory; the local lock prevents overlapping effects on a host.
"""
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path

from .storage import save,_directory

POLICY = {'schema':'public-final-recovery-v1','normal_poll_seconds':60,
          'max_attempts':3,'burst_seconds':120,'base_backoff_seconds':15,
          'probe_seconds':600,'public_read_only':True}
HARD_ERRORS = {'SCHEMA','CREDENTIALS','CONFIGURATION','CLOCK','LOCAL_IO','OWNER'}


class RecoveryBlocked(ValueError):
    def __init__(self,reason):
        self.reason=reason
        super().__init__(reason)


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def instant(value):
    value = dt.datetime.fromisoformat(value) if isinstance(value,str) else value
    if value.tzinfo is None:
        raise ValueError('Recovery timestamps must be timezone-aware')
    return value.astimezone(dt.timezone.utc)


@contextmanager
def ownership(folder):
    folder=Path(folder);_directory(folder)
    with (folder/'final-feed.lock').open('a+') as stream:
        try:
            fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(stream,fcntl.LOCK_UN)


class FinalFeedRecovery:
    def __init__(self,folder,owner,now):
        self.folder=Path(folder);self.path=self.folder/'final-feed.json'
        self.owner=owner;self.now=instant(now)
        if not owner:raise RecoveryBlocked('OWNER_REQUIRED')
        self.state=json.loads(self.path.read_text()) if self.path.exists() else {
            'schema':POLICY['schema'],'policy_sha256':digest(POLICY),'owner':owner,
            'state':'HEALTHY','attempts':0,'last_event_at':self.now.isoformat()}
        if self.state.get('policy_sha256')!=digest(POLICY) or self.state.get('schema')!=POLICY['schema']:
            raise RecoveryBlocked('POLICY_MISMATCH')
        if self.state.get('state') not in {'HEALTHY','DEGRADED','RECOVERING','STALE','FAILED_CLOSED'}:
            raise RecoveryBlocked('UNKNOWN_STATE')
        if self.state['owner']!=owner:raise RecoveryBlocked('OWNER_MISMATCH')
        if self.now<instant(self.state['last_event_at']):
            raise RecoveryBlocked('CLOCK_ROLLBACK')

    def persist(self,history=False):
        self.state['last_event_at']=self.now.isoformat()
        if history:
            save(self.folder/'history'/f'{digest(self.state)}.json',self.state,immutable=True)
        save(self.path,self.state)

    def view(self,action):
        return {'recovery_state':self.state['state'],'action':action,
                'operation_id':self.state.get('operation_id'),
                'attempts':self.state['attempts'],'reason':self.state.get('reason'),
                'next_attempt_at':self.state.get('next_attempt_at'),
                'deadline':self.state.get('deadline'),'owner':self.owner}

    def ready(self,feed):
        """Return FETCH only after durable intent; callers must reconcile first."""
        if self.state.get('latched'):
            return self.view('RECONCILE_REQUIRED')
        if feed:
            received=instant(feed['received_at'])
            if received>self.now:
                return self.fail('CLOCK',bool(feed))
            if (self.now-received).total_seconds()<POLICY['normal_poll_seconds'] and self.state['state']=='HEALTHY':
                return self.view('FRESH')
        next_at=self.state.get('next_attempt_at')
        if next_at and self.now<instant(next_at):
            return self.view('WAIT')
        if self.state['state']=='RECOVERING':
            # A prior invocation ended while an attempt was in flight. The caller
            # has checked the output before reaching here; charge the attempt.
            return self.fail('NETWORK',bool(feed),exhausted=self.state['attempts']>=POLICY['max_attempts'] or self.now>=instant(self.state['deadline']))
        if self.state['state']=='DEGRADED' and self.now>=instant(self.state['deadline']):
            return self.fail('NETWORK',bool(feed),exhausted=True)
        probe=self.state['state'] in ('STALE','FAILED_CLOSED')
        if self.state['state']=='HEALTHY' or probe:
            self.state.update(operation_id=digest({'source':'nflverse-finals','owner':self.owner,
                              'started_at':self.now.isoformat(),'policy':digest(POLICY)}),
                              attempts=0,started_at=self.now.isoformat(),
                              deadline=(self.now+dt.timedelta(seconds=POLICY['burst_seconds'])).isoformat(),
                              probe=probe)
        self.state.update(state='RECOVERING',attempts=self.state['attempts']+1,
                          next_attempt_at=None,reason=None)
        resources=os.statvfs(self.folder)
        self.state['resources']={'free_bytes':resources.f_bavail*resources.f_frsize,
                                 'free_inodes':resources.f_favail,
                                 'measured_at':self.now.isoformat(),
                                 'scope':'Current free resources, not a proven job-headroom reserve'}
        if resources.f_bavail==0 or resources.f_favail==0:
            return self.fail('LOCAL_IO',bool(feed))
        self.persist()
        return self.view('FETCH')

    def fail(self,reason,has_last_good,exhausted=False,retry_after=None):
        if reason not in HARD_ERRORS|{'NETWORK'}:raise ValueError('Unknown recovery failure')
        hard=reason in HARD_ERRORS
        retry_after=instant(retry_after) if retry_after else None
        expired=exhausted or self.state.get('probe') or self.state['attempts']>=POLICY['max_attempts'] or (self.state.get('deadline') and (self.now>=instant(self.state['deadline']) or retry_after and retry_after>=instant(self.state['deadline'])))
        if hard:
            self.state.update(state='FAILED_CLOSED',latched=True,next_attempt_at=None)
        elif expired:
            self.state.update(state='STALE' if has_last_good else 'FAILED_CLOSED',
                              next_attempt_at=(self.now+dt.timedelta(seconds=POLICY['probe_seconds'])).isoformat())
        else:
            n=self.state['attempts'];seed=digest({'id':self.state.get('operation_id'),'attempt':n})
            jitter=int(seed[:8],16)/0xffffffff*POLICY['base_backoff_seconds']
            delay=POLICY['base_backoff_seconds']*2**max(0,n-1)+jitter
            self.state.update(state='DEGRADED',next_attempt_at=(self.now+dt.timedelta(seconds=delay)).isoformat())
        if not hard and retry_after:
            self.state['next_attempt_at']=max(instant(self.state['next_attempt_at']),retry_after).isoformat()
            self.state['server_retry_at']=retry_after.isoformat()
        self.state['reason']=reason
        self.state.setdefault('incident_started_at',self.state.get('started_at',self.now.isoformat()))
        self.persist(history=True)
        return self.view('RECONCILE_REQUIRED' if hard else 'WAIT')

    def success(self,feed,reconciled=False):
        if self.state.get('latched'):raise ValueError('A latched failure cannot clear itself')
        if feed.get('refresh_operation_id')!=self.state.get('operation_id'):
            raise ValueError('Committed feed belongs to a different operation')
        if digest(feed)!=self.state.get('expected_feed_sha256'):
            raise ValueError('Committed feed differs from the saved intent')
        received=instant(feed['received_at'])
        if received>self.now or received<instant(self.state['started_at']):
            raise ValueError('Committed feed has invalid retrieval chronology')
        recovering=self.state['attempts']>1 or self.state.get('probe') or self.state.get('reason') or reconciled
        self.state.update(state='HEALTHY',attempts=0,reason=None,next_attempt_at=None,
                          last_success_at=received.isoformat(),source_sha256=feed['source_sha256'],
                          reconciled=bool(reconciled),probe=False,
                          deadline_missed=received>instant(self.state['deadline']),
                          recovery_seconds=(self.now-instant(self.state.get('incident_started_at',self.state['started_at']))).total_seconds())
        self.state.pop('incident_started_at',None)
        self.persist(history=bool(recovering))
        return self.view('COMMITTED')

    def output_intent(self,feed):
        if feed.get('refresh_operation_id')!=self.state.get('operation_id'):
            raise ValueError('Output operation changed')
        self.state['expected_feed_sha256']=digest(feed)
        self.persist()
