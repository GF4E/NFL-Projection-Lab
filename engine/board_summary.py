"""Display-only summaries of frozen selections and first grades. No new picks."""
import json
from pathlib import Path
from engine.pick_store import sha


def summary(rows):
    clv = [r['clv_cents'] for r in rows if isinstance(r.get('clv_cents'), (int, float))]
    return {'wins': sum(r['outcome'] == 'W' for r in rows),
            'losses': sum(r['outcome'] == 'L' for r in rows),
            'pushes': sum(r['outcome'] in ('P', 'PUSH') for r in rows),
            'mean_clv_cents': sum(clv)/len(clv) if clv else None, 'clv_n': len(clv)}


def enrich(board, records, grades, root):
    records = {r['game']['game_id']: r for r in records}
    jaret = [json.loads(p.read_text()) for p in (Path(root)/'outputs/jaret/grades').glob('*.json')]
    weeks = {}
    for week in sorted({g['week'] for g in board['games']}):
        rows = [r for r in grades if r['week'] == week]
        weeks[str(week)] = {
            'model': summary([r for r in rows if r['kind'] == 'actual']),
            'price': summary([r for r in rows if r['kind'] == 'actual' and r['edge_source'] == 'price']),
            'paper': summary([r for r in rows if r['kind'].startswith('WIND-')]),
            'jaret': summary([r for r in jaret if int(r['week']) == week]),
        }
    board['week_records'] = weeks
    board['clv_reference'] = 'nflverse_close; reference CLV, not executed-book closing quotes'
    for game in board['games']:
        record = records.get(game['game_id'])
        game['executed_picks'] = [{k: g.get(k) for k in ('side','line_at_approval','book_price','executed_book','outcome','stake','stake_currency')} for g in jaret if g['game_id'] == game['game_id']]
        if not record or record['status'] != 'LOCKED': continue
        game['consensus'] = {m: {'line': (-1 if m == 'spreads' else 1)*v['full']['center'],
                                'coverage': v['full']['coverage']} for m,v in record.get('consensus',{}).items()}
        source = record.get('capture',{}).get('source')
        best = {}
        if source:
            path = Path(source['path'])
            if not path.exists():
                candidates = list((Path(root)/'outputs/model-pick-v1/captures').rglob(source['sha256']+'.json'))
                if len(candidates) == 1: path = candidates[0]
            raw = path.read_bytes()
            if sha(raw) != source['sha256']: raise ValueError('Capture hash mismatch')
            events = json.loads(raw)
            for event in events:
                if event['home_team'] != game['home_team'] or event['away_team'] != game['away_team']: continue
                for pick in record['picks']:
                    offers = []
                    for book in event.get('bookmakers',[]):
                        if book['key'] not in ('betmgm','williamhill_us','fanduel','draftkings'): continue
                        if book['key'] not in record['consensus'][pick['market']]['devigged_books']: continue
                        for market in book.get('markets',[]):
                            if market['key'] != pick['market']: continue
                            for outcome in market['outcomes']:
                                if outcome['name'] == pick['side'] and outcome.get('point') == pick['line']:
                                    offers.append({'book':book['key'],'price':outcome['price'],'side':pick['side'],'line':pick['line']})
                    if offers: best[pick['market']] = max(offers,key=lambda o:o['price'])
        game['best_captured'] = best
        for pick in record['picks']:
            game['verdicts'][pick['market']]['analytics'] = {k:pick.get(k) for k in ('win','loss','push','loo_center','price_edge_cents','quote_updated_at')}
    return board
