"""Versioned HFA adapter; the archived Elo implementation remains byte-identical."""
import math
from engine.elo import Elo
class SeasonElo(Elo):
 def __init__(self,initial,hfa):
  super().__init__(initial);self.hfa=float(hfa)
 def forecast(self,home,away,neutral=False,home_qb=None,away_qb=None):
  if home_qb is None or away_qb is None:raise ValueError('Missing pregame QB adjustment; not zero-filled')
  if not all(math.isfinite(v) for v in (home_qb,away_qb,self.hfa)):raise ValueError('Invalid Elo adjustment')
  difference=self.teams[home]['elo']-self.teams[away]['elo']+(0 if neutral else self.hfa)+home_qb-away_qb
  return {'elo_difference':difference,'home_win_probability':1/(10**(-difference/400)+1),'margin_location':difference/25}
