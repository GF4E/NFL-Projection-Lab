"""Migration integrity inventory; read-only, bounded streaming hashes."""
import hashlib,json,os,stat,sys
from pathlib import Path

def inventory(root):
    root=Path(root);out={}
    for base,dirs,files in os.walk(root,followlinks=False):
        dirs.sort();files.sort()
        for name in dirs+files:
            p=Path(base)/name;s=p.lstat();v={'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid}
            if p.is_symlink():v.update(type='symlink',target=os.readlink(p))
            elif p.is_dir():v.update(type='directory')
            elif p.is_file():
                h=hashlib.sha256()
                with p.open('rb') as f:
                    for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
                v.update(type='file',bytes=s.st_size,sha256=h.hexdigest())
            else:raise RuntimeError('Unexpected special file: '+str(p))
            out[str(p.relative_to(root))]=v
    return out
if __name__=='__main__':
    result=inventory(sys.argv[1]);Path(sys.argv[2]).write_text(json.dumps(result,sort_keys=True,separators=(',',':'))+'\n')
    print(json.dumps({'entries':len(result),'files':sum(v['type']=='file' for v in result.values()),'bytes':sum(v.get('bytes',0) for v in result.values()),'manifest_sha256':hashlib.sha256(Path(sys.argv[2]).read_bytes()).hexdigest()}))
