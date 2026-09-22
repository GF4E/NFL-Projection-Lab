"""Restorable cutoff state from recorded availability; inactive for issuance.

Every state is rebuilt from its eligible set in played order. No new statistical
method is fitted, and a revised result is never added twice to an existing rating.
"""
from contextlib import contextmanager
import datetime as dt
import fcntl
import gzip
import json
import math
from pathlib import Path
import re

from . import observations as obs, cutoff_features as features
from .lineage import read_artifact
from .storage import _directory, save, write_bytes
from engine.forecast_system.calendar import timestamp, schedule_kickoff
from engine.forecast_system.cadence import next_cutoff, cutoff_before

BASE='work/projection-cutoff-state-v1'
POINTER=BASE+'/current-ref.json'
SCHEMA='cutoff-state-v1'
CODE=('engine/projection/cutoff_state.py','engine/projection/cutoff_features.py',
      'engine/projection/observations.py','engine/projection/features.py',
      'engine/projection/model.py','engine/elo.py','engine/elo_hfa.py',
      'engine/forecast_system/calendar.py','engine/forecast_system/cadence.py')


def now():return dt.datetime.now(dt.timezone.utc)
def raw(value):return obs.raw(value)
def sha(value):return obs.sha(raw(value))


def method(root,fit_ref):
    artifact=read_artifact(root,fit_ref)
    if artifact.get('groups')!=['calibration','elo'] or artifact.get('selected')!=['none',10]:
        raise ValueError('Unqualified state method settings')
    hfa=artifact.get('elo_hfa')
    if not isinstance(hfa,dict) or not hfa or not all(math.isfinite(float(v)) for v in hfa.values()):
        raise ValueError('Qualified historical HFA required')
    code_root=Path(__file__).resolve().parents[2]
    return {'policy':features.POLICY,'elo_hfa':hfa,'groups':artifact['groups'],
            'selected':artifact['selected'],'code':{p:obs.sha((code_root/p).read_bytes()) for p in CODE}}


def snapshot_before(root,ref,cutoff):
    """Use recorded transaction clocks; never the latest refreshed manifest."""
    visited=set()
    while ref is not None:
        if ref['sha256'] in visited:raise ValueError('Observation snapshot cycle')
        visited.add(ref['sha256']);snapshot=obs.read_object(root,ref,'snapshots')
        key=snapshot.get('transaction')
        if not isinstance(key,str) or not re.fullmatch('[0-9a-f]{64}',key):raise ValueError('Invalid snapshot transaction')
        path=Path(root)/obs.BASE/'transactions'/(key+'.json')
        envelope=json.loads(path.read_bytes());transaction=envelope['body']
        if obs.sha(raw(transaction))!=envelope['sha256'] or transaction['signature']!=key or transaction['parent']!=snapshot['parent']:
            raise ValueError('Snapshot transaction mismatch')
        at=timestamp(transaction['collected_at'])
        if at<cutoff:return ref,snapshot,transaction
        ref=snapshot['parent']
    raise ValueError('No observed source snapshot before cutoff')


def available(root,observation_ref,cutoff):
    ref,snapshot,transaction=snapshot_before(root,observation_ref,cutoff)
    _,records=obs.load(root,ref)
    schedule=obs.read_source(root,transaction['sources']['schedule'],'schedule')
    finals={};statistics={};missing=list(snapshot['unknown'])
    for game in schedule:
        gid=game['game_id']
        if game['game_type']!='REG' or any(game.get(k) in ('',None) for k in ('home_score','away_score')):continue
        if schedule_kickoff(game['gameday'],game['gametime'])+dt.timedelta(hours=4)>=cutoff:continue
        value={k:game.get(k) for k in obs.GAME_KEYS}
        for k in ('season','week'):value[k]=int(value[k])
        for k in ('home_score','away_score'):
            value[k]=float(value[k])
            if not math.isfinite(value[k]) or value[k]<0 or not value[k].is_integer():raise ValueError('Invalid final in state source')
        if gid in finals:raise ValueError('Duplicate state final')
        value['source_hash']=transaction['sources']['schedule']['sha256'];finals[gid]=value
    unavailable={r['game_id'] for r in missing}
    for gid,record in records.items():
        if gid not in finals or gid in unavailable:continue
        if timestamp(record['collected_at'])>=cutoff:raise ValueError('Early statistics in selected snapshot')
        statistics[gid]=[{**r,'source_hash':record['sources']['team_games']['sha256']} for r in record['statistics']]
    known_missing={r['game_id'] for r in missing}
    missing.extend({'game_id':gid,'reason':'TEAM_STATISTICS_NOT_RECORDED'} for gid in sorted(set(finals)-set(statistics)-known_missing))
    return ref,finals,statistics,sorted(missing,key=lambda r:r['game_id'])


