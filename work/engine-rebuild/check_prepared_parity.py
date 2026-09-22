"""Prepared-state migration parity on captured production inputs; isolated writes."""
import copy
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import types
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection import bundle, prepared
from engine.projection.lineage import read_artifact
from engine.projection.scoring import artifact_payload
from engine.projection.scoring_process import score_batch
from scripts import projection_v3_publish as current, projection_publish, projection_learning, board_v7_publish

BASE='2d69f0e7e2b265d75765ffb7d7dd60f17963f431'
source=subprocess.check_output(['git','show',BASE+':scripts/projection_v3_publish.py'],cwd=ROOT).decode()
prior=types.ModuleType('bundle_control_publisher');prior.__file__=str(ROOT/'scripts/projection_v3_publish.py')
exec(compile(source,prior.__file__,'exec'),prior.__dict__)
capture=json.loads((ROOT/'work/engine-rebuild/prepared-input-capture.json').read_text())
captured=ROOT/capture['folder']
for name,record in capture['files'].items():
    assert hashlib.sha256((captured/name).read_bytes()).hexdigest()==record['sha256'],name
ref=json.loads((captured/'work/in-season-learning-v1/active-fit-ref.json').read_text())
artifact=read_artifact(captured,ref)
now=dt.datetime.fromisoformat(capture['captured_at'])
candidate_code={'commit':BASE,'status':'CANDIDATE_SOURCE_NOT_YET_COMMITTED',
                'files':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in bundle.CODE_PATHS}}
IGNORED={'forecast_bundle_ref','release_ref','issued_at','published_at','content_sha256'}
def normalize(value):
    if isinstance(value,dict):return {k:normalize(v) for k,v in value.items() if k not in IGNORED}
    if isinstance(value,list):return [normalize(v) for v in value]
    return value

def run(module, folder, when):
    writes={}
    def save(path,value,immutable=False):
        key=str(Path(path).relative_to(folder));writes[key]=copy.deepcopy(value)
        from engine.projection.storage import save as durable
        durable(path,value,immutable)
    with patch.multiple(module,ROOT=folder,WORK=folder/'work/projection-v3',OUT=folder/'outputs/projection-v3'), \
         patch.object(module,'save',side_effect=save),patch.object(projection_publish,'save',side_effect=save), \
         patch.object(module,'read',side_effect=lambda r:read_artifact(folder,r)), \
         patch.object(projection_learning,'active_artifact_with_ref',return_value=(ref,artifact)), \
         patch.object(board_v7_publish,'run',return_value=None), \
         patch.object(bundle,'capture_code',return_value=candidate_code):
        start=time.monotonic();board=module.run(now=when);elapsed=time.monotonic()-start
    return board,writes,elapsed

