"""Retain and reverify the complete training migration without fitting/activation."""
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection import training_ledger as ledger, cutoff_pipeline as p
from engine.projection.storage import save


def main():
    if os.environ.get('OPENBLAS_NUM_THREADS')!='1':raise ValueError('One worker required')
    started=time.monotonic()
    replay_ref=json.loads((ROOT/'work/engine-rebuild/hourly-catchup/current-ref.json').read_bytes())
    replay=ledger.read(ROOT,replay_ref)
    cache=replay['retained_training_cache'];data=(ROOT/cache['path']).read_bytes()
    base_ref=ledger.retain_base(ROOT,data,replay)
    audit_ref=json.loads((ROOT/'work/engine-rebuild/training-input-audit/current-ref.json').read_bytes())
    method_ref=json.loads((ROOT/'work/in-season-learning-v1/active-fit-ref.json').read_bytes())
    folder=ROOT/'work/engine-rebuild/training-transition'
    pointer=folder/'current-ref.json'
    if pointer.exists():ref=json.loads(pointer.read_bytes())
    else:
        ref=ledger.create(ROOT,replay_ref=replay_ref,base_ref=base_ref,legacy_audit_ref=audit_ref,
                          method_ref=method_ref,at=dt.datetime.now(dt.timezone.utc))
    rows=ledger.history(ROOT,ref,method_ref=method_ref)
    body=p.load(ROOT,ref,'training')
    if len(rows)!=5854 or len(body['training_games'])!=2927:raise ValueError('Full training population differs')
    current=[r for r in rows if r['season']==2026]
    if len(current)!=64:raise ValueError('32 paired current-season games required')
    # Every logical historical forecast must exclude its own result and any later game.
    source={g['game_id']:g for g in ledger.read(ROOT,body['sources']['schedule'])}
    checks=0
    for receipt in body['reconstruction_receipts']:
        cutoff=p.timestamp(receipt['cutoff_at'])
        for gid in receipt['incorporated_games']:
            if p.time_of(source[gid])+dt.timedelta(hours=4,minutes=75)>=cutoff:raise ValueError('Early result')
            checks+=1
    original=ledger.read(ROOT,audit_ref);old={r['game_id']:r for r in original['records']}
    comparisons=[]
    for r in current:
        entry=old[r['game_id']]
        previous=entry.get('rows',{}).get('home' if r['home'] else 'away')
        comparisons.append({'game_id':r['game_id'],'team':r['team'],'original_evidence':entry['evidence'],
            'original_version':entry.get('version'),
            'features':{k:{'original':previous['features'].get(k) if previous else None,'reconstructed':r['features'][k]}
                        for k in ('baseline','elo','elo_difference')},
            'qualification':'HISTORICAL_RECONSTRUCTION_NOT_AS_ISSUED'})
    elapsed=time.monotonic()-started;rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)
    if elapsed>600 or rss>4*1024**3:raise ValueError('Weekly runtime budget exceeded')
    report={'schema':'training-transition-qualification-v1','ledger_ref':ref,'historical_games':2895,
        'current_games':32,'training_rows':len(rows),'recorded_live_games':0,'reconstructed_games':2927,
        'strict_eligibility_checks':checks,'comparisons':comparisons,'fit_performed':False,'activation':False,
        'historical_availability':'UNKNOWN_ASSUMED_AT_KICKOFF_PLUS_FOUR_HOURS',
        'elapsed_seconds':elapsed,'peak_rss_bytes':rss,
        'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'candidate_code':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in
            ('engine/projection/training_ledger.py','engine/projection/cutoff_pipeline.py',str(Path(__file__).resolve().relative_to(ROOT)))}}
    save(pointer,ref,immutable=True)
    save(folder/'verification.json',report)
    print(json.dumps({k:v for k,v in report.items() if k not in ('comparisons','candidate_code')}))


if __name__=='__main__':main()
