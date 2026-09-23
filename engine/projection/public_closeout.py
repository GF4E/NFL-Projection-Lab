"""Exact-byte public closeout acknowledgment; no publishing or credential access.

The endpoint mapping is deliberately not installed by this module. An API that
serves a different representation needs its own qualified adapter, not a hash
claim substituted for verification of the served content.
"""
import datetime as dt
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
from urllib.parse import urlparse

from . import prepared
from .storage import save
from engine.forecast_system.calendar import timestamp

CONFIG='config/projection-closeout-publication.json'
LIMIT=8*1024*1024


def transport(root):
    value=json.loads((Path(root)/CONFIG).read_bytes()).get('transport','urllib')
    if value not in ('urllib','curl'):raise ValueError('Unqualified public transport')
    return value


def fetch(url,client='urllib'):
    """Anonymous exact-byte GET; never use cookies, credentials or redirects."""
    if client=='urllib':
        with urllib.request.urlopen(url,timeout=10) as response:
            if response.status!=200:raise ValueError('Public closeout response not successful')
            data=response.read(LIMIT+1)
    elif client=='curl':
        try:
            response=subprocess.run(['curl','--disable','--silent','--show-error','--globoff',
                '--proto','=https','--connect-timeout','5','--max-time','10',
                '--max-filesize',str(LIMIT),'--write-out','\n%{http_code}',url],
                capture_output=True,timeout=12,check=False)
        except (subprocess.TimeoutExpired,OSError) as error:
            raise urllib.error.URLError('Public transport unavailable') from error
        if response.returncode:raise urllib.error.URLError('Public transfer failed')
        try:data,status=response.stdout.rsplit(b'\n',1)
        except ValueError:raise ValueError('Public response status missing')
        if status!=b'200':
            if status.isdigit():raise urllib.error.HTTPError(url,int(status),'Public access failed',None,None)
            raise ValueError('Invalid public response status')
    else:raise ValueError('Unqualified public transport')
    if len(data)>LIMIT:raise ValueError('Oversized public response')
    return data


def mapping(root,receipt):
    config=json.loads((Path(root)/CONFIG).read_bytes())
    if config['schema']!='public-closeout-endpoints-v1':raise ValueError('Public closeout adapter unqualified')
    base=config['base_url'].rstrip('/')
    parsed=urlparse(base)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Public closeout endpoint invalid')
    names=[Path(name).name for name in receipt['artifacts']]
    if len(names)!=len(set(names)) or not set(names)<= {'scorecard.json','trend.json','season.json'}:
        raise ValueError('Public closeout artifact names differ')
    urls={name:f"{base}/{receipt['season']}-w{receipt['week']}/{Path(name).name}" for name in receipt['artifacts']}
    transport(root)
    return urls


def proof_path(receipt):return receipt.parent/'public-acknowledgments'/receipt.name


def require_visible(root,receipt,at):
    root=Path(root);closed=json.loads(receipt.read_bytes());urls=mapping(root,closed)
    proof=json.loads(proof_path(receipt).read_bytes())
    if (proof.get('schema')!='verified-public-closeout-v1' or proof.get('status')!='HTTP_BYTES_VERIFIED'
        or proof.get('receipt_sha256')!=prepared.sha(receipt.read_bytes())
        or proof.get('artifacts')!=closed['artifacts'] or proof.get('urls')!=urls):
        raise ValueError('Public closeout proof identity differs')
    observed=timestamp(proof['observed_at'])
    if observed<timestamp(closed['published_at']) or observed>timestamp(at):
        raise ValueError('Public closeout proof chronology differs')
    for name,digest in proof['artifacts'].items():
        path=(root/name).resolve()
        if not path.is_relative_to(root.resolve()) or prepared.sha(path.read_bytes())!=digest:
            raise ValueError('Public closeout source artifact changed')
    return proof


def confirm(root,receipt):
    from scripts.closeout_publish import require_published
    root=Path(root);receipt=Path(receipt);at=dt.datetime.now(dt.timezone.utc)
    if proof_path(receipt).exists():return require_visible(root,receipt,at)
    closed=require_published(root,receipt,at);urls=mapping(root,closed);client=transport(root)
    for name,url in sorted(urls.items()):
        data=fetch(url,client)
        if prepared.sha(data)!=closed['artifacts'][name]:
            raise ValueError('Public closeout content differs')
    proof={'schema':'verified-public-closeout-v1','status':'HTTP_BYTES_VERIFIED',
           'observed_at':dt.datetime.now(dt.timezone.utc).isoformat(),
           'receipt_sha256':prepared.sha(receipt.read_bytes()),'urls':urls,'artifacts':closed['artifacts']}
    if client=='curl':
        version=subprocess.run(['curl','--disable','--version'],capture_output=True,check=True,timeout=5)
        proof['transport']={'client':'curl','version':version.stdout.decode().splitlines()[0],
                            'authentication':'NONE','redirects':False}
    save(proof_path(receipt),proof,immutable=True)
    return require_visible(root,receipt,dt.datetime.now(dt.timezone.utc))
