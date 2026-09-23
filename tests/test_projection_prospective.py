import copy,datetime as dt,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from engine.projection import prospective as p,storage
from engine.projection.scoring import prepare_pair,calculate,artifact_payload
from test_projection_bundle import fixture

class ProspectiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.ref,self.artifact,self.shapes,self.rows,self.game,self.card=fixture(self.root)
        self.source=Path(__file__).resolve().parents[1]
        self.time=dt.datetime(2026,9,27,15,41,tzinfo=dt.timezone.utc)
        self.card['forecast_role']='FINAL_ELIGIBLE';self.card['forecast_bundle_ref']={'path':'fixture','sha256':'a'*64}
        self.b={'input':prepare_pair(self.rows),'chronology':{'status':'RECORDED_CUTOFF_INPUTS'}}
        self.plan={'schema':'prospective-comparison-v1','enrolled_at':'2026-09-26T00:00:00+00:00',
            'policy':p.POLICY,'review_requested':p.REVIEW,'activates_method':False,
            'eligible':[dict(game_id='fixture',season=2026,week=1,home='IND',away='BAL')],
            'reference':{'artifact':artifact_payload(self.artifact),'shapes':self.shapes,
                         'code':p.scorer_code(self.source),'environment':p.environment()}}
        self.planref=p.store(self.root,'plans',self.plan)
        storage.save(self.root/p.BASE/'enrollment-receipts'/(self.planref['sha256']+'.json'),{'plan_ref':self.planref,'observed_durable_at':self.plan['enrolled_at']})
        self.clock=patch.object(p,'now',side_effect=lambda:self.time);self.clock.start();self.addCleanup(self.clock.stop)
        self.verify=patch.object(p.bundle,'verify_card',return_value=self.b);self.verify.start();self.addCleanup(self.verify.stop)
        self.receipt=patch.object(p.cutoff_publication,'verify_receipt',return_value={});self.receipt.start();self.addCleanup(self.receipt.stop)
    def pair(self):return p.pair(self.root,self.planref,self.card,self.source)
    def lock(self):
        card={**self.card,'status':'LOCKED','freeze_time':self.card['cutoff_at']};storage.save(self.root/'outputs/projection-v3/locks/fixture.json',card,immutable=True)
    def grade(self):
        self.lock();storage.save(self.root/'outputs/projection-v3/grades/fixture.json',{**self.card,'status':'FINAL','final':{'home_points':31,'away_points':20}},immutable=True)
    def test_real_isolated_scorer_matches_production_and_same_input(self):
        ref=self.pair();v=p.read(self.root,ref)
        self.assertEqual(v['reference'],self.card['projection']);self.assertEqual(v['input'],self.b['input'])
        self.assertNotIn('home_score',json.dumps(v['input']));self.assertNotIn('spread_line',json.dumps(v['input']))
        self.lock();self.assertIsNone(p.selected(self.root,self.planref,'fixture')[1])
    def test_retry_does_not_rescore_or_move_clock(self):
        ref=self.pair();before=(self.root/ref['path']).read_bytes();self.time+=dt.timedelta(hours=1)
        with patch.object(p,'frozen_score',side_effect=AssertionError('rescore')):self.assertEqual(ref,self.pair())
        self.assertEqual(before,(self.root/ref['path']).read_bytes());self.lock();self.assertIsNone(p.selected(self.root,self.planref,'fixture')[1])
    def test_deadline_equality_refused_and_compute_crossing_never_commits(self):
        self.time=dt.datetime(2026,9,27,15,45,tzinfo=dt.timezone.utc)
        with self.assertRaisesRegex(ValueError,'missed lock'):self.pair()
        self.time-=dt.timedelta(minutes=1)
        def slow(*args):self.time+=dt.timedelta(minutes=1);return {'projection':self.card['projection'],'contributions':{}}
        with patch.object(p,'frozen_score',side_effect=slow),self.assertRaisesRegex(ValueError,'crossed lock'):self.pair()
        self.assertFalse(list((self.root/p.BASE/'pairs').rglob('*.json')))
    def test_write_crossing_or_lost_ack_is_explicitly_late(self):
        real=storage.save
        def delayed(target,value,immutable=False):
            ret=real(target,value,immutable)
            if '/pairs/' in str(target) and not str(target).endswith('.receipt.json'):self.time+=dt.timedelta(minutes=5)
            return ret
        with patch.object(storage,'save',side_effect=delayed):self.pair()
        self.lock();self.assertEqual(p.selected(self.root,self.planref,'fixture')[1],'LATE_OR_UNQUALIFIED_PAIR')
    def test_lost_response_preserves_pair_and_before_deadline_ack_retry(self):
        real=storage.save
        def fail(target,value,immutable=False):
            result=real(target,value,immutable)
            if '/pairs/' in str(target):raise OSError('lost response')
            return result
        with patch.object(storage,'save',side_effect=fail),self.assertRaises(OSError):self.pair()
        with patch.object(p,'frozen_score',side_effect=AssertionError('rescore')):self.pair()
        self.lock();self.assertIsNone(p.selected(self.root,self.planref,'fixture')[1])
    def test_missing_lock_and_latest_bundle_cannot_cherry_pick(self):
        self.pair();self.assertEqual(p.selected(self.root,self.planref,'fixture')[1],'LOCK_MISSING')
        self.card['forecast_bundle_ref']={'path':'second','sha256':'b'*64};self.lock()
        self.assertEqual(p.selected(self.root,self.planref,'fixture')[1],'PAIR_MISSING')
    def test_plan_and_source_and_market_changes_fail(self):
        bad=copy.deepcopy(self.plan);bad['reference']['code']['engine/projection/scoring.py']='0'*64
        with self.assertRaisesRegex(ValueError,'source differs'):p.frozen_score(bad,self.b['input'],self.source)
        request=copy.deepcopy(self.b['input']);request['spread_line']=3
        with self.assertRaises(ValueError):p.frozen_score(self.plan,request,self.source)
        (self.root/self.planref['path']).write_text('{}')
        with self.assertRaisesRegex(ValueError,'hash differs'):self.pair()
    def test_unqualified_legacy_and_pre_enrollment_refused(self):
        for field,value in [('evidence','RETROSPECTIVE'),('forecast_role','PROVISIONAL'),('status','FINAL'),('issued_at','2026-09-25T00:00:00+00:00')]:
            card={**self.card,field:value}
            with self.assertRaises(ValueError):p.pair(self.root,self.planref,card,self.source)
    def test_report_counts_all_enrolled_and_scores_without_worker(self):
        self.pair();self.grade()
        with patch.object(p,'frozen_score',side_effect=AssertionError('report scored')):
            ref=p.report(self.root,self.planref);self.assertEqual(ref,p.report(self.root,self.planref))
        r=p.read(self.root,ref);self.assertEqual(r['eligible_games'],1);self.assertEqual(r['paired_graded_games'],1)
        expected=(abs(self.card['projection']['home_points']-31)+abs(self.card['projection']['away_points']-20))/2
        self.assertAlmostEqual(r['summary']['live']['team']['mae'],expected)
        self.assertEqual(r['summary']['reference'],r['summary']['live']);self.assertIsNone(r['gate']);self.assertFalse(r['activates_method'])
    def test_empty_report_has_named_shortfall_not_fabricated_accuracy(self):
        r=p.read(self.root,p.report(self.root,self.planref));self.assertEqual(r['eligible_games'],1)
        self.assertIsNone(r['summary']['live']);self.assertEqual(r['shortfalls'][0]['reason'],'LOCK_MISSING')
    def test_missing_or_late_enrollment_ack_refuses_pair(self):
        receipt=self.root/p.BASE/'enrollment-receipts'/(self.planref['sha256']+'.json')
        receipt.write_text(json.dumps({'plan_ref':self.planref,'observed_durable_at':'2026-09-27T15:40:01+00:00'}))
        with self.assertRaisesRegex(ValueError,'predates enrollment'):self.pair()
    def test_corrupt_pair_after_ack_refused(self):
        ref=self.pair();v=p.read(self.root,ref);v['reference']['home_points']+=1
        (self.root/ref['path']).write_bytes(p.raw(v));self.lock()
        with self.assertRaisesRegex(ValueError,'hash differs'):p.selected(self.root,self.planref,'fixture')
    def test_enrollment_lost_response_retries_original_plan_and_physical_clock(self):
        schedule=[{'game_id':'fixture','season':2026,'week':1,'game_type':'REG','home_team':'IND','away_team':'BAL','gameday':'2026-09-27','gametime':'13:00'}]
        sr=p.store(self.root,'fixture-schedule',schedule)
        active={'fit_ref':self.ref,'calibration_ref':self.artifact['shapes']}
        with patch.object(p,'admission',return_value=({'fixture':True},active)):
            real=storage.save
            def fail(target,value,immutable=False):
                out=real(target,value,immutable)
                if '/enrollments/' in str(target):raise OSError('lost enrollment response')
                return out
            with patch.object(storage,'save',side_effect=fail),self.assertRaises(OSError):p.enroll(self.root,sr,2026)
            pending=json.loads((self.root/p.BASE/'enrollments/2026.json').read_bytes())
            self.time+=dt.timedelta(seconds=1)
            ref=p.enroll(self.root,sr,2026);self.assertEqual(ref,pending)
            self.assertEqual(p.enrolled_at(self.root,ref),self.time)
            self.time+=dt.timedelta(seconds=1);self.assertEqual(ref,p.enroll(self.root,sr,2026))
            self.assertEqual(p.enrolled_at(self.root,ref),self.time-dt.timedelta(seconds=1))
            self.assertEqual(p.plan(self.root,ref)['review_dates_pacific'][0],'2026-09-29')
            snap=p.read(self.root,p.plan(self.root,ref)['reference']['source_snapshot'])
            self.assertEqual({n:p.sha(v.encode()) for n,v in snap['files'].items()},p.scorer_code(self.source))
    def test_frozen_source_restore_executes_exact_reference(self):
        snapshot=p.store(self.root,'scorer-sources',{'files':{n:(self.source/n).read_text() for n in self.plan['reference']['code']}})
        self.plan['reference']['source_snapshot']=snapshot;ref=p.store(self.root,'plans',self.plan)
        dest=self.root/'restored';result=p.restore_scorer(self.root,ref,dest)
        self.assertEqual(result['status'],'SOURCE_RESTORED')
        self.assertEqual(p.frozen_score(self.plan,self.b['input'],dest)['projection'],self.card['projection'])
        self.assertEqual(p.restore_scorer(self.root,ref,dest),result)
        (dest/'engine/projection/scoring.py').write_text('changed')
        with self.assertRaises(ValueError):p.restore_scorer(self.root,ref,dest)
    def test_enrollment_without_active_authority_fails_before_writing(self):
        with patch.object(p.pipeline_release,'guard',return_value=None),self.assertRaisesRegex(ValueError,'Qualified scheduled'):
            p.enroll(self.root,{'path':'unused','sha256':'0'*64},2026)
        self.assertFalse((self.root/p.BASE/'enrollments').exists())

