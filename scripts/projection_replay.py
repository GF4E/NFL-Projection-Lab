"""Offline verification of a named fitted football experiment; no provider calls."""
import argparse,gzip,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection.train import read
from engine.projection.features import build
from engine.projection.model import Fit,fit

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--fit-ref',default='work/projection-v1/fit-ref.json');parser.add_argument('--verify',action='store_true');args=parser.parse_args();a=read(json.loads((ROOT/args.fit_ref).read_text()));m=a['source_manifest'];data=read(m['team_games']);schedule=read(m['schedule']);shapes=read(a['shapes']);d=a['selected'][0]
 rows=build(data,schedule,json.loads((ROOT/'config/stadiums.json').read_text()),None if d=='none' else int(d),m['roster_source_hashes']);training=[r for r in rows if r['season']<=2025 and r['actual_points'] is not None and r['features']['baseline'] is not None];f=fit(training,a['fit']['names'],a['fit']['penalty']);assert f.fit_hash==Fit(**a['fit']).fit_hash
 if args.verify:
  reversed_fit=fit(list(reversed(training)),a['fit']['names'],a['fit']['penalty']);assert reversed_fit.fit_hash==f.fit_hash
  for r in rows:
   if r['features']['baseline'] is not None:assert f.predict(r['features'])==reversed_fit.predict(r['features'])
 print(json.dumps({'experiment':a['version'],'fit_hash':a['fit_hash'],'training_team_rows':len(training),'margin_residual_n':shapes['margin']['n'],'replay':'PASS','order_invariant':args.verify,'credits_spent':0}))
if __name__=='__main__':main()
