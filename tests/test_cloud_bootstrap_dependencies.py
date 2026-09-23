"""Exercise both restoration branches; real wheel/runtime qualification is separate."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class BootstrapDependencyTests(unittest.TestCase):
    def run_bootstrap(self, *, explicit=False, fail_install=False, missing_requirements=False):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            runtime = base/'runtime'
            (runtime/'env/bin').mkdir(parents=True)
            (runtime/'environment.yml').write_text('name: fixture\n')
            if explicit:
                (runtime/'linux-64.explicit.txt').write_text('@EXPLICIT\nfixture\n')
            trace = base/'commands'
            python = runtime/'env/bin/python'
            python.write_text('#!/bin/bash\nprintf "python %s\\n" "$*" >> "$TRACE"\n'
                              'if [[ "$*" == *"pip install"* && "${FAIL_INSTALL:-0}" == 1 ]]; then exit 9; fi\n')
            python.chmod(0o755)
            mamba = base/'micromamba'
            mamba.write_text('#!/bin/bash\nprintf "mamba %s\\n" "$*" >> "$TRACE"\n'
                             'if [[ "$1" == list ]]; then echo "@EXPLICIT"; fi\n')
            mamba.chmod(0o755)
            script = (ROOT/'ops/cloud/bootstrap.sh').read_text()
            script = script.replace('/opt/nfl-runtime', str(runtime)).replace('/usr/local/bin/micromamba', str(mamba))
            (base/'bootstrap.sh').write_text(script)
            if not missing_requirements:
                (base/'pip-requirements.txt').write_bytes((ROOT/'ops/cloud/pip-requirements.txt').read_bytes())
            env = {**os.environ, 'PATH':str(base)+os.pathsep+os.environ['PATH'],
                   'TRACE':str(trace), 'FAIL_INSTALL':str(int(fail_install))}
            result = subprocess.run(['bash',str(base/'bootstrap.sh')],env=env,capture_output=True,text=True)
            return result.returncode, trace.read_text() if trace.exists() else ''

    def test_explicit_conda_restore_includes_hash_pinned_wheel(self):
        code, trace = self.run_bootstrap(explicit=True)
        self.assertEqual(code, 0)
        self.assertIn('linux-64.explicit.txt',trace)
        self.assertIn('pip install --require-hashes --only-binary=:all: --no-deps -r',trace)
        self.assertLess(trace.index('pip install'),trace.index('pip check'))
        self.assertLess(trace.index('pip check'),trace.index('mamba list'))
        self.assertIn('scoringrules',trace)

    def test_yaml_bootstrap_uses_same_locked_pip_step(self):
        code, trace = self.run_bootstrap()
        self.assertEqual(code, 0)
        self.assertIn('environment.yml',trace)
        self.assertEqual(trace.count('pip install'),1)

    def test_failed_install_stops_bootstrap_before_success_inventory(self):
        code, trace = self.run_bootstrap(explicit=True,fail_install=True)
        self.assertEqual(code, 9)
        self.assertNotIn('mamba list',trace)
        self.assertNotIn('pip check',trace)

    def test_missing_lock_stops_before_environment_mutation(self):
        code, trace = self.run_bootstrap(missing_requirements=True)
        self.assertNotEqual(code, 0)
        self.assertEqual(trace,'')
