"""Only locked model picks and frozen human leans enter the current CSV views."""
import csv
import io
import json
from pathlib import Path
from engine.pick_store import put,read_pinned,sha
from engine.t75_report import final_feed,summarize,dto
from engine.t75_grade import grade
from engine.live_picks import overwrite


def locks(root):return [json.loads(p.read_text()) for p in (Path(root)/'outputs/model-pick-v1/locks').glob('*/T75-picks.json') if json.loads(p.read_text()).get('status')=='LOCKED']


def csv_write(path,rows,fields):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    f=io.StringIO();w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore',lineterminator='\n');w.writeheader();w.writerows(rows)
    import os,tempfile
    with tempfile.NamedTemporaryFile('w',dir=path.parent,prefix='.pending-',delete=False) as t:t.write(f.getvalue());name=t.name
    os.replace(name,path)


def write_pick_log(root):
    rows=[]
    for r in locks(root):
        for source,ps in [('model',r['picks']),('human_lean',[r['human_lean']] if r.get('human_lean') else [])]:
            for p in ps: rows.append({**p,'source':source,'game_id':r['game']['game_id'],'week':r['game']['week'],'status':'LOCKED','locked_at':r['freeze_timestamp'],'note':r.get('our_note',{}).get('text','') if source=='human_lean' else ''})
    csv_write(Path(root)/'outputs/model-pick-v1/pick_log.csv',rows,['game_id','week','market','side','line','book','price','fair_probability','source','status','locked_at','author','note'])


def run(root):
    root=Path(root);out=root/'outputs/model-pick-v1';config=json.loads((root/'work/model-pick-v1/runtime-config.json').read_text());shape=read_pinned(config['distribution'])
    refs=[json.loads(p.read_text()) for p in (out/'result-refreshes').glob('*.json')]+[json.loads(p.read_text()) for p in (out/'daily').glob('*/results-ref.json')]
    latest=max(refs,key=lambda r:r.get('received_at',''),default=None)
    results={}
    if latest:
        raw=Path(latest['path']).read_bytes()
        if sha(raw)!=latest['sha256']:raise ValueError('Results hash mismatch')
        results=final_feed(raw,latest['sha256'])
    records=locks(root)
    for r in records:
        p=r.get('human_lean')
        if not p or p.get('fair_probability') is None:continue
        identity=sha((r['game']['game_id']+'|human_lean|'+p['market']).encode());dest=out/'human-grades'/(identity+'.json')
        if dest.exists():continue
        g=grade(dto(p,r['game']),results.get(r['game']['game_id']),shape)
        if g['status']=='SCORED':put(dest,{**g,**{k:r['game'][k] for k in ('game_id','week','season')},'market':p['market'],'source':'human_lean','author':p['author'],'side':p['side'],'line':p['line'],'price':p['price']})
    grades=[json.loads(p.read_text()) for p in (out/'grades').glob('*/*.json')]
    human=[json.loads(p.read_text()) for p in (out/'human-grades').glob('*.json')]
    jarrett=[json.loads(p.read_text()) for p in (root/'outputs/jarrett/grades').glob('*.json')]
    for g in grades:g['source']='model' if g['kind']=='actual' else 'paper_rule' if g['kind'].startswith('WIND-') else 'diagnostic'
    rows=[]
    for source in ('model','price','paper_rule','human_lean','jarrett'):
        pool=human if source=='human_lean' else jarrett if source=='jarrett' else [g for g in grades if g['source']==('model' if source=='price' else source) and (source!='price' or g['edge_source']=='price')]
        for week in ['ALL']+sorted({r['game']['week'] for r in records}):
            for market in ('spreads','totals'):
                chosen=[g for g in pool if (week=='ALL' or int(g['week'])==week) and g['market']==market]
                normalized=[{**g,'clv_probability':g.get('clv_probability'),'clv_cents':g.get('clv_cents'),'units':g.get('units',0)} for g in chosen]
                rows.append({'source':source,'week':week,'market':market,**summarize(normalized)})
    csv_write(root/'outputs/scorecard.csv',rows,list(rows[0]));write_pick_log(root)
    return {'human_grades':human,'rows':rows}
