"""Exact private directory recovery points; never activates or executes a restore.

Absolute internal symlinks retain their original prefix. A restored runtime must
be qualified at that prefix in an isolated namespace before use. Host OS/native
libraries outside this prefix are a separately verified compatibility condition.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
from .storage import save, _directory, _sync_directory

SCHEMA='private-runtime-snapshot-v1'


def digest_file(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()


def inventory(root, *, origin_prefix=None):
    root=Path(root).absolute()
    if root.is_symlink() or not root.is_dir():raise ValueError('Real directory required')
    origin=Path(origin_prefix or root).absolute();todo=[root];entries={}
    while todo:
        path=todo.pop();s=path.lstat();name=path.relative_to(root).as_posix()
        item={'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'mtime_ns':s.st_mtime_ns}
        if stat.S_ISLNK(s.st_mode):
            target=os.readlink(path)
            logical=Path(os.path.normpath(str(origin/Path(name).parent/target)))
            if not logical.is_relative_to(origin):raise ValueError('External symlink: '+name)
            item.update(kind='symlink',target=target)
        elif stat.S_ISDIR(s.st_mode):
            item['kind']='directory';todo.extend(path.iterdir())
        elif stat.S_ISREG(s.st_mode):
            item.update(kind='file',size=s.st_size,sha256=digest_file(path))
            after=path.lstat()
            if (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
                raise ValueError('Source changed during hashing: '+name)
        else:raise ValueError('Special runtime member: '+name)
        entries[name]=item
    return dict(sorted(entries.items()))


def validate_manifest(manifest):
    if manifest.get('schema')!=SCHEMA:raise ValueError('Unknown runtime snapshot')
    prefix=Path(manifest['source_prefix'])
    if not prefix.is_absolute():raise ValueError('Absolute runtime prefix required')
    entries=manifest['entries']
    if entries.get('.',{}).get('kind')!='directory':raise ValueError('Snapshot root directory required')
    for name,item in entries.items():
        p=Path(name)
        if p.is_absolute() or '..' in p.parts or p.as_posix()!=name:raise ValueError('Unsafe member path')
        for parent in p.parents:
            if entries.get(parent.as_posix(),{}).get('kind')!='directory':raise ValueError('Non-directory member ancestor')
        if item['kind']=='symlink':
            logical=Path(os.path.normpath(str(prefix/p.parent/item['target'])))
            if not logical.is_relative_to(prefix):raise ValueError('External runtime symlink')
        elif item['kind'] not in ('file','directory'):raise ValueError('Unsupported member type')
    return manifest


def verify(root, manifest):
    validate_manifest(manifest)
    found=inventory(root,origin_prefix=manifest['source_prefix'])
    if found!=manifest['entries']:raise ValueError('Runtime recovery contents or metadata differ')
    return {'entries':len(found),'file_bytes':sum(v.get('size',0) for v in found.values()),
            'files':sum(v['kind']=='file' for v in found.values()),'symlinks':sum(v['kind']=='symlink' for v in found.values())}


def copy_exact(source,destination,manifest):
    source=Path(source).absolute();destination=Path(destination).absolute()
    if destination.is_relative_to(source):raise ValueError('Recovery cannot be nested in source')
    if destination.exists() or destination.is_symlink():raise ValueError('Fresh recovery directory required')
    # All source ancestors are real directories; links are copied, never traversed.
    shutil.copytree(source,destination,symlinks=True,copy_function=shutil.copy2)
    # copy2 preserves bytes/modes/times but not ownership. Apply exact retained IDs.
    for name,item in sorted(manifest['entries'].items(),key=lambda v:len(Path(v[0]).parts),reverse=True):
        p=destination/name
        os.chown(p,item['uid'],item['gid'],follow_symlinks=False)
        if item['kind']!='symlink':os.chmod(p,item['mode'])
        os.utime(p,ns=(item['mtime_ns'],item['mtime_ns']),follow_symlinks=False)
        if item['kind']=='file':
            with p.open('rb') as stream:os.fsync(stream.fileno())
        elif item['kind']=='directory':
            fd=os.open(p,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
            try:os.fsync(fd)
            finally:os.close(fd)
    _sync_directory(destination.parent)
    return verify(destination,manifest)


def capture(source, folder):
    source=Path(source).absolute();folder=Path(folder).absolute()
    if folder.is_relative_to(source):raise ValueError('Snapshot cannot be nested in source')
    if folder.exists() or folder.is_symlink():raise ValueError('New snapshot destination required')
    manifest={'schema':SCHEMA,'source_prefix':str(source),'entries':inventory(source)}
    validate_manifest(manifest);_directory(folder);os.chmod(folder,0o700)
    save(folder/'intent.json',manifest,immutable=True)
    result=copy_exact(source,folder/'tree',manifest)
    verify(source,manifest)
    # Acceptance is last; a killed/failed copy has intent only and cannot restore.
    raw=(folder/'intent.json').read_bytes()
    save(folder/'accepted.json',{'manifest_sha256':hashlib.sha256(raw).hexdigest(),'verified':result},immutable=True)
    return {'manifest_sha256':hashlib.sha256(raw).hexdigest(),**result}


def restore(folder,destination):
    folder=Path(folder).absolute();destination=Path(destination).absolute()
    if destination.is_relative_to(folder):raise ValueError('Recovery cannot be nested in snapshot')
    raw=(folder/'intent.json').read_bytes();receipt=json.loads((folder/'accepted.json').read_bytes())
    if hashlib.sha256(raw).hexdigest()!=receipt['manifest_sha256']:raise ValueError('Snapshot manifest hash differs')
    manifest=validate_manifest(json.loads(raw));result=verify(folder/'tree',manifest)
    if result!=receipt['verified']:raise ValueError('Acceptance summary differs')
    return copy_exact(folder/'tree',destination,manifest)
