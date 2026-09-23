"""Verify archive metadata, restore locally, and hash every restored file."""
import datetime,hashlib,json,os,stat,sys,tarfile
from pathlib import Path
from manifest import inventory
folder=Path(sys.argv[1]);source=folder/'source.json';archive=folder/'host-checkout.tar.gz';dest=folder/'restore-check'
expected=json.loads(source.read_text());headers={};dest.mkdir(exist_ok=False)
with tarfile.open(archive,'r:gz') as tf:
    for member in tf.getmembers():
        name=member.name.removeprefix('./').rstrip('/')
        if name in ('','.'):continue
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        kind='directory' if member.isdir() else 'symlink' if member.issym() else 'file' if member.isfile() or member.islnk() else 'unknown'
        v={'mode':member.mode,'uid':member.uid,'gid':member.gid,'type':kind}
        if member.issym():v['target']=member.linkname
        e=expected[name]
        assert all(e[k]==value for k,value in v.items()),(name,v,e)
        headers[name]=v
    assert headers.keys()==expected.keys()
    tf.extractall(dest,filter='data')
actual=inventory(dest)
assert actual.keys()==expected.keys()
for name,e in expected.items():
    for k in ('type','bytes','sha256','target'):
        assert actual[name].get(k)==e.get(k),(name,k)
h=hashlib.sha256()
with archive.open('rb') as f:
    for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifest_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'archive_sha256':h.hexdigest(),'archive_bytes':archive.stat().st_size,'entries':len(expected),'files':sum(v['type']=='file' for v in expected.values()),'all_content_restored':True,'archive_metadata_matches':True,'scope':'Entire checkout archive restored to private Mac directory; Linux owner/mode headers checked against source; every restored file hash verified'}
(folder/'off-host-restore.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
