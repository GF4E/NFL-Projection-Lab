"""Pure T75 lock decisions. Receives quote-only DTOs, never results or close feeds.

All file access belongs to the separate runner/store. Shadow inputs cannot enter
select(); their counterfactual choices are evaluated separately after selection.
"""
import datetime as dt
import hashlib
import math
import random
import statistics
from engine.market_distribution import MarketDistribution, integer
from engine.pricing import decimal_odds, power_devig, price_edge, timestamp

BOOKS = ('betmgm', 'draftkings', 'fanduel', 'williamhill_us')
MARKETS = ('spreads', 'totals')


def devigged_center(shape, market, line, probability):
    # Integer location inverse: closest conditional probability at posted line.
    # This retains the frozen integer PMF, including push mass. Ties choose the
    # midpoint of minimizing integer locations, before the existing rounding.
    center = -line if market == 'spreads' else line
    target = shape['targets']['margin' if market == 'spreads' else 'total']
    threshold = -line if market == 'spreads' else line
    lower = math.floor(threshold-max(map(int, target['counts'])))-1
    upper = math.ceil(threshold-min(map(int, target['counts'])))+1
    candidates = []
    for location in range(lower, upper+1):
        if market == 'totals' and location < 0:
            continue
        model = MarketDistribution(shape, -location if market == 'spreads' else 0,
                                   location if market == 'totals' else 45)
        p = (model.spread(line) if market == 'spreads' else model.totals(line))['conditional_win']
        if p is not None:
            candidates.append((abs(p-probability), abs(location-center), location))
    error = min(x[0] for x in candidates)
    closest = [x for x in candidates if x[0] == error]
    distance = min(x[1] for x in closest)
    return statistics.mean(x[2] for x in closest if x[1] == distance)


def quotes(event, receipt, shape):
    """Reject incomplete pairs and missing/stale/future per-market timestamps."""
    output = {}
    for book in event.get('bookmakers', []):
        key = book['key']
        if key not in (*BOOKS, 'pinnacle'):
            continue
        for market in book.get('markets', []):
            kind = market['key']
            if kind not in MARKETS:
                continue
            try:
                updated = market.get('last_update', book.get('last_update'))
                if not isinstance(updated, str):
                    continue
                age = (timestamp(receipt['received_at'])-timestamp(updated)).total_seconds()
                if not 0 <= age <= 3600:
                    continue
                names = [event['home_team'], event['away_team']] if kind == 'spreads' else ['Over', 'Under']
                outcomes = market['outcomes']
                if len(outcomes) != 2 or {o['name'] for o in outcomes} != set(names):
                    continue
                ordered = [next(o for o in outcomes if o['name'] == n) for n in names]
                lines = [float(o['point']) for o in ordered]
                if not all(math.isfinite(x) for x in lines):
                    continue
                if (lines[0] != -lines[1] if kind == 'spreads' else lines[0] != lines[1]):
                    continue
                probs, power = power_devig([o['price'] for o in ordered])
                value = {'book': key, 'market': kind, 'line': lines[0],
                         'center': devigged_center(shape, kind, lines[0], probs[0]),
                         'power': power, 'probabilities': probs, 'updated_at': updated,
                         'outcomes': [{'side': n, 'line': line, 'price': float(o['price'])}
                                      for n, line, o in zip(names, lines, ordered)]}
                identity = (key, kind)
                if identity in output:
                    raise ValueError('Duplicate mainline')
                output[identity] = value
            except (ValueError, KeyError, TypeError):
                # A malformed pair cannot supply executable or reference quotes.
                output.pop((key, kind), None)
    return output


def consensus(books, excluded=None):
    others = {b: v for b, v in books.items() if b in BOOKS and b != excluded}
    median = statistics.median(v['center'] for v in others.values()) if others else None
    sharp = books.get('pinnacle')
    anchor = sharp['center'] if sharp else None
    # Registered anchor: equal weight to sharp and independent retail median.
    center = (median+anchor)/2 if median is not None and anchor is not None else (median if median is not None else anchor)
    return {'center': center, 'retail_median': median, 'pinnacle_center': anchor,
            'contributors': sorted(others)+(['pinnacle'] if sharp else []),
            'excluded_book': excluded, 'coverage': len(others),
            'method': 'power_inverse_integer_PMF; 50% retail median + 50% Pinnacle when both available'}


