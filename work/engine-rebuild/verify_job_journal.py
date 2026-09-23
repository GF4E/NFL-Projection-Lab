"""Qualify one exact transient job invocation from retained manager journal rows.

Unloaded systemctl properties are defaults, not terminal or limit evidence.
Resource settings must be captured while a unit is loaded; this verifies outcome
and observed wall time only and retains the manager's resource-usage message.
"""
import argparse
import json
from pathlib import Path

START='39f53479d3a045ac8e11786248231fbf'
SUCCESS='7ad2d189f7e94e70a38c781354912448'
USAGE='ae8f7b866b0347b9af31fe1c80b127c0'


def verify(rows,unit,invocation):
    selected=sorted((r for r in rows if r.get('UNIT')==unit and r.get('INVOCATION_ID')==invocation),
                    key=lambda r:int(r['__REALTIME_TIMESTAMP']))
    starts=[r for r in selected if r.get('MESSAGE_ID')==START]
    ends=[r for r in selected if r.get('MESSAGE_ID')==SUCCESS]
    if len(starts)!=1 or len(ends)!=1:raise ValueError('Exact invocation start and success required')
    if len({r['_BOOT_ID'] for r in selected})!=1:raise ValueError('Invocation crosses boots')
    if any(r.get('RESULT') not in (None,'success') or r.get('EXIT_STATUS') not in (None,'0',0)
           or 'failed' in r.get('MESSAGE','').lower() for r in selected):raise ValueError('Failure record present')
    elapsed=(int(ends[0]['__REALTIME_TIMESTAMP'])-int(starts[0]['__REALTIME_TIMESTAMP']))/1e6
    if elapsed<=0:raise ValueError('Success must follow start')
    return {'status':'JOURNAL_TERMINAL_SUCCESS','unit':unit,'invocation_id':invocation,
            'boot_id':starts[0]['_BOOT_ID'],'elapsed_seconds':elapsed,
            'start':starts[0],'success':ends[0],
            'resource_usage_messages':[r['MESSAGE'] for r in selected if r.get('MESSAGE_ID')==USAGE],
            'resource_configuration':'NOT_RETAINED_LIVE; requested systemd-run properties remain in execution record, not inferred from unloaded defaults'}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('journal');p.add_argument('unit');p.add_argument('invocation')
    a=p.parse_args();rows=[json.loads(line) for line in Path(a.journal).read_text().splitlines() if line]
    print(json.dumps(verify(rows,a.unit,a.invocation),indent=2))
