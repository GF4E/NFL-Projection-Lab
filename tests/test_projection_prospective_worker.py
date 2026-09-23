import copy,datetime as dt,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import test_projection_prospective as fixtures
from engine.projection import prospective as p,prospective_worker as w,storage,pipeline_release as release
from engine.projection.watchdog import assess_host
from test_projection_watchdog import host,NOW

class Base(fixtures.ProspectiveTests):pass
for name in vars(fixtures.ProspectiveTests):
    if name.startswith('test_'):setattr(Base,name,None)

class CollectorTests(Base):
    def setUp(self):
        super().setUp()
        self.card['cutoff_forecast_ref']={'path':'fixture-cutoff','sha256':'b'*64}
        self.card['release_ref']={'path':'fixture-release','sha256':'c'*64}
        storage.save(self.root/release.OWNER,{'state':'ACTIVE','owner':'owner'})
        with release.dispatch(self.root):pass
        self.config=w.configure(self.root,self.planref,self.source,'owner')
        storage.save(self.root/'outputs/projection-v3/live/fixture.json',self.card)
    def test_unenrolled_scheduler_does_not_start_worker_or_create_plan(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);storage.save(root/release.OWNER,{'state':'ACTIVE','owner':'owner'})
            with release.dispatch(root) as fd,patch.object(w,'bounded',side_effect=AssertionError('unconfigured worker')):
                self.assertEqual(w.collect(root,'owner',fd)['state'],'NOT_ENROLLED')
            self.assertFalse((root/p.BASE).exists())
    def test_owner_and_unrelated_descriptor_refused(self):
        with (self.root/'other-lock').open('w+') as fd,self.assertRaises(ValueError):w.collect(self.root,'owner',fd)
        with release.dispatch(self.root) as fd,self.assertRaisesRegex(ValueError,'fenced'):w.collect(self.root,'different',fd)
        with self.assertRaisesRegex(ValueError,'descriptor'):w.collect(self.root,'owner',None)
    def test_collector_pair_retry_and_configuration_changes(self):
        with release.dispatch(self.root) as fd:
            first=w.worker(self.root,'owner',fd)
            with patch.object(p,'frozen_score',side_effect=AssertionError('duplicate scored')):second=w.worker(self.root,'owner',fd)
        self.assertEqual(first,second);self.assertEqual(first['results'][0]['state'],'PAIRED')
        self.assertEqual(w.configure(self.root,self.planref,self.source,'owner'),self.config)
        with self.assertRaises(ValueError):w.configure(self.root,self.planref,self.source,'different')
    def test_lock_reserve_and_equality_never_score(self):
        self.time=dt.datetime(2026,9,27,15,44,tzinfo=dt.timezone.utc)
        with patch.object(p,'frozen_score',side_effect=AssertionError('late score')):
            r=w.collect_one(self.root,self.config,self.card)
        self.assertEqual(r['state'],'DEFERRED_LOCK_RESERVE')
        self.assertFalse((self.root/p.BASE/'collection').exists())
    def test_interrupted_attempt_reconciles_pair_without_rescoring(self):
        real=w.seal_attempt
        with patch.object(w,'seal_attempt',side_effect=OSError('receipt failed')),self.assertRaises(OSError):w.collect_one(self.root,self.config,self.card)
        with patch.object(p,'frozen_score',side_effect=AssertionError('recovery scored')):r=w.collect_one(self.root,self.config,self.card)
        self.assertEqual(r['state'],'PAIRED')
        self.assertEqual(len(list((self.root/p.BASE/'collection').rglob('start.json'))),1)
    def test_pair_ack_failure_recovers_without_replacing_failed_receipt(self):
        with patch.object(p,'acknowledge',side_effect=OSError('lost acknowledgment')):
            first=w.collect_one(self.root,self.config,self.card)
        self.assertEqual(first['state'],'INTERRUPTED')
        receipt=next((self.root/p.BASE/'collection').rglob('receipt.json'));before=receipt.read_bytes()
        with patch.object(p,'frozen_score',side_effect=AssertionError('recovery rescored')):
            recovered=w.collect_one(self.root,self.config,self.card)
            self.assertEqual(recovered,w.collect_one(self.root,self.config,self.card))
        self.assertEqual(recovered['state'],'PAIRED');self.assertEqual(before,receipt.read_bytes())
        self.assertTrue(receipt.with_name('recovery.json').exists())
    def test_timeout_is_bounded_to_three_and_integrity_failure_latches(self):
        with patch.object(p,'pair',side_effect=subprocess.TimeoutExpired('scorer',5)):
            for _ in range(3):self.assertEqual(w.collect_one(self.root,self.config,self.card)['state'],'INTERRUPTED')
        with patch.object(p,'pair',side_effect=AssertionError('fourth attempt')):
            self.assertEqual(w.collect_one(self.root,self.config,self.card)['reason'],'ATTEMPTS_EXHAUSTED')
        self.assertEqual(len(list((self.root/p.BASE/'collection').rglob('start.json'))),3)
    def test_integrity_failure_is_not_retried(self):
        with patch.object(p,'pair',side_effect=ValueError('bad bundle')) as score:
            first=w.collect_one(self.root,self.config,self.card)
            self.assertEqual(first,w.collect_one(self.root,self.config,self.card))
        self.assertEqual(first['state'],'FAILED_CLOSED');self.assertEqual(score.call_count,1)
    def test_corrupt_committed_pair_does_not_report_success(self):
        r=w.collect_one(self.root,self.config,self.card);(self.root/r['pair_ref']['path']).write_text('{}')
        with self.assertRaisesRegex(ValueError,'hash differs'):w.collect_one(self.root,self.config,self.card)
    def test_supervisor_failure_is_durable_and_shadow_only(self):
        with release.dispatch(self.root) as fd,patch.object(w,'bounded',return_value=subprocess.CompletedProcess([],137,'','')):
            r=w.collect(self.root,'owner',fd)
        self.assertEqual(r['reason'],'PASS_TIME_LIMIT');self.assertFalse(r['activates_method'])
        self.assertEqual(w.health(self.root)['state'],'DEGRADED')
        h=host();h['prospective']=w.health(self.root)
        self.assertIn('PROSPECTIVE_COLLECTOR_DEGRADED',[x['code'] for x in assess_host(h,{'received_at':NOW.isoformat()},NOW)])
    def test_receipt_history_does_not_grow_when_condition_unchanged(self):
        one=w.status(self.root,{'state':'DEGRADED','reason':'fixture'})
        self.time+=dt.timedelta(minutes=1)
        two=w.status(self.root,{'state':'DEGRADED','reason':'fixture'})
        self.assertEqual(one['observed_at'],two['observed_at'])
        self.assertEqual(len(list((self.root/p.BASE/'collector-history').glob('*.json'))),1)

