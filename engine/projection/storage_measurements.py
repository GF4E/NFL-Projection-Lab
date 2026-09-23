"""Durable physical-capacity observations; measurements never declare safe capacity."""
import datetime as dt
import json
from pathlib import Path
from .storage import save

INTERVAL=300
MAX_GAP=2*INTERVAL
SCHEMA='storage-measurements-v1'


def stamp(value):
    t=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    if t.tzinfo is None:raise ValueError('Aware measurement time required')
    return t.astimezone(dt.timezone.utc)


def validate(sample):
    observed=stamp(sample['observed_at'])
    if type(sample.get('bucket')) is not int or sample['bucket']!=int(observed.timestamp())//INTERVAL:
        raise ValueError('Observation bucket differs from actual timestamp')
    if set(sample['filesystems'])!={'root','artifacts'}:raise ValueError('Both filesystems required')
    for item in sample['filesystems'].values():
        for key in ('free_bytes','free_inodes','total_bytes','filesystem_id'):
            if type(item.get(key)) is not int or item[key]<0:raise ValueError('Invalid filesystem measurement')
        if item['total_bytes']<=0 or item['free_bytes']>item['total_bytes']:raise ValueError('Invalid filesystem capacity')
    return sample


def observe(folder,storage,at):
    """Called under the monitor's existing exclusive lock; first sample per bucket."""
    folder=Path(folder);now=stamp(at);bucket=int(now.timestamp())//INTERVAL
    sample=validate({'observed_at':now.isoformat(),'bucket':bucket,'filesystems':storage['filesystems']})
    latest=folder/'latest.json'
    if latest.exists():
        previous=json.loads(latest.read_bytes())
        if now<stamp(previous['observed_at']):raise ValueError('Storage measurement clock rollback')
    path=folder/(now.strftime('%Y-%m-%dT%H')+'.json')
    hour=json.loads(path.read_bytes()) if path.exists() else {'schema':SCHEMA,'samples':[]}
    if hour['schema']!=SCHEMA or len(hour['samples'])>12:raise ValueError('Invalid hourly observations')
    for prior in hour['samples']:
        validate(prior)
        if stamp(prior['observed_at']).strftime('%Y-%m-%dT%H')!=path.stem:
            raise ValueError('Observation in wrong hour')
    matches=[x for x in hour['samples'] if x['bucket']==bucket]
    if matches:
        if len(matches)!=1:raise ValueError('Duplicate sample bucket')
        sample=matches[0]
    else:
        if any(stamp(x['observed_at'])>now for x in hour['samples']):raise ValueError('Storage measurement clock rollback')
        hour['samples'].append(sample);hour['samples'].sort(key=lambda x:x['bucket'])
        if len(hour['samples'])>12:raise ValueError('Too many hourly observations')
        save(path,hour)
    # The durable hour precedes the cursor. Retry repairs an uncertain cursor.
    save(latest,sample)
    return {'state':'RECORDED','path':str(path),'sample':sample,'headroom_qualified':False}


def summarize(samples):
    samples=sorted((validate(x) for x in samples),key=lambda x:stamp(x['observed_at']))
    if len({x['bucket'] for x in samples})!=len(samples):raise ValueError('Duplicate sample bucket')
    results={}
    for name in ('root','artifacts'):
        groups=[]
        for sample in samples:
            fs=sample['filesystems'][name];identity=(fs['filesystem_id'],fs['total_bytes'])
            if not groups or groups[-1]['identity']!=identity:groups.append({'identity':identity,'samples':[]})
            groups[-1]['samples'].append(sample)
        output=[]
        for group in groups:
            rows=group['samples'];span=(stamp(rows[-1]['observed_at'])-stamp(rows[0]['observed_at'])).total_seconds()
            gaps=[(stamp(b['observed_at'])-stamp(a['observed_at'])).total_seconds() for a,b in zip(rows,rows[1:])]
            losses=[a['filesystems'][name]['free_bytes']-b['filesystems'][name]['free_bytes'] for a,b in zip(rows,rows[1:])]
            gross=sum(max(0,x) for x in losses)
            output.append({'filesystem_id':group['identity'][0],'total_bytes':group['identity'][1],
                'start':rows[0]['observed_at'],'end':rows[-1]['observed_at'],'samples':len(rows),'span_seconds':span,
                'gaps_over_600_seconds':[x for x in gaps if x>MAX_GAP],
                'net_consumption_bytes':sum(losses),'positive_sampled_depletion_bytes':gross,
                'daily_normalized_positive_depletion_bytes':gross*86400/span if span else None,
                'daily_status':'OBSERVED_AT_LEAST_ONE_DAY' if span>=86400 and all(x<=MAX_GAP for x in gaps) else 'INSUFFICIENT_CONTINUOUS_DAY',
                'rate_is_extrapolated':span<86400,'minimum_free_bytes':min(x['filesystems'][name]['free_bytes'] for x in rows),
                'minimum_free_inodes':min(x['filesystems'][name]['free_inodes'] for x in rows)})
        results[name]=output
    return {'schema':'storage-measurement-summary-v1','filesystems':results,'headroom_qualified':False,
        'limitations':['Sampled depletion can miss writes and removals between observations.',
                      'Transient job peak, Git/restore workspace and future growth require separate evidence.']}


def read(folder):
    rows=[]
    for path in sorted(Path(folder).glob('????-??-??T??.json')):
        value=json.loads(path.read_bytes())
        if value.get('schema')!=SCHEMA:raise ValueError('Unknown measurement format')
        if len(value['samples'])>12 or any(stamp(x['observed_at']).strftime('%Y-%m-%dT%H')!=path.stem for x in value['samples']):
            raise ValueError('Invalid observation hour')
        rows.extend(value['samples'])
    return summarize(rows)
