"""Sync immutable human tickets and grade them from the board's pinned finals."""
import datetime as dt
import json
import os
from pathlib import Path
import urllib.request
from engine.pick_store import put, sha
from engine.live_picks import overwrite
from engine.live_scorecard import csv_write
from engine.pricing import decimal_odds

ROOT = Path(__file__).resolve().parents[1]


def leg_grade(leg, game):
    if game.get('status') != 'FINAL' or not game.get('final_score'):
        return None
    home, away = game['final_score']['home'], game['final_score']['away']
    if leg['market'] == 'spread':
        margin = home-away if leg['side'] == leg['home_abbr'] else away-home
        delta = margin+leg['settlement_line']
    else:
        delta = home+away-leg['settlement_line'] if leg['side'] == 'Over' else leg['settlement_line']-home-away
    return {'outcome': 'WIN' if delta > 0 else 'LOSS' if delta < 0 else 'PUSH',
            'final_score': game['final_score'], 'game_id': leg['game_id'],
            'result_source': next((v.get('grade_source') for v in game.get('verdicts', {}).values() if v.get('grade_source')), None)}


def ticket_grade(ticket, leg_grades):
    if any(g is None for g in leg_grades):
        return {'outcome': 'PENDING', 'profit_cents': None}
    results = [g['outcome'] for g in leg_grades]
    if ticket['type'] != 'single' and 'PUSH' in results:
        return {'outcome': 'SETTLEMENT_REVIEW', 'profit_cents': None,
                'reason': 'A leg pushed. Confirm the sportsbook ticket settlement; no push/repricing rule was assumed.'}
    outcome = 'LOSS' if 'LOSS' in results else 'PUSH' if 'PUSH' in results else 'WIN'
    profit = -ticket['stake_cents'] if outcome == 'LOSS' else 0 if outcome == 'PUSH' else round(ticket['stake_cents']*(decimal_odds(ticket['price'])-1))
    return {'outcome': outcome, 'profit_cents': profit}


def run(root=ROOT, sync=False):
    root=Path(root);out=root/'outputs/human-tickets-v1'
    if sync:
        key=os.environ.get('NOTE_SYNC_KEY');private=root/'.cloud-private/note-access.json'
        if not key and private.exists():key=json.loads(private.read_text()).get('NOTE_SYNC_KEY')
        if not key:raise ValueError('Ticket sync credential unavailable')
        req=urllib.request.Request('https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/api/tickets/sync',headers={'Authorization':'Bearer '+key,'User-Agent':'Mozilla/5.0 NFL-Engine/1.0'})
        with urllib.request.urlopen(req,timeout=15) as r:tickets=json.load(r)['tickets']
        for ticket in tickets:
            identity=ticket['id']
            if not identity or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' for c in identity):raise ValueError('Invalid ticket identity')
            path=out/'tickets'/(identity+'.json')
            if path.exists():
                if json.loads(path.read_text())!=ticket:raise ValueError('Locked ticket changed')
            else:put(path,ticket)
    board=json.loads((root/'outputs/model-pick-v1/board.json').read_text());games={g['game_id']:g for g in board['games']};grades=[];tickets=[]
    for path in sorted((out/'tickets').glob('*.json')):
        t=json.loads(path.read_text());tickets.append(t);legs=[]
        for i,leg in enumerate(t['legs']):
            target=out/'leg-grades'/f'{t["id"]}-{i}.json'
            if target.exists():g=json.loads(target.read_text())
            else:
                g=leg_grade(leg,games.get(leg['game_id'],{}))
                if g:
                    g.update(board_hash=board['content_sha256'],ticket_sha256=sha(path.read_bytes()))
                    put(target,g)
            legs.append(g)
        target=out/'ticket-grades'/(t['id']+'.json')
        if target.exists():g=json.loads(target.read_text())
        else:
            g={**ticket_grade(t,legs),'ticket_id':t['id'],'source':'human_ticket','record_class':t['record_class'],'type':t['type'],'legs':legs}
            if g['outcome'] not in ('PENDING','SETTLEMENT_REVIEW'):put(target,g)
        grades.append(g)
    overwrite(out/'grades.json',{'schema':'human-ticket-grades-v1','grades':grades})
    rows=[]
    for cls in ('ALL','paper','executed'):
        for typ in ('ALL','single','parlay','teaser'):
            for week in ['ALL']+sorted({str(l['week']) for t in tickets for l in t['legs']}):
                pool=[t for t in tickets if (cls=='ALL' or t['record_class']==cls) and (typ=='ALL' or t['type']==typ) and (week=='ALL' or str(min(l['week'] for l in t['legs']))==week)]
                gs=[g for g in grades if any(t['id']==g['ticket_id'] for t in pool)]
                rows.append({'source':'human_ticket','record_class':cls,'type':typ,'week':week,'locked':len(pool),'wins':sum(g['outcome']=='WIN' for g in gs),'losses':sum(g['outcome']=='LOSS' for g in gs),'pushes':sum(g['outcome']=='PUSH' for g in gs),'pending':sum(g['outcome']=='PENDING' for g in gs),'review':sum(g['outcome']=='SETTLEMENT_REVIEW' for g in gs),'profit_cents':sum(g['profit_cents'] or 0 for g in gs)})
    csv_write(out/'scorecard.csv',rows,list(rows[0]))
    return {'tickets':len(tickets),'graded':sum(g['outcome'] in ('WIN','LOSS','PUSH') for g in grades),'credits_spent':0}


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--sync',action='store_true');a=p.parse_args()
    print(json.dumps(run(sync=a.sync)))