with tempfile.TemporaryDirectory(prefix='projection-bundle-parity-') as temp:
    base=Path(temp);old=base/'old';new=base/'new';shutil.copytree(captured,old);shutil.copytree(captured,new)
    before={str(p.relative_to(new)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ('locks','grades') for p in (new/'outputs/projection-v3'/folder).glob('*.json')}
    original_alias=(new/prepared.LEGACY).read_bytes()
    manifest=json.loads((new/prepared.POINTER).read_bytes())
    with prepared.writer(new):snapshot=prepared.commit(new,original_alias,manifest)
    assert (new/prepared.LEGACY).read_bytes()==original_alias
    assert prepared.load(new)[2]==original_alias
    ob,ow,ot=run(prior,old,now);nb,nw,nt=run(current,new,now)
    assert normalize(ob)==normalize(nb),'Publisher fields differ'
    assert ow.keys()==nw.keys(),'Written card population differs'
    assert all(normalize(ow[k])==normalize(nw[k]) for k in ow),'Card writes differ'
    for name,sha in before.items():assert hashlib.sha256((new/name).read_bytes()).hexdigest()==sha,'History changed'
    bundles=[g for g in nb['games'] if g.get('forecast_bundle_ref')]
    for card in bundles:
        b=bundle.verify_card(new,card)
        reproduction=score_batch(artifact,read_artifact(new,artifact['shapes']),[b['input']])[card['game_id']]
        assert reproduction=={key:card[key] for key in reproduction},'Bundle reproduction differs'
    immutable_count=len(list((new/'outputs/projection-v3/bundles').glob('*.json.gz')))
    again,_,_=run(current,new,now+dt.timedelta(seconds=1))
    assert normalize(again)==normalize(nb)
    assert len(list((new/'outputs/projection-v3/bundles').glob('*.json.gz')))==immutable_count,'Unchanged poll accumulated bundles'
    assert [g.get('forecast_bundle_ref') for g in again['games']]==[g.get('forecast_bundle_ref') for g in nb['games']]
    new_bytes=sum(p.stat().st_size for kind in ('bundles','releases','input-manifests') for p in (new/'outputs/projection-v3'/kind).glob('*'))
    result={'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'capture_time':capture['captured_at'],
            'host_commit_at_capture':capture['host_commit'],'control_publisher_commit':BASE,
            'fit_ref':ref,'candidate_source':candidate_code,'scope':'Isolated captured-input publication; no production writes, no provider requests, no public rendering',
            'cards':len(nb['games']),'all_card_fields_identical_except_declared_metadata':True,
            'excluded_metadata_fields':sorted(IGNORED),'written_card_paths':len(nw),'immutable_history_verified_unchanged':len(before),
            'prepared_snapshot_ref':snapshot['prepared_manifest_ref'],'prepared_features_ref':snapshot['features_ref'],
            'prepared_bytes':len(original_alias),'legacy_alias_unchanged':True,'new_bundle_cards':len(bundles),'exact_bundle_reproductions':len(bundles),
            'unchanged_poll_reuses_bundles':True,'new_immutable_bytes':new_bytes,
            'control_wall_seconds':ot,'candidate_wall_seconds':nt,'provider_credits':0}
    # Test entirely fresh issuance in simulated pre-lock time, using captured
    # features, never present it as a historical as-issued replay.
    fresh=base/'fresh';shutil.copytree(captured,fresh)
    work=fresh/'work/projection-v3';rows=json.loads(gzip.decompress((work/'current-features.json.gz').read_bytes()))
    from engine.forecast_system.calendar import schedule_kickoff
    when=min(schedule_kickoff(r['game']['gameday'],r['game']['gametime']) for r in rows)-dt.timedelta(minutes=80)
    for row in rows:
        row['actual_points']=None
        for key in ('home_score','away_score'):row['game'][key]=None
    raw=gzip.compress(json.dumps(rows).encode(),mtime=0);(work/'current-features.json.gz').write_bytes(raw)
    manifest=json.loads((work/'current-ref.json').read_text());manifest['sha256']=hashlib.sha256(raw).hexdigest();(work/'current-ref.json').write_text(json.dumps(manifest))
    # These are private disposable fixture copies, not original user records.
    for folder in ('outputs/projection-v3','outputs/projection-v2'):
        if (fresh/folder).exists():shutil.rmtree(fresh/folder)
    fresh_old=base/'fresh-old';shutil.copytree(fresh,fresh_old)
    with prepared.writer(fresh):prepared.commit(fresh,raw,manifest)
    fb,fw,ft=run(current,fresh,when);fo,_,_=run(prior,fresh_old,when)
    expected=len({r['game_id'] for r in rows if r['week']<=2})
    assert len(fb['games'])==expected and all(g['status']=='UPCOMING' and g.get('forecast_bundle_ref') for g in fb['games'])
    assert normalize(fb)==normalize(fo),'Fresh card parity differs'
    result['fresh_fixture']={'scope':'Simulated pre-lock time, captured values, labels cleared; not a chronology proof',
                             'cards':expected,'exact_card_parity':True,'candidate_wall_seconds':ft}
(ROOT/'work/engine-rebuild/prepared-parity.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='candidate_source'},indent=2))
