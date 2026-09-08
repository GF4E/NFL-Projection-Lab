"""538 MIT base Elo port with explicit pregame QB-value adjustment.

Base implementation: fivethirtyeight/nfl-elo-game, pinned in HARVEST.md.
See licenses/538-nfl-elo-game-LICENSE. This is not the unpublished full QB
estimator: callers must supply pregame QB and team VALUE ratings or adjustments.
No network, label lookup, evaluation-population selection, or ledger access.
"""
import math
HFA=65.0
K=20.0
REVERT=1/3
REVERSIONS={'CBD1925':1502.032,'RAC1926':1403.384,'LOU1926':1307.201,'CIB1927':1362.919,'MNN1929':1306.702,'BFF1929':1331.943,'LAR1944':1373.977,'PHI1944':1497.988,'ARI1945':1353.939,'PIT1945':1353.939,'CLE1999':1300.0}

def qb_adjustment(starter_value, team_value):
    if starter_value is None or team_value is None: raise ValueError('Missing pregame QB VALUE')
    if not all(math.isfinite(x) for x in (starter_value,team_value)): raise ValueError('Invalid QB VALUE')
    return 3.3*(starter_value-team_value)

class Elo:
    def __init__(self, initial):
        self.teams={k:{'elo':float(v),'season':None} for k,v in initial.items()}
    def prepare(self, team, season):
        t=self.teams.setdefault(team,{'elo':1505.,'season':None})
        if t['season'] is not None and season<t['season']: raise ValueError('Chronology reversal')
        if t['season'] is not None and season!=t['season']:
            t['elo']=REVERSIONS.get(team+str(season),1505.*REVERT+t['elo']*(1-REVERT))
        t['season']=season
    def forecast(self, home, away, neutral=False, home_qb=None, away_qb=None):
        if home_qb is None or away_qb is None: raise ValueError('Missing pregame QB adjustment; not zero-filled')
        if not all(math.isfinite(v) for v in (home_qb,away_qb)): raise ValueError('Invalid QB adjustment')
        difference=self.teams[home]['elo']-self.teams[away]['elo']+(0 if neutral else HFA)+home_qb-away_qb
        return {'elo_difference':difference,'home_win_probability':1/(10**(-difference/400)+1), 'margin_location':difference/25}
    def update(self, home, away, home_score, away_score, prediction):
        result=1. if home_score>away_score else 0. if home_score<away_score else .5
        diff=prediction['elo_difference'];pd=abs(home_score-away_score)
        denominator=1. if result==.5 else (diff if result==1 else -diff)*.001+2.2
        mult=math.log(max(pd,1)+1)*(2.2/denominator)
        shift=K*mult*(result-prediction['home_win_probability'])
        self.teams[home]['elo']+=shift;self.teams[away]['elo']-=shift
