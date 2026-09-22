"""Exact public source bytes, stored once as legacy CSV or lossless gzip.

Existing records are never migrated/deleted here. The logical identity remains
SHA256(original bytes); compressed records additionally bind their stored bytes.
"""
import gzip
import hashlib
import io
from pathlib import Path
import re
from .storage import write_bytes

FOLDER = 'outputs/projection-v3/final-sources'


def _sha(value):
    if not isinstance(value,str) or not re.fullmatch('[0-9a-f]{64}',value):
        raise ValueError('Invalid final source hash')
    return value


def reference(feed):
    logical = _sha(feed['source_sha256'])
    if 'source_ref' in feed:
        ref = feed['source_ref']
    elif 'source' in feed:
        ref = feed['source']
    else:
        ref = {'path':f'{FOLDER}/{logical}.csv','sha256':logical}
    if not isinstance(ref,dict):raise ValueError('Invalid final source reference')
    plain = {'path':f'{FOLDER}/{logical}.csv','sha256':logical}
    if ref == plain:return dict(ref)
    if (set(ref)!={'path','sha256','sha256_uncompressed','encoding'}
        or ref['path']!=f'{FOLDER}/{logical}.csv.gz'
        or ref['sha256_uncompressed']!=logical or ref['encoding']!='gzip'):
        raise ValueError('Unsupported final source reference')
    _sha(ref['sha256'])
    return dict(ref)


def read_source(root, feed):
    ref=reference(feed);root=Path(root).resolve();path=(root/ref['path']).resolve()
    if not path.is_relative_to(root):raise ValueError('Final source escapes repository')
    stored=path.read_bytes()
    if hashlib.sha256(stored).hexdigest()!=ref['sha256']:
        raise ValueError('Stored final source hash mismatch')
    raw=gzip.decompress(stored) if ref.get('encoding')=='gzip' else stored
    if hashlib.sha256(raw).hexdigest()!=feed['source_sha256']:
        raise ValueError('Uncompressed final source hash mismatch')
    return raw


def store_source(root, raw):
    if not isinstance(raw,bytes):raise TypeError('Source bytes required')
    root=Path(root);logical=hashlib.sha256(raw).hexdigest()
    plain={'path':f'{FOLDER}/{logical}.csv','sha256':logical}
    if (root/plain['path']).exists():
        read_source(root,{'source_sha256':logical,'source_ref':plain})
        write_bytes(root/plain['path'],raw,immutable=True)
        return plain
    path=f'{FOLDER}/{logical}.csv.gz'
    local=root/path
    if local.exists():
        stored=local.read_bytes()
    else:
        buffer=io.BytesIO()
        with gzip.GzipFile(fileobj=buffer,mode='wb',filename='',mtime=0) as stream:stream.write(raw)
        stored=buffer.getvalue()
    ref={'path':path,'sha256':hashlib.sha256(stored).hexdigest(),
         'sha256_uncompressed':logical,'encoding':'gzip'}
    # Verify old objects before reuse; a corrupt collision is not overwritten.
    if local.exists():
        read_source(root,{'source_sha256':logical,'source_ref':ref})
    write_bytes(local,stored,immutable=True)
    return ref
