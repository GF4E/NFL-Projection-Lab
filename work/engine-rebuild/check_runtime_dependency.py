"""Read-only installed runtime and exact bundle reproduction; no fitting/publication."""
import datetime,hashlib,importlib.metadata,json,subprocess
from pathlib import Path
from engine.projection.bundle import resolve,verify_card
from engine.projection.lineage import read_artifact
from engine.projection.scoring_process import score_batch
root=Path.cwd()
board=json.loads((root/'outputs/projection-v3/board.json').read_bytes())
groups={};refs={};reproduced={}
for card in board['games']:
    saved=verify_card(root,card)
    if saved:
        key=card['release_ref']['sha256'];refs[key]=resolve(root,card['release_ref'],'releases')
        groups.setdefault(key,[]).append((card,saved))
for key,pairs in groups.items():
    ref=refs[key]
    scores=score_batch(read_artifact(root,ref['fit_artifact_ref']),read_artifact(root,ref['calibration_ref']),[v['input'] for _,v in pairs])
    for card,saved in pairs:
        score=scores[card['game_id']]
        assert score=={key:card[key] for key in score}
        reproduced[card['game_id']]=hashlib.sha256(json.dumps(score,sort_keys=True,separators=(',',':')).encode()).hexdigest()
packages={d.metadata['Name']:d.version for d in importlib.metadata.distributions()}
protected={}
for name in ['numpy','scipy','pandas']:
    d=importlib.metadata.distribution(name);h=hashlib.sha256();count=0
    for relative in sorted(d.files or [],key=str):
        if str(relative).endswith(('.pyc','.pyo')):continue
        p=Path(d.locate_file(relative))
        if p.is_file():h.update(str(relative).encode()+b'\0'+hashlib.sha256(p.read_bytes()).digest());count+=1
    protected[name]={'version':d.version,'files':count,'content_sha256':h.hexdigest()}
immutable={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for k in ['locks','grades'] for p in (root/'outputs/projection-v3'/k).glob('*.json')}
print(json.dumps({'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'packages':packages,'protected_packages':protected,'reproduced_forecasts':reproduced,'immutable_records':immutable,'active_fit':json.loads((root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes()),'scope':'Read-only package identities and exact live bundle reproduction; no fitting or provider calls'},indent=2))
