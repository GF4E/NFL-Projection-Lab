"""Run only the new synthetic suite; preserve exact source and process evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import resource
import time
import unittest

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OUT = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02e-implementation')
start = time.monotonic()
paths = ['scripts/research_score_conditional_infer_archive.py', 'tests/research-score-conditional-margin/test_infer_archive.py']
hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in paths}
print(json.dumps({'phase': 'start', 'source_hashes': hashes}), flush=True)
spec = importlib.util.spec_from_file_location('test_infer_archive', ROOT / paths[1])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(module))
report = {'tests': result.testsRun, 'success': result.wasSuccessful(), 'failures': len(result.failures), 'errors': len(result.errors),
          'process_seconds': time.monotonic() - start, 'peak_rss_mib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2,
          'source_hashes': hashes, 'unchanged_source_hashes': all(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == value for name,value in hashes.items()),
          'command': '/opt/anaconda3/bin/python3.12 -I work/rf02e-implementation/run_author_tests.py',
          'historical_execution': False}
print(json.dumps(report), flush=True)
with (OUT / ('author-tests-' + hashes[paths[1]][:16] + '.json')).open('x') as stream:
    json.dump(report, stream, indent=2, sort_keys=True); stream.write('\n')
raise SystemExit(not result.wasSuccessful())