def probabilities(shape, target, center, offer, home):
    model = MarketDistribution(shape, -center if target == 'spreads' else 0,
                               center if target == 'totals' else 45)
    return model.spread(offer['line'], offer['side'] == home) if target == 'spreads' else model.totals(offer['line'], offer['side'] == 'Over')


def select(candidates, game_id, version, market):
    best = max(c['EV'] for c in candidates)
    ties = sorted([c for c in candidates if c['EV'] == best], key=lambda c: (c['side'], c['book'], c['line'], c['price']))
    seed = hashlib.sha256((game_id+'|'+version).encode()).hexdigest() if len(ties)>1 else None
    if seed:
        rng = random.Random(seed+'|'+market)
        # Equal side probability; multiple quotes for one side cannot bias it.
        side = rng.choice(sorted({c['side'] for c in ties}))
        chosen = rng.choice([c for c in ties if c['side'] == side])
    else:
        chosen = ties[0]
    return {**chosen, 'seed': seed, 'exact_tie_count': len(ties)}


def evaluate(shape, game, book_quotes, centers, version):
    choices = {}
    for market in MARKETS:
        candidates = []
        for book in BOOKS:
            q = book_quotes.get((book, market))
            c = centers[market]['leave_one_out'][book]
            if not q or c['center'] is None:
                continue
            for offer in q['outcomes']:
                probs = probabilities(shape, market, c['center'], offer, game['home_team'])
                p = probs['conditional_win']
                if p is None or not 0 < p < 1:
                    continue
                ev = probs['win']*(decimal_odds(offer['price'])-1)-probs['loss']
                edge = price_edge(p, offer['price'])
                reference_line = -c['center'] if market == 'spreads' and offer['side'] == game['home_team'] else c['center']
                line_better = offer['line'] > reference_line if market == 'spreads' or offer['side'] == 'Under' else offer['line'] < reference_line
                candidates.append({**offer, **probs, 'market': market, 'book': book,
                    'fair_probability': p, 'fair_probability_basis': 'conditional_non_push', 'EV': ev,
                    'price_edge_cents': edge, 'edge_source': 'price' if line_better or edge > 0 else 'tiebreak',
                    'filtered_subset': .60 <= p <= .70 and edge >= 10,
                    'loo_center': c['center'], 'quote_updated_at': q['updated_at']})
        if candidates:
            choices[market] = select(candidates, game['game_id'], version, market)
    return choices


def lock(game, event, receipt, shape, config, freeze_at):
    """Exactly two decisions, or one explicit MISSED game. No shadow dependency."""
    record = {'game': game, 'version': config['version'], 'distribution_hash': config['distribution']['sha256'],
              'freeze_timestamp': freeze_at, 'cutoff': 'T75', 'status': 'MISSED', 'picks': []}
    cutoff = timestamp(game['cutoff_at'])
    if timestamp(freeze_at) > cutoff:
        return {**record, 'reason': 'LATE'}
    if not receipt or not event:
        return {**record, 'reason': 'NO_QUOTES'}
    if timestamp(receipt['received_at']) > cutoff:
        return {**record, 'reason': 'LATE'}
    if not timestamp(game['capture_at']) <= timestamp(receipt['request_at']) < timestamp(game['capture_at'])+dt.timedelta(seconds=60):
        return {**record, 'reason': 'OUTSIDE_T80'}
    if timestamp(receipt['received_at']) > timestamp(freeze_at):
        return {**record, 'reason': 'LATE'}
    if event['home_team'] != game['home_team'] or event['away_team'] != game['away_team'] or timestamp(event['commence_time']) != timestamp(game['kickoff_at']):
        return {**record, 'reason': 'EVENT_MISMATCH'}
    book_quotes = quotes(event, receipt, shape)
    centers = {}
    for market in MARKETS:
        books = {b: q for (b, m), q in book_quotes.items() if m == market}
        centers[market] = {'full': consensus(books), 'leave_one_out': {b: consensus(books, b) for b in BOOKS},
                           'devigged_books': {b: {k: v for k, v in q.items() if k != 'outcomes'} for b,q in books.items()}}
    decisions = evaluate(shape, game, book_quotes, centers, config['version'])
    if len(decisions) != 2:
        return {**record, 'reason': 'NO_QUOTES', 'detail': 'Two complete markets with independent consensus required', 'consensus': centers}
    return {**record, 'status': 'LOCKED', 'picks': [decisions[m] for m in MARKETS],
            'consensus': centers, 'capture': receipt, 'record_class': 'paper_model_pick'}
