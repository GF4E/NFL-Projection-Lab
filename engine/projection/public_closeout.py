"""Exact-byte public closeout acknowledgment; no publishing or credential access.

The endpoint mapping is deliberately not installed by this module. An API that
serves a different representation needs its own qualified adapter, not a hash
claim substituted for verification of the served content.
"""
import datetime as dt
import json
from pathlib import Path
import urllib.request
from urllib.parse import urlparse

from . import prepared
from .storage import save
from engine.forecast_system.calendar import timestamp

CONFIG='config/projection-closeout-publication.json'
LIMIT=8*1024*1024


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
    closed=require_published(root,receipt,at);urls=mapping(root,closed)
    for name,url in sorted(urls.items()):
        with urllib.request.urlopen(url,timeout=10) as response:
            if response.status!=200:raise ValueError('Public closeout response not successful')
            data=response.read(LIMIT+1)
        if len(data)>LIMIT or prepared.sha(data)!=closed['artifacts'][name]:
            raise ValueError('Public closeout content differs')
    proof={'schema':'verified-public-closeout-v1','status':'HTTP_BYTES_VERIFIED',
           'observed_at':dt.datetime.now(dt.timezone.utc).isoformat(),
           'receipt_sha256':prepared.sha(receipt.read_bytes()),'urls':urls,'artifacts':closed['artifacts']}
    save(proof_path(receipt),proof,immutable=True)
    return require_visible(root,receipt,dt.datetime.now(dt.timezone.utc))
