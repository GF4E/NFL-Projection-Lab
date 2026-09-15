"""Explicit offline fit for the requested BAL–IND counterfactual, never publication."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine.forecast_system.postprocess import fit,distribution
from engine.projection_v3.model import predict


def run():
    p=ROOT/'work/projection-v2/phase-a'
    oof=json.loads((p/'core-oof.json').read_text())
    a=fit(2026,lambda y:[r for r in oof if r['season']==y])
    (p/'emos-2026-diagnostic.json').write_text(json.dumps(a,sort_keys=True,indent=2))
    raw=(p/'BAL-IND-features.json').read_bytes()
    rows=json.loads(raw)
    model=json.loads((p/'core-future-fit.json').read_text())['fit']
    out=[]
    for r in rows:
        pred=predict(model,r['features']);x=pred['points']
        band='under_20' if x<20 else 'over_27' if x>27 else '20_to_27'
        terms=[]
        for t in pred['contributions']:
            label=r.get('metadata',{}).get(t['input'],{}).get('label',t['input'].replace('_',' '))
            terms.append(dict(input=t['input'],label=label,before=t['points'],after=a['b']*t['points']))
        terms.append(dict(input='historical_scoring_adjustment',label='Historical scoring adjustment for comparable projected scores',before=0.,after=a['a']+a['band_offsets'][band]))
        result=float(np.median(distribution(a,x)))
        if not np.isclose(sum(t['after'] for t in terms),result):raise ValueError('Contributions do not reconcile')
        out.append(dict(team=r['team'],raw_core=x,postprocessed=result,terms=terms))
    if len(out)!=2:raise ValueError('Both teams required')
    (p/'BAL-IND.json').write_text(json.dumps(dict(state='COUNTERFACTUAL_DIAGNOSTIC_ONLY',source_sha256=hashlib.sha256(raw).hexdigest(),emos_sha256=a['sha256'],teams=out),indent=2))


if __name__=='__main__':run()