class LifecycleTests(fixtures.LiveBoundaryBase):
    def test_collector_actual_publisher_lock_grade_and_report(self):
        self.setup_publisher();source=Path(__file__).resolve().parents[1]
        definition={'schema':'prospective-comparison-v1','enrolled_at':'2026-09-13T14:59:00+00:00',
            'policy':p.POLICY,'review_requested':p.REVIEW,'activates_method':False,
            'eligible':[dict(game_id='sun',season=int(self.target['season']),week=int(self.target['week']),home=self.target['home_team'],away=self.target['away_team'])],
            'reference':{'artifact':fixtures.artifact_payload(self.artifact),'shapes':self.shapes,
                         'code':p.scorer_code(source),'environment':p.environment()}}
        ref=p.store(self.root,'plans',definition)
        storage.save(self.root/p.BASE/'enrollment-receipts'/(ref['sha256']+'.json'),{'plan_ref':ref,'observed_durable_at':definition['enrolled_at']})
        storage.save(self.root/release.OWNER,{'state':'ACTIVE','owner':'owner'})
        w.configure(self.root,ref,source,'owner')
        first=fixtures.publisher.run(fixtures.timestamp('2026-09-13T15:01:00Z'))['games'][0]
        with release.dispatch(self.root) as fd,patch.object(p,'now',return_value=fixtures.timestamp('2026-09-13T15:02:00Z')):
            result=w.worker(self.root,'owner',fd)
            self.assertEqual(result['results'][0]['state'],'PAIRED')
            with patch.object(p,'frozen_score',side_effect=AssertionError('retry rescored')):
                self.assertEqual(result,w.worker(self.root,'owner',fd))
        saved=p.read(self.root,result['results'][0]['pair_ref'])
        self.assertEqual(saved['live_bundle_ref'],first['forecast_bundle_ref'])
        self.assertEqual(saved['reference'],first['projection'])
        fixtures.publisher.run(fixtures.timestamp('2026-09-13T15:45:00Z'))
        storage.save(self.root/'outputs/projection-v3/final-feed.json',{'games':{'sun':{'home_score':31.,'away_score':24.}}})
        fixtures.publisher.run(fixtures.timestamp('2026-09-14T01:00:00Z'))
        with patch.object(p,'frozen_score',side_effect=AssertionError('report rescored')):
            report=p.read(self.root,p.report(self.root,ref))
        self.assertEqual(report['paired_graded_games'],1)
        self.assertEqual(report['summary']['reference'],report['summary']['live'])