def fingerprints(finals,statistics):
    return ({gid:sha({k:v for k,v in row.items() if k!='source_hash'}) for gid,row in finals.items()},
            {gid:sha([{k:v for k,v in row.items() if k!='source_hash'} for row in rows]) for gid,rows in statistics.items()})


def state_ref(data):return {'path':f'{BASE}/states/{obs.sha(data)}.json.gz','sha256':obs.sha(data)}


def current(root):
    p=Path(root)/POINTER
    return json.loads(p.read_bytes()) if p.exists() else None


def read(root,ref):
    if not isinstance(ref,dict) or set(ref)!={'path','sha256'} or not re.fullmatch('[0-9a-f]{64}',str(ref['sha256'])) or ref['path']!=f'{BASE}/states/{ref["sha256"]}.json.gz':
        raise ValueError('Invalid cutoff-state reference')
    path=Path(root)/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):raise ValueError('Cutoff state escapes repository')
    data=path.read_bytes()
    if obs.sha(data)!=ref['sha256']:raise ValueError('Cutoff state hash mismatch')
    body=json.loads(gzip.decompress(data))
    if body.get('schema')!=SCHEMA:raise ValueError('Cutoff state schema differs')
    return body


def restore(root,ref):
    body=read(root,ref)
    if body['method']!=method(root,body['fit_ref']):raise ValueError('Cutoff state executable/method mismatch')
    cutoff=timestamp(body['cutoff_at'])
    selected,finals,statistics,missing=available(root,body['observation_ref'],cutoff)
    if selected!=body['observation_ref']:raise ValueError('State selected a later observation snapshot')
    fh,sh=fingerprints(finals,statistics)
    state=features.reconstruct(list(finals.values()),statistics,body['method']['elo_hfa'])
    if (fh!=body['final_hashes'] or sh!=body['statistics_hashes'] or missing!=body['missing']
        or state.elo.teams!=body['elo'] or state.identity()!=body['state_sha256']
        or state.incorporated!=body['incorporated']):
        raise ValueError('Cutoff state does not reproduce')
    return state,body


@contextmanager
def writer(root):
    folder=Path(root)/'.cloud-private/projection-cutoff-state';_directory(folder)
    with (folder/'writer.lock').open('a+') as handle:
        try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('Cutoff state writer already active') from None
        yield


