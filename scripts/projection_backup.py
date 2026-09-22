"""Offline restoration proof for a pinned committed projection repository.

No scheduler, network fetch, fit, provider request or production restore is run.
Ignored files, host credentials/runtime/services and uncommitted state are outside
this recovery point. A successful archive alone is not a successful restore.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection.storage import save, _sync_directory

ENV={**os.environ,'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null',
     'GIT_TERMINAL_PROMPT':'0','GIT_NO_REPLACE_OBJECTS':'1'}
CONFIG=['-c','gc.auto=0','-c','core.hooksPath=/dev/null','-c','core.autocrlf=false',
        '-c','protocol.allow=never','-c','protocol.file.allow=always',
        '-c','pack.threads=1','-c','pack.windowMemory=32m','-c','pack.deltaCacheSize=16m']


def git(root,*args):
    result=subprocess.run(['git',*CONFIG,'-C',str(root),*args],env=ENV,
                          capture_output=True,check=True)
    return result.stdout


def digest_file(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def pin(root,commit):
    if len(commit)!=40 or any(c not in '0123456789abcdef' for c in commit):
        raise ValueError('Exact Git commit required')
    if git(root,'cat-file','-t',commit).strip()!=b'commit':raise ValueError('Commit object required')
    ref='refs/rebuild-backups/'+commit
    existing=subprocess.run(['git','-C',str(root),'rev-parse','--verify',ref],env=ENV,capture_output=True)
    if existing.returncode==0:
        if existing.stdout.strip().decode()!=commit:raise ValueError('Backup ref differs')
    else:git(root,'update-ref',ref,commit,'0'*40)
    return ref


def archive(root,commit,folder):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=False,mode=0o700)
    ref=pin(root,commit);pending=folder/'snapshot.bundle.pending'
    git(root,'bundle','create',str(pending),ref)
    with pending.open('rb') as stream:os.fsync(stream.fileno())
    sha=digest_file(pending);target=folder/(sha+'.bundle')
    os.link(pending,target);_sync_directory(folder)
    pending.unlink();_sync_directory(folder)  # Only our disposable staging link.
    git(root,'bundle','verify',str(target))
    heads=git(root,'bundle','list-heads',str(target)).decode().splitlines()
    if heads!=[commit+' '+ref]:raise ValueError('Unexpected archive refs')
    return {'path':str(target),'sha256':sha,'bytes':target.stat().st_size,'commit':commit,'ref':ref}


def restore(record,folder):
    folder=Path(folder)
    if folder.exists():raise ValueError('Restore requires a new empty destination')
    if digest_file(record['path'])!=record['sha256']:raise ValueError('Backup archive hash mismatch')
    folder.mkdir(mode=0o700)
    git(folder,'init','-q')
    git(folder,'fetch','--no-tags',record['path'],record['ref']+':refs/heads/restored')
    git(folder,'-c','filter.lfs.required=false','-c','filter.lfs.smudge=',
        '-c','filter.lfs.process=','checkout','--detach',record['commit'])
    if git(folder,'rev-parse','HEAD').strip().decode()!=record['commit']:raise ValueError('Restored commit differs')
    if git(folder,'remote').strip() or (folder/'.git/objects/info/alternates').exists():
        raise ValueError('Restore depends on another object store or remote')
    git(folder,'fsck','--full','--strict')
    return verify_tree(folder,record['commit'])


def verify_tree(root,commit):
    root=Path(root).resolve();entries=[];total=0
    for row in git(root,'ls-tree','-r','-l','-z',commit).split(b'\0'):
        if not row:continue
        head,name=row.split(b'\t',1);mode,kind,oid,size=head.split();name=os.fsdecode(name)
        if kind!=b'blob' or mode not in (b'100644',b'100755',b'120000'):
            raise ValueError('Tree contains a gitlink or unsupported entry; not a complete file backup')
        path=root/name;metadata=path.lstat();size=int(size)
        h=hashlib.sha1(b'blob '+str(size).encode()+b'\0')
        if mode==b'120000':
            if not stat.S_ISLNK(metadata.st_mode):raise ValueError('Symlink mode differs')
            content=os.fsencode(os.readlink(path));h.update(content);actual_size=len(content)
        else:
            if not path.resolve().is_relative_to(root) or not stat.S_ISREG(metadata.st_mode):
                raise ValueError('Restored file is not a contained regular file')
            if bool(metadata.st_mode & 0o111)!=(mode==b'100755'):raise ValueError('Executable mode differs')
            actual_size=metadata.st_size
            with path.open('rb') as stream:
                for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
        if actual_size!=size or h.hexdigest()!=oid.decode():raise ValueError('Restored file differs from Git: '+name)
        entries.append([name,mode.decode(),oid.decode(),size]);total+=size
    return {'verified_entries':len(entries),'verified_file_bytes':total,
            'tree_manifest_sha256':hashlib.sha256(json.dumps(entries,separators=(',',':')).encode()).hexdigest(),
            'tree_oid':git(root,'rev-parse',commit+'^{tree}').strip().decode(),
            'git_object_graph_verified':True,'object_alternates':False,'network_remote':False}


def reproduce(restored):
    restored=Path(restored)
    # This verifier itself is outside the restored executable. All application
    # imports and scoring occur in an isolated interpreter rooted in the restore.
    program=r'''
import json,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]);sys.path.insert(0,str(root))
from engine.projection.bundle import verify_card,resolve
from engine.projection.lineage import read_artifact
board=json.loads((root/'outputs/projection-v3/board.json').read_bytes())
groups={};graded=0
for card in board['games']:
 b=verify_card(root,card)
 if b:groups.setdefault(card['release_ref']['sha256'],[]).append((card,b))
 if card.get('grades'):
  from engine.projection.grade import grade
  for source,saved in card['grades'].items():
   actual=saved['actual'];prediction=card['projection'] if source=='PROJECTION' else card['ours']
   assert grade(prediction,actual['away_points'],actual['home_points'])==saved
   graded+=1
if not groups:raise ValueError('No bundle-backed forecasts to restore')
count=0
for pairs in groups.values():
 release=resolve(root,pairs[0][0]['release_ref'],'releases')
 artifact=read_artifact(root,release['fit_artifact_ref']);shapes=read_artifact(root,release['calibration_ref'])
 from engine.projection.scoring import artifact_payload
 payload={'artifact':artifact_payload(artifact),'shapes':shapes,'requests':[b['input'] for _,b in pairs]}
 p=subprocess.run([sys.executable,'-I','-B',str(root/'scripts/projection_score_worker.py')],input=json.dumps(payload),text=True,capture_output=True,check=True,timeout=60,cwd=root,env={'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
 scores=json.loads(p.stdout)
 for card,b in pairs:
  score=scores[card['game_id']];assert score=={key:card[key] for key in score};count+=1
print(json.dumps({'restored_forecasts':count,'first_grades_recomputed':graded,'board_cards':len(board['games']),'source':'Restored code and restored artifacts; original checkout not on child import path','runtime':'Existing Mac Python/NumPy; Linux runtime not restored'}))
'''
    result=subprocess.run([sys.executable,'-I','-B','-c',program,str(restored)],cwd=restored,
        env={'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'},
        capture_output=True,text=True,check=True,timeout=120)
    return json.loads(result.stdout)


def accept(source,record):
    if record.get('state')!='RESTORE_VERIFIED':raise ValueError('Only a verified restore can be accepted')
    body={k:v for k,v in record.items() if k!='receipt_ref'}
    encoded=(json.dumps(body,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
    sha=hashlib.sha256(encoded).hexdigest()
    ref={'path':f'work/engine-rebuild/backup-receipts/{sha}.json','sha256':sha}
    save(Path(source)/ref['path'],body,immutable=True)
    accepted={**body,'receipt_ref':ref}
    save(Path(source)/'work/engine-rebuild/backup-restore.json',accepted)
    return accepted


def _run_locked(source=ROOT,base=None):
    source=Path(source).resolve();base=Path(base or source/'.cloud-private/recovery-points').resolve()
    commit=git(source,'rev-parse','refs/remotes/origin/engine-v2').strip().decode()
    now=dt.datetime.now(dt.timezone.utc);folder=base/(now.strftime('%Y%m%dT%H%M%SZ')+'-'+commit[:12])
    started=time.monotonic();record={'schema':'projection-backup-v1','state':'STARTED','source_commit':commit,
        'started_at':now.isoformat(),'scope':'Committed engine-v2 snapshot/history only',
        'excluded':['ignored/uncommitted files','credentials and owner state','installed runtime and OS/services','public deployment'],
        'provider_credits':0}
    out=source/'work/engine-rebuild/backup-attempt.json'
    save(out,record)
    try:
        value=archive(source,commit,folder);record.update(state='ARCHIVED_NOT_YET_RESTORED',archive=value)
        save(out,record);print(json.dumps({'state':record['state'],'bytes':value['bytes']}),flush=True)
        restored=folder/'restored'
        record['tree']=restore(value,restored);record.update(state='TREE_VERIFIED',restored_path=str(restored))
        save(out,record);print(json.dumps({'state':record['state'],**record['tree']}),flush=True)
        record['reproduction']=reproduce(restored)
        if git(restored,'status','--porcelain').strip():raise ValueError('Reproduction changed restored records')
        record.update(state='RESTORE_VERIFIED',completed_at=dt.datetime.now(dt.timezone.utc).isoformat(),elapsed_seconds=time.monotonic()-started)
        record=accept(source,record)
        save(out,record)
        print(json.dumps({'state':record['state'],'reproduction':record['reproduction'],'elapsed_seconds':record['elapsed_seconds']}),flush=True)
    except Exception as error:
        record.update(state='FAILED',failure_type=type(error).__name__,elapsed_seconds=time.monotonic()-started)
        save(out,record)
        raise
    return record


def run(source=ROOT,base=None):
    source=Path(source).resolve();base=Path(base or source/'.cloud-private/recovery-points').resolve()
    base.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (base/'.backup.lock').open('a+') as handle:
        try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'state':'LOCAL_BACKUP_ACTIVE'}
        return _run_locked(source,base)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=ROOT);parser.add_argument('--destination',type=Path)
    args=parser.parse_args();result=run(args.source,args.destination)
    if result['state']=='LOCAL_BACKUP_ACTIVE':print(json.dumps(result))