class SchedulerBoundaryTests(unittest.TestCase):
    def test_shadow_failure_and_failed_receipt_cannot_skip_primary_publication(self):
        from contextlib import ExitStack
        from scripts import cloud_scheduler as s
        with tempfile.TemporaryDirectory() as tmp,ExitStack() as stack:
            root=Path(tmp);events=[]
            for version in ('v1','v3'):
                storage.save(root/f'work/projection-{version}/fit-ref.json',{})
            stack.enter_context(patch.multiple(s,ROOT=root,OUT=root/'outputs/model-pick-v1'))
            stack.enter_context(patch.object(s,'ownership',return_value={'state':'ACTIVE','owner':'owner'}))
            stack.enter_context(patch.object(s,'synchronize'))
            stack.enter_context(patch.object(s,'worker',return_value=0))
            stack.enter_context(patch.object(s,'publish_artifacts',side_effect=lambda:events.append('publish')))
            for name in ('engine.projection.initial_release.recover','engine.projection.weekly_refit.recover',
                         'engine.projection.pipeline_release.guard','scripts.projection_publish.sync',
                         'engine.game_card_runtime.sync','engine.live_scorecard.run','engine.board_bridge.publish',
                         'engine.suit_publish.publish','scripts.projection_v3_prepare.prepare','scripts.projection_learning.report',
                         'scripts.suit_prepare.run','engine.pick_store.put'):
                stack.enter_context(patch(name))
            stack.enter_context(patch('engine.projection.finals.refresh',return_value={'state':'FRESH'}))
            stack.enter_context(patch('scripts.projection_v3_publish.run',side_effect=lambda **kw:events.append('projection')))
            def fail(root,owner,fd):
                # The same descriptor is the actual scheduler lock, not a mock.
                with release.dispatch(root,fd):events.append('shadow')
                raise ValueError('fixture')
            stack.enter_context(patch.object(w,'collect',side_effect=fail))
            stack.enter_context(patch.object(w,'status',side_effect=OSError('disk full')))
            self.assertEqual(s.run('capture','owner')['state'],'OK')
            self.assertEqual(events,['publish','projection','shadow','publish'])

