"""Explicit E-CAL execution or retained report; never installed implicitly."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
MEMORY_BYTES=4*1024**3
DEADLINE_SECONDS=2700


def bounded(command,*,deadline=DEADLINE_SECONDS):
    """Linux supervisor; a shorter fixture budget is allowed, never a larger one."""
    if not sys.platform.startswith('linux') or not shutil.which('timeout') or not shutil.which('prlimit'):
        raise RuntimeError('Execute on qualified Linux host with timeout and prlimit')
    if type(deadline) is not int or not 0<deadline<=DEADLINE_SECONDS:raise ValueError('Invalid phase deadline')
    env={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1',
         'NUMEXPR_NUM_THREADS':'1','PYTHONDONTWRITEBYTECODE':'1'}
    return subprocess.run(['timeout','--signal=KILL',str(deadline),'prlimit',
                           f'--as={MEMORY_BYTES}:{MEMORY_BYTES}','--',*command],env=env,check=False).returncode


def main(argv=None):
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT)
    commands=parser.add_subparsers(dest='mode',required=True)
    for name in ('execute','_worker'):
        p=commands.add_parser(name);p.add_argument('--registration',required=True)
        p.add_argument('--retry',action='store_true')
    p=commands.add_parser('report');p.add_argument('--registration-sha256',required=True)
    p.add_argument('--diagnostic-ref')
    args=parser.parse_args(argv)
    if args.mode=='execute':
        command=[sys.executable,'-B',str(Path(__file__).resolve()),'--root',str(args.root),'_worker',
                 '--registration',args.registration]
        if args.retry:command.append('--retry')
        code=bounded(command)
        if code:print(json.dumps({'state':'EXECUTION_NOT_CONFIRMED','exit_code':code,
            'next':'Inspect the retained attempt; interrupted work is not automatically retried'}))
        return code
    if args.mode=='_worker':
        import resource
        soft,hard=resource.getrlimit(resource.RLIMIT_AS)
        if not (0<soft<=MEMORY_BYTES and 0<hard<=MEMORY_BYTES):raise RuntimeError('Hard memory supervisor required')
        parent=Path('/proc')/str(os.getppid())
        if not sys.platform.startswith('linux') or (parent/'comm').read_text().strip()!='timeout':
            raise RuntimeError('External wall-clock supervisor required')
    sys.path.insert(0,str(ROOT))
    if args.mode=='report':
        from engine.projection.calibration_report import publish
        result=publish(args.root,args.registration_sha256,
                       diagnostic_ref=json.loads(args.diagnostic_ref) if args.diagnostic_ref else None)
    else:
        from engine.projection.research_ledger import run_calibration as run
        saved=run(args.root,json.loads(args.registration),retry=args.retry)
        last=saved['attempts'][-1] if saved['attempts'] else None
        result={'registration_sha256':saved['key'],'attempts':len(saved['attempts']),
                'receipt':last['receipt'] if last else None,'activates_method':False}
    print(json.dumps(result,sort_keys=True))
    if args.mode=='_worker' and (result.get('receipt') or {}).get('state')!='COMPUTED_NOT_RELEASED':return 1
    return 0


if __name__=='__main__':raise SystemExit(main())
