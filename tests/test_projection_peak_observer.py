import importlib.util,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'work/engine-rebuild/profile_lifecycle_storage.py'
spec=importlib.util.spec_from_file_location('peak_observer',PATH)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class PeakTests(unittest.TestCase):
 def test_staging_peak_includes_old_and_new_bytes_then_deduplicates_links(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)/'tree';root.mkdir();o=m.PeakObserver(root,Path(d)/'receipt.json')
   target=root/'value';m.storage.write_bytes(target,b'x'*8192)
   old=os.replace
   with patch.object(m.storage.os,'replace',side_effect=o.watched(old)):
    m.storage.write_bytes(target,b'y'*16384)
   self.assertEqual(o.state['peak_logical_bytes'],24576)
   self.assertEqual(o.state['largest_staging_bytes'],16384)
   os.link(target,root/'copy');(root/'skip').symlink_to(Path(d))
   o.state['peak_logical_bytes']=0;o.sample();self.assertEqual(o.state['peak_logical_bytes'],16384)
 def test_outside_operations_are_not_sampled_and_phase_is_durable(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)/'tree';root.mkdir();o=m.PeakObserver(root,Path(d)/'receipt.json')
   old=os.replace
   with patch.object(m.storage.os,'replace',side_effect=o.watched(old)):m.storage.save(Path(d)/'outside.json',{'a':1})
   self.assertEqual(o.state['sample_count'],0)
   (root/'data').write_bytes(b'x'*123);o.phase('VERIFIED',1.25)
   saved=json.loads(o.checkpoint.read_text());self.assertEqual(saved['profile']['peak_logical_bytes'],123)
   self.assertEqual(saved['profile']['phases'],{'VERIFIED':1.25});self.assertEqual(saved['status'],'IN_PROGRESS')
   self.assertFalse(saved['headroom_qualified'])
 def test_occupied_checkpoint_or_recursive_measurement_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)/'tree';root.mkdir();p=Path(d)/'receipt.json';p.write_text('prior')
   with self.assertRaises(ValueError):m.PeakObserver(root,p)
   self.assertEqual(p.read_text(),'prior')
   with self.assertRaises(ValueError):m.PeakObserver(root,root/'receipt.json')
 def test_allocated_blocks_are_measured_separately_from_logical_size(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)/'tree';root.mkdir();file=root/'sparse'
   with file.open('wb') as stream:stream.truncate(1024*1024*8)
   o=m.PeakObserver(root,Path(d)/'receipt.json');o.sample();st=file.stat()
   self.assertEqual(o.state['peak_logical_bytes'],st.st_size)
   self.assertEqual(o.state['peak_allocated_bytes'],st.st_blocks*512)
   self.assertEqual(o.state['peak_files'],1)
 def test_killed_worker_retains_partial_checkpoint(self):
  with tempfile.TemporaryDirectory() as d:
   program='''import importlib.util,os,signal,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('profile',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=Path(sys.argv[2]);r=p/'tree';r.mkdir();o=m.PeakObserver(r,p/'receipt.json');(r/'record').write_bytes(b'preserved');o.phase('BEFORE_KILL',1.0);os.kill(os.getpid(),signal.SIGKILL)
'''
   result=subprocess.run([sys.executable,'-B','-c',program,str(PATH),d],capture_output=True)
   self.assertLess(result.returncode,0)
   v=json.loads((Path(d)/'receipt.json').read_text());self.assertEqual(v['status'],'IN_PROGRESS')
   self.assertEqual(v['profile']['peak_logical_bytes'],9);self.assertEqual(v['profile']['phases'],{'BEFORE_KILL':1.0})
