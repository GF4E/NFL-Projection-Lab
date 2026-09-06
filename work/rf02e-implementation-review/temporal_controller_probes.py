"""Synthetic-only controller/persistence probes; never opens a historical archive."""
from pathlib import Path
import hashlib
import importlib
import json
import os
import signal
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02e-implementation-review')
sys.path.insert(0, str(REPO / 'scripts'))
m = importlib.import_module('research_score_conditional_infer_archive')

class Probe(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='synthetic-', dir=WORK)
        self.output = Path(self.temp.name)
        self.calls = []
        self.pointer = {'path': str(self.output / 'synthetic-pointer'), 'sha256': 'a' * 64}
        self.inputs = {key: self.pointer for key in ('Accepted RF-02D historical protocol',
                       '`config/research-team-score-conditional.v1.json`', 'Actual temporal terminal review',
                       'Actual numerical terminal review', m.INPUT_NAMES[2])}
        self.impl = {'code_hashes': {}, 'runtime': {}}
        self.budget = None
        def preflight(root, pointer, budget):
            self.calls.append('preflight'); self.budget = budget
            return self.inputs, self.impl, {'protocol': self.pointer}, self.pointer, self.output
        def authenticate(*args):
            self.calls.append('authenticate'); self.assertIs(args[-1], self.budget)
            return None, None, {}, {}, {}
        def assemble(*args):
            self.calls.append('assemble')
            return [], {}, {}, {'checks': {k: True for k in ('admission','leakage','falsification','no_new_numerical_failure')}}
        def evaluate(*args):
            self.calls.append('evaluate'); return {'status': 'reject_all', 'production_authorized': False}
        self.patches = [patch.object(m,'preflight',preflight),patch.object(m,'authenticate',authenticate),
                        patch.object(m,'assemble',assemble),patch.object(m,'evaluate',evaluate),
                        patch.object(m,'check_sources',lambda *args: self.calls.append('check_sources')),
                        patch.object(m,'read_pointer',lambda *args: b'{}')]
        for p in self.patches: p.start()
        self.addCleanup(self.temp.cleanup)
        for p in reversed(self.patches): self.addCleanup(p.stop)
    def invoke(self):
        return m.run(REPO, self.pointer['path'], self.pointer['sha256'])
    def archive(self):
        dirs=list(self.output.iterdir()); self.assertEqual(len(dirs),1); return dirs[0]
    def read(self,name): return json.loads((self.archive()/name).read_bytes())
    def test_success_and_existing_identity_refusal(self):
        result=self.invoke(); self.assertEqual(result['status'],'reject_all')
        files={str(p.relative_to(self.archive())):p.read_bytes() for p in self.archive().rglob('*') if p.is_file()}
        terminal=self.read('completion/terminal.json'); self.assertEqual(terminal['rf02d_scientific_terminal_status'],'protocol_invalid')
        self.assertEqual(terminal['execution_counts']['evaluate'],1)
        second=self.invoke(); self.assertEqual(second['status'],'protocol_invalid')
        self.assertEqual(self.calls.count('evaluate'),1); self.assertEqual(self.calls.count('authenticate'),1)
        self.assertEqual(files,{str(p.relative_to(self.archive())):p.read_bytes() for p in self.archive().rglob('*') if p.is_file()})
    def test_expired_shared_clock_before_evaluate(self):
        previous=m.assemble
        def expire(*args):
            value=previous(*args); self.budget.started-=601; return value
        with patch.object(m,'assemble',expire): result=self.invoke()
        self.assertEqual(result['status'],'protocol_invalid'); self.assertNotIn('evaluate',self.calls)
        terminal=self.read('completion/terminal.json'); self.assertGreater(terminal['scientific_stop_elapsed_seconds'],600)
        self.assertEqual(terminal['execution_counts']['evaluate'],0)
    def test_invalid_evaluator_preserved_once(self):
        def invalid(*args): self.calls.append('evaluate'); return {'status':'protocol_invalid','reason':'synthetic-invalid'}
        with patch.object(m,'evaluate',invalid): result=self.invoke()
        self.assertEqual(result['status'],'protocol_invalid'); self.assertEqual(self.calls.count('evaluate'),1)
        self.assertEqual(self.read('evaluation.json'),{'status':'protocol_invalid','reason':'synthetic-invalid'})
        self.assertIn('synthetic-invalid',self.read('completion/terminal.json')['reason'])
    def test_swallowed_deadline_result_written_only_in_invalid_grace(self):
        write=m.Store.write; observations=[]
        def swallowed(*args):
            self.calls.append('evaluate'); self.budget.started-=601
            m.signal.setitimer(signal.ITIMER_REAL,0)
            return {'status':'protocol_invalid','reason':'synthetic-swallowed-deadline'}
        def observed(store,name,value):
            if name=='evaluation.json':
                remaining=signal.getitimer(signal.ITIMER_REAL)[0]
                observations.append(remaining)
                self.assertGreater(remaining,0,'expired one-shot deadline must be replaced by bounded invalid grace before writing')
                self.assertLessEqual(remaining,30)
            return write(store,name,value)
        with patch.object(m,'evaluate',swallowed),patch.object(m.Store,'write',observed): result=self.invoke()
        self.assertEqual(result['status'],'protocol_invalid');self.assertEqual(self.calls.count('evaluate'),1)
        self.assertEqual(len(observations),1)
        self.assertEqual(self.read('evaluation.json')['reason'],'synthetic-swallowed-deadline')
        self.assertNotIn('check_sources',self.calls)

    def test_real_evaluator_catches_actual_signal_then_grace_persists(self):
        inference=importlib.import_module('research_score_conditional_inference')
        real_evaluate=inference.evaluate; setitimer=m.signal.setitimer; write=m.Store.write
        requests=[]; write_timers=[]
        def wait_validation(*args): time.sleep(.1);raise AssertionError('signal was not delivered')
        def timer(which,seconds,*args):
            requests.append(seconds)
            return setitimer(which,.01 if seconds>30 else seconds,*args)
        def observed_evaluate(*args):
            self.calls.append('evaluate'); return real_evaluate(*args)
        def observed_write(store,name,value):
            if name=='evaluation.json': write_timers.append(signal.getitimer(signal.ITIMER_REAL)[0])
            return write(store,name,value)
        with patch.object(inference,'_validate',wait_validation),patch.object(m,'evaluate',observed_evaluate),patch.object(m.signal,'setitimer',timer),patch.object(m.Store,'write',observed_write):
            result=self.invoke()
        self.assertEqual(result['status'],'protocol_invalid');self.assertEqual(self.calls.count('evaluate'),1)
        evaluation=self.read('evaluation.json')
        self.assertEqual(evaluation['failure_type'],'DerivationFailure')
        self.assertIn('registered_600_second_deadline:inference',evaluation['reason'])
        self.assertTrue(any(seconds>590 for seconds in requests));self.assertIn(30,requests)
        self.assertEqual(len(write_timers),1);self.assertGreater(write_timers[0],0);self.assertLessEqual(write_timers[0],30)
        self.assertNotIn('check_sources',self.calls)

    def test_partial_ordinary_bytes_indexed_invalid(self):
        base=m.Store.__mro__[1]; original=base.write
        def partial(store,name,raw):
            if name=='evaluation.json':
                with (store.path/name).open('xb') as f:f.write(raw[:17])
                raise OSError('synthetic-short-write')
            return original(store,name,raw)
        with patch.object(base,'write',partial): result=self.invoke()
        self.assertEqual(result['status'],'protocol_invalid'); index=self.read('completion/artifact-index.json')
        raw=(self.archive()/'evaluation.json').read_bytes(); self.assertEqual(len(raw),17)
        self.assertEqual(index['uncommitted_artifacts'],['evaluation.json'])
        self.assertEqual(index['files']['evaluation.json'],{'bytes':17,'sha256':hashlib.sha256(raw).hexdigest()})
        self.assertEqual(self.calls.count('evaluate'),1)
    def test_abandoned_success_stage_is_uncommitted_only(self):
        rename=m.os.rename; first=[True]
        def fail_once(*args,**kwargs):
            if first[0]: first[0]=False; raise OSError('synthetic-prerename-interruption')
            return rename(*args,**kwargs)
        with patch.object(m.os,'rename',fail_once): result=self.invoke()
        self.assertEqual(result['status'],'protocol_invalid'); index=self.read('completion/artifact-index.json')
        self.assertEqual(len(index['uncommitted_staging']),1)
        stage=index['uncommitted_staging'][0]
        for name in ('terminal.json','artifact-index.json'):
            raw=(self.archive()/stage/name).read_bytes()
            self.assertEqual(index['files'][stage+'/'+name],{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
        self.assertEqual(self.read('completion/terminal.json')['status'],'protocol_invalid')
    def test_postrename_fsync_has_no_second_terminal(self):
        fsync=m.os.fsync; raised=[False]
        def late(fd):
            if not raised[0] and any(self.output.glob('*/completion/terminal.json')):
                raised[0]=True; raise OSError('synthetic-late-fsync')
            return fsync(fd)
        with patch.object(m.os,'fsync',late):
            with self.assertRaisesRegex(m.DerivationFailure,'completion_already_published_finalization_failed'):
                self.invoke()
        self.assertTrue(raised[0]);self.assertEqual(self.read('completion/terminal.json')['status'],'reject_all')
        self.assertEqual(len(list(self.archive().glob('.completion-staging-*'))),0)
        self.assertEqual(self.calls.count('evaluate'),1)
    def test_real_invalid_grace_expiry_no_science(self):
        finish=m.Store.finish; setitimer=m.signal.setitimer; requests=[]
        def wait_invalid(store,terminal,budget=None):
            if terminal['status']=='protocol_invalid': time.sleep(.1)
            return finish(store,terminal,budget)
        def timer(which,seconds,*args):
            requests.append(seconds);return setitimer(which,.01 if seconds==30 else seconds,*args)
        def failure(*args): self.calls.append('evaluate');raise m.DerivationFailure('synthetic-inference-failure')
        with patch.object(m,'evaluate',failure),patch.object(m.Store,'finish',wait_invalid),patch.object(m.signal,'setitimer',timer):
            with self.assertRaisesRegex(m.DerivationFailure,'invalid_finalization_only_30_second_deadline'): self.invoke()
        self.assertIn(30,requests);self.assertEqual(self.calls.count('evaluate'),1)
        self.assertFalse((self.archive()/'completion').exists())
        self.assertTrue((self.archive()/'authenticated-inputs.json').is_file())
        self.assertEqual(signal.getitimer(signal.ITIMER_REAL),(0.0,0.0))

if __name__=='__main__':unittest.main(verbosity=2)
