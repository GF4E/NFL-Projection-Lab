"""Week 1 counterfactuals from immutable issued contribution inputs; never live."""
import datetime as dt
import json,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import numpy as np
from scripts.e1_evaluate import OUT,load_inputs,paired_games,save,summary,NAMES
from engine.forecast_system.state_fit import fit as state_fit,replay
from engine.forecast_system.state_space import preseason,predict,observation,stationary
from engine.projection_v3.model import fit as ridge_fit,predict as ridge_predict
from engine.projection.features import DIV
from engine.forecast_system.verification import verify


def issued_graded_cards(board):
    return [c for c in board['games'] if c.get('evidence')=='AS_ISSUED' and (c.get('grades') or {}).get('PROJECTION')]


def run():
    start=time.monotonic();registration,data=load_inputs();base=data['linear'];games=paired_games(base)
    teams=sorted(DIV);staff=json.loads((ROOT/'config/staff_history.json').read_text())
    changes={y:[next(r['preseason_variance_doubled'] for r in staff['records'] if r['season']==y and r['team']==t) for t in teams] for y in range(2013,2027)}
    historical=[r for r in base if r['features']['baseline'] is not None and r['actual_points'] is not None]
    league=sum(r['actual_points'] for r in historical)/sum(r['actual_drives'] for r in historical)
    # Reconstruct the exact state-feature history with cached parameters: no search.
    state_rows=[dict(r,features=dict(r['features'])) for r in base if r['season']==2012]
    for year in range(2013,2026):
        f=json.loads((OUT/f'state-fit-{year}.json').read_text())
        _,rr,_,_=replay([g for g in games if g['season']<=year],(f['q'],f['r'],f['retention']),f['rho'],f['league_ppd'],changes)
        by={r['game_id']:r for r in rr if r['season']==year}
        for row in base:
            if row['season']==year and row['game_id'] in by:
                r=dict(row,features=dict(row['features']));r['features']['baseline']=by[row['game_id']]['points'][0 if row['home'] else 1];state_rows.append(r)
    print('E1 2026 training-only state fit',flush=True)
    cached=OUT/'state-fit-2026.json'
    f=json.loads(cached.read_text()) if cached.exists() else state_fit(games,league,changes)
    if cached.exists():
        assert f['trained_through_season']==2025 and f['league_ppd']==league
    if not f['starts'][f['selected_start']]['success']:raise ValueError('2026 training fit did not converge')
    f.update(season=2026,trained_through_season=2025,league_ppd=league)
    save('state-fit-2026.json',f)
    _,_,(x,p),_=replay(games,(f['q'],f['r'],f['retention']),f['rho'],league,changes)
    p0,_=stationary(f['q'],f['r'],f['rho']);x,p=preseason(x,p,p0,f['retention'],changes[2026]);x,p=predict(x,p,f['q'])
    populations={**data,'state_space':state_rows};fits={}
    for name in NAMES:
        fits[name]=ridge_fit([r for r in populations[name] if r['features']['baseline'] is not None and r['actual_points'] is not None],['calibration','elo'],10)
        save(f'core-{name}-2026.json',fits[name])
    oof=json.loads((OUT/'oof.json').read_text());board=json.loads((OUT/'as-issued-board-snapshot.json').read_text())
    cards=issued_graded_cards(board)
    if any(c['week']!=1 for c in cards):raise ValueError('This registration covers Week 1 counterfactuals only')
    outputs=[];missing=[]
    for card in sorted(cards,key=lambda c:c['game_id']):
        features={side:{t['input']:t.get('value') for t in card['contributions'][side]} for side in ('home','away')}
        if any(features[side].get(key) is None for side in features for key in ('baseline','drives','opponent_drives','elo','elo_difference')):
            missing.append(card['game_id']);continue
        h,a=[{'WAS':'WSH','LA':'LAR','LV':'OAK'}.get(card[side],card[side]) for side in ('home','away')]
        d=(features['home']['drives']+features['away']['drives'])/2
        state_baseline=(league+observation(teams.index(h),teams.index(a))@x)*d
        actual=card['grades']['PROJECTION']['actual'];candidates={}
        for name in NAMES:
            predictions={}
            for index,side in enumerate(('home','away')):
                feature=dict(features[side])
                if name=='state_space':feature['baseline']=float(state_baseline[index])
                # n=0 at Week 1: both shrinkage baselines equal the issued prior-season strength.
                predictions[side+'_points']=ridge_predict(fits[name],feature)['points']
            predictions['margin']=predictions['home_points']-predictions['away_points'];predictions['total']=predictions['home_points']+predictions['away_points']
            candidates[name]=predictions
        outputs.append(dict(game_id=card['game_id'],issued_version=card['version'],issued=card['projection'],actual=actual,counterfactual=candidates,
                            input_provenance='Frozen as-issued contribution values; no current-season result enters fitting'))
    def metrics(rows,key):
        result={}
        for target,fields in [('team',['home_points','away_points']),('margin',['margin']),('total',['total'])]:
            p=[(r['issued'] if key=='issued' else r['counterfactual'][key])[k] for r in rows for k in fields]
            a=[r['actual'][k] for r in rows for k in fields]
            result[target]=dict(mae=float(np.mean(np.abs(np.array(a)-p))),projected_sd=float(np.std(p)),actual_sd=float(np.std(a))) if p else None
        return result
    save('current-season.json',dict(population='AS_ISSUED baseline games; challenger forecasts are retrospective counterfactuals, not originally issued',
          registration_sha256=registration['sha256'],games=outputs,missing_input_games=missing,summary={name:metrics(outputs,name) for name in ('issued',*NAMES)},
          runtime_seconds=time.monotonic()-start,trained_through_season=2025,current_season_outcomes_used_for_fit=False))
    print('Current-season comparison cached',len(outputs),'games',flush=True)

if __name__=='__main__':run()
