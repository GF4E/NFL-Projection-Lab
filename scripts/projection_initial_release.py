"""Stage or explicitly activate a qualified initial chronology handoff.

Run on the owner host in the accepted interpreter under the standard 570-second,
4-GiB, one-worker service ceiling. No provider calls, fitting or control promotion.
"""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection import initial_release


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('stage','activate'))
    parser.add_argument('--owner',required=True)
    parser.add_argument('--packet-ref',type=Path)
    parser.add_argument('--runtime-manifest',type=Path)
    parser.add_argument('--plan-ref',type=Path)
    args=parser.parse_args()
    if args.action=='stage':
        if not args.packet_ref or not args.runtime_manifest or args.plan_ref:parser.error('stage requires packet and runtime manifest only')
        result=initial_release.stage(ROOT,json.loads(args.packet_ref.read_bytes()),owner=args.owner,runtime_manifest=args.runtime_manifest)
    else:
        if not args.plan_ref or args.packet_ref or args.runtime_manifest:parser.error('activate requires the exact staged plan reference only')
        result=initial_release.activate(ROOT,json.loads(args.plan_ref.read_bytes()),owner=args.owner)
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
