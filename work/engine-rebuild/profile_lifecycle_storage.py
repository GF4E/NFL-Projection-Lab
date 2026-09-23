"""Isolated lifecycle profiling with durable partial observations, never autoqualified."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import resource
import stat
import sys
import time
from unittest.mock import patch

ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
sys.path.insert(0,str(ROOT))
from engine.projection import storage

class PeakObserver:
    def __init__(self, parent, checkpoint):
        self.parent=Path(parent).resolve();self.checkpoint=Path(checkpoint).resolve()
        if self.checkpoint.is_relative_to(self.parent):raise ValueError('Checkpoint must be outside measured tree')
        if self.checkpoint.exists():raise ValueError('New attempt checkpoint required')
        self.started=time.monotonic();self.last_checkpoint=float('-inf')
        self.state={'sample_count':0,'peak_allocated_bytes':0,'peak_logical_bytes':0,
                    'peak_files':0,'largest_staging_bytes':0,'observed_namespace_operations':0,
                    'observer_wall_seconds':0.0,'checkpoint_wall_seconds':0.0,'phases':{}}
        self.persist(force=True)

    def sample(self):
        started=time.monotonic();allocated=logical=files=0;seen=set();todo=[self.parent]
        while todo:
            with os.scandir(todo.pop()) as entries:
                for entry in entries:
                    try:s=entry.stat(follow_symlinks=False)
                    except FileNotFoundError:continue
                    if stat.S_ISDIR(s.st_mode):todo.append(entry.path);continue
                    if not stat.S_ISREG(s.st_mode):continue
                    key=(s.st_dev,s.st_ino)
                    if key in seen:continue
                    seen.add(key);files+=1;logical+=s.st_size;allocated+=s.st_blocks*512
                    if entry.name.endswith('.pending'):
                        self.state['largest_staging_bytes']=max(self.state['largest_staging_bytes'],s.st_size)
        self.state['sample_count']+=1
        for key,value in [('peak_allocated_bytes',allocated),('peak_logical_bytes',logical),('peak_files',files)]:
            self.state[key]=max(self.state[key],value)
        self.state['observer_wall_seconds']+=time.monotonic()-started

    def snapshot(self, status='IN_PROGRESS'):
        own=resource.getrusage(resource.RUSAGE_SELF);child=resource.getrusage(resource.RUSAGE_CHILDREN)
        return {'status':status,'profile':self.state,'elapsed_seconds':time.monotonic()-self.started,
                'process_cpu_seconds':own.ru_utime+own.ru_stime,'child_cpu_seconds':child.ru_utime+child.ru_stime,
                'peak_process_rss_bytes':own.ru_maxrss*(1 if sys.platform=='darwin' else 1024),
                'measurement_scope':'Observed atomic-boundary allocated files; incomplete until terminal PASS',
                'headroom_qualified':False}

    def persist(self, force=False, status='IN_PROGRESS'):
        now=time.monotonic()
        if force or now-self.last_checkpoint>=2:
            start=time.monotonic();storage.save(self.checkpoint,self.snapshot(status));self.last_checkpoint=now
            self.state['checkpoint_wall_seconds']+=time.monotonic()-start

    def phase(self, name, elapsed):
        self.sample();self.state['phases'][name]=elapsed;self.persist(force=True)

    def watched(self, operation):
        def call(src,dst,*args,**kwargs):
            if Path(src).resolve().is_relative_to(self.parent):
                self.sample();self.state['observed_namespace_operations']+=1;self.persist()
            return operation(src,dst,*args,**kwargs)
        return call


def main(parent, checkpoint):
    parent=Path(parent);parent.mkdir(parents=True,exist_ok=False)
    spec=importlib.util.spec_from_file_location('lifecycle',ROOT/'work/engine-rebuild/check_full_lifecycle.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    observer=PeakObserver(parent,checkpoint)
    try:
        with patch.object(storage.os,'replace',side_effect=observer.watched(storage.os.replace)), \
             patch.object(storage.os,'link',side_effect=observer.watched(storage.os.link)):
            result=module.verify(source_root=ROOT,temp_parent=parent,on_phase=observer.phase)
    except BaseException:
        observer.persist(force=True,status='FAILED');raise
    observer.persist(force=True,status=result['status'])
    report={**observer.snapshot(result['status']),'lifecycle':result,'actual_service_uid':os.getuid(),
            'harness_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'lifecycle_harness_sha256':hashlib.sha256((ROOT/'work/engine-rebuild/check_full_lifecycle.py').read_bytes()).hexdigest(),
            'scope':'Isolated captured full slate; simulated cutoffs/finals; no production writes or provider calls',
            'limitations':['Atomic-boundary file allocation omits filesystem metadata and unobserved transients.',
                           'Git repack, backup/restore and historical experiment outputs require separate evidence.']}
    print(json.dumps(report,indent=2))

if __name__=='__main__':main(sys.argv[1],sys.argv[2])
