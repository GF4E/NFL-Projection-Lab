"""Real weekly arithmetic/staging/switch with small synthetic retained rows.

The full training-ledger source audit is mocked here and separately tested in
training-ledger tests. Public fetches use explicit response fixtures.
"""
import copy,gzip,io,json
from contextlib import ExitStack
from unittest.mock import patch

import test_projection_pipeline_release as helpers
from test_projection_cutoff_state import game,statistics
from engine.projection import weekly_refit as weekly,public_closeout as public,cutoff_pipeline as p
from engine.projection import cutoff_state as cs,prepared,pipeline_release as release,training_ledger as ledger
from engine.projection.storage import save
from scripts import projection_v3_prepare as preparer,projection_learning
from engine.forecast_system.calendar import timestamp

class Base(helpers.ReleaseTests):pass
for name in vars(helpers.ReleaseTests):
    if name.startswith('test_'):setattr(Base,name,None)

class WeeklyTests(Base):
    def setUp(self):
        super().setUp()
        del self.source  # Parent patch handle shadows the fixture source writer.
        rows=prepared.load(self.root)[0]
        self.training=[]
        finals=[self.g,game('sun','2026-09-13','13:00'),game('mon','2026-09-14','20:30')]
        for g in finals:
            for row in rows[:2]:
                r=copy.deepcopy(row);r.update(game_id=g['game_id'],row_id=g['game_id']+':'+r['team'],game=g,actual_points=None)
                issue=p.time_of(g);cut=p.cutoff_before(issue)
                r['state_lineage'].update(role='HISTORICAL_RECONSTRUCTION',cutoff_at=cut.isoformat(),prepared_at=issue.isoformat())
                self.training.append(r)
        future=game('next','2026-09-20','13:00');future.update(home_score=None,away_score=None,week=3)
        self.capture(finals+[future],[r for g in finals for r in statistics(g)],at='2026-09-15T12:30:00Z')
        self.run_cut('2026-09-14T13:00:00Z','2026-09-14T13:01:00Z')
        self.run_cut('2026-09-15T13:00:00Z','2026-09-15T13:00:10Z')
        _,_,transaction=cs.snapshot_before(self.root,cs.obs.current(self.root),timestamp('2026-09-15T13:02:00Z'))
        save(self.root/'work/projection-v1/source-manifest.json',transaction['sources'])
        new=[]
        for row in rows[:2]:
            r=copy.deepcopy(row);r.update(game_id='next',row_id='next:'+r['team'],game=future,week=3);new.append(r)
        _,meta,_=prepared.load(self.root);raw=gzip.compress(prepared.raw(rows+new),mtime=0)
        prepared.commit(self.root,raw,{**meta,'sha256':prepared.sha(raw)})
        self.clock=timestamp('2026-09-15T13:02:10Z')
        stack=ExitStack();self.addCleanup(stack.close)
        stack.enter_context(patch.object(p,'now',side_effect=lambda:self.clock))
        stack.enter_context(patch.object(preparer,'ROOT',self.root))
        self.history=stack.enter_context(patch.object(ledger,'history',return_value=self.training))
        with patch.object(p,'now',return_value=timestamp('2026-09-15T13:01:50Z')):
            p.capture_schedule(self.root,transaction['sources']['schedule'])
        preparer.prepare(select_scheduled=True,at=self.clock)
        self.parent=release.checkpoint(self.root,label='weekly-parent')
        self.switch(self.parent)
        training_ref=p.store(self.root,'training',{'schema':ledger.SCHEMA,'created_at':'2026-09-15T13:01:00Z',
            'training_games':['thu','sun','mon']})
        weekly.record(self.root,weekly.CONFIG,{'schema':'recorded-weekly-refit-v1','owner':'owner',
            'training_ref':training_ref,'method_fit_ref':self.fit,'method':cs.method(self.root,self.fit)},immutable=True)
        evidence=self.write('outputs/cadence-v2/weeks/2026-w2/scorecard.json',{'simulation':True,'games':['thu','sun','mon']})
        self.closed=self.root/'outputs/cadence-v2/closeouts/2026-09-15.json'
        save(self.closed,{'schema':'closeout-publication-v2','state':'PUBLISHED','all_games_graded':True,
            'season':2026,'week':2,'published_at':'2026-09-15T13:01:00Z','source_commit':'a'*40,
            'artifacts':{evidence['path']:evidence['sha256']}},immutable=True)
        save(self.closed.parent/'acknowledgments'/self.closed.name,{'receipt_sha256':prepared.sha(self.closed.read_bytes()),
            'verified_remote_commit':'b'*40,'confirmed_at':'2026-09-15T13:01:10Z'},immutable=True)
        self.urls={evidence['path']:'https://fixture.invalid/2026-w2/scorecard.json'}
        save(self.root/public.CONFIG,{'schema':'public-closeout-endpoints-v1','base_url':'https://fixture.invalid'})
        self.proof={'schema':'verified-public-closeout-v1','status':'HTTP_BYTES_VERIFIED',
            'observed_at':'2026-09-15T13:01:30Z','receipt_sha256':prepared.sha(self.closed.read_bytes()),
            'urls':self.urls,'artifacts':{evidence['path']:evidence['sha256']}}
        save(public.proof_path(self.closed),self.proof,immutable=True)

    def run_weekly(self):return weekly.run(self.root,2,self.clock,owner='owner')

    def test_actual_refit_stages_switches_and_retry_never_refits(self):
        result=self.run_weekly()
        self.assertEqual(result['state'],'REFIT_COMPLETE')
        self.assertEqual(prepared.active_fit(self.root),result['fit'])
        self.assertEqual(p.read_fit(self.root,result['fit'])['through_week'],2)
        self.assertEqual(release.guard(self.root)['fit_ref'],result['fit'])
        request=weekly.load(self.root,weekly.BASE+'/operations/2026-w2/request.json')
        self.assertEqual(request['fit_at'],self.clock.isoformat())
        with patch.object(p,'refit',side_effect=AssertionError('Duplicate fitting')):
            self.assertEqual(self.run_weekly(),result)
        self.switch(self.parent,'manual-rollback',result['release_ref'])
        with patch.object(p,'refit',side_effect=AssertionError('Must not undo rollback')):
            self.assertEqual(self.run_weekly()['state'],'REFIT_ALREADY_COMPLETED_RELEASE_CHANGED')

    def test_source_push_without_public_proof_never_fits(self):
        public.proof_path(self.closed).unlink()
        with patch.object(public,'confirm',side_effect=FileNotFoundError('Public evidence unavailable')),patch.object(p,'refit_recorded',side_effect=AssertionError('Refit before visible closeout')):
            self.assertEqual(self.run_weekly()['state'],'WAITING_FOR_PUBLIC_CLOSEOUT')
        self.assertFalse((self.root/weekly.BASE/'operations').exists())

    def test_changed_public_content_and_late_evidence_rejected(self):
        bad={**self.proof,'observed_at':'2026-09-16T00:00:00Z'};save(public.proof_path(self.closed),bad)
        with self.assertRaisesRegex(ValueError,'chronology'):self.run_weekly()
        save(public.proof_path(self.closed),self.proof)
        source=self.root/next(iter(self.urls));source.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'artifact changed'):self.run_weekly()

    def test_existing_dispatch_descriptor_is_reused_and_wrong_file_rejected(self):
        with release.dispatch(self.root) as handle:
            self.assertEqual(weekly.run(self.root,2,self.clock,owner='owner',dispatch_handle=handle)['state'],'REFIT_COMPLETE')
        with (self.root/'wrong-lock').open('w') as other,self.assertRaisesRegex(ValueError,'descriptor'):
            weekly.run(self.root,2,self.clock,owner='owner',dispatch_handle=other)

    def test_crash_after_fit_switch_reconciles_before_other_work(self):
        real=release.save;seen=[]
        def crash(path,value,immutable=False):
            answer=real(path,value,immutable)
            if str(path).endswith(release.FIT_POINTER) and not seen:
                seen.append(True);raise OSError('Simulated interruption')
            return answer
        with patch.object(release,'save',side_effect=crash),self.assertRaises(OSError):self.run_weekly()
        with self.assertRaisesRegex(ValueError,'reconciliation'):release.guard(self.root)
        with patch.object(p,'refit',side_effect=AssertionError('No repeated fit')),release.dispatch(self.root) as handle:
            result=weekly.recover(self.root,'owner',handle)
        self.assertEqual(result['state'],'REFIT_COMPLETE');release.guard(self.root)
        self.assertEqual(self.run_weekly(),result)

    def test_actual_weekly_entry_routes_to_recorded_path(self):
        with patch.multiple(projection_learning,ROOT=self.root),patch.object(projection_learning,'_weekly_refit',side_effect=AssertionError('Legacy route')):
            result=projection_learning.weekly_refit([],2,self.clock,owner='owner')
        self.assertEqual(result['state'],'REFIT_COMPLETE')

    def test_public_confirmer_checks_actual_response_bytes(self):
        public.proof_path(self.closed).unlink()
        payload=(self.root/next(iter(self.urls))).read_bytes()
        response=io.BytesIO(payload);response.status=200
        with patch.object(public.urllib.request,'urlopen',return_value=response):
            proof=public.confirm(self.root,self.closed)
        self.assertEqual(proof['artifacts'],self.proof['artifacts'])
        public.proof_path(self.closed).unlink()
        response=io.BytesIO(b'not the report');response.status=200
        with patch.object(public.urllib.request,'urlopen',return_value=response),self.assertRaisesRegex(ValueError,'content differs'):
            public.confirm(self.root,self.closed)
        self.assertFalse(public.proof_path(self.closed).exists())

    def test_changed_owner_generation_blocks_retry_before_fitting(self):
        with patch.object(p,'refit_recorded',side_effect=OSError('interrupted fit')),self.assertRaises(OSError):self.run_weekly()
        save(self.root/release.OWNER,{'state':'ACTIVE','owner':'owner','generation':2})
        with patch.object(p,'refit_recorded',side_effect=AssertionError('Changed owner must not fit')),self.assertRaisesRegex(ValueError,'configuration changed'):
            self.run_weekly()

    def test_three_failed_attempts_stop_new_computation(self):
        with patch.object(p,'refit_recorded',side_effect=OSError('interrupted fit')) as fit:
            for _ in range(3):
                with self.assertRaises(OSError):self.run_weekly()
            self.assertEqual(self.run_weekly()['reason'],'WEEKLY_ATTEMPTS_EXHAUSTED')
            self.assertEqual(fit.call_count,3)

    def test_retry_keeps_original_fit_start_after_clock_advances(self):
        original=self.clock
        with patch.object(p,'refit_recorded',side_effect=OSError('before calculation')),self.assertRaises(OSError):self.run_weekly()
        self.clock=timestamp('2026-09-15T14:02:10Z')
        real=p.refit_recorded
        with patch.object(p,'refit_recorded',wraps=real) as fit:
            result=self.run_weekly()
        self.assertEqual(result['state'],'REFIT_COMPLETE')
        self.assertEqual(fit.call_args.kwargs['at'],original.isoformat())

    def test_elapsed_staging_deadline_prevents_activation(self):
        real=preparer.stage_refit
        def slow(*args,**kwargs):
            target=real(*args,**kwargs)
            self.clock=timestamp('2026-09-15T13:12:11Z')
            return target
        with patch.object(preparer,'stage_refit',side_effect=slow),self.assertRaisesRegex(TimeoutError,'handoff deadline'):
            self.run_weekly()
        self.assertEqual(release.pointer(self.root,release.ACTIVE),self.parent)
        self.assertEqual(prepared.active_fit(self.root),self.fit)
