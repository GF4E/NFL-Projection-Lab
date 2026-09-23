"""Internal child of the owner-fenced scheduler; never enrolls or fits."""
import argparse,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection import prospective_worker as worker

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--owner',required=True);p.add_argument('--dispatch-fd',type=int,required=True);a=p.parse_args()
    import resource
    soft,hard=resource.getrlimit(resource.RLIMIT_AS)
    if not sys.platform.startswith('linux') or not 0<soft<=hard<=worker.POLICY['memory_bytes']:
        raise RuntimeError('Qualified hard memory limit required')
    if (Path('/proc')/str(os.getppid())/'comm').read_text().strip()!='timeout':raise RuntimeError('Hard wall supervisor required')
    with os.fdopen(os.dup(a.dispatch_fd),'a+') as handle:result=worker.worker(a.root,a.owner,handle)
    print(json.dumps(result,sort_keys=True))
if __name__=='__main__':main()
