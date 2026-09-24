"""Durable-issuance SLO consumes real publisher output without repairing it."""
import copy
import datetime as dt
import json
from unittest.mock import patch

import test_projection_cutoff_publication as publication
from engine.projection import cutoff_publication
from engine.projection.storage import save
from engine.projection.watchdog import assess_source, digest
from engine.forecast_system.calendar import timestamp
from scripts import projection_watchdog as observer


class Base(publication.PublicationTests):
    pass
for name in dir(publication.PublicationTests):
    if name.startswith('test_'):
        setattr(Base, name, None)


class IssuanceSLOTests(Base):
    def sample(self, role='FINAL_ELIGIBLE'):
        self.setup_publisher(role)
        self.card = publication.publisher.run(timestamp('2026-09-13T15:01:00Z'))['games'][0]
        self.now = timestamp('2026-09-13T15:45:00Z')
        self.schedule = [{'game_id': 'sun', 'cutoff_at': self.card['cutoff_at']}]
        self.board = {'schema': 'projection-board-v1', 'published_at': self.now.isoformat(),
                      'games': [self.card]}
        self.receipt = self.root/cutoff_publication.RECEIPTS/(self.card['forecast_bundle_ref']['sha256']+'.json')

    def assess(self):
        self.board['content_sha256'] = digest({k:v for k,v in self.board.items() if k != 'content_sha256'})
        evidence = observer.issuance_evidence(self.root, self.board, self.schedule, self.now)
        result = assess_source(self.board, self.schedule, {}, {'sun':True}, self.now, self.now, evidence)
        return evidence, result

    def test_actual_durable_bundle_counts_without_writes_or_fitting(self):
        self.sample()
        before = {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        with patch.object(cutoff_publication, 'issuance_receipt', side_effect=AssertionError('No write')):
            evidence, result = self.assess()
        metric = result['metrics']['on_time_committed_issuance']
        self.assertEqual(metric['rate'], 1.)
        self.assertEqual(metric['verified_game_ids'], ['sun'])
        self.assertEqual(metric['state'], 'MEASURED')
        self.assertEqual(evidence['sun']['state'], 'VERIFIED')
        self.assertEqual(before, {str(p):p.read_bytes() for p in self.root.rglob('*') if p.is_file()})
        self.assertIn('UNKNOWN', result['metrics']['grade_latency'])

    def test_missing_receipt_cannot_be_regenerated_by_monitor(self):
        self.sample(); self.receipt.rename(self.receipt.with_suffix('.held'))
        evidence, result = self.assess()
        self.assertEqual(evidence['sun']['state'], 'MISSING')
        self.assertFalse(self.receipt.exists())
        self.assertEqual(result['metrics']['on_time_committed_issuance']['rate'], 0.)
        self.assertIn('ISSUANCE_RECEIPT_UNVERIFIED', [f['code'] for f in result['findings']])

    def test_corrupt_bundle_is_not_credited_even_with_valid_receipt(self):
        self.sample();path=self.root/self.card['forecast_bundle_ref']['path']
        path.write_bytes(b'not a valid bundle')
        evidence,result=self.assess()
        self.assertEqual(evidence['sun']['state'], 'INVALID')
        self.assertEqual(result['metrics']['on_time_committed_issuance']['verified_on_time_games'], 0)

    def test_equal_deadline_receipt_is_invalid(self):
        self.sample();body=json.loads(self.receipt.read_bytes())
        body['committed_at']=self.card['cutoff_at'];save(self.receipt, body)
        evidence,result=self.assess()
        self.assertEqual(evidence['sun']['state'], 'INVALID')
        self.assertEqual(result['metrics']['on_time_committed_issuance']['failed_games'], 1)

    def test_independent_schedule_mismatch_is_invalid(self):
        self.sample();self.schedule[0]['cutoff_at']=(self.now-dt.timedelta(seconds=1)).isoformat()
        evidence,result=self.assess()
        self.assertEqual(evidence['sun']['state'], 'INVALID')
        self.assertEqual(result['metrics']['on_time_committed_issuance']['rate'], 0.)

    def test_legacy_unknown_and_missing_game_stay_in_denominator(self):
        self.sample();legacy=copy.deepcopy(self.card)
        legacy['game_id']='legacy'
        for key in cutoff_publication.FIELDS: legacy.pop(key)
        missing={'game_id':'missing', 'cutoff_at':self.card['cutoff_at']}
        self.board['games'].append(legacy)
        self.schedule.extend([{'game_id':'legacy','cutoff_at':self.card['cutoff_at']},missing])
        _,result=self.assess();metric=result['metrics']['on_time_committed_issuance']
        self.assertEqual([metric[k] for k in ('eligible_due_games','verified_on_time_games','unknown_games','failed_games')],[3,1,1,1])
        self.assertEqual(metric['unknown_game_ids'],['legacy'])
        self.assertIsNone(metric['rate']);self.assertEqual(metric['state'],'PARTIAL')

    def test_provisional_or_retrospective_does_not_earn_success(self):
        self.sample('PROVISIONAL')
        _,result=self.assess()
        self.assertEqual(result['metrics']['on_time_committed_issuance']['rate'],0.)
        self.card['evidence']='RETROSPECTIVE'
        _,result=self.assess()
        self.assertEqual(result['metrics']['on_time_committed_issuance']['failed_games'],1)

    def test_future_game_excluded_until_its_deadline(self):
        self.sample();self.now-=dt.timedelta(seconds=1)
        self.board['published_at']=self.now.isoformat()
        evidence,result=self.assess()
        self.assertEqual(evidence,{})
        metric=result['metrics']['on_time_committed_issuance']
        self.assertEqual(metric['state'],'NO_DUE_GAMES');self.assertIsNone(metric['rate'])
