"""Prospective, hash-bound availability receipts; no fitting or state activation.

Collection time is evidence of local availability, never an inferred historical
publication clock. Changed observations link prior revisions instead of replacing
them. Compressed batches keep the initial historical bootstrap bounded.
"""
from collections import defaultdict
from contextlib import contextmanager
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import math
from pathlib import Path
import re

from .storage import _directory, save, write_bytes
from .cutoff_features import DIV, GAME_FIELDS
from engine.forecast_system.calendar import schedule_kickoff, timestamp

BASE = 'work/projection-observations-v1'
POINTER = BASE + '/current-ref.json'
SCHEMA = 'prospective-observations-v1'
STAT_FIELDS = ('game_id team opponent season week date off_ppd off_ypp drives '
               'plays_per_drive rush_epa rush_success pass_epa cpoe explosive '
               'redzone_td fg_points return_points turnovers_lost fumble_recovery '
               'te_share rb_share fg_short_made fg_short_attempts fg_medium_made '
               'fg_medium_attempts fg_long_made fg_long_attempts').split()
GAME_KEYS = tuple(k for k in GAME_FIELDS if k != 'source_hash') + ('home_score','away_score')


def raw(value):
    return (json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return dt.datetime.now(dt.timezone.utc)


def read_source(root, ref, name):
    if (not isinstance(ref,dict) or set(ref)!={'path','sha256'}
            or not re.fullmatch(r'[0-9a-f]{64}',str(ref['sha256']))
            or ref['path']!=f'work/projection-v1/data/{name}-{ref["sha256"]}.json'):
        raise ValueError('Invalid observation source reference')
    path=Path(root)/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):
        raise ValueError('Observation source escapes repository')
    data=path.read_bytes()
    if sha(data)!=ref['sha256']:raise ValueError('Observation source hash mismatch')
    result=json.loads(data)
    if not isinstance(result,list):raise ValueError('Observation source must be rows')
    return result


def object_ref(kind, data):
    return {'path':f'{BASE}/{kind}/{sha(data)}.json.gz','sha256':sha(data)}


def read_object(root, ref, kind):
    if (not isinstance(ref,dict) or set(ref)!={'path','sha256'}
            or not re.fullmatch(r'[0-9a-f]{64}',str(ref['sha256']))
            or ref['path']!=f'{BASE}/{kind}/{ref["sha256"]}.json.gz'):
        raise ValueError('Invalid observation object reference')
    path=Path(root)/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):
        raise ValueError('Observation object escapes repository')
    data=path.read_bytes()
    if sha(data)!=ref['sha256']:raise ValueError('Observation object hash mismatch')
    return json.loads(gzip.decompress(data))


def store(root, kind, value):
    data=gzip.compress(raw(value),mtime=0);ref=object_ref(kind,data)
    write_bytes(Path(root)/ref['path'],data,immutable=True)
    return ref


def current(root):
    p=Path(root)/POINTER
    return json.loads(p.read_bytes()) if p.exists() else None


def load(root, ref=None):
    ref=current(root) if ref is None else ref
    if ref is None:return None,{}
    snapshot=read_object(root,ref,'snapshots')
    if snapshot.get('schema')!=SCHEMA:raise ValueError('Observation schema differs')
    batches={};records={}
    for gid,entry in snapshot['index'].items():
        batch_ref=entry['batch'];key=batch_ref['sha256']
        if key not in batches:batches[key]=read_object(root,batch_ref,'batches')
        batch=batches[key]
        if batch.get('schema')!=SCHEMA:raise ValueError('Observation batch schema differs')
        if type(entry['offset']) is not int or not 0<=entry['offset']<len(batch['observations']):
            raise ValueError('Invalid observation offset')
        record=batch['observations'][entry['offset']]
        if record['game']['game_id']!=gid or sha(raw({'game':record['game'],'statistics':record['statistics']}))!=record['input_sha256']:
            raise ValueError('Observation index/body mismatch')
        timestamp(batch['collected_at'])
        records[gid]={**record,'collected_at':batch['collected_at'],'sources':batch['sources'],'reference':entry}
    return snapshot,records


