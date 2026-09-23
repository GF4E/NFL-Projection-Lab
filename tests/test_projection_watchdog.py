import copy
import datetime as dt
import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

from engine.projection.watchdog import (UTC, POLICY, digest, board_identity, assess_source,
                                       assess_host, assess_outside, transition, issue, notification_transition)
from scripts import projection_watchdog as runner


NOW = dt.datetime(2026, 9, 22, 6, 40, tzinfo=UTC)


def board():
    b = {'schema': 'projection-board-v1', 'published_at': NOW.isoformat(),
         'games': [{'game_id': '2026_02_A_B', 'evidence': 'AS_ISSUED', 'status': 'LOCKED',
                    'issued_at': (NOW-dt.timedelta(hours=3)).isoformat(),
                    'projection': {'home_points': 24., 'away_points': 21., 'margin': 3., 'total': 45.}}]}
    b['content_sha256'] = digest(b)
    return b


def host():
    return {'schema': POLICY['schema'], 'policy_sha256': digest(POLICY),
            'epoch': (NOW-dt.timedelta(hours=1)).isoformat(), 'checked_at': NOW.isoformat(),
            'services': {'nfl-engine-capture.service': {'Result': 'success'},
                         'nfl-engine-capture.timer': {'ActiveState': 'active'}},
            'storage': {'free_bytes': 1000, 'free_inodes': 100, 'headroom_qualified': True},
            'final_reader': {'state': 'HEALTHY', 'last_success_at': NOW.isoformat()},
            'source': {'identity': board_identity(board()), 'findings': []},
            'assessment': transition(None, [], NOW)}


