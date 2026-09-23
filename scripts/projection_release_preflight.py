"""Read-only initial release evidence validation. No fitting or publication."""
import argparse
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection.release_preflight import check

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet-ref',type=Path,required=True)
    parser.add_argument('--runtime-manifest',type=Path)
    args=parser.parse_args()
    print(json.dumps(check(ROOT,json.loads(args.packet_ref.read_text()),runtime_manifest=args.runtime_manifest),indent=2))

if __name__=='__main__':main()