def advance(root,cutoff,fit_ref,observation_ref=None):
    """Commit a completed scheduled cutoff, still inactive for production scoring."""
    root=Path(root);cutoff=timestamp(cutoff);execution=timestamp(now())
    if cutoff>execution:raise ValueError('Future cutoff cannot be executed')
    if next_cutoff(cutoff-dt.timedelta(microseconds=1))!=cutoff:raise ValueError('Not a scheduled assimilation cutoff')
    config=method(root,fit_ref)
    receipt=root/BASE/'cutoffs'/(cutoff.strftime('%Y%m%dT%H%M%SZ')+'.json')
    with writer(root):
        parent=current(root)
        if receipt.exists():
            ref=json.loads(receipt.read_bytes());_,body=restore(root,ref)
            if body['method']!=config or body['fit_ref']!=fit_ref:raise ValueError('Committed cutoff method/fit differs')
            if parent==body['parent']:save(root/POINTER,ref)
            elif parent!=ref and (parent is None or timestamp(read(root,parent)['cutoff_at'])<cutoff):
                raise ValueError('Cutoff pointer lineage differs')
            return ref
        previous=restore(root,parent)[1] if parent else None
        if previous:
            if previous['method']!=config:raise ValueError('State method migration requires qualification')
            if cutoff!=next_cutoff(previous['cutoff_at']):raise ValueError('Catch up cutoffs in scheduled order')
        source_ref=observation_ref or obs.current(root)
        selected,finals,statistics,missing=available(root,source_ref,cutoff)
        fh,sh=fingerprints(finals,statistics)
        oldf=previous['final_hashes'] if previous else {};olds=previous['statistics_hashes'] if previous else {}
        if set(oldf)-set(fh) or set(olds)-set(sh):raise ValueError('Previously incorporated evidence withdrawn; linked correction required')
        state=features.reconstruct(list(finals.values()),statistics,config['elo_hfa'])
        body={'schema':SCHEMA,'purpose':'INACTIVE_NUMERICAL_STATE','cutoff_at':cutoff.isoformat(),
              'created_at':execution.isoformat(),'parent':parent,'fit_ref':fit_ref,'method':config,
              'observation_ref':selected,'final_hashes':fh,'statistics_hashes':sh,
              'incorporated':state.incorporated,'elo':state.elo.teams,'state_sha256':state.identity(),
              'added_games':sorted(set(fh)-set(oldf)),'added_statistics':sorted(set(sh)-set(olds)),
              'revised_finals':[{'game_id':gid,'before':oldf[gid],'after':fh[gid]} for gid in sorted(set(fh)&set(oldf)) if fh[gid]!=oldf[gid]],
              'revised_statistics':[{'game_id':gid,'before':olds[gid],'after':sh[gid]} for gid in sorted(set(sh)&set(olds)) if sh[gid]!=olds[gid]],
              'missing':missing}
        data=gzip.compress(raw(body),mtime=0);ref=state_ref(data)
        write_bytes(root/ref['path'],data,immutable=True)
        restore(root,ref)
        save(receipt,ref,immutable=True)
        if current(root)!=parent:raise ValueError('Cutoff pointer advanced outside ownership')
        save(root/POINTER,ref)
        return ref


def forecast_rows(root,ref,slate,stadiums,extra_hashes=()):
    """Pure label-free shadow preparation; does not issue, lock or publish."""
    if not slate:raise ValueError('Forecast games required')
    if any(set(g)-set(features.GAME_FIELDS) for g in slate):raise ValueError('Forecast game DTO contains unapproved fields')
    if len({g['game_id'] for g in slate})!=len(slate):raise ValueError('Duplicate forecast game')
    state,body=restore(root,ref);cutoff=timestamp(body['cutoff_at']);contexts={}
    for game in slate:
        issuance=schedule_kickoff(game['gameday'],game['gametime'])-dt.timedelta(minutes=75)
        if cutoff_before(issuance)!=cutoff:raise ValueError('Forecast does not use its required cutoff')
        contexts.setdefault((int(game['season']),int(game['week'])),[]).append(game)
    result=[]
    for (season,week),games in sorted(contexts.items()):
        state.prepare(season);identity=state.identity()
        rows=features.render(state,sorted(games,key=lambda g:g['game_id']),stadiums,None,extra_hashes)
        for row in rows:
            row['state_lineage']={'policy':features.POLICY,'cutoff_at':cutoff.isoformat(),'state_ref':ref,
                                  'state_sha256':identity,'incorporated_count':len(state.incorporated),
                                  'weight_context_week':week,'evidence':'SHADOW_NOT_ISSUED'}
        result.extend(rows)
    return result
