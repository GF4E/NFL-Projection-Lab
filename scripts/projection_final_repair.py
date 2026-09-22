"""Explicit, fenced repair of a hard-latched free public final-feed reader."""
import argparse
import fcntl
from pathlib import Path
import json
import sys

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts import cloud_scheduler as scheduler
from engine.projection.finals import resume_after_repair


def run(host,reason):
    scheduler.OUT.mkdir(parents=True,exist_ok=True)
    with (scheduler.OUT/'.cloud-dispatch.lock').open('a+') as handle:
        try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'state':'LOCAL_JOB_ACTIVE'}
        record=scheduler.ownership()
        if not scheduler.permitted(record,host):return {'state':'YIELD_TO_OWNER'}
        scheduler.synchronize()
        result=resume_after_repair(scheduler.ROOT,reason)
        if result['state'] in ('REPAIRED','REPAIR_NOT_REQUIRED'):
            result['commit']=scheduler.publish_artifacts()
        return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host',required=True)
    parser.add_argument('--reason',required=True,choices=('SCHEMA_FIXED','ACCESS_RESTORED','STORAGE_RESTORED'))
    args=parser.parse_args()
    try:
        result=run(args.host,args.reason);print(json.dumps(result))
        return 0 if result['state'] in ('REPAIRED','REPAIR_NOT_REQUIRED') else 1
    except Exception as error:
        # Never emit URLs, credentials or provider response text.
        print(json.dumps({'state':'FAILED_CLOSED','error_type':type(error).__name__,
                          'reason':getattr(error,'reason','VALIDATION_OR_PUBLICATION_FAILED')}))
        return 1

if __name__=='__main__':raise SystemExit(main())
