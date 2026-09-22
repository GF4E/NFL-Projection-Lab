"""Exercise the real prepared writer, publisher, bundle and first-grade path."""
import copy
import gzip
import json
from contextlib import ExitStack
from unittest.mock import patch

import test_projection_cutoff_pipeline as helpers
from engine.projection import prepared,cutoff_pipeline as p,cutoff_state as cs,bundle
from engine.projection.lineage import read_artifact
from engine.projection.storage import save
from engine.forecast_system.calendar import timestamp
from scripts import projection_v3_prepare as preparer,projection_v3_publish as publisher,projection_learning


class Base(helpers.PipelineTests):
    pass
for name in vars(helpers.PipelineTests):
    if name.startswith('test_'):setattr(Base,name,None)


class PublicationTests(Base):
    def setup_publisher(self,role='FINAL_ELIGIBLE'):
        self.seed();self.artifact['wind_status']='INACTIVE'
        self.fit_ref=self.write('work/projection-v3/issuer-fit.json',self.artifact)
        save(self.root/'work/in-season-learning-v1/active-fit-ref.json',self.fit_ref)
        source=self.prepared();raw=gzip.compress(prepared.raw(source['rows']),mtime=0)
        prepared.commit(self.root,raw,{'fit':self.fit_ref,'elo_hfa':self.artifact['elo_hfa'],
                                      'sha256':prepared.sha(raw),'signature':'original'})
        _,_,transaction=cs.snapshot_before(self.root,cs.obs.current(self.root),timestamp('2026-09-13T15:00:00Z'))
        save(self.root/'work/projection-v1/source-manifest.json',transaction['sources'])
        save(self.root/'config/stadiums.json',{'stadiums':[]})
        save(self.root/'config/game_card_team_colors.json',{'BAL':{'color':'#123456'},'BUF':{'color':'#654321'}})
        with patch.object(preparer,'ROOT',self.root),patch.object(p,'now',return_value=timestamp('2026-09-13T14:59:00Z')):
            preparer.prepare(cutoff_state_ref=self.state_ref,game_ids=['sun'],role=role,at='2026-09-13T15:00:00Z')
        self.sink=[];stack=ExitStack();self.addCleanup(stack.close)
        stack.enter_context(patch.multiple(publisher,ROOT=self.root,OUT=self.root/'outputs/projection-v3',WORK=self.root/'work/projection-v3'))
        stack.enter_context(patch.object(publisher,'read',side_effect=lambda ref:read_artifact(self.root,ref)))
        stack.enter_context(patch.object(projection_learning,'active_artifact_with_ref',return_value=(self.fit_ref,self.artifact)))
        # The fixture has no historical Season database. Its publishing boundary
        # is intercepted; real card generation, bundles, scorecards and grades run.
        stack.enter_context(patch('scripts.board_v7_publish.run',side_effect=lambda board:self.sink.append(copy.deepcopy(board))))
        stack.enter_context(patch.object(bundle,'capture_code',return_value={'commit':'a'*40,'files':{},'environment':{'python':'fixture'}}))

    def test_actual_publisher_locks_and_grades_original_cutoff_bundle(self):
        self.setup_publisher();first=publisher.run(timestamp('2026-09-13T15:01:00Z'))['games'][0]
        self.assertEqual(first['forecast_role'],'FINAL_ELIGIBLE')
        self.assertEqual(first['issued_at'],'2026-09-13T15:01:00+00:00')
        self.assertEqual(bundle.verify_card(self.root,first)['chronology']['status'],'RECORDED_CUTOFF_INPUTS')
        frozen=publisher.run(timestamp('2026-09-13T15:45:00Z'))['games'][0]
        self.assertEqual(frozen['status'],'LOCKED');self.assertEqual(frozen['projection'],first['projection'])
        save(self.root/'outputs/projection-v3/final-feed.json',{'games':{'sun':{'home_score':31.,'away_score':24.}}})
        final=publisher.run(timestamp('2026-09-14T01:00:00Z'))['games'][0]
        self.assertEqual(final['status'],'FINAL');self.assertEqual(final['forecast_bundle_ref'],first['forecast_bundle_ref'])
        path=self.root/'outputs/projection-v3/grades/sun.json';original=path.read_bytes()
        save(self.root/'outputs/projection-v3/final-feed.json',{'games':{'sun':{'home_score':99.,'away_score':0.}}})
        again=publisher.run(timestamp('2026-09-14T02:00:00Z'))['games'][0]
        self.assertEqual(again['grades'],final['grades']);self.assertEqual(path.read_bytes(),original)
        self.assertEqual(self.sink[-1]['games'][0]['forecast_bundle_ref'],first['forecast_bundle_ref'])

    def test_provisional_card_is_missed_and_never_locked(self):
        self.setup_publisher('PROVISIONAL')
        card=publisher.run(timestamp('2026-09-13T15:01:00Z'))['games'][0]
        self.assertEqual(card['evidence'],'PROVISIONAL')
        result=publisher.run(timestamp('2026-09-13T15:45:00Z'))['games'][0]
        self.assertEqual(result['status'],'MISSED');self.assertIn('final-eligible',result['reason'])
        self.assertFalse((self.root/'outputs/projection-v3/locks/sun.json').exists())

    def test_on_time_calculation_cannot_authorize_late_card_bundle(self):
        self.setup_publisher()
        clocks=[timestamp(t) for t in ('2026-09-13T15:44:50Z','2026-09-13T15:44:51Z','2026-09-13T15:45:00Z')]
        with patch.object(p,'now',side_effect=clocks):
            with self.assertRaisesRegex(ValueError,'issuance bundle missed deadline'):
                publisher.run(timestamp('2026-09-13T15:44:00Z'))
        self.assertFalse((self.root/'outputs/projection-v3/live/sun.json').exists())
        self.assertFalse((self.root/'outputs/projection-v3/board.json').exists())

    def test_declared_cutoff_mode_cannot_silently_fall_back(self):
        self.setup_publisher()
        with patch.object(preparer,'ROOT',self.root):
            with self.assertRaisesRegex(ValueError,'no legacy fallback'):preparer.prepare()
        rows,meta,raw=prepared.load(self.root);meta['cutoff_preparations']={}
        prepared.commit(self.root,raw,meta)
        with self.assertRaisesRegex(ValueError,'Incomplete or unknown'):publisher.run(timestamp('2026-09-13T15:01:00Z'))

    def test_actual_first_lock_rejects_consistently_corrupted_source_features(self):
        self.setup_publisher();rows,meta,_=prepared.load(self.root)
        body=p.load(self.root,meta['cutoff_preparations']['sun'],'preparations')
        body['rows'][0]['features']['elo']+=50.
        meta['cutoff_preparations']['sun']=p.store(self.root,'preparations',body)
        raw=gzip.compress(prepared.raw(body['rows']),mtime=0);meta['sha256']=prepared.sha(raw)
        prepared.commit(self.root,raw,meta)
        with patch.object(p,'verify_preparation',return_value=True):
            publisher.run(timestamp('2026-09-13T15:01:00Z'))
        with self.assertRaisesRegex(ValueError,'do not reconstruct'):
            publisher.run(timestamp('2026-09-13T15:45:00Z'))
        self.assertFalse((self.root/'outputs/projection-v3/locks/sun.json').exists())

    def test_duplicate_publish_reuses_issuance_and_original_bundle(self):
        self.setup_publisher();first=publisher.run(timestamp('2026-09-13T15:01:00Z'))['games'][0]
        receipt=self.root/'outputs/projection-v3/issuance-receipts'/(first['forecast_bundle_ref']['sha256']+'.json')
        original=receipt.read_bytes()
        with patch.object(p,'now',return_value=timestamp('2026-09-13T15:02:00Z')):
            second=publisher.run(timestamp('2026-09-13T15:02:00Z'))['games'][0]
        self.assertEqual(first['forecast_bundle_ref'],second['forecast_bundle_ref'])
        self.assertEqual(receipt.read_bytes(),original)

    def test_repeat_explicit_preparation_keeps_original_snapshot_and_clock(self):
        self.setup_publisher();original=prepared.current(self.root)
        with patch.object(preparer,'ROOT',self.root),patch.object(p,'now',return_value=timestamp('2026-09-13T15:02:00Z')):
            preparer.prepare(cutoff_state_ref=self.state_ref,game_ids=['sun'],role='FINAL_ELIGIBLE',at='2026-09-13T15:03:00Z')
        self.assertEqual(prepared.current(self.root),original)

    def test_cutoff_card_cannot_downgrade_itself_to_unbundled_legacy(self):
        self.setup_publisher();card=publisher.run(timestamp('2026-09-13T15:01:00Z'))['games'][0]
        del card['forecast_bundle_ref'];del card['release_ref']
        with self.assertRaisesRegex(ValueError,'requires its immutable bundle'):bundle.verify_card(self.root,card)
