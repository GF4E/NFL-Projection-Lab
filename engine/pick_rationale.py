"""Explain saved choices from their captured evidence, without changing selection."""
from engine.pricing import decimal_odds

BOOKS = {'betmgm': 'BetMGM', 'williamhill_us': 'Caesars',
         'fanduel': 'FanDuel', 'draftkings': 'DraftKings'}


def rationale(pick, record, stale=False):
    market, side, line = pick['market'], pick['side'], pick['line']
    game = record['game']
    label = game.get('home_abbr', side) if side == game['home_team'] else game.get('away_abbr', side) if side == game['away_team'] else side
    selection = f"{label} {line:+g}" if market == 'spreads' else f"{side} {line:g}"
    price = pick['price']
    title = f"{selection} at {BOOKS.get(pick['book'], pick['book'])} {price:+g}"
    reasons = []
    center = pick.get('loo_center')
    if center is not None:
        reference = -center if market == 'spreads' and side == game['home_team'] else center
        advantage = reference-line if market == 'totals' and side == 'Over' else line-reference
        reference_text = f"{reference:+g}" if market == 'spreads' else f"{reference:g}"
        reasons.append(f"The other-book reference for this side is {reference_text}. " +
                       (f"Our line gives us {advantage:g} extra {'point' if advantage == 1 else 'points'} of cushion." if advantage > 0 else
                        f"Our line gives up {-advantage:g} {'point' if advantage == -1 else 'points'} versus that reference." if advantage < 0 else
                        "Our line matches it; there is no extra cushion from the line."))
    if market == 'spreads':
        if line > 0:
            reasons.append(f"{label} can lose by fewer than {line:g} points and still cover" +
                           (f"; losing by exactly {line:g} is a push." if float(line).is_integer() else "."))
        elif line < 0:
            reasons.append(f"{label} must win by more than {-line:g} points to cover" +
                           (f"; a {-line:g}-point win is a push." if float(line).is_integer() else "."))
        else:
            reasons.append(f"{label} must win outright; a tied game pushes this spread.")
    else:
        reasons.append(f"We need the combined score {'above' if side == 'Over' else 'below'} {line:g}" +
                       (f"; exactly {line:g} is a push." if float(line).is_integer() else "."))
    if market == 'spreads':
        for key in (3, 7):
            if abs(abs(line)-key) <= .5:
                result = 'wins' if abs(line) > key and line > 0 or abs(line) < key and line < 0 else 'pushes' if abs(line) == key else 'loses'
                reasons.append(f"At the key margin of {key}, this bet {result} if {label} {'loses' if line > 0 else 'wins'} by {key}.")
    if pick.get('seed'):
        reasons.append("Several offers tied for the highest estimated return. A deterministic tiebreak chose this offer; the tie does not add conviction.")
    else:
        reasons.append("This offer had the highest estimated return among the captured offers for this market.")
    fair = pick['fair_probability']; breakeven = 1/decimal_odds(price)
    gap = (fair-breakeven)*100
    reasons.append(f"Excluding pushes, our estimated chance is {fair:.1%}; this price needs {breakeven:.1%} to break even. " +
                   (f"That is {gap:.1f} percentage points above break-even." if gap > 0 else
                    f"That is {-gap:.1f} percentage points below break-even." if gap < 0 else
                    "That leaves no probability advantage at this price."))
    ev = pick['EV']
    assessment = (f"The price does not justify confidence: estimated return is {ev:.1%} per unit staked. This is only a directional lean."
                  if ev < 0 else f"The captured price supports this lean with an estimated return of {ev:+.1%} per unit staked; this is an estimate, not a verified edge.")
    if not pick.get('filtered_subset'):
        assessment += " It does not meet the betting filter."
    if stale:
        assessment += " The quote is stale, so this is a dated lean pending the next scheduled capture."
    return {'title': title, 'reasons': reasons, 'assessment': assessment}