if __name__=='__main__':unittest.main()

import test_projection_cutoff_publication as publication_fixture
from engine.forecast_system.calendar import timestamp
from scripts import projection_v3_publish as publisher

class LiveBoundaryBase(publication_fixture.PublicationTests):pass
for name in dir(publication_fixture.PublicationTests):
    if name.startswith('test_'):setattr(LiveBoundaryBase,name,None)

class EndToEndTests(LiveBoundaryBase):
    def test_actual_cutoff_publish_pair_lock_grade_and_no_worker_report(self):
        self.setup_publisher();source=Path(__file__).resolve().parents[1]
        definition={'schema':'prospective-comparison-v1','enrolled_at':'2026-09-13T14:59:00+00:00',
            'policy':p.POLICY,'review_requested':p.REVIEW,'activates_method':False,
            'eligible':[dict(game_id='sun',season=int(self.target['season']),week=int(self.target['week']),home=self.target['home_team'],away=self.target['away_team'])],
            'reference':{'artifact':artifact_payload(self.artifact),'shapes':self.shapes,
                         'code':p.scorer_code(source),'environment':p.environment()}}
        ref=p.store(self.root,'plans',definition)
        storage.save(self.root/p.BASE/'enrollment-receipts'/(ref['sha256']+'.json'),{'plan_ref':ref,'observed_durable_at':definition['enrolled_at']})
        first=publisher.run(timestamp('2026-09-13T15:01:00Z'))['games'][0]
        # No bundle, chronology, receipt, worker, lock or grade verifier is mocked.
        with patch.object(p,'now',return_value=timestamp('2026-09-13T15:02:00Z')):
            paired=p.pair(self.root,ref,first,source)
        self.assertEqual(p.read(self.root,paired)['reference'],first['projection'])
        publisher.run(timestamp('2026-09-13T15:45:00Z'))
        storage.save(self.root/'outputs/projection-v3/final-feed.json',{'games':{'sun':{'home_score':31.,'away_score':24.}}})
        publisher.run(timestamp('2026-09-14T01:00:00Z'))
        with patch.object(p,'frozen_score',side_effect=AssertionError('report recomputed forecast')):
            result=p.read(self.root,p.report(self.root,ref))
        self.assertEqual(result['paired_graded_games'],1);self.assertEqual(result['summary']['live'],result['summary']['reference'])
