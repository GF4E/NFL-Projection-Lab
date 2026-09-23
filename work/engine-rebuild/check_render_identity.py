"""Read-only candidate renderer qualification on a retained isolated lifecycle root.

Usage: python -B check_render_identity.py FIXTURE_ROOT CANDIDATE_PIPELINE_FILE
Candidate code is explicit trusted repository source, executed only in this process.
"""
import ast,cProfile,hashlib,json,pstats,sys,time
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from engine.projection import cutoff_pipeline as p

def check(root,candidate):
    source=Path(candidate).read_bytes();root=Path(root)
    node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='prepare')
    namespace=dict(p.__dict__);exec(compile(ast.Module(body=[node],type_ignores=[]),'candidate-prepare','exec'),namespace)
    paths=sorted((root/'outputs/projection-v3/locks').glob('*.json'))
    if not paths:raise ValueError('Retained locks required')
    cards=[json.loads(f.read_bytes()) for f in paths];hashes=[hashlib.sha256(f.read_bytes()).hexdigest() for f in paths]
    prof=cProfile.Profile();started=time.monotonic()
    with patch.object(p,'prepare',namespace['prepare']):
        prof.enable();p.verify_forecast(root,cards[0]['cutoff_forecast_ref']);prof.disable();single=time.monotonic()-started
        cache={};started=time.monotonic()
        for card in cards:p.verify_forecast(root,card['cutoff_forecast_ref'],cache=cache)
        elapsed=time.monotonic()-started
    if hashes!=[hashlib.sha256(f.read_bytes()).hexdigest() for f in paths]:raise ValueError('Lock changed')
    identity=[{'calls':v[1],'cumulative_seconds':v[3]} for (file,line,name),v in pstats.Stats(prof).stats.items()
              if file.endswith('/cutoff_features.py') and name=='identity']
    return {'status':'PASS','candidate_source_sha256':hashlib.sha256(source).hexdigest(),'single_profiled_seconds':single,
            'identity_profile':identity,'full_slate_forecasts_verified':len(cards),'all_preparation_bytes_and_forecast_values_match_retained':True,
            'unprofiled_slate_verification_seconds':elapsed,'unique_preparation_fit_contexts':len(cache),
            'original_isolated_locks_unchanged':True,'scope':'Candidate prepare only in isolated verifier memory; no production source mutation, writes or fitting'}

if __name__=='__main__':print(json.dumps(check(sys.argv[1],sys.argv[2]),indent=2))
