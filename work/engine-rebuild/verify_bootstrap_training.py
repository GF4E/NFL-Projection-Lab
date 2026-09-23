"""Read-only Linux compatibility check plus isolated boundary fixtures.

The candidate is imported from a private staged file. Production files, ledgers,
fit pointers and live configuration are not written. Fixture files live in fresh
TemporaryDirectories. This is not release activation or source-restore proof.
"""
import argparse
import datetime as dt
import gc
import hashlib
import importlib.util
import json
from pathlib import Path
import resource
import subprocess
import sys
import time
import unittest


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--candidate',required=True)
    parser.add_argument('--tests',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    root=Path.cwd();sys.path.insert(0,str(root));sys.path.insert(0,str(root/'tests'))
    from engine.projection import training_ledger as prior, observations as obs, prepared
    ref=json.loads((root/'work/engine-rebuild/training-transition/linux-current-ref.json').read_bytes())
    preserved={str(path.relative_to(root)):digest(path)
               for kind in ('locks','grades') for path in (root/'outputs/projection-v3'/kind).glob('*.json')}
    fit=prepared.active_fit(root);started=time.monotonic()
    old=prior.history(root,ref);count=len(old);before=obs.sha(obs.raw(old));del old;gc.collect()
    path=Path(args.candidate).resolve()
    spec=importlib.util.spec_from_file_location('engine.projection.training_ledger',path)
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
    import engine.projection
    engine.projection.training_ledger=module
    new=module.history(root,ref);after=obs.sha(obs.raw(new))
    assert len(new)==count and before==after, 'Existing numerical training rows changed'
    del new;gc.collect()
    spec=importlib.util.spec_from_file_location('test_bootstrap_training_candidate',args.tests)
    test_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(test_module)
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(test_module))
    assert result.wasSuccessful(), 'Linux boundary fixtures failed'
    assert prepared.active_fit(root)==fit, 'Active fit changed during read-only verification'
    assert all(digest(root/name)==sha for name,sha in preserved.items()), 'Original record changed'
    report={'status':'PASS','scope':'READ_ONLY_LEDGER_PARITY_AND_ISOLATED_LINUX_FIXTURES',
        'observed_at':dt.datetime.now(dt.timezone.utc).isoformat(),
        'host_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
        'candidate_sha256':digest(path),'tests_sha256':digest(Path(args.tests)),
        'training_ref':ref,'training_rows':count,'training_games':count//2,
        'before_rows_sha256':before,'after_rows_sha256':after,'active_fit_ref':fit,
        'preserved_original_records':len(preserved),'tests_run':result.testsRun,
        'elapsed_seconds':time.monotonic()-started,'maximum_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        'live_activation':False,'source_restore_verified':False}
    Path(args.output).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
