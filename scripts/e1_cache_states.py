"""Cache posterior states from already-fitted E1 parameters; never optimizes."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import numpy as np
from scripts.e1_evaluate import OUT,load_inputs,paired_games,save
from engine.forecast_system.state_fit import replay
from engine.forecast_system.state_space import stationary,preseason,predict
from engine.projection.features import DIV


def run():
    reg,data=load_inputs();games=paired_games(data['linear']);teams=sorted(DIV)
    staff=json.loads((ROOT/'config/staff_history.json').read_text())
    changes={y:[next(r['preseason_variance_doubled'] for r in staff['records'] if r['season']==y and r['team']==t) for t in teams] for y in range(2013,2027)}
    receipt=[]
    for year in range(2013,2027):
        path=OUT/f'state-fit-{year}.json'
        if not path.exists():continue
        f=json.loads(path.read_text());horizon=min(year,2025)
        _,_,(x,p),_=replay([g for g in games if g['season']<=horizon],(f['q'],f['r'],f['retention']),f['rho'],f['league_ppd'],changes)
        label='POST_SEASON_GRADES'
        if year==2026:
            p0,_=stationary(f['q'],f['r'],f['rho']);x,p=preseason(x,p,p0,f['retention'],changes[2026]);x,p=predict(x,p,f['q']);label='PRE_WEEK_1'
        error=float(np.max(np.abs(p@np.ones(64))));minimum=float(np.linalg.eigvalsh(p).min())
        if abs(float(x.sum()))>1e-10 or error>1e-10 or minimum< -1e-10:raise ValueError('Cached constrained state violates invariants')
        name=f'state-cache-{year}.json'
        save(name,dict(season=year,state=label,team_order=teams,mean=x.tolist(),covariance=p.tolist(),
            fit_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),registration_sha256=reg['sha256'],unknown_transition_policy='Unknown coach half false independently; known QB1 change retained',
            mean_sum=float(x.sum()),null_variance_error=error,minimum_covariance_eigenvalue=minimum,activates_method=False))
        receipt.append(dict(path=name,sha256=hashlib.sha256((OUT/name).read_bytes()).hexdigest()))
    save('state-cache-ref.json',receipt)
    print('Cached posterior states',len(receipt),flush=True)

if __name__=='__main__':run()
