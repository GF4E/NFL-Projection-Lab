"""Stubborn parent and child for an isolated oneshot supervision check."""
import json,os,signal,sys,time
from pathlib import Path
signal.signal(signal.SIGTERM,signal.SIG_IGN)
child=os.fork()
if child==0:
 while True:time.sleep(1)
path=Path(sys.argv[1])
with path.open('x') as f:
 json.dump({'parent':os.getpid(),'child':child,'uid':os.getuid()},f);f.flush();os.fsync(f.fileno())
print('READY',flush=True)
while True:time.sleep(1)
