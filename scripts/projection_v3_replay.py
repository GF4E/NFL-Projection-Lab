"""Verify or fully replay one immutable v2 experiment, offline and without writes."""
import argparse,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection_v3.qualify import read,load_prepared,Study,gate,prior_shapes
from engine.projection_v3.model import fit,predict

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--experiment');parser.add_argument('--verify',action='store_true');parser.add_argument('--replay',action='store_true');args=parser.parse_args();ref=json.loads((ROOT/'work/projection-v3/record-ref.json').read_text())
 if args.experiment:
  p=Path(args.experiment);ref={'path':str(p),'sha256':p.stem.rsplit('-',1)[1]}
 r=read(ref);a=read(r['fit']);pred=read(r['oof']);baseline=read(r['baseline_oof']);decisions=read(r['qualification']);read(r['availability']);read(a['shapes']);assert hashlib.sha256((ROOT/r['protocol']['path']).read_bytes()).hexdigest()==r['protocol']['sha256'];prepared,_,_=load_prepared();study=Study(prepared)
 for key,rows in prepared.items():
  from engine.projection.model import hash_value
  assert hash_value(rows)==r['feature_hashes'][key]
 final=fit(study.train_rows(a['selected'][0],2026),a['groups'],a['selected'][1]);assert final==a['fit']
 if args.verify:
  assert fit(list(reversed(study.train_rows(a['selected'][0],2026))),a['groups'],a['selected'][1])==final
  checked=gate(pred,baseline,set(range(2016,2026)),True);assert checked==r['release_gate']
  for year in r['annual']:
   expected=prior_shapes(pred,year['season']);actual=read(year['calibration']) if year['calibration'] else None;assert expected==actual
   rows=[p for p in pred if p['season']==year['season']]
   for k,j in [('team_points',0),('margin',1),('total',2)]:assert abs(sum(p['loss'][j] for p in rows)/len(rows)-year['point_metrics'][k]['v2_mae'])<1e-12
 if args.replay:
  replay=[]
  for y in range(2016,2027):
   q=study.qualify(y,interval=y==2026);assert q==decisions[y-2016]
   if y<2026:replay += [p for p in study.evaluate(q['selected_groups'])['predictions'] if p['season']==y]
  assert replay==pred
 print(json.dumps({'experiment':r['experiment'],'verification':'PASS','full_qualification_replay':bool(args.replay),'paired_n':len(pred),'retained_groups':a['groups'],'credits_spent':0}))
if __name__=='__main__':main()