def material(schedule, statistics, collected_at):
    """Extract paired completed football facts only; ignore unrelated columns."""
    by=defaultdict(list)
    for row in statistics:by[row['game_id']].append(row)
    records={};unknown=[];seen=set()
    for game in sorted(schedule,key=lambda g:g['game_id']):
        gid=game['game_id']
        if gid in seen:raise ValueError('Duplicate observation schedule game')
        seen.add(gid)
        if game['game_type']!='REG':continue
        if any(game.get(k) in (None,'') for k in ('home_score','away_score')):continue
        if schedule_kickoff(game['gameday'],game['gametime'])+dt.timedelta(hours=4)>=collected_at:
            unknown.append({'game_id':gid,'reason':'COMPLETION_PROXY_NOT_REACHED'});continue
        h,a=game['home_team'],game['away_team']
        if h not in DIV or a not in DIV or h==a:raise ValueError('Unknown paired team')
        clean_game={k:game.get(k) for k in GAME_KEYS}
        for k in ('home_score','away_score'):
            value=float(clean_game[k])
            if not math.isfinite(value) or value<0 or not value.is_integer():raise ValueError('Invalid observation score')
            clean_game[k]=value
        for k in ('season','week'):clean_game[k]=int(clean_game[k])
        rows=by.get(gid,[])
        if not rows:
            unknown.append({'game_id':gid,'reason':'TEAM_STATISTICS_UNAVAILABLE',
                            'final_input_sha256':sha(raw(clean_game))});continue
        if len(rows)!=2 or {r['team'] for r in rows}!={h,a}:raise ValueError('Paired observation statistics required')
        clean_rows=[]
        for row in sorted(rows,key=lambda r:r['team']):
            if row['opponent']!=(a if row['team']==h else h):raise ValueError('Wrong observation opponent')
            if any(int(row[k])!=clean_game[k] for k in ('season','week')) or row['date']!=game['gameday']:
                raise ValueError('Observation schedule/statistics identity differs')
            if not all(k in row for k in STAT_FIELDS):raise ValueError('Incomplete observation statistics schema')
            clean={k:row[k] for k in STAT_FIELDS}
            for k,v in clean.items():
                if k in ('game_id','team','opponent','date'):continue
                if v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v)):
                    raise ValueError('Invalid observation statistic')
            if clean['drives'] is None or clean['drives']<=0 or clean['plays_per_drive'] is None or clean['plays_per_drive']<=0:
                raise ValueError('Invalid drive denominator')
            required=('fg_points','turnovers_lost')+tuple('fg_'+b+'_'+k for b in ('short','medium','long') for k in ('made','attempts'))
            if any(clean[k] is None or clean[k]<0 for k in required):raise ValueError('Required observed count unavailable')
            if any(clean['fg_'+b+'_made']>clean['fg_'+b+'_attempts'] for b in ('short','medium','long')):raise ValueError('Invalid observed kicking counts')
            clean_rows.append(clean)
        body={'game':clean_game,'statistics':clean_rows}
        records[gid]={**body,'input_sha256':sha(raw(body))}
    return records,unknown


@contextmanager
def writer(root):
    folder=Path(root)/'.cloud-private/projection-observations';_directory(folder)
    with (folder/'writer.lock').open('a+') as handle:
        try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('Observation writer already active') from None
        yield


def capture(root, manifest):
    """Collect current verified bytes. Retries reuse a durable collection clock."""
    root=Path(root)
    with writer(root):
        sources={k:manifest[k] for k in ('schedule','team_games')}
        schedule=read_source(root,sources['schedule'],'schedule')
        statistics=read_source(root,sources['team_games'],'team-games')
        at=timestamp(now());ref=current(root);snapshot,old=load(root,ref)
        values,unknown=material(schedule,statistics,at)
        unknown_ids={item['game_id'] for item in unknown}
        unknown.extend({'game_id':gid,'reason':'PREVIOUS_OBSERVATION_NOW_UNAVAILABLE'} for gid in sorted(set(old)-set(values)-unknown_ids))
        unknown.sort(key=lambda item:item['game_id'])
        changed={gid:row for gid,row in values.items() if gid not in old or old[gid]['input_sha256']!=row['input_sha256']}
        if snapshot is not None and not changed and snapshot['unknown']==unknown:
            return ref
        # Source identity and parent prevent a lost-response retry from rewinding.
        signature=sha(raw({'sources':sources,'parent':ref,'schema':SCHEMA,'unknown':unknown,
                           'changes':{gid:v['input_sha256'] for gid,v in changed.items()}}))
        pending=root/BASE/'transactions'/(signature+'.json')
        if pending.exists():
            envelope=json.loads(pending.read_bytes());transaction=envelope['body']
            if sha(raw(transaction))!=envelope['sha256']:
                raise ValueError('Observation transaction hash mismatch')
            if transaction['sources']!=sources or transaction['parent']!=ref or transaction['signature']!=signature:
                raise ValueError('Observation transaction differs')
            at=timestamp(transaction['collected_at'])
            if at>timestamp(now()):raise ValueError('Observation transaction clock is in the future')
        else:
            transaction={'schema':SCHEMA,'signature':signature,'collected_at':at.isoformat(),'sources':sources,'parent':ref}
            save(pending,{'body':transaction,'sha256':sha(raw(transaction))},immutable=True)
        index=dict(snapshot['index']) if snapshot else {}
        observations=[]
        for gid,value in sorted(changed.items()):
            observations.append({**value,'previous':index.get(gid)})
        batch={'schema':SCHEMA,'collected_at':at.isoformat(),'sources':sources,'observations':observations}
        batch_ref=store(root,'batches',batch)
        for offset,row in enumerate(observations):
            index[row['game']['game_id']]={'batch':batch_ref,'offset':offset}
        body={'schema':SCHEMA,'parent':ref,'transaction':signature,'index':index,'unknown':unknown}
        new_ref=store(root,'snapshots',body)
        load(root,new_ref)
        if current(root)!=ref:raise ValueError('Observation pointer advanced outside ownership')
        save(root/POINTER,new_ref)
        return new_ref
