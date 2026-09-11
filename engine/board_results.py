"""Refresh public finals without overwriting the daily source or first grades."""
import datetime as dt
import json
import urllib.request
from pathlib import Path
from engine.pick_store import pin, put, read_pinned
from engine.t75_report import final_feed, score_files, run as report

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'


def refresh(root=ROOT):
    root=Path(root);out=root/'outputs/model-pick-v1'
    raw=urllib.request.urlopen(URL,timeout=30).read()
    ref=pin(out/'final-sources',raw,'.csv',True)
    results=final_feed(raw,ref['sha256'])
    if not results: raise ValueError('No valid public finals; retain previous publication')
    config=json.loads((root/'work/model-pick-v1/runtime-config.json').read_text())
    grades=score_files(sorted((out/'locks').glob('*/T75-picks.json')),results,read_pinned(config['distribution']),out/'grades')
    now=dt.datetime.now(dt.timezone.utc)
    put(out/'result-refreshes'/(now.strftime('%Y%m%dT%H%M%SZ')+'-'+ref['sha256']+'.json'),{**ref,'received_at':now.isoformat(),'url':URL})
    result=report(output=out)
    from engine.slip_grade import run
    jarrett=run(results_path=ref['path'])
    return {'source':ref,'graded':len(grades),'model_report':result,'jarrett_report':jarrett,'credits_spent':0}

if __name__=='__main__': print(json.dumps(refresh()))