class ResumeSlateTests(Base):
    @unittest.skipUnless(sys.platform.startswith('linux'),'Actual qualified Linux supervisor')
    def test_killed_slate_resumes_committed_pairs_across_bounded_passes(self):
        # Synthetic chronology is explicit; real numerical children, kernel
        # deadlines, durable effects and descriptor ownership are exercised.
        source=Path(__file__).resolve().parents[1];requests={};cards=[]
        for i in range(16):
            gid=f'fixture-{i:02d}';card=copy.deepcopy(self.card);card['game_id']=gid
            card.update(cutoff_forecast_ref={'path':'fixture','sha256':'b'*64},release_ref={'path':'fixture','sha256':'c'*64},
                        forecast_bundle_ref={'path':gid,'sha256':f'{i:064x}'})
            cards.append(card);request=copy.deepcopy(self.b['input']);request['game_id']=gid;requests[gid]=request
            storage.save(self.root/f'outputs/projection-v3/live/{gid}.json',card)
        definition=copy.deepcopy(self.plan);definition['eligible']=[{k:c[k] for k in ('game_id','season','week','home','away')} for c in cards]
        ref=p.store(self.root,'plans',definition)
        storage.save(self.root/p.BASE/'enrollment-receipts'/(ref['sha256']+'.json'),{'plan_ref':ref,'observed_durable_at':definition['enrolled_at']})
        storage.save(self.root/release.OWNER,{'state':'ACTIVE','owner':'owner'})
        w.configure(self.root,ref,source,'owner');storage.save(self.root/'fixture-requests.json',requests)
        script=self.root/'bounded-fixture.py'
        script.write_text('''import datetime,json,os,sys,time
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from engine.projection import prospective as p,prospective_worker as w
root=Path(sys.argv[2]);requests=json.loads((root/'fixture-requests.json').read_bytes())
p.now=lambda:datetime.datetime(2026,9,27,15,41,tzinfo=datetime.timezone.utc)
p.bundle.verify_card=lambda root,card:{'input':requests[card['game_id']],'chronology':{'status':'RECORDED_CUTOFF_INPUTS'}}
p.cutoff_publication.verify_receipt=lambda *a:None
real=p.frozen_score
def slow(*a):
    time.sleep(.3)
    return real(*a)
p.frozen_score=slow
with os.fdopen(os.dup(int(sys.argv[3])),'a+') as fd:result=w.worker(root,'owner',fd)
print(json.dumps(result))
''')
        completed={};killed=0
        with release.dispatch(self.root) as fd:
            for _ in range(6):
                child=w.bounded([sys.executable,'-B',str(script),str(source),str(self.root),str(fd.fileno())],fd)
                if child.returncode in (-9,124,137):killed+=1
                else:self.assertEqual(child.returncode,0,child.stderr)
                for name,data in completed.items():self.assertEqual((self.root/name).read_bytes(),data)
                pairs=list((self.root/p.BASE/'pairs'/ref['sha256']).rglob('*.json'))
                pairs=[f for f in pairs if not f.name.endswith('.receipt.json')]
                completed.update({str(f.relative_to(self.root)):f.read_bytes() for f in pairs})
                if child.returncode==0:break
        self.assertGreater(killed,0);self.assertEqual(len(completed),16)
        self.assertEqual(json.loads(child.stdout)['state'],'COLLECTED')
        self.assertTrue(all(r['state']=='PAIRED' for r in json.loads(child.stdout)['results']))

class SupervisionTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform.startswith('linux'),'Actual qualified Linux supervisor')
    def test_actual_child_accepts_supervisor_and_descriptor_but_cannot_enroll(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);storage.save(root/release.OWNER,{'state':'ACTIVE','owner':'owner'})
            with release.dispatch(root) as fd:
                child=w.bounded([sys.executable,'-B',str(Path(w.__file__).resolve().parents[2]/'scripts/projection_prospective_collect.py'),
                    '--root',str(root),'--owner','owner','--dispatch-fd',str(fd.fileno())],fd)
            self.assertEqual(child.returncode,1)
            self.assertIn('Collector cannot enroll itself',child.stderr)
            self.assertFalse((root/p.BASE).exists())
    @unittest.skipUnless(sys.platform.startswith('linux'),'Actual qualified Linux supervisor')
    def test_wall_limit_kills_descendant_group_and_memory_bound_is_inherited(self):
        import time
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);script=root/'child.py';out=root/'limit.json'
            script.write_text("import json,resource,subprocess,sys,time\nfrom pathlib import Path\np=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'])\nPath(sys.argv[1]).write_text(json.dumps({'pid':p.pid,'limits':resource.getrlimit(resource.RLIMIT_AS)}))\ntime.sleep(30)\n")
            with (root/'lock').open('w+') as fd:
                started=time.monotonic();result=w.bounded([sys.executable,str(script),str(out)],fd)
            self.assertIn(result.returncode,(-9,124,137));self.assertLess(time.monotonic()-started,7)
            r=json.loads(out.read_text());self.assertEqual(r['limits'],[w.POLICY['memory_bytes']]*2)
            stat=Path('/proc')/str(r['pid'])/'stat'
            if stat.exists():self.assertEqual(stat.read_text().split()[2],'Z')
