import copy
import datetime as dt
import json
import unittest
from unittest.mock import patch

import test_projection_cutoff_state as helpers
from test_projection_cutoff_state import game, statistics, FRIDAY, MONDAY, TUESDAY
from test_projection_bundle import fixture
from engine.projection import cutoff_pipeline as p, cutoff_state as cs
from engine.projection.model import hash_value
from engine.projection.scoring_process import score_batch
from engine.forecast_system.calendar import timestamp


class Helpers(helpers.CutoffStateTests):
    pass
for name in vars(helpers.CutoffStateTests):
    if name.startswith('test_'):setattr(Helpers,name,None)


class PipelineTests(Helpers):
    def seed(self):
        self.scoring_clock=patch.object(p,'now',return_value=timestamp('2026-09-13T15:01:00Z'))
        self.scoring_clock.start();self.addCleanup(self.scoring_clock.stop)
        self.target={k:game('sun','2026-09-13','13:00').get(k) for k in cs.features.GAME_FIELDS}
        self.capture([self.g,self.target],statistics(self.g))
        with patch.object(cs,'now',return_value=timestamp(FRIDAY)):self.state_ref=self.advance(FRIDAY)
        self.fit_ref,self.artifact,self.shapes,_,_,_=fixture(self.root)
        self.artifact.update(elo_hfa={'2026':65.},issued_at='2026-09-09T00:00:00Z')
        self.fit_ref=self.write('work/projection-v3/pipeline-fit.json',self.artifact)
        _,_,transaction=cs.snapshot_before(self.root,cs.obs.current(self.root),timestamp(FRIDAY))
        self.target['source_hash']=transaction['sources']['schedule']['sha256']

    def prepared(self,role='FINAL_ELIGIBLE'):
        return p.from_recorded(self.root,self.state_ref,[self.target],{'stadiums':[]},at='2026-09-13T15:00:00Z',role=role,
                               schedule_ref=getattr(self,'schedule_ref',None))

    def test_render_identity_is_context_local_and_never_stale_across_calls(self):
        self.seed();state,body=cs.restore(self.root,self.state_ref)
        context=p.state_context(body,self.state_ref)
        games=[dict(self.target,game_id='copy'+str(i),week=2+(i%2)) for i in range(4)]
        identity=cs.features.State.identity;calls=[]
        def counted(value):
            result=identity(value);calls.append(result);return result
        before=identity(state)
        with patch.object(cs.features.State,'identity',counted):
            result=p.prepare(state,context,games,{'stadiums':[]},at='2026-09-13T15:00:00Z',role='PROVISIONAL')
        self.assertEqual(len(calls),3)  # input validation plus two render contexts, not eight row hashes
        self.assertEqual(identity(state),before)
        self.assertEqual(len(result['rows']),8)
        for row in result['rows']:
            self.assertEqual(row['state_lineage']['rendered_state_sha256'],calls[1+(row['week']-2)])
        state.elo.teams[self.target['home_team']]['elo']+=1
        context['state_sha256']=identity(state)
        newer=p.prepare(state,context,games,{'stadiums':[]},at='2026-09-13T15:00:00Z',role='PROVISIONAL')
        self.assertNotEqual(newer['rows'][0]['state_lineage']['rendered_state_sha256'],result['rows'][0]['state_lineage']['rendered_state_sha256'])

    def test_final_preparation_matches_existing_state_rows_and_is_label_free(self):
        self.seed();body=self.prepared()
        previous=cs.forecast_rows(self.root,self.state_ref,[self.target],{'stadiums':[]})
        self.assertEqual({r['row_id']:r['features'] for r in body['rows']},{r['row_id']:r['features'] for r in previous})
        self.assertTrue(all(r['actual_points'] is None for r in body['rows']))
        forecast=p.score(body,self.artifact,self.shapes)['sun']
        isolated=score_batch(self.artifact,self.shapes,[forecast['input']])['sun']
        self.assertEqual(isolated,{k:forecast[k] for k in ('projection','contributions','why')})

    def test_preview_cannot_lock_even_when_its_state_is_current(self):
        self.seed();preview=p.score(self.prepared('PROVISIONAL'),self.artifact,self.shapes)['sun']
        with self.assertRaisesRegex(ValueError,'final-eligible'):p.lockable(preview,p.time_of(self.target))
        self.target['gameday']='2026-09-14';self.target['gametime']='20:30'
        source=self.source('schedule',[self.g,self.target])
        with patch.object(p,'now',return_value=timestamp('2026-09-13T14:00:00Z')):
            self.schedule_ref=p.capture_schedule(self.root,source)
        self.target['source_hash']=source['sha256']
        self.assertEqual(self.prepared('PROVISIONAL')['role'],'PROVISIONAL')
        with self.assertRaisesRegex(ValueError,'cutoff differs'):self.prepared()

    def test_late_or_unavailable_state_cannot_prepare_final(self):
        self.seed()
        with self.assertRaisesRegex(ValueError,'at or after lock'):
            p.from_recorded(self.root,self.state_ref,[self.target],{'stadiums':[]},at='2026-09-13T15:45:00Z',role='FINAL_ELIGIBLE')
        with self.assertRaisesRegex(ValueError,'available at preparation'):
            p.from_recorded(self.root,self.state_ref,[self.target],{'stadiums':[]},at='2026-09-11T12:00:00Z',role='FINAL_ELIGIBLE')

    def test_common_historical_points_equal_recorded_points_without_borrowed_calibration(self):
        self.seed();state,body=cs.restore(self.root,self.state_ref)
        context={'cutoff_at':body['cutoff_at'],'state_sha256':state.identity(),'source_availability':'HISTORICAL_AVAILABILITY_ASSUMED'}
        replay=p.prepare(state,context,[self.target],{'stadiums':[]},at=p.time_of(self.target),role='HISTORICAL_RECONSTRUCTION')
        self.assertEqual(p.score(replay,self.artifact)['sun']['projection'],{k:p.score(self.prepared(),self.artifact,self.shapes)['sun']['projection'][k] for k in ('home_points','away_points','margin','total')})
        with self.assertRaisesRegex(ValueError,'Historical calibration'):p.score(replay,self.artifact,self.shapes)
        with self.assertRaisesRegex(ValueError,'final-eligible'):p.lockable(p.score(replay,self.artifact)['sun'],p.time_of(self.target))

    def test_recorded_scores_lock_idempotently_and_cannot_replace_prior_forecast(self):
        self.seed();prep=p.store(self.root,'preparations',self.prepared());forecast=p.recorded_scores(self.root,prep,self.fit_ref)['sun']
        with self.assertRaisesRegex(ValueError,'not reached'):p.commit_shadow_lock(self.root,forecast,'2026-09-13T15:44:59Z')
        first=p.commit_shadow_lock(self.root,forecast,'2026-09-13T15:45:00Z')
        self.assertEqual(first,p.commit_shadow_lock(self.root,forecast,'2026-09-14T00:00:00Z'))
        changed=p.load(self.root,forecast,'forecasts');changed['projection']['home_points']+=1
        other=p.store(self.root,'forecasts',changed)
        with self.assertRaisesRegex(ValueError,'Frozen'):p.commit_shadow_lock(self.root,other,'2026-09-14T00:00:00Z')
        self.assertFalse((self.root/'outputs/projection-v3/locks').exists())

    def test_new_fit_cannot_be_applied_to_earlier_preparation(self):
        self.seed();prep=p.store(self.root,'preparations',self.prepared())
        self.artifact['issued_at']='2026-09-13T16:00:00Z';ref=self.write('work/projection-v3/future-fit.json',self.artifact)
        with self.assertRaisesRegex(ValueError,'Fit unavailable'):p.recorded_scores(self.root,prep,ref)

    def test_late_scoring_cannot_turn_old_preparation_into_a_locked_forecast(self):
        self.seed();prep=p.store(self.root,'preparations',self.prepared())
        with patch.object(p,'now',return_value=timestamp('2026-09-13T15:45:00Z')):
            with self.assertRaisesRegex(ValueError,'at or after lock'):p.recorded_scores(self.root,prep,self.fit_ref)
        clocks=[timestamp('2026-09-13T15:44:59Z'),timestamp('2026-09-13T15:45:00Z')]
        with patch.object(p,'now',side_effect=clocks):forecast=p.recorded_scores(self.root,prep,self.fit_ref)['sun']
        with self.assertRaisesRegex(ValueError,'predeadline scoring'):
            p.commit_shadow_lock(self.root,forecast,'2026-09-13T15:45:01Z')

    def test_committed_scoring_retry_after_deadline_reuses_original_receipt(self):
        self.seed();prep=p.store(self.root,'preparations',self.prepared())
        original=p.recorded_scores(self.root,prep,self.fit_ref)
        with patch.object(p,'now',return_value=timestamp('2026-09-13T15:46:00Z')):
            with patch.object(p,'score',side_effect=AssertionError('Committed operation must not rescore')):
                self.assertEqual(p.recorded_scores(self.root,prep,self.fit_ref),original)
        self.assertEqual(p.commit_shadow_lock(self.root,original['sun'],'2026-09-13T15:46:00Z')['role'],'SHADOW_LOCK')

    def test_first_lock_reconciles_values_and_fit_with_exact_preparation(self):
        self.seed();prep=p.store(self.root,'preparations',self.prepared())
        ref=p.recorded_scores(self.root,prep,self.fit_ref)['sun'];bad=p.load(self.root,ref,'forecasts')
        bad['projection']['home_points']+=1;other=p.store(self.root,'forecasts',bad)
        with self.assertRaisesRegex(ValueError,'differs from its preparation'):
            p.commit_shadow_lock(self.root,other,'2026-09-13T15:45:01Z')
        self.assertFalse((self.root/p.BASE/'locks/sun.json').exists())
        self.assertEqual(p.verify_forecast(self.root,ref)['game_id'],'sun')

    def test_hash_valid_preparation_with_late_clock_or_changed_pair_is_rejected(self):
        self.seed();prepared=self.prepared();prepared['prepared_at']='2026-09-13T16:00:00Z'
        for row in prepared['rows']:row['state_lineage']['prepared_at']=prepared['prepared_at']
        with self.assertRaisesRegex(ValueError,'at or after lock'):p.score(prepared,self.artifact)
        prepared=self.prepared();prepared['rows'][0]['game']['roof']='dome'
        with self.assertRaisesRegex(ValueError,'Paired game snapshots'):p.score(prepared,self.artifact)

    def test_scoring_uses_isolated_worker_and_has_no_in_process_fallback(self):
        self.seed()
        with patch.object(p,'score_batch',side_effect=ValueError('isolated failure')):
            with self.assertRaisesRegex(ValueError,'isolated failure'):p.score(self.prepared(),self.artifact,self.shapes)

    def test_hash_valid_changed_features_and_metadata_fail_before_scoring(self):
        self.seed()
        for field in ('features','metadata','personnel'):
            body=self.prepared()
            if field=='features':body['rows'][0][field]['baseline']+=5.
            elif field=='metadata':body['rows'][0][field]['baseline']['label']='invented context'
            else:body['rows'][0][field]['status']='invented'
            ref=p.store(self.root,'preparations',body)
            with patch.object(p,'score_batch',side_effect=AssertionError('Must reject before scoring')):
                with self.assertRaisesRegex(ValueError,'do not reconstruct'):
                    p.recorded_scores(self.root,ref,self.fit_ref)

    def test_consistently_rescored_forged_preparation_cannot_first_lock(self):
        self.seed();body=self.prepared();body['rows'][0]['features']['elo']+=50.
        ref=p.store(self.root,'preparations',body)
        # Simulate a prior producer omitting source verification. All forecast
        # values and the valid commit receipt agree with the altered preparation.
        with patch.object(p,'verify_preparation',return_value=True):
            forecast=p.recorded_scores(self.root,ref,self.fit_ref)['sun']
        with self.assertRaisesRegex(ValueError,'do not reconstruct'):
            p.commit_shadow_lock(self.root,forecast,'2026-09-13T15:45:01Z')
        self.assertFalse((self.root/p.BASE/'locks/sun.json').exists())

    def test_changed_retained_stadiums_or_schedule_cannot_validate_original_rows(self):
        self.seed();body=self.prepared();body['render_inputs']['stadiums']['note']='changed source'
        with self.assertRaisesRegex(ValueError,'do not reconstruct'):p.verify_preparation(self.root,body)
        body=self.prepared();body['render_inputs']['slate'][0]['roof']='dome'
        with self.assertRaisesRegex(ValueError,'retained schedule'):p.verify_preparation(self.root,body)
        body=self.prepared();del body['render_inputs']
        with self.assertRaisesRegex(ValueError,'render inputs required'):p.verify_preparation(self.root,body)

    def test_later_schedule_revision_does_not_rewrite_prepared_input(self):
        self.seed();original=self.prepared();revision=copy.deepcopy(self.target);revision['roof']='dome'
        source=self.source('schedule',[self.g,revision])
        with patch.object(p,'now',return_value=timestamp('2026-09-13T15:00:00Z')):
            later=p.capture_schedule(self.root,source)
        self.assertTrue(p.verify_preparation(self.root,original))
        # An unchanged observation pointer retains the original known schedule.
        self.assertEqual(self.prepared(),original)
        revision['source_hash']=source['sha256']
        with self.assertRaisesRegex(ValueError,'Schedule unavailable'):
            p.from_recorded(self.root,self.state_ref,[revision],{'stadiums':[]},
                            at='2026-09-13T15:00:00Z',role='FINAL_ELIGIBLE',schedule_ref=later)
        revised=p.from_recorded(self.root,self.state_ref,[revision],{'stadiums':[]},
                                at='2026-09-13T15:01:00Z',role='FINAL_ELIGIBLE',schedule_ref=later)
        self.assertTrue(p.verify_preparation(self.root,revised))
        self.assertEqual(revised['state'],original['state'])
        self.assertNotEqual(revised['schedule_evidence'],original['schedule_evidence'])
        with patch.object(p,'now',return_value=timestamp('2026-09-14T00:00:00Z')):
            self.assertEqual(p.capture_schedule(self.root,source),later)

    def test_retained_source_corruption_prevents_preparation_verification(self):
        self.seed();body=self.prepared();source=self.root/body['schedule_evidence']['source_ref']['path']
        source.write_bytes(b'[]')
        with self.assertRaisesRegex(ValueError,'source hash mismatch'):p.verify_preparation(self.root,body)

    def test_schedule_capture_lost_response_reuses_original_clock_and_changed_source_fails(self):
        self.seed();source=self.source('schedule',[self.g,self.target])
        from engine.projection import storage
        original=storage.save
        def lost(path,body,immutable=False):
            result=original(path,body,immutable)
            if 'schedule-captures' in str(path):raise OSError('lost schedule response')
            return result
        with patch.object(storage,'save',side_effect=lost):
            with self.assertRaisesRegex(OSError,'lost schedule'):p.capture_schedule(self.root,source)
        with patch.object(p,'now',return_value=timestamp('2026-09-14T00:00:00Z')):
            ref=p.capture_schedule(self.root,source)
        self.assertEqual(p.load(self.root,ref,'schedule-inputs')['collected_at'],'2026-09-13T15:01:00+00:00')
        (self.root/source['path']).write_bytes(b'[]')
        with self.assertRaisesRegex(ValueError,'source hash mismatch'):p.capture_schedule(self.root,source)

    def test_target_fields_bad_team_and_tampered_artifact_fail_closed(self):
        self.seed();self.target['home_score']=999
        with self.assertRaisesRegex(ValueError,'unapproved'):self.prepared()
        del self.target['home_score'];body=self.prepared();body['rows'][0]['actual_points']=99
        with self.assertRaisesRegex(ValueError,'Target labels'):p.score(body,self.artifact)
        body=self.prepared();body['rows'][0]['team']='CHI'
        with self.assertRaisesRegex(ValueError,'identity'):p.score(body,self.artifact)
        ref=p.store(self.root,'preparations',self.prepared());(self.root/ref['path']).write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'hash mismatch'):p.load(self.root,ref,'preparations')

    def training(self):
        self.seed();body=self.prepared();rows=copy.deepcopy(body['rows'])
        labels={'sun':{'home_points':29.,'away_points':21.,'kickoff_at':'2026-09-13T17:00:00Z','available_at':'2026-09-14T01:00:00Z'}}
        closeout={'state':'PUBLISHED','season':2026,'week':2,'published_at':'2026-09-15T13:01:00Z','evidence':'SIMULATED_HISTORICAL_CLOSEOUT'}
        return rows,labels,closeout

    def test_refit_joins_paired_prior_labels_and_preserves_feature_history(self):
        rows,labels,closed=self.training();before=copy.deepcopy(rows)
        result=p.refit(rows,labels,self.artifact,cutoff=TUESDAY,through_season=2026,through_week=2,closeout=closed)
        self.assertEqual(rows,before);self.assertEqual(result['training_games'],['sun'])
        self.assertEqual(result['groups'],self.artifact['groups']);self.assertEqual(result['selected'],self.artifact['selected'])
        again=p.refit(list(reversed(rows)),labels,self.artifact,cutoff=TUESDAY,through_season=2026,through_week=2,closeout=closed)
        self.assertEqual(result,again)
        labels['sun']['home_points']=31.
        corrected=p.refit(rows,labels,self.artifact,cutoff=TUESDAY,through_season=2026,through_week=2,closeout=closed)
        self.assertNotEqual(corrected['fit']['training_hash'],result['fit']['training_hash']);self.assertEqual(rows,before)

    def test_refit_rejects_unpublished_closeout_late_labels_wrong_day_and_one_team(self):
        rows,labels,closed=self.training();args=dict(cutoff=TUESDAY,through_season=2026,through_week=2,closeout=closed)
        with self.assertRaisesRegex(ValueError,'closeout'):p.refit(rows,labels,self.artifact,**{**args,'closeout':{**closed,'state':'LOCAL_ONLY'}})
        with self.assertRaisesRegex(ValueError,'Tuesday'):p.refit(rows,labels,self.artifact,**{**args,'cutoff':FRIDAY})
        with self.assertRaisesRegex(ValueError,'Paired'):p.refit(rows[:1],labels,self.artifact,**args)
        labels['sun']['available_at']=closed['published_at']
        with self.assertRaisesRegex(ValueError,'unavailable'):p.refit(rows,labels,self.artifact,**args)

    def recorded_refit_inputs(self):
        rows,_,_=self.training()
        p.now.return_value=timestamp('2026-09-15T13:02:05Z')
        actual=game('sun','2026-09-13','13:00')
        self.capture([self.g,actual],at='2026-09-14T12:00:00Z')
        with patch.object(cs,'now',return_value=timestamp(MONDAY)):self.advance(MONDAY)
        with patch.object(cs,'now',return_value=timestamp(TUESDAY)):state=self.advance(TUESDAY)
        training=p.store(self.root,'training',{'schema':'retained-pregame-training-v1','rows':rows})
        evidence=self.write('outputs/cadence-v2/weeks/fixture/scorecard.json',{'games':['thu','sun']})
        closeout=self.write('outputs/cadence-v2/closeouts/2026-09-15.json',{
            'schema':'closeout-publication-v2','state':'PUBLISHED','all_games_graded':True,
            'season':2026,'week':2,'published_at':'2026-09-15T13:01:00+00:00',
            'source_commit':'a'*40,'artifacts':{evidence['path']:evidence['sha256']}})
        self.write('outputs/cadence-v2/closeouts/acknowledgments/2026-09-15.json',{
            'receipt_sha256':closeout['sha256'],'verified_remote_commit':'b'*40,
            'confirmed_at':'2026-09-15T13:01:10+00:00','publication_surface':'source_repository'})
        return state,training,self.root/closeout['path']

    def test_recorded_refit_uses_cutoff_labels_after_ack_and_retains_parent(self):
        state,training,closed=self.recorded_refit_inputs();before=(self.root/self.fit_ref['path']).read_bytes()
        ref=p.refit_recorded(self.root,state,training,self.fit_ref,closed,at='2026-09-15T13:02:00Z')
        artifact=p.read_fit(self.root,ref)
        self.assertIsNone(artifact['issued_at'])
        self.assertEqual(artifact['fit_started_at'],'2026-09-15T13:02:00+00:00')
        self.assertEqual(p.fit_available_at(self.root,ref),timestamp('2026-09-15T13:02:05Z'))
        self.assertEqual(artifact['parent_fit_ref'],self.fit_ref)
        self.assertEqual(artifact['training_games'],['sun'])
        self.assertEqual(artifact['closeout_evidence']['evidence'],'VERIFIED_SOURCE_PUBLICATION')
        self.assertIn('public-surface qualification remains required',artifact['publication_limit'])
        self.assertEqual((self.root/self.fit_ref['path']).read_bytes(),before)
        self.assertFalse((self.root/'work/in-season-learning-v1/active-fit-ref.json').exists())
        self.assertEqual(ref,p.refit_recorded(self.root,state,training,self.fit_ref,closed,at='2026-09-16T13:02:00Z'))

    def test_daily_catchup_uses_only_labels_available_before_actual_refit(self):
        rows,labels,closed=self.training()
        labels['sun']['available_at']='2026-09-16T12:00:00Z'
        closed['published_at']='2026-09-16T13:00:00Z'
        result=p.refit(rows,labels,self.artifact,cutoff=TUESDAY,through_season=2026,through_week=2,
                       closeout=closed,fit_at='2026-09-16T13:01:00Z')
        self.assertEqual(result['scheduled_cutoff'],'2026-09-15T13:00:00+00:00')
        self.assertEqual(result['training_cutoff'],'2026-09-16T13:01:00+00:00')
        labels['sun']['available_at']='2026-09-16T13:01:00Z'
        with self.assertRaisesRegex(ValueError,'actual refit time'):
            p.refit(rows,labels,self.artifact,cutoff=TUESDAY,through_season=2026,through_week=2,
                    closeout=closed,fit_at='2026-09-16T13:01:00Z')

    def test_refit_lost_ack_reuses_original_intent_and_label_snapshot(self):
        state,training,closed=self.recorded_refit_inputs()
        from engine.projection import storage
        real=storage.save
        def lost(path,body,immutable=False):
            result=real(path,body,immutable)
            if 'refit-operations' in str(path):raise OSError('lost refit acknowledgment')
            return result
        with patch.object(storage,'save',side_effect=lost),self.assertRaisesRegex(OSError,'lost refit'):
            p.refit_recorded(self.root,state,training,self.fit_ref,closed,at='2026-09-15T13:02:00Z')
        with patch.object(p,'refit',side_effect=AssertionError('Committed refit must not repeat')):
            ref=p.refit_recorded(self.root,state,training,self.fit_ref,closed,at='2026-09-16T13:02:00Z')
        self.assertEqual(p.read_fit(self.root,ref)['fit_started_at'],'2026-09-15T13:02:00+00:00')
        self.assertEqual(p.fit_available_at(self.root,ref),timestamp('2026-09-15T13:02:05Z'))
        with self.assertRaisesRegex(ValueError,'payload changed'):
            p.refit_recorded(self.root,state,training,{'path':'other','sha256':'f'*64},closed,at='2026-09-16T13:02:00Z')

    def test_recorded_refit_rejects_future_or_corrupted_closeout_ack(self):
        state,training,closed=self.recorded_refit_inputs()
        with self.assertRaisesRegex(ValueError,'not confirmed'):
            p.refit_recorded(self.root,state,training,self.fit_ref,closed,at='2026-09-15T13:01:05Z')
        ack=closed.parent/'acknowledgments'/closed.name
        value=json.loads(ack.read_bytes());value['receipt_sha256']='0'*64;ack.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError,'not confirmed'):
            p.refit_recorded(self.root,state,training,self.fit_ref,closed,at='2026-09-15T13:02:00Z')

    def test_refit_rejects_missing_final_and_forged_label_clock(self):
        rows,labels,closed=self.training();args=dict(cutoff=TUESDAY,through_season=2026,through_week=2,closeout=closed)
        with self.assertRaisesRegex(ValueError,'Missing eligible training final'):
            p.refit(rows,{},self.artifact,**args)
        labels['sun']['kickoff_at']='2026-09-12T17:00:00Z'
        with self.assertRaisesRegex(ValueError,'kickoff differs'):
            p.refit(rows,labels,self.artifact,**args)

    def test_refit_calculation_recovery_preserves_fit_and_physical_clock(self):
        state,training,closed=self.recorded_refit_inputs()
        from engine.projection import storage
        real=storage.save
        def interrupted(path,body,immutable=False):
            result=real(path,body,immutable)
            if 'refit-calculations' in str(path):raise OSError('after durable calculation')
            return result
        with patch.object(storage,'save',side_effect=interrupted),self.assertRaisesRegex(OSError,'durable calculation'):
            p.refit_recorded(self.root,state,training,self.fit_ref,closed,at='2026-09-15T13:02:00Z')
        saved=json.loads((self.root/p.BASE/'refit-calculations'/closed.name).read_bytes())
        self.assertFalse((self.root/p.BASE/'fit-availability'/(saved['fit_ref']['sha256']+'.json')).exists())
        with patch.object(p,'refit',side_effect=AssertionError('Do not recompute committed calculation')):
            ref=p.refit_recorded(self.root,state,training,self.fit_ref,closed,at='2026-09-16T13:02:00Z')
        self.assertEqual(ref,saved['fit_ref'])
        self.assertEqual(p.fit_available_at(self.root,ref),timestamp('2026-09-15T13:02:05Z'))

    def test_new_fit_completed_after_lock_is_not_available_to_old_preparation(self):
        self.seed();prep=p.store(self.root,'preparations',self.prepared())
        artifact={**self.artifact,'role':'SHADOW_WEIGHT_ONLY','issued_at':None,'fit_started_at':'2026-09-13T14:59:00Z',
                  'computation_completed_at':'2026-09-13T15:46:00Z','intent_sha256':'a'*64}
        ref=p.store(self.root,'shadow-fits',artifact)
        from engine.projection.storage import save
        path=self.root/p.BASE/'fit-availability'/(ref['sha256']+'.json')
        receipt={'fit_ref':ref,'available_at':'2026-09-13T15:46:01Z','intent_sha256':'a'*64,'status':'DURABLY_STORED_NOT_ACTIVATED'}
        save(path,receipt,immutable=True)
        with self.assertRaisesRegex(ValueError,'Fit unavailable'):p.recorded_scores(self.root,prep,ref)
        receipt['available_at']='2026-09-13T14:59:30Z';path.write_text(json.dumps(receipt))
        with self.assertRaisesRegex(ValueError,'chronology'):p.fit_available_at(self.root,ref)

    def test_fenced_run_reuses_slate_reconstruction_but_checks_each_forecast_and_receipt(self):
        self.seed();other={**self.target,'game_id':'sun2','gametime':'16:25'}
        source=self.source('schedule',[self.g,self.target,other])
        with patch.object(p,'now',return_value=timestamp('2026-09-13T14:00:00Z')):
            schedule_ref=p.capture_schedule(self.root,source)
        games=[{**g,'source_hash':source['sha256']} for g in (self.target,other)]
        body=p.from_recorded(self.root,self.state_ref,games,{'stadiums':[]},
                             at='2026-09-13T15:00:00Z',role='FINAL_ELIGIBLE',schedule_ref=schedule_ref)
        prep=p.store(self.root,'preparations',body);refs=p.recorded_scores(self.root,prep,self.fit_ref)
        cache={}
        with patch.object(p,'verify_preparation',wraps=p.verify_preparation) as reconstruction:
            with patch.object(p,'score',wraps=p.score) as scoring:
                for gid in ('sun','sun2'):
                    self.assertEqual(p.verify_forecast(self.root,refs[gid],cache=cache)['game_id'],gid)
                self.assertEqual(reconstruction.call_count,1);self.assertEqual(scoring.call_count,1)
                bad=p.load(self.root,refs['sun2'],'forecasts');bad['projection']['home_points']+=1
                changed=p.store(self.root,'forecasts',bad)
                with self.assertRaisesRegex(ValueError,'differs from its preparation'):
                    p.verify_forecast(self.root,changed,cache=cache)
                receipt=self.root/p.BASE/'scoring-receipts'/(refs['sun2']['sha256']+'.json')
                saved=json.loads(receipt.read_text());saved['completed_at']='2026-09-14T00:00:00Z'
                receipt.write_text(json.dumps(saved))
                with self.assertRaisesRegex(ValueError,'predeadline scoring'):
                    p.verify_forecast(self.root,refs['sun2'],cache=cache)
                p.verify_forecast(self.root,refs['sun'])
                self.assertEqual(reconstruction.call_count,2);self.assertEqual(scoring.call_count,2)


if __name__=='__main__':unittest.main()
