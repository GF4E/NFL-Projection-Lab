import datetime as dt
import errno
import fcntl
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
from types import SimpleNamespace

from engine.projection.finals import refresh,resume_after_repair
from engine.projection.recovery import FinalFeedRecovery,POLICY,ownership

RAW=b'game_id,away_score,home_score,result,total\ng,13,20,7,33\n'

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.now=dt.datetime(2026,9,22,6,tzinfo=dt.timezone.utc)
        self.feed=self.root/'outputs/projection-v3/final-feed.json'
        self.folder=self.root/'outputs/projection-v3/operations'

    def call(self,at=None,fetch=lambda:RAW,owner='test'):
        return refresh(self.root,at or self.now,fetch,owner=owner)

    def offline(self):raise TimeoutError('fixture')

    def later(self,result):return dt.datetime.fromisoformat(result['next_attempt_at'])

    def test_transient_burst_is_bounded_then_one_probe_recovers(self):
        self.call();before=self.feed.read_bytes();at=self.now+dt.timedelta(seconds=61)
        ids=[]
        for n in range(3):
            result=self.call(at,self.offline);ids.append(result['operation_id'])
            self.assertEqual(result['attempts'],n+1)
            self.assertEqual(self.feed.read_bytes(),before)
            self.call(at,lambda:self.fail('backoff must suppress network'))
            at=self.later(result)
        self.assertEqual(len(set(ids)),1);self.assertEqual(result['state'],'STALE')
        recovered=self.call(at)
        self.assertEqual(recovered['recovery_state'],'HEALTHY')
        self.assertNotEqual(recovered['operation_id'],ids[0])
        self.assertEqual(json.loads(self.feed.read_bytes())['received_at'],at.isoformat())
        state=json.loads((self.folder/'final-feed.json').read_text())
        self.assertGreaterEqual(state['recovery_seconds'],600)
        self.assertTrue(list((self.folder/'history').glob('*.json')))

    def test_failed_probe_does_not_restart_a_three_request_burst(self):
        result=self.call(fetch=self.offline)
        for _ in range(2):result=self.call(self.later(result),self.offline)
        self.assertEqual(result['state'],'FAILED_CLOSED')
        probe_at=self.later(result);result=self.call(probe_at,self.offline)
        self.assertEqual(result['attempts'],1)
        self.assertEqual((self.later(result)-probe_at).total_seconds(),600)
        self.assertFalse(self.feed.exists())

    def test_schema_failure_latches_and_preserves_last_good(self):
        self.call();before=self.feed.read_bytes()
        result=self.call(self.now+dt.timedelta(seconds=61),lambda:b'not,a,valid,feed\n')
        self.assertEqual(result['state'],'FAILED_CLOSED');self.assertEqual(result['reason'],'SCHEMA')
        result=self.call(self.now+dt.timedelta(days=1),lambda:self.fail('hard failure must not retry'))
        self.assertEqual(result['action'],'RECONCILE_REQUIRED');self.assertEqual(self.feed.read_bytes(),before)

    def test_credential_failure_does_not_retry_on_next_poll(self):
        def forbidden():raise urllib.error.HTTPError('not-logged',403,'fixture',{},None)
        result=self.call(fetch=forbidden);self.assertEqual(result['reason'],'CREDENTIALS')
        self.call(self.now+dt.timedelta(hours=1),lambda:self.fail('credential retry forbidden'))

    def test_held_lock_never_expires_or_steals_work(self):
        with ownership(self.folder) as acquired:
            self.assertTrue(acquired)
            result=self.call(self.now+dt.timedelta(days=1),lambda:self.fail('locked worker'))
            self.assertEqual(result['state'],'LOCAL_JOB_ACTIVE')
        self.assertEqual(self.call()['state'],'REFRESHED')

    def test_owner_change_requires_fencing_reconciliation(self):
        self.call()
        result=self.call(self.now+dt.timedelta(hours=1),lambda:self.fail('wrong owner'),owner='other')
        self.assertEqual(result['state'],'FAILED_CLOSED');self.assertEqual(result['reason'],'OWNER_MISMATCH')

    def test_backward_clock_is_not_freshness(self):
        self.call()
        result=self.call(self.now-dt.timedelta(seconds=1),lambda:self.fail('clock invalid'))
        self.assertEqual(result['state'],'FAILED_CLOSED');self.assertEqual(result['reason'],'CLOCK_ROLLBACK')

    def test_lost_response_after_pointer_commit_reconciles_without_fetch(self):
        real=FinalFeedRecovery.success
        with patch.object(FinalFeedRecovery,'success',side_effect=OSError(errno.EIO,'lost response')):
            with self.assertRaises(OSError):self.call()
        before=self.feed.read_bytes();mtime=self.feed.stat().st_mtime_ns
        result=self.call(self.now+dt.timedelta(seconds=1),lambda:self.fail('must reconcile committed output'))
        self.assertTrue(result['reconciled']);self.assertEqual(result['recovery_state'],'HEALTHY')
        self.assertEqual(self.feed.read_bytes(),before);self.assertEqual(self.feed.stat().st_mtime_ns,mtime)

    def test_crash_after_intent_charges_attempt_and_waits(self):
        with ownership(self.folder):
            r=FinalFeedRecovery(self.folder,'test',self.now);decision=r.ready({})
            self.assertEqual(decision['attempts'],1)
        result=self.call(self.now+dt.timedelta(seconds=1),lambda:self.fail('must back off uncertain attempt'))
        self.assertEqual(result['recovery_state'],'DEGRADED');self.assertEqual(result['attempts'],1)
        self.assertEqual(self.call(self.later(result))['state'],'REFRESHED')

    def test_disk_failure_before_intent_prevents_network(self):
        with patch('engine.projection.recovery.save',side_effect=OSError(errno.ENOSPC,'full')):
            with self.assertRaises(OSError):self.call(fetch=lambda:self.fail('no durable attempt'))
        self.assertFalse(self.feed.exists())

    def test_committed_payload_change_fails_instead_of_false_recovery(self):
        with patch.object(FinalFeedRecovery,'success',side_effect=OSError('lost')):
            with self.assertRaises(OSError):self.call()
        value=json.loads(self.feed.read_text());value['games']['g']['home_score']=99;self.feed.write_text(json.dumps(value))
        result=self.call(self.now+dt.timedelta(seconds=1),lambda:self.fail('corrupt output'))
        self.assertEqual(result['state'],'FAILED_CLOSED');self.assertEqual(result['reason'],'LOCAL_IO')

    def test_deadline_prevents_another_burst_attempt(self):
        first=self.call(fetch=self.offline)
        result=self.call(self.now+dt.timedelta(seconds=POLICY['burst_seconds']),lambda:self.fail('expired burst'))
        self.assertEqual(result['state'],'FAILED_CLOSED');self.assertEqual(result['attempts'],1)

    def test_operator_repair_requires_valid_source_and_preserves_failure_evidence(self):
        self.call(fetch=lambda:b'invalid')
        path=self.folder/'final-feed.json';before=path.read_bytes()
        with self.assertRaises(ValueError):
            resume_after_repair(self.root,'SCHEMA_FIXED',self.now+dt.timedelta(seconds=1),lambda:b'still invalid',owner='test')
        self.assertEqual(path.read_bytes(),before)
        result=resume_after_repair(self.root,'SCHEMA_FIXED',self.now+dt.timedelta(seconds=2),lambda:RAW,owner='test')
        self.assertEqual(result['state'],'REPAIRED');self.assertEqual(result['recovery_state'],'HEALTHY')
        proof=json.loads((self.folder/'repairs'/f"{result['repair_sha256']}.json").read_text())
        self.assertTrue((self.folder/'history'/f"{proof['previous_state_sha256']}.json").exists())

    def test_repair_cannot_merge_a_corrupted_last_good(self):
        with patch.object(FinalFeedRecovery,'success',side_effect=OSError('lost')):
            with self.assertRaises(OSError):self.call()
        value=json.loads(self.feed.read_text());value['games']['g']['home_score']=99;self.feed.write_text(json.dumps(value))
        self.call(self.now+dt.timedelta(seconds=1),lambda:self.fail('no request on corruption'))
        with self.assertRaisesRegex(ValueError,'Restore'):
            resume_after_repair(self.root,'STORAGE_RESTORED',self.now+dt.timedelta(seconds=2),lambda:self.fail('restore first'),owner='test')

    def test_repair_cli_obeys_existing_scheduler_fence(self):
        from scripts import projection_final_repair as command
        from scripts import cloud_scheduler as scheduler
        with patch.object(scheduler,'OUT',self.root),patch.object(scheduler,'ownership',return_value={'state':'ACTIVE','owner':'other'}),patch.object(command,'resume_after_repair',side_effect=AssertionError('no repair without ownership')),patch.object(scheduler,'synchronize',side_effect=AssertionError('no sync without ownership')):
            self.assertEqual(command.run('this','SCHEMA_FIXED')['state'],'YIELD_TO_OWNER')

    def test_zero_available_inodes_prevents_fetch(self):
        with patch('engine.projection.recovery.os.statvfs',return_value=SimpleNamespace(f_bavail=100,f_frsize=4096,f_favail=0)):
            result=self.call(fetch=lambda:self.fail('inode exhaustion must prevent request'))
        self.assertEqual(result['state'],'FAILED_CLOSED');self.assertEqual(result['reason'],'LOCAL_IO')

    def test_server_retry_after_cannot_be_shortened_by_local_backoff(self):
        def limited():raise urllib.error.HTTPError('not-logged',429,'fixture',{'Retry-After':'1800'},None)
        result=self.call(fetch=limited)
        self.assertEqual(self.later(result),self.now+dt.timedelta(seconds=1800))
        self.call(self.now+dt.timedelta(seconds=600),lambda:self.fail('server delay not elapsed'))
        self.assertEqual(self.call(self.later(result))['state'],'REFRESHED')