class WatchdogTests(unittest.TestCase):
    def test_capture_flapping_does_not_repeat_persistent_storage_alert(self):
        storage=issue('STORAGE_EXHAUSTED');capture=issue('CAPTURE_RUN_FAILED')
        notice=notification_transition(None,[storage,capture],NOW)
        self.assertTrue(notice['notify'])
        for minute in range(1,61):
            active=[storage]+([capture] if minute%2 else [])
            notice=notification_transition(notice,active,NOW+dt.timedelta(minutes=minute))
            self.assertFalse(notice['notify'])

    def test_new_fault_and_new_affected_games_still_notify(self):
        notice=notification_transition(None,[issue('LOCK_NOT_VERIFIED',games=['a'])],NOW)
        notice=notification_transition(notice,[issue('LOCK_NOT_VERIFIED',games=['a','b'])],NOW+dt.timedelta(minutes=1))
        self.assertTrue(notice['notify']);self.assertEqual(notice['new'][0]['details']['games'],['a','b'])

    def test_recovery_requires_continuous_observation_then_new_failure_alerts(self):
        fault=issue('STORAGE_EXHAUSTED');notice=notification_transition(None,[fault],NOW)
        notice=notification_transition(notice,[],NOW+dt.timedelta(minutes=1))
        self.assertFalse(notice['notify'])
        notice=notification_transition(notice,[],NOW+dt.timedelta(minutes=20),complete=False)
        self.assertFalse(notice['notify'])
        notice=notification_transition(notice,[],NOW+dt.timedelta(minutes=21))
        self.assertFalse(notice['notify'])
        for minute in range(22,37):notice=notification_transition(notice,[],NOW+dt.timedelta(minutes=minute))
        self.assertEqual(notice['recovered_codes'],['STORAGE_EXHAUSTED'])
        notice=notification_transition(notice,[fault],NOW+dt.timedelta(minutes=37))
        self.assertTrue(notice['notify'])

    def test_sleep_gap_does_not_count_as_observed_recovery(self):
        notice=notification_transition(None,[issue('CAPTURE_RUN_FAILED')],NOW)
        notice=notification_transition(notice,[],NOW+dt.timedelta(minutes=1))
        notice=notification_transition(notice,[],NOW+dt.timedelta(hours=2))
        self.assertFalse(notice['notify'])

    def test_changed_game_list_does_not_claim_same_code_recovered(self):
        notice=notification_transition(None,[issue('LOCK_NOT_VERIFIED',games=['a'])],NOW)
        for minute in range(1,18):
            notice=notification_transition(notice,[issue('LOCK_NOT_VERIFIED',games=['a','b'])],NOW+dt.timedelta(minutes=minute))
        self.assertEqual(notice['recovered_codes'],[])

    def test_outside_runner_migrates_existing_alert_without_another_popup(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory);h=host();h['assessment']=transition(None,[issue('STORAGE_EXHAUSTED')],NOW)
            prior={'checked_at':NOW.isoformat(),'assessment':transition(None,[issue('STORAGE_EXHAUSTED'),issue('PUBLIC_ACCESS_UNQUALIFIED')],NOW)}
            (folder/'outside.json').write_text(json.dumps(prior))
            (folder/'notification.json').write_text(json.dumps({'result':'SUBMITTED_NOT_READ_RECEIPT'}))
            with patch.object(runner,'remote',return_value=h),patch.object(runner,'public_probe',return_value={'state':'ACCESS_UNQUALIFIED'}),patch.object(runner,'notify') as notify:
                runner.outside_once(folder,now=NOW+dt.timedelta(seconds=30))
                notify.assert_not_called()
            self.assertTrue((folder/'notification-state.json').exists())

    def test_source_snapshot_verifies_chain_without_writing_source_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); out=root/'outputs/projection-v3'; out.mkdir(parents=True)
            work=root/'work/projection-v1'; work.mkdir(parents=True)
            b=board(); (out/'board.json').write_text(json.dumps(b))
            schedule=[{'game_id':'2026_02_A_B','season':'2026','game_type':'REG','gameday':'2026-09-21','gametime':'20:00'}]
            raw=json.dumps(schedule).encode(); (work/'schedule.json').write_bytes(raw)
            (work/'source-manifest.json').write_text(json.dumps({'schedule':{'path':'work/projection-v1/schedule.json','sha256':hashlib.sha256(raw).hexdigest()}}))
            raw=b'qualified fixture final source'; sha=hashlib.sha256(raw).hexdigest()
            (out/'final-sources').mkdir(); (out/'final-sources'/f'{sha}.csv').write_bytes(raw)
            feed={'received_at':NOW.isoformat(),'source_sha256':sha,'games':{},'refresh_operation_id':'op'}
            (out/'final-feed.json').write_text(json.dumps(feed)); (out/'operations').mkdir()
            op={'state':'HEALTHY','operation_id':'op','expected_feed_sha256':digest(feed)}
            (out/'operations/final-feed.json').write_text(json.dumps(op))
            before={str(p):p.read_bytes() for p in root.rglob('*') if p.is_file()}
            r=runner.source_snapshot(root,NOW,NOW)
            self.assertEqual(r['final_commit_receipt'],'VERIFIED')
            self.assertEqual(before,{str(p):p.read_bytes() for p in root.rglob('*') if p.is_file()})
            feed['games']={'2026_02_A_B':{'home_score':1,'away_score':2}}
            (out/'final-feed.json').write_text(json.dumps(feed))
            with self.assertRaises(ValueError): runner.source_snapshot(root,NOW,NOW)

    def test_schedule_denominator_includes_absent_and_retrospective_rows(self):
        b = board(); b['games'][0]['evidence'] = 'RETROSPECTIVE'
        b['content_sha256'] = digest({k:v for k,v in b.items() if k != 'content_sha256'})
        schedule = [{'game_id': gid, 'cutoff_at': NOW.isoformat()} for gid in ['2026_02_A_B', '2026_02_C_D']]
        r = assess_source(b, schedule, {}, {}, NOW, NOW)
        self.assertEqual(r['metrics']['eligible_due_games'], 2)
        self.assertEqual(r['metrics']['missing_or_invalid_pregame_games'], 2)
        self.assertEqual(r['metrics']['retrospective_games'], 1)
        self.assertEqual(r['findings'][0]['details']['games'], ['2026_02_C_D'])

    def test_reboot_epoch_cannot_hide_missed_lock(self):
        r = assess_source(board(), [{'game_id':'2026_02_A_B','cutoff_at':(NOW-dt.timedelta(hours=1)).isoformat()}], {}, {}, NOW, NOW)
        self.assertEqual([x['code'] for x in r['findings']], ['LOCK_NOT_VERIFIED'])

    def test_equal_deadline_is_not_pregame_and_first_seen_is_unknown(self):
        b = board(); b['games'][0]['issued_at'] = NOW.isoformat()
        b['content_sha256'] = digest({k:v for k,v in b.items() if k != 'content_sha256'})
        r = assess_source(b, [{'game_id':'2026_02_A_B','cutoff_at':NOW.isoformat()}],
                          {'2026_02_A_B':{'home_score':24,'away_score':21}}, {}, NOW, NOW)
        self.assertEqual(r['metrics']['valid_pregame_forecasts'], 0)
        self.assertEqual(r['metrics']['grade_latency_unknown_first_seen'], 1)
        self.assertIn('UNKNOWN', r['metrics']['grade_latency'])

    def test_content_corruption_and_duplicate_ids_are_rejected(self):
        for action in ['changed', 'duplicate']:
            b = board()
            if action == 'changed': b['games'][0]['projection']['total'] += 1
            else: b['games'] *= 2
            with self.assertRaises(ValueError): board_identity(b)

    def test_sustained_failure_not_one_transient_tick_and_not_spam(self):
        findings = [issue('CAPTURE_RUN_FAILED', 60)]
        first = transition(None, findings, NOW)
        self.assertFalse(first['changed'])
        prior = {'checked_at': NOW.isoformat(), 'assessment': first}
        second = transition(prior, findings, NOW+dt.timedelta(seconds=60))
        self.assertTrue(second['changed'])
        prior = {'checked_at': (NOW+dt.timedelta(seconds=60)).isoformat(), 'assessment': second}
        self.assertFalse(transition(prior, findings, NOW+dt.timedelta(seconds=120))['changed'])
        recovered = transition(prior, [], NOW+dt.timedelta(seconds=120))
        self.assertEqual(recovered['recovered_codes'], ['CAPTURE_RUN_FAILED'])
        self.assertTrue(recovered['changed'])

    def test_changing_details_do_not_restart_failure_clock(self):
        a = transition(None, [issue('FINAL_NOT_PUBLISHED', 60, games=['a'])], NOW)
        b = transition({'checked_at': NOW.isoformat(), 'assessment': a},
                       [issue('FINAL_NOT_PUBLISHED', 60, games=['a','b'])], NOW+dt.timedelta(seconds=60))
        self.assertEqual(len(b['active']), 1)

    def test_storage_failure_detected_even_when_scheduler_reports_success(self):
        for key in ('free_bytes', 'free_inodes'):
            h = host(); h['storage'][key] = 0
            self.assertIn('STORAGE_EXHAUSTED', [x['code'] for x in assess_host(h, {'received_at':NOW.isoformat()}, NOW)])

    def test_dead_scheduler_detected_when_timer_or_progress_stops(self):
        h = host(); h['services']['nfl-engine-capture.timer']['ActiveState'] = 'inactive'
        h['final_reader']['last_success_at'] = (NOW-dt.timedelta(seconds=901)).isoformat()
        codes = [x['code'] for x in assess_host(h, {'received_at':NOW.isoformat()}, NOW)]
        self.assertIn('CAPTURE_TIMER_INACTIVE', codes)
        self.assertIn('FINAL_READER_STALE', codes)

    def test_host_independently_detects_dead_outside_observer(self):
        codes = [x['code'] for x in assess_host(host(), {'received_at':(NOW-dt.timedelta(seconds=181)).isoformat()}, NOW)]
        self.assertIn('OUTSIDE_OBSERVER_MISSING', codes)

    def test_outside_detects_dead_host_observer_despite_live_ssh(self):
        h = host(); h['checked_at'] = (NOW-dt.timedelta(seconds=181)).isoformat()
        p = {'state':'VERIFIED','identity':h['source']['identity']}
        self.assertIn('HOST_OBSERVER_STALE', [x['code'] for x in assess_outside(h,p,NOW)])

    def test_matching_old_publication_is_not_stale(self):
        h = host(); h['source']['identity']['published_at'] = (NOW-dt.timedelta(days=3)).isoformat()
        p = {'state':'VERIFIED','identity':copy.deepcopy(h['source']['identity'])}
        self.assertEqual(assess_outside(h,p,NOW), [])

    def test_stale_publication_and_equal_timestamp_corruption(self):
        h = host(); p = {'state':'VERIFIED','identity':copy.deepcopy(h['source']['identity'])}
        p['identity']['content_sha256'] = 'a'*64
        self.assertIn('PUBLIC_CONTENT_MISMATCH', [x['code'] for x in assess_outside(h,p,NOW)])
        p['identity']['published_at'] = (NOW-dt.timedelta(seconds=841)).isoformat()
        self.assertIn('PUBLIC_STALE', [x['code'] for x in assess_outside(h,p,NOW)])

    def test_forbidden_probe_is_blind_spot_and_not_retried(self):
        with patch.object(runner.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('url',403,'Forbidden',{},None)) as fetch:
            first = runner.public_probe()
            second = runner.public_probe(first)
        self.assertEqual(first, second)
        self.assertEqual(fetch.call_count, 1)
        self.assertIn('PUBLIC_ACCESS_UNQUALIFIED', [x['code'] for x in assess_outside(host(),first,NOW)])

    def test_uncertain_ack_retry_does_not_refresh_receipt_time(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            r = {'schema':POLICY['schema'],'observer':'gabe-mac','checked_at':NOW.isoformat(),'report_sha256':'a'*64}
            first = runner.accept_receipt(folder,r,NOW)
            second = runner.accept_receipt(folder,r,NOW+dt.timedelta(seconds=60))
            self.assertEqual(first,second)
            with self.assertRaises(ValueError): runner.accept_receipt(folder,{**r,'report_sha256':'b'*64},NOW)
            with self.assertRaises(ValueError): runner.accept_receipt(folder,r,NOW+dt.timedelta(seconds=181))

    def test_clock_and_receipt_rollback_rejected(self):
        prior = {'checked_at': (NOW+dt.timedelta(seconds=1)).isoformat()}
        self.assertEqual(transition(prior, [], NOW)['active'][0]['code'],'CLOCK_INVALID')
        with tempfile.TemporaryDirectory() as folder:
            r = {'schema':POLICY['schema'],'observer':'gabe-mac','checked_at':NOW.isoformat(),'report_sha256':'a'*64}
            runner.accept_receipt(Path(folder),r,NOW)
            with self.assertRaises(ValueError):
                runner.accept_receipt(Path(folder),{**r,'checked_at':(NOW-dt.timedelta(seconds=1)).isoformat()},NOW)

    def test_full_event_storage_does_not_write_success_heartbeat(self):
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder); value={'checked_at':NOW.isoformat(),'assessment':transition(None,[issue('STORAGE_EXHAUSTED')],NOW)}
            with patch.object(runner,'save',side_effect=OSError('disk full')):
                with self.assertRaises(OSError):runner.record(folder,'host',value)
            self.assertFalse((folder/'host.json').exists())

    def test_outside_read_failure_does_not_fake_host_health(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(runner,'remote',side_effect=RuntimeError('offline')), \
             patch.object(runner,'public_probe',return_value={'state':'ACCESS_UNQUALIFIED','http_status':403}):
            r = runner.outside_once(Path(folder),now=NOW,notifications=False)
            self.assertIn('HOST_OBSERVER_UNREACHABLE',[x['code'] for x in r['assessment']['active']])
            self.assertFalse((Path(folder)/'acknowledgment.json').exists())

    def test_old_successful_ack_is_not_new_acknowledgment(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(runner,'remote',side_effect=RuntimeError('offline')), \
             patch.object(runner,'public_probe',return_value={'state':'ACCESS_UNQUALIFIED','http_status':403}):
            p=Path(folder)/'acknowledgment.json'; old={'received_at':(NOW-dt.timedelta(hours=2)).isoformat()};p.write_text(json.dumps(old))
            runner.outside_once(Path(folder),now=NOW,notifications=False)
            self.assertEqual(json.loads(p.read_text()),old)


if __name__ == '__main__':
    unittest.main()
