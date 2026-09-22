import copy,gzip,json
from contextlib import ExitStack
from unittest.mock import patch

import test_projection_cutoff_state as helpers
from test_projection_bundle import fixture
from engine.projection import cutoff_selection as selection,cutoff_worker as worker,cutoff_state as cs,cutoff_pipeline as p,prepared,bundle
from engine.projection.storage import save
from engine.projection.lineage import read_artifact
from engine.forecast_system.calendar import timestamp
from scripts import projection_v3_prepare as preparer,projection_v3_publish as publisher,projection_learning


class Base(helpers.CutoffStateTests):pass
for name in vars(helpers.CutoffStateTests):
    if name.startswith('test_'):setattr(Base,name,None)


class SelectionTests(Base):
    def setup_selection(self):
        _,self.artifact,_,_,_,_=fixture(self.root)
        self.artifact.update(elo_hfa={'2026':65.},issued_at='2026-09-09T00:00:00Z',wind_status='INACTIVE')
        self.fit=self.write('work/projection-v3/selection-fit.json',self.artifact)
        self.sun=helpers.game('sun','2026-09-13','13:00');self.mon=helpers.game('mon','2026-09-14','20:30')
        for game in (self.sun,self.mon):game.update(home_score=None,away_score=None)
        self.capture([self.g,self.sun,self.mon],helpers.statistics(self.g))
        with patch.object(worker,'now',return_value=timestamp('2026-09-11T12:30:00Z')):
            worker.configure(self.root,'owner',self.fit)

    def run_cut(self,at='2026-09-11T13:00:00Z',completed='2026-09-11T13:02:00Z'):
        with patch.object(worker,'now',side_effect=[timestamp(at),timestamp(completed)]),patch.object(cs,'now',return_value=timestamp(at)):
            return worker.run_due(self.root,'owner')

    def initialize_preparer(self):
        self.setup_selection();self.run_cut()
        _,_,transaction=cs.snapshot_before(self.root,cs.obs.current(self.root),timestamp('2026-09-11T15:00:00Z'))
        games=[{**{k:g.get(k) for k in p.features.GAME_FIELDS},'source_hash':transaction['sources']['schedule']['sha256']} for g in (self.sun,self.mon)]
        body=p.from_recorded(self.root,cs.current(self.root),games,{'stadiums':[]},at='2026-09-11T15:00:00Z',role='PROVISIONAL')
        raw=gzip.compress(prepared.raw(body['rows']),mtime=0)
        save(self.root/'work/in-season-learning-v1/active-fit-ref.json',self.fit)
        prepared.commit(self.root,raw,{'fit':self.fit,'elo_hfa':self.artifact['elo_hfa'],'sha256':prepared.sha(raw),'signature':'fixture'})
        save(self.root/'work/projection-v1/source-manifest.json',transaction['sources'])
        save(self.root/'config/stadiums.json',{'stadiums':[]})
        save(self.root/'config/game_card_team_colors.json',{'BAL':{'color':'#123456'},'BUF':{'color':'#654321'}})

    def prepare_at(self,at='2026-09-11T15:00:00Z'):
        with patch.object(preparer,'ROOT',self.root),patch.object(p,'now',return_value=timestamp('2026-09-11T14:00:00Z')):
            return preparer.prepare(select_scheduled=True,at=at)

    def test_selects_exact_final_cutoff_and_future_preview_with_durable_clock(self):
        self.setup_selection();done=self.run_cut()
        picked=selection.select(self.root,[self.sun,self.mon],timestamp('2026-09-11T15:00:00Z'))
        self.assertEqual(picked['games']['sun']['role'],'FINAL_ELIGIBLE')
        self.assertEqual(picked['games']['mon']['role'],'PROVISIONAL')
        for item in picked['games'].values():
            self.assertEqual(item['state_ref'],done['state_ref'])
            self.assertEqual(selection.committed_at(self.root,item['state_ref'],cs.read(self.root,item['state_ref']),item['availability_ref']),timestamp('2026-09-11T13:02:00Z'))

    def test_due_missing_cutoff_never_falls_back_to_friday(self):
        self.setup_selection();self.run_cut()
        with self.assertRaisesRegex(ValueError,'Required cutoff unavailable: mon'):
            selection.select(self.root,[self.mon],timestamp('2026-09-14T14:00:00Z'))

    def test_state_creation_does_not_establish_acknowledged_availability(self):
        self.setup_selection();self.run_cut()
        with self.assertRaisesRegex(ValueError,'acknowledged after preparation'):
            selection.select(self.root,[self.sun],timestamp('2026-09-11T13:01:00Z'))

    def test_committed_state_without_worker_acknowledgment_cannot_be_selected(self):
        self.setup_selection()
        with patch.object(worker,'finish',side_effect=KeyboardInterrupt),self.assertRaises(KeyboardInterrupt):self.run_cut()
        self.assertIsNotNone(cs.current(self.root))
        with self.assertRaisesRegex(ValueError,'acknowledgment unavailable'):
            selection.select(self.root,[self.sun],timestamp('2026-09-11T15:00:00Z'))

    def test_exact_cutoff_ignores_newer_pointer_and_closed_games_are_not_prepared(self):
        self.setup_selection();friday=self.run_cut()['state_ref']
        self.run_cut('2026-09-14T13:00:00Z','2026-09-14T13:02:00Z')
        self.run_cut('2026-09-15T13:00:00Z','2026-09-15T13:02:00Z')
        self.assertNotEqual(cs.current(self.root),friday)
        chosen=selection.select(self.root,[self.sun],timestamp('2026-09-13T15:00:00Z'))
        self.assertEqual(chosen['games']['sun']['state_ref'],friday)
        self.assertEqual(selection.select(self.root,[self.sun],timestamp('2026-09-13T15:45:00Z'))['closed_games'],['sun'])

    def test_actual_scheduled_preparer_is_atomic_across_groups(self):
        self.initialize_preparer();before=prepared.current(self.root);real=p.from_recorded;calls=[]
        def fail(*args,**kwargs):
            calls.append(kwargs['role'])
            if len(calls)==2:raise ValueError('second group failure')
            return real(*args,**kwargs)
        with patch.object(p,'from_recorded',side_effect=fail),self.assertRaisesRegex(ValueError,'second group failure'):
            self.prepare_at()
        self.assertEqual(len(calls),2)
        self.assertTrue(list((self.root/p.BASE/'preparations').glob('*.json.gz')))
        self.assertEqual(prepared.current(self.root),before)

    def test_scheduled_preparations_reconstruct_ack_and_reuse_unchanged_snapshot(self):
        self.initialize_preparer();rows=self.prepare_at();original=prepared.current(self.root)
        _,meta,_=prepared.load(self.root)
        self.assertEqual(len(meta['cutoff_preparations']),2)
        for ref in meta['cutoff_preparations'].values():
            body=p.load(self.root,ref,'preparations');self.assertTrue(p.verify_preparation(self.root,body))
            self.assertEqual(body['state']['committed_at'],timestamp('2026-09-11T13:02:00Z').isoformat())
        self.assertEqual(rows,self.prepare_at('2026-09-11T15:10:00Z'))
        self.assertEqual(prepared.current(self.root),original)
        body=p.load(self.root,meta['cutoff_preparations']['sun'],'preparations')
        body['state']['availability_ref']['operation']['body_sha256']='f'*64
        with self.assertRaises(ValueError):p.verify_preparation(self.root,body)

    def test_actual_publisher_distinguishes_automatic_final_and_preview(self):
        self.initialize_preparer();self.prepare_at()
        with ExitStack() as stack:
            stack.enter_context(patch.multiple(publisher,ROOT=self.root,OUT=self.root/'outputs/projection-v3',WORK=self.root/'work/projection-v3'))
            stack.enter_context(patch.object(publisher,'read',side_effect=lambda ref:read_artifact(self.root,ref)))
            stack.enter_context(patch.object(projection_learning,'active_artifact_with_ref',return_value=(self.fit,self.artifact)))
            stack.enter_context(patch('scripts.board_v7_publish.run',return_value=None))
            stack.enter_context(patch.object(bundle,'capture_code',return_value={'commit':'a'*40,'files':{},'environment':{'python':'fixture'}}))
            stack.enter_context(patch.object(p,'now',return_value=timestamp('2026-09-11T15:01:00Z')))
            board=publisher.run(timestamp('2026-09-11T15:01:00Z'));cards={c['game_id']:c for c in board['games']}
            self.assertEqual(cards['sun']['evidence'],'AS_ISSUED');self.assertEqual(cards['mon']['evidence'],'PROVISIONAL')
            for card in cards.values():self.assertIn('availability_ref',bundle.verify_card(self.root,card)['chronology']['state_lineage'])

    def test_selected_manifest_cannot_silently_return_to_manual_state_choice(self):
        self.initialize_preparer();self.prepare_at();original=prepared.current(self.root)
        with patch.object(preparer,'ROOT',self.root),self.assertRaisesRegex(ValueError,'fall back to manual'):
            preparer.prepare(cutoff_state_ref=cs.current(self.root),game_ids=['sun'],role='FINAL_ELIGIBLE',at='2026-09-11T15:10:00Z')
        self.assertEqual(prepared.current(self.root),original)
