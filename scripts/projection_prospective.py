"""Explicit prospective operations; no scheduler activation or numerical fitting."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection import prospective as p

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT)
    sub=parser.add_subparsers(dest='mode',required=True)
    q=sub.add_parser('enroll');q.add_argument('--schedule-ref',required=True,type=json.loads);q.add_argument('--season',required=True,type=int)
    q=sub.add_parser('pair');q.add_argument('--plan-ref',required=True,type=json.loads);q.add_argument('--card',required=True,type=Path);q.add_argument('--scorer-root',required=True,type=Path)
    q=sub.add_parser('restore');q.add_argument('--plan-ref',required=True,type=json.loads);q.add_argument('--destination',required=True,type=Path)
    q=sub.add_parser('report');q.add_argument('--plan-ref',required=True,type=json.loads)
    a=parser.parse_args()
    if a.mode=='enroll':result=p.enroll(a.root,a.schedule_ref,a.season)
    elif a.mode=='pair':result=p.pair(a.root,a.plan_ref,json.loads(a.card.read_bytes()),a.scorer_root)
    elif a.mode=='restore':result=p.restore_scorer(a.root,a.plan_ref,a.destination)
    else:result=p.report(a.root,a.plan_ref)
    print(json.dumps(result,sort_keys=True))
if __name__=='__main__':main()
