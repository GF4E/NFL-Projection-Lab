import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from engine.projection import bundle, executable
from engine.projection.scoring import prepare_pair
from test_projection_bundle import fixture


class ExecutableTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = Path(__file__).resolve().parents[1]
        pointer = json.loads((cls.original/'outputs/projection-v3/current-release-ref.json').read_bytes())
        release = bundle.resolve(cls.original, pointer, 'releases')
        cls.code = executable.code_closure(cls.original, release['code']['commit'])
        for path in bundle.CODE_PATHS:
            cls.code.setdefault(path, executable.git(cls.original, 'show', release['code']['commit']+':'+path).decode())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name); self.root = self.base/'repo'; self.root.mkdir()
        for path, source in self.code.items():
            target = self.root/path; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(source)
        def git(*args):
            return subprocess.check_output(['git','-C',str(self.root),*args],stderr=subprocess.PIPE)
        git('init','-q'); git('add','.'); git('-c','user.name=Fixture','-c','user.email=fixture@invalid','commit','-qm','code')
        ref, self.artifact, self.shapes, self.rows, self.game, self.card = fixture(self.root)
        self.prepared = {'fit':ref}
        self.release_ref = bundle.release_for(self.root,ref,self.artifact)
        self.package = executable.build(self.root,self.release_ref,self.base/'built')
        self.requests = [prepare_pair(self.rows)]

    def test_roundtrip_runs_archived_code_and_artifacts_without_active_checkout(self):
        ref = executable.store(self.root,self.package)
        package = executable.load(self.root,ref)
        executable.unpack_code(package['code']['files'],self.base/'restored')
        # Changing active source and fit must not affect the restored computation.
        (self.root/'engine/projection_v3/model.py').write_text('raise RuntimeError("current code")')
        (self.root/self.prepared['fit']['path']).write_text('unrelated active artifact')
        result = executable.execute(package,self.base/'restored',self.requests,self.prepared)
        self.assertEqual(result['fixture'],{key:self.card[key] for key in ('projection','contributions','why')})
        executable.verify_code(package,self.base/'restored')

    def test_restore_cannot_overwrite_or_escape(self):
        with self.assertRaises(ValueError):
            executable.unpack_code(self.package['code']['files'],self.base/'built')
        files = dict(self.package['code']['files']); files['../outside.py']='bad'
        with self.assertRaises(ValueError): executable.unpack_code(files,self.base/'escape')
        self.assertFalse((self.base/'escape').exists())

    def test_tampered_missing_or_extra_executable_cannot_run(self):
        for mode in ('changed','missing','extra','symlink'):
            with self.subTest(mode=mode):
                dest = self.base/mode; executable.unpack_code(self.package['code']['files'],dest)
                path = dest/'engine/projection_v3/model.py'
                if mode=='changed': path.write_text('pass')
                elif mode=='missing': path.unlink()
                elif mode=='extra': (dest/'surprise.py').write_text('pass')
                else: path.unlink(); path.symlink_to(self.root/'engine/projection_v3/model.py')
                with patch.object(executable,'runtime',side_effect=AssertionError('must not execute')):
                    with self.assertRaises(ValueError): executable.execute(self.package,dest,self.requests,self.prepared)

    def test_wrong_prepared_fit_fails_before_execution(self):
        with patch.object(executable,'runtime',side_effect=AssertionError('must not execute')):
            with self.assertRaisesRegex(ValueError,'Prepared inputs'):
                executable.execute(self.package,self.base/'built',self.requests,{'fit':{'path':'different','sha256':'0'*64}})

    def test_runtime_bytes_change_cannot_fall_back_to_current_code(self):
        runtime = copy.deepcopy(self.package['runtime']); runtime['files']['interpreter']='0'*64
        with patch.object(executable,'runtime',return_value=runtime):
            with self.assertRaisesRegex(ValueError,'runtime changed'):
                executable.execute(self.package,self.base/'built',self.requests,self.prepared)

    def test_artifact_code_and_schema_tampering_rejected(self):
        for part in ('fit','calibration','code','commit','schema','environment'):
            with self.subTest(part=part):
                p=copy.deepcopy(self.package)
                if part in ('fit','calibration'): p['artifacts'][part]+=' '
                elif part=='code': p['code']['files']['engine/projection_v3/model.py']+='\n'
                elif part=='commit': p['code']['commit']='0'*40
                elif part=='schema': p['schema']='future'
                else:p['runtime']['identity']['python']='different'
                with self.assertRaises(ValueError): executable.validate(p)

    def test_package_byte_hash_and_path_are_required(self):
        ref=executable.store(self.root,self.package)
        path=self.root/ref['path'];path.write_bytes(path.read_bytes()[:-10])
        with self.assertRaises(ValueError):executable.load(self.root,ref)
        with self.assertRaises(ValueError):executable.load(self.root,{'path':'../x','sha256':'0'*64})

    def test_raw_final_or_market_values_do_not_enter_restored_worker(self):
        requests=copy.deepcopy(self.requests);requests[0]['rows']['home']['features']['spread_line']=99
        with self.assertRaises(ValueError):
            executable.execute(self.package,self.base/'built',requests,self.prepared)

    def test_worker_failure_has_no_fallback(self):
        fake=subprocess.CompletedProcess([],1,'','failure')
        with patch.object(executable,'runtime',return_value=self.package['runtime']), patch.object(executable.subprocess,'run',return_value=fake):
            with self.assertRaisesRegex(ValueError,'no fallback'):
                executable.execute(self.package,self.base/'built',self.requests,self.prepared)


if __name__=='__main__':unittest.main()
