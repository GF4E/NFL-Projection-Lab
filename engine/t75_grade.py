"""Pure final/close scoring. No capture imports or access to T80 sources.

The input pick DTO contains locked line/price and hash-pinned distribution only;
consensus tables, raw quotes and T80 paths are excluded by the scoring adapter.
"""
from engine.market_distribution import MarketDistribution
from engine.pricing import american, cents, decimal_odds


def grade(pick, result, shape):
    if not result or not result.get('final') or result.get('spread_line') is None or result.get('total_line') is None:
        return {'status': 'PENDING'}
    home = result['home_score']; away = result['away_score']
    if pick['market'] == 'spreads':
        actual = home-away if pick['side'] == pick['home_team'] else away-home
        value = actual+pick['line']
    else:
        value = home+away-pick['line']
        if pick['side'] == 'Under':
            value = -value
    outcome = 'W' if value > 0 else 'L' if value < 0 else 'P'
    units = decimal_odds(pick['price'])-1 if outcome == 'W' else -1. if outcome == 'L' else 0.
    # nflverse spread_line is positive home-favored; forecast uses home handicap.
    closing = MarketDistribution(shape, -result['spread_line'], result['total_line'])
    p = (closing.spread(pick['line'], pick['side'] == pick['home_team']) if pick['market'] == 'spreads'
         else closing.totals(pick['line'], pick['side'] == 'Over'))['conditional_win']
    clv_p = p-pick['fair_probability'] if p is not None else None
    clv_c = cents(american(pick['fair_probability']))-cents(american(p)) if p is not None and 0<p<1 else None
    return {'status': 'SCORED', 'outcome': outcome, 'units': units, 'clv_reference': 'nflverse_close',
            'clv_probability': clv_p, 'clv_cents': clv_c, 'closing_fair_probability': p,
            'closing_spread': result['spread_line'], 'closing_total': result['total_line'],
            'result_source': result['source_sha256'], 'overtime_included': True}
