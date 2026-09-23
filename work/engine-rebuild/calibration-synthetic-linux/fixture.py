"""Disposable synthetic Linux qualification; no production inputs or releases."""
import json, os, subprocess, sys, time
from pathlib import Path
sys.path[:0]=[str(Path.cwd()),str(Path.cwd()/'tests')]
from scripts.projection_calibration import bounded, MEMORY_BYTES
from test_projection_calibration_runner import RunnerTests
from engine.projection.calibration_execute import read
from engine.projection_experiments import digest
import shutil
probe='import os,resource,mmap,json; s,h=resource.getrlimit(resource.RLIMIT_AS); assert s==h==4294967296; assert os.environ["OPENBLAS_NUM_THREADS"]=="1"; rejected=False\ntry: mmap.mmap(-1,4294967297)\nexcept (OSError,MemoryError): rejected=True\nassert rejected; print(json.dumps({"memory_bytes":s,"oversized_allocation_rejected":rejected,"threads":1}))'
assert bounded([sys.executable,'-B','-c',probe])==0
started=time.monotonic();code=bounded([sys.executable,'-B','-c','import time; time.sleep(20)'],deadline=1)
assert code!=0 and time.monotonic()-started<5
print(json.dumps({'synthetic_timeout_exit':code,'elapsed_seconds':time.monotonic()-started}))
f=RunnerTests();f.setUp()
try:
    command=[sys.executable,'-B','scripts/projection_calibration.py','--root',str(f.root),'execute','--registration',json.dumps(f.ref)]
    subprocess.run(command,check=True)
    subprocess.run(command,check=True)
    saved=read(f.root,digest(f.r));assert len(saved['attempts'])==1
    assert saved['attempts'][0]['receipt']['state']=='COMPUTED_NOT_RELEASED'
    subprocess.run([sys.executable,'-B','scripts/projection_calibration.py','--root',str(f.root),'report','--registration-sha256',digest(f.r)],check=True)
    shutil.copytree(f.root/'work/e-cal-lineage/executions',Path.cwd()/'retained-synthetic-execution')
    print(json.dumps({'synthetic_cli':'PASS','duplicate_attempts':1,'activates_method':False}))
finally:f.doCleanups()
