"""Synthetic admitted lifecycle; retained failures are not experiment decisions."""
import copy
import datetime as dt
import fcntl
import json
from unittest.mock import patch
import test_projection_calibration_runner as runner_fixture
from engine.projection import calibration_execute as x, calibration_report as report, calibration_evaluate as evaluator
from engine.projection import calibration_admission as a, storage, research_ledger as ledger


class Base(runner_fixture.RunnerTests):pass
for name in vars(runner_fixture.RunnerTests):
    if name.startswith('test_'):setattr(Base,name,None)


class ExecutionTests(Base):
    def setUp(self):
        super().setUp();self.key=a.read(self.root,self.ref)['sha256']

    def execute(self,**kwargs):return x.run(self.root,self.ref,clock=self.clock,**kwargs)

    def folder(self):return x.directory(self.root,self.key)

    def test_end_to_end_duplicate_and_expired_report_never_refit(self):
        with patch.object(evaluator,'run',wraps=evaluator.run) as worker:
            first=self.execute();before=self.snapshot();again=self.execute()
            self.assertEqual(first,again);self.assertEqual(worker.call_count,1);self.assertEqual(before,self.snapshot())
        self.assertEqual(first['attempts'][0]['receipt']['state'],'COMPUTED_NOT_RELEASED')
        self.assertFalse(first['activates_method'])
        future=lambda:dt.datetime(2030,1,1,tzinfo=dt.timezone.utc)
        with patch.object(evaluator,'run',side_effect=AssertionError('refit')):
            self.assertEqual(x.run(self.root,self.ref,clock=future),first)
            descriptor=report.publish(self.root,self.key)
            before=self.snapshot();self.assertEqual(report.publish(self.root,self.key),descriptor)
            self.assertEqual(before,self.snapshot())
        text=a.checked_bytes(self.root,descriptor['report_ref']).decode()
        self.assertIn('REVIEW REQUESTED',text);self.assertIn('NOT_ASSESSED',text)
        self.assertEqual(text.count('<details>'),2)
        self.assertIn('No retained, lineage-matched reference diagnostic',text)
        packet=a.read(self.root,descriptor['review_packet_ref'])
        self.assertEqual(packet['status'],'DRAFT_NOT_SENT_NOT_APPROVED');self.assertEqual(len(packet['questions']),4)
        self.assertFalse(packet['activates_method'])

    def test_invalid_admission_writes_nothing_and_never_calls_worker(self):
        self.r['authoritative']=False;self.ref=self.registration();before=self.snapshot()
        with patch.object(evaluator,'run') as worker,self.assertRaisesRegex(ValueError,'Non-authoritative'):
            self.execute()
        worker.assert_not_called();self.assertEqual(before,self.snapshot())

    def test_active_local_lock_does_not_steal_or_fit(self):
        lockpath=x.directory(self.root)/'.worker.lock';storage.write_bytes(lockpath,b'',immutable=True)
        with lockpath.open('r+') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch.object(evaluator,'run') as worker,self.assertRaises(x.WorkerBusy):self.execute()
        worker.assert_not_called();self.assertFalse((self.folder()/'request.json').exists())

    def test_changed_request_under_same_registration_key_rejected(self):
        self.execute();other=self.save('work/alias.json',a.read(self.root,self.ref))
        with patch.object(evaluator,'run') as worker,self.assertRaisesRegex(ValueError,'Changed request'):
            x.run(self.root,other,clock=self.clock)
        worker.assert_not_called()

    def test_failure_is_retained_and_retry_is_explicit_and_bounded(self):
        with patch.object(evaluator,'run',side_effect=RuntimeError('synthetic failure')) as worker:
            with self.assertRaisesRegex(RuntimeError,'synthetic failure'):self.execute()
            self.assertEqual(self.execute()['attempts'][-1]['receipt']['state'],'FAILED')
            self.assertEqual(worker.call_count,1)
            for expected in (2,3):
                with self.assertRaises(RuntimeError):self.execute(retry=True)
                self.assertEqual(len(x.read(self.root,self.key)['attempts']),expected)
            with self.assertRaisesRegex(ValueError,'attempt limit'):self.execute(retry=True)
            self.assertEqual(worker.call_count,3)
        text=report.render(x.read(self.root,self.key),{'series':{}})
        self.assertIn('not a gate rejection',text)

    def test_process_death_before_result_is_interrupted_not_automatically_retried(self):
        with patch.object(evaluator,'run',side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):self.execute()
        with patch.object(evaluator,'run') as worker:
            saved=self.execute();worker.assert_not_called()
        self.assertEqual(saved['attempts'][0]['receipt']['state'],'INTERRUPTED')
        done=self.execute(retry=True)
        self.assertEqual(len(done['attempts']),2)
        self.assertEqual(done['attempts'][0]['receipt']['state'],'INTERRUPTED')
        self.assertEqual(done['attempts'][1]['receipt']['state'],'COMPUTED_NOT_RELEASED')

    def test_lost_response_after_result_recovers_after_deadline_without_refit(self):
        real=storage.save
        def crash(path,value,**kwargs):
            if path.name=='receipt.json':raise KeyboardInterrupt
            return real(path,value,**kwargs)
        with patch.object(storage,'save',side_effect=crash),self.assertRaises(KeyboardInterrupt):self.execute()
        before=(self.folder()/'attempts/001/result.json').read_bytes()
        with patch.object(evaluator,'run') as worker:
            done=x.run(self.root,self.ref,clock=lambda:dt.datetime(2030,1,1,tzinfo=dt.timezone.utc))
            worker.assert_not_called()
        self.assertTrue(done['attempts'][0]['receipt']['recovered_after_lost_response'])
        self.assertEqual(before,(self.folder()/'attempts/001/result.json').read_bytes())

    def test_uncertain_result_and_receipt_sync_do_not_duplicate_effects(self):
        for target in ('result.json','receipt.json'):
            with self.subTest(target=target):
                # Each subcase needs a separate accepted registration identity.
                self.r['disproving_conditions']='registered gate failure '+target
                self.ref=self.registration();self.key=a.read(self.root,self.ref)['sha256']
                owner=x.retained_json if target=='result.json' else storage
                real=owner.save
                def uncertain(path,value,**kwargs):
                    outcome=real(path,value,**kwargs)
                    if path.name==target:raise OSError('uncertain fsync')
                    return outcome
                with patch.object(owner,'save',side_effect=uncertain),self.assertRaises(OSError):self.execute()
                with patch.object(evaluator,'run') as worker:
                    done=self.execute();worker.assert_not_called()
                self.assertEqual(len(done['attempts']),1)
                self.assertEqual(done['attempts'][0]['receipt']['state'],'COMPUTED_NOT_RELEASED')

    def test_tampered_result_rejected_before_report_or_refit(self):
        self.execute();p=self.folder()/'attempts/001/result.json';value=json.loads(p.read_text())
        value['pooled']['candidate']['team']['mae']=0.;value['sha256']=a.digest({k:v for k,v in value.items() if k!='sha256'})
        p.write_text(json.dumps(value))
        with patch.object(evaluator,'run') as worker,self.assertRaisesRegex(ValueError,'durable result intent'):
            self.execute()
        worker.assert_not_called()
        with self.assertRaises(ValueError):report.publish(self.root,self.key)

    def test_result_changed_during_streamed_read_is_rejected(self):
        self.execute()
        real=x.retained_json.load
        def changed(path):
            value=real(path)
            path.write_bytes(path.read_bytes()+b' ')
            return value
        with patch.object(x.retained_json,'load',side_effect=changed),self.assertRaisesRegex(ValueError,'changed during read'):
            x.read(self.root,self.key)

    def test_full_disk_cannot_create_false_success(self):
        real=storage.save
        def fail(path,value,**kwargs):
            if path.name in ('result.json','receipt.json'):raise OSError('disk full')
            return real(path,value,**kwargs)
        with patch.object(storage,'save',side_effect=fail),patch.object(x.retained_json,'save',side_effect=OSError('disk full')),self.assertRaises(OSError):self.execute()
        saved=x.read(self.root,self.key)
        self.assertIsNone(saved['attempts'][0]['receipt']);self.assertIsNone(saved['attempts'][0]['result'])
        with patch.object(evaluator,'run') as worker:
            done=self.execute();worker.assert_not_called()
        self.assertEqual(done['attempts'][0]['receipt']['state'],'INTERRUPTED')

    def test_mutated_point_is_out_of_scope_not_scored(self):
        real=evaluator.run
        def changed(*args,**kwargs):
            v=real(*args,**kwargs);v['records'][0]['forecasts']['candidate']['home_points']+=1
            v['sha256']=a.digest({k:q for k,q in v.items() if k!='sha256'});return v
        with patch.object(evaluator,'run',side_effect=changed),self.assertRaisesRegex(ValueError,'POINT_FORECAST_CHANGED'):
            self.execute()
        saved=x.read(self.root,self.key);self.assertEqual(saved['attempts'][0]['receipt']['state'],'OUT_OF_SCOPE')
        self.assertIsNone(saved['attempts'][0]['result'])

    def test_diagnostic_is_report_only_and_requires_matching_lineage(self):
        done=self.execute();before=copy.deepcopy(done)
        ref=self.save('work/diagnostic.json',{'schema':'calibration-reference-diagnostic-v1',
            'control_sha256':self.r['baseline_hash'],'report':{'schema':'reference-lines-report-v1',
                'label':'DIAGNOSTIC ONLY','series':{},'shortfall':'Synthetic named missing reference'}})
        with patch.object(evaluator,'run',side_effect=AssertionError('report triggered fit')):
            descriptor=report.publish(self.root,self.key,diagnostic_ref=ref)
        self.assertEqual(x.read(self.root,self.key),before)
        self.assertIn('Synthetic named missing reference',a.checked_bytes(self.root,descriptor['report_ref']).decode())
        wrong=self.save('work/wrong.json',{'schema':'calibration-reference-diagnostic-v1','control_sha256':'0'*64})
        with self.assertRaisesRegex(ValueError,'different control lineage'):report.publish(self.root,self.key,diagnostic_ref=wrong)

    def test_numeric_tables_match_retained_result_and_never_activate(self):
        saved=self.execute();result=saved['attempts'][0]['result'];text=report.render(saved,{'series':{}})
        for arm,z in result['pooled'].items():
            for target in ('team','margin','total'):
                v=z[target];row=[arm,target,v['n'],*[v[k] for k in ('mae','rmse','bias','crps','projected_sd','actual_sd')]]
                self.assertIn('| '+' | '.join(report.cell(v) for v in row)+' |',text)
        self.assertEqual(result['pooled']['control']['team']['mae'],result['pooled']['candidate']['team']['mae'])
        self.assertIn('reused seasons',text);self.assertIn('NOT_ASSESSED',text)

    def test_crash_before_start_commit_can_resume_without_inventing_attempt(self):
        real=storage.save
        def fail(path,value,**kwargs):
            if path.name=='start.json':
                path.parent.mkdir(parents=True,exist_ok=True)
                (path.parent/'.start.json.fixture.pending').write_text('partial staging only')
                raise OSError('before atomic start')
            return real(path,value,**kwargs)
        with patch.object(storage,'save',side_effect=fail),patch.object(evaluator,'run') as worker,self.assertRaises(OSError):
            self.execute()
        worker.assert_not_called();saved=x.read(self.root,self.key)
        self.assertEqual(saved['attempts'],[]);self.assertEqual(saved['uncommitted_start'],[1])
        done=self.execute();self.assertEqual(len(done['attempts']),1)
        self.assertEqual(done['attempts'][0]['receipt']['state'],'COMPUTED_NOT_RELEASED')

    def test_retry_requires_fresh_admission_and_unchanged_execution_policy(self):
        with patch.object(evaluator,'run',side_effect=RuntimeError('failure')):
            with self.assertRaises(RuntimeError):self.execute()
        self.r['execution_policy']['maximum_explicit_attempts']=4;self.ref=self.registration()
        with patch.object(evaluator,'run') as worker,self.assertRaisesRegex(ValueError,'calibration contract'):
            self.execute(retry=True)
        worker.assert_not_called()

    def test_clock_rollback_cannot_seal_retained_result(self):
        real=storage.save
        def crash(path,value,**kwargs):
            if path.name=='receipt.json':raise KeyboardInterrupt
            return real(path,value,**kwargs)
        with patch.object(storage,'save',side_effect=crash),self.assertRaises(KeyboardInterrupt):self.execute()
        with patch.object(evaluator,'run') as worker,self.assertRaisesRegex(ValueError,'clock predates'):
            x.run(self.root,self.ref,clock=lambda:dt.datetime(2020,1,1,tzinfo=dt.timezone.utc))
        worker.assert_not_called();self.assertFalse((self.folder()/'attempts/001/receipt.json').exists())
        self.assertEqual(self.execute()['attempts'][0]['receipt']['state'],'COMPUTED_NOT_RELEASED')

    def test_saved_score_summaries_reproduce_by_independent_arithmetic(self):
        saved=self.execute();result=saved['attempts'][0]['result']
        for arm in ('control','candidate'):
            for target in ('team','margin','total'):
                rows=[z for g in result['records'] for z in g['scores'][arm][target]]
                n=len(rows);summary=result['pooled'][arm][target]
                self.assertEqual(summary['n'],n)
                self.assertAlmostEqual(summary['mae'],sum(abs(z['point']-z['actual']) for z in rows)/n)
                self.assertAlmostEqual(summary['bias'],sum(z['point']-z['actual'] for z in rows)/n)
                for level in ('50','80'):
                    alpha=1-int(level)/100;scores=[];hits=0
                    for z in rows:
                        lo,hi=z[level]['lower'],z[level]['upper'];actual=z['actual']
                        hits+=lo<=actual<=hi
                        scores.append(hi-lo+(2/alpha)*max(lo-actual,0)+(2/alpha)*max(actual-hi,0))
                    self.assertEqual(summary[level]['hits'],hits)
                    self.assertAlmostEqual(summary[level]['interval_score'],sum(scores)/n)
        text=report.render(saved,{'series':{}})
        self.assertIn('LEGACY_RIDGE_CENTER',text);self.assertIn('negative-score mass',text)

    def test_unsealed_result_must_match_prior_durable_intent(self):
        real=storage.save
        def crash(path,value,**kwargs):
            if path.name=='receipt.json':raise KeyboardInterrupt
            return real(path,value,**kwargs)
        with patch.object(storage,'save',side_effect=crash),self.assertRaises(KeyboardInterrupt):self.execute()
        p=self.folder()/'attempts/001/result.json';v=json.loads(p.read_text())
        v['pooled']['candidate']['team']['crps']=0
        v['sha256']=a.digest({k:z for k,z in v.items() if k!='sha256'})
        p.write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n')
        with patch.object(evaluator,'run') as worker,self.assertRaisesRegex(ValueError,'durable result intent'):
            self.execute()
        worker.assert_not_called();self.assertFalse((p.parent/'receipt.json').exists())

    def test_killed_live_process_releases_lock_and_records_interruption(self):
        import os,select,subprocess,sys
        from pathlib import Path
        code='''import datetime,json,sys,time
from engine.projection import calibration_execute as x,calibration_evaluate as e
def blocked(*a,**k):
 print('READY',flush=True);time.sleep(30)
e.run=blocked
x.run(sys.argv[1],json.loads(sys.argv[2]),clock=lambda:datetime.datetime.fromisoformat(sys.argv[3]))
'''
        env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1'}
        p=subprocess.Popen([sys.executable,'-B','-c',code,str(self.root),json.dumps(self.ref),self.clock().isoformat()],
            cwd=Path(a.__file__).resolve().parents[2],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
        def cleanup():
            if p.poll() is None:p.kill()
            p.communicate()
        self.addCleanup(cleanup)
        ready=select.select([p.stdout],[],[],30)[0];self.assertTrue(ready,'fixture worker did not enter')
        self.assertEqual(p.stdout.readline().strip(),'READY');self.assertIsNone(p.poll())
        with self.assertRaises(x.WorkerBusy):self.execute()
        p.kill();p.wait(timeout=10)
        with patch.object(evaluator,'run') as worker:
            value=self.execute();worker.assert_not_called()
        self.assertEqual(value['attempts'][-1]['receipt']['state'],'INTERRUPTED')

    def test_cli_returns_failure_for_retained_interrupted_attempt(self):
        import resource
        from pathlib import Path
        from scripts import projection_calibration as cli
        saved={'key':self.key,'attempts':[{'receipt':{'state':'INTERRUPTED'}}]}
        with patch.object(cli.sys,'platform','linux'),patch.object(resource,'getrlimit',return_value=(cli.MEMORY_BYTES,cli.MEMORY_BYTES)),patch.object(Path,'read_text',return_value='timeout'),patch.object(ledger,'run_calibration',return_value=saved),patch('builtins.print'):
            self.assertEqual(cli.main(['--root',str(self.root),'_worker','--registration',json.dumps(self.ref)]),1)

    def test_cli_supervisor_never_allows_larger_budget_or_unbounded_platform(self):
        from scripts import projection_calibration as cli
        with patch.object(cli.sys,'platform','linux'),patch.object(cli.shutil,'which',return_value='/fixture/tool'),patch.object(cli.subprocess,'run') as child:
            for limit in (0,2701,True,1.5):
                with self.assertRaises(ValueError):cli.bounded(['fixture'],deadline=limit)
            child.assert_not_called()
        with patch.object(cli.sys,'platform','darwin'),self.assertRaisesRegex(RuntimeError,'qualified Linux'):
            cli.bounded(['fixture'])

    def test_report_indexes_every_native_attempt_without_human_view_claim(self):
        self.execute()
        with patch.object(evaluator,'run',side_effect=AssertionError('ledger/report fitted')):
            report.publish(self.root,self.key);report.publish(self.root,self.key)
        events=[e['body']['request']['kind'] for e in ledger.inventory(self.root)['events']]
        self.assertCountEqual(events,['CONFIGURATION_RETAINED','ATTEMPT_STARTED','ATTEMPT_RECEIPT','NUMERICAL_RESULT_RETAINED','REPORT_GENERATED'])

    def test_failed_attempt_is_indexed_without_a_gate_rejection(self):
        with patch.object(evaluator,'run',side_effect=RuntimeError('failure')):
            with self.assertRaises(RuntimeError):self.execute()
        report.publish(self.root,self.key)
        events=ledger.inventory(self.root)['events']
        self.assertNotIn('NUMERICAL_RESULT_RETAINED',[e['body']['request']['kind'] for e in events])
        receipt=next(e['body'] for e in events if e['body']['request']['kind']=='ATTEMPT_RECEIPT')
        native=json.loads((self.root/receipt['snapshots'][0]['path']).read_bytes())
        self.assertEqual(native['body']['state'],'FAILED')

    def test_report_ledger_failure_stops_return_then_retries_without_refitting(self):
        self.execute();real=ledger.record
        def fail(*args,**kwargs):
            if kwargs['kind']=='REPORT_GENERATED':raise OSError('ledger unavailable')
            return real(*args,**kwargs)
        with patch.object(ledger,'record',side_effect=fail),self.assertRaises(OSError):report.publish(self.root,self.key)
        with patch.object(evaluator,'run',side_effect=AssertionError('retry refitted')):report.publish(self.root,self.key)
        kinds=[e['body']['request']['kind'] for e in ledger.inventory(self.root)['events']]
        self.assertEqual(kinds.count('REPORT_GENERATED'),1)

    def test_worker_wrapper_indexes_failed_native_receipt_before_raising(self):
        real=x.run
        def frozen(root,ref,**kwargs):return real(root,ref,clock=self.clock,**kwargs)
        with patch.object(x,'run',side_effect=frozen),patch.object(evaluator,'run',side_effect=RuntimeError('failure')):
            with self.assertRaises(RuntimeError):ledger.run_calibration(self.root,self.ref)
        kinds=[e['body']['request']['kind'] for e in ledger.inventory(self.root)['events']]
        self.assertCountEqual(kinds,['CONFIGURATION_RETAINED','ATTEMPT_STARTED','ATTEMPT_RECEIPT'])
