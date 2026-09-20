"""Daily public OPEN audit ingestion; never an Odds API or forecast dependency."""
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
from urllib.request import urlopen
ROOT=Path(__file__).resolve().parents[1]


def refresh(root=ROOT, now=None, fetch=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    folder=root/'outputs/in-season-learning-v1/reference-sources'
    folder.mkdir(parents=True,exist_ok=True)
    status=folder/'status.json'
    if status.exists() and json.loads(status.read_text()).get('date')==now.date().isoformat():
        return json.loads(status.read_text())
    def download(url):
        with urlopen(url,timeout=20) as response:return response.read()
    fetch=fetch or download
    receipts=[]
    try:
        for filename,column in [('historic_projected_spreads.csv','home_line_open'),('nfelo_games.csv','total_line_open')]:
            url='https://raw.githubusercontent.com/greerreNFL/nfelo/main/output_data/'+filename
            raw=fetch(url)
            reader=csv.DictReader(io.StringIO(raw.decode()))
            rows=list(reader)
            if not {'game_id',column}<=set(reader.fieldnames or []) or not rows:
                raise ValueError('Invalid audit reference schema')
            seen={}
            for row in rows:
                try:value=float(row[column])
                except (ValueError,TypeError):continue
                if not math.isfinite(value):continue
                gid=row['game_id']
                if gid in seen and seen[gid]!=value:
                    raise ValueError('Conflicting duplicate opening reference')
                seen[gid]=value
            digest=hashlib.sha256(raw).hexdigest();packed=gzip.compress(raw,mtime=0)
            path=folder/(filename.removesuffix('.csv')+'-'+digest+'.csv.gz')
            if not path.exists():path.write_bytes(packed)
            receipts.append({'url':url,'path':str(path.relative_to(root)),
                             'sha256':hashlib.sha256(packed).hexdigest(),'sha256_uncompressed':digest,
                             'retrieved_at':now.isoformat()})
        tmp=folder/'receipts.tmp';tmp.write_text(json.dumps(receipts,indent=2)+'\n');tmp.replace(folder/'receipts.json')
        result={'date':now.date().isoformat(),'state':'REFRESHED','audit_only':True}
    except (OSError,ValueError,UnicodeError) as exc:
        result={'date':now.date().isoformat(),'state':'LAST_GOOD_RETAINED','error_type':type(exc).__name__,
                'audit_only':True,'reason':'OPEN reference refresh failed; no CLOSE substitution'}
    status.write_text(json.dumps(result,indent=2)+'\n')
    return result
if __name__=='__main__':print(json.dumps(refresh()))
