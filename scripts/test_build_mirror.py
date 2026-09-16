import unittest,tarfile,tempfile,io
from pathlib import Path
from publish_build_mirror import validate_archive
class Boundary(unittest.TestCase):
 def archive(self,extra):
  tmp=tempfile.NamedTemporaryFile(suffix='.tar.gz',delete=False);self.addCleanup(Path(tmp.name).unlink);tmp.close()
  with tarfile.open(tmp.name,'w:gz') as t:
   for name,data in {'dist/server/index.js':b'export default {}','dist/.openai/hosting.json':b'{}',**extra}.items():
    i=tarfile.TarInfo(name);i.size=len(data);t.addfile(i,io.BytesIO(data))
  return tmp.name
 def test_only_build_output(self):self.assertEqual(len(validate_archive(self.archive({}))),2)
 def test_reject_sources_data_and_engine_artifacts(self):
  for name in ['src/page.tsx','dist/engine/fit.json','dist/outputs/board.json','dist/private.csv','dist/client/chunk.js.map']:
   with self.subTest(name=name),self.assertRaises(ValueError):validate_archive(self.archive({name:b'private'}))
 def test_reject_column_values(self):
  with self.assertRaises(ValueError):validate_archive(self.archive({'dist/client/chunk.js':b'PFF_PRIVATE_COLUMN_CANARY_726184'}))
if __name__=='__main__':unittest.main()
