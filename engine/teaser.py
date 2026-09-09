"""Six-point empirical teaser pricing; cross-game independence is explicit."""
import math
from engine.market_distribution import wong

def leg(model,line,home=True):
 p=model.teaser(line,home=home)
 return dict(line=float(line),teased_line=float(line)+6,home=home,wong=wong(line),**p)

def ticket(legs,american_odds):
 if len(legs) not in (2,3):raise ValueError('Two or three legs required')
 if len({r['game_id'] for r in legs})!=len(legs):raise ValueError('Same-game teaser requires joint distribution')
 if not math.isfinite(american_odds) or abs(american_odds)<100:raise ValueError('Invalid American price')
 for r in legs:
  if any(not math.isfinite(r[k]) or r[k]<0 for k in ('win','push','loss')) or abs(sum(r[k] for k in ('win','push','loss'))-1)>1e-9:raise ValueError('Invalid leg mass')
 win=math.prod(r['win'] for r in legs);void=math.prod(r['win']+r['push'] for r in legs)-win;loss=1-win-void
 profit=american_odds/100 if american_odds>0 else 100/-american_odds
 fair=win/(win+loss) if win+loss else None
 price=None if fair is None or fair in (0,1) else (-100*fair/(1-fair) if fair>=.5 else 100*(1-fair)/fair)
 return dict(win=win,void=void,loss=loss,fair_probability=fair,fair_american=price,book_american=american_odds,price_edge_cents=american_odds-price if price is not None else None,expected_profit_per_unit=win*profit-loss,break_even=1/(1+profit),assumption='Independent distinct games; any loss loses; otherwise any push voids full ticket')
