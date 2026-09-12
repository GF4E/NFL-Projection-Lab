"""Descriptive Week 1 projections; never selects ATS sides or changes gates."""
import datetime as dt
import hashlib
import math
from engine.market_distribution import MarketDistribution
from engine.pricing import timestamp

VERSION = 'week1-display-projection-v1'
MAX_QUOTE_AGE_SECONDS = 3600  # Existing quote qualification horizon, not a new betting gate.


def unavailable(reason):
    return {'version': VERSION, 'status': 'UNAVAILABLE', 'reason': reason}


def project(record, shape, generated_at=None):
    now = generated_at or dt.datetime.now(dt.timezone.utc).isoformat()
    game = record['game']
    if game['week'] != 1 or record['status'] != 'LIVE':
        return unavailable('No new projection for historical locks, MISSED games, or Week 2.')
    if timestamp(now) >= timestamp(game['cutoff_at']):
        return unavailable('Projection was not recorded before the lock.')
    try:
        margin = record['consensus']['spreads']['full']['center']
        total = record['consensus']['totals']['full']['center']
        if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in (margin, total)):
            return unavailable('Complete finite consensus spread and total required.')
        model = MarketDistribution(shape, -margin, total)
        expected_margin = sum(k*p for k,p in model.margin.pmf.items())
        expected_total = sum(k*p for k,p in model.total.pmf.items())
        home_score = (expected_total+expected_margin)/2
        away_score = (expected_total-expected_margin)/2
        if min(home_score, away_score) < 0:
            return unavailable('Distribution implies an invalid negative team score.')
        home, away = model.moneyline(True)['win'], model.moneyline(False)['win']
        tie = model.moneyline(True)['push']
        coin = home == away
        home_wins = (int(hashlib.sha256((game['game_id']+'|'+VERSION).encode()).hexdigest(),16)%2 == 0) if coin else home > away
        return {'version': VERSION, 'status': 'AVAILABLE', 'generated_at': now,
                'quote_captured_at': record['captured_at'], 'distribution_hash': record['distribution_hash'],
                'basis': 'Full market consensus; empirical residual distribution; not an independent football forecast',
                'winner': game['home_team'] if home_wins else game['away_team'],
                'win_probability': home if home_wins else away, 'home_win_probability': home,
                'away_win_probability': away, 'tie_probability': tie, 'coin_flip': coin,
                'expected_margin': expected_margin, 'expected_total': expected_total,
                'home_score': home_score, 'away_score': away_score, 'score_label': 'market-based score estimate'}
    except (KeyError, TypeError, ValueError):
        return unavailable('Required consensus or distribution input unavailable.')


def winner_grade(projection, game, final):
    if not projection or projection.get('status') != 'AVAILABLE': return 'not recorded'
    if not final: return None
    if final['home'] == final['away']: return 'PUSH'
    actual = game['home_team'] if final['home'] > final['away'] else game['away_team']
    return 'WIN' if projection['winner'] == actual else 'LOSS'


def display(record, game, now):
    projection = record.get('projection') or unavailable('Winner and score projection not recorded before lock.')
    final = game.get('final_score')
    frozen = record['status'] == 'LOCKED'
    quote_at = record.get('captured_at') or record.get('capture',{}).get('received_at')
    stale = not final and (not quote_at or (now-timestamp(quote_at)).total_seconds()>MAX_QUOTE_AGE_SECONDS)
    selections = {}
    from engine.pick_rationale import rationale
    for market in ('spreads','totals'):
        pick = next((p for p in record.get('picks',[]) if p['market']==market), None)
        if not pick:
            selections[market] = {'status':'UNAVAILABLE','reason':'No lock: capture late' if record['status']=='MISSED' else 'No qualified inputs'}
            continue
        passed = bool(pick.get('filtered_subset')) and .60<=pick['fair_probability']<=.70 and pick.get('price_edge_cents',-1)>=10
        selections[market] = {k:pick.get(k) for k in ('side','line','book','price','win','push','fair_probability','EV','edge_source','seed')}
        selections[market].update(status='AVAILABLE', betting_status='FINAL' if final else 'STALE — LEAN ONLY' if stale else 'PLAY' if passed else 'LEAN ONLY — filter not met',
            filter_pass=passed, negative_EV=pick['EV']<0, grade=game['verdicts'][market].get('grade'),
            explanation='Coin flip: deterministic equal-EV tiebreak.' if pick.get('seed') else 'Market pricing selected this side; no independent football signal.' if pick['edge_source']=='price' else 'Highest estimated return without a positive price/line edge; not necessarily a random tie.')
        selections[market]['rationale'] = rationale(pick, record, stale)
    return {'projection':projection,'selections':selections,'stale':stale,'quote_at':quote_at,
            'winner_grade':winner_grade(projection,game,final) if frozen else 'not recorded' if final else None,
            'frozen':frozen,'explanation':[
                'The projected winner is the more likely outright winner. The spread pick can favor the opponent because the handicap changes the settlement threshold.',
                'The score estimate uses distribution means; the winner uses win probability. An asymmetric distribution can make their orderings differ.',
                'This engine translates market information into probabilities; it has not demonstrated an independent predictive edge.',
                'Fair chance excludes pushes; win chance includes their possibility. EV includes pushes at zero profit. Negative EV is not a betting recommendation.',
                'Prices more than one hour old are marked STALE and cannot display an actionable PLAY. Inactives remain unknown unless verified.']}
