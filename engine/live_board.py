"""Merge current live selections and locked human leans into the read-only grid."""
import json
from pathlib import Path
from engine.pricing import decimal_odds
from engine.board_summary import summary


def enrich_live(board, records, root):
    root=Path(root);out=root/'outputs/model-pick-v1'
    current={p.stem:json.loads(p.read_text()) for p in (out/'live').glob('*.json')}
    locked={r['game']['game_id']:r for r in records}
    human=[json.loads(p.read_text()) for p in (out/'human-grades').glob('*.json')]
    from engine.board_bridge import verdict
    for g in board['games']:
        r=locked.get(g['game_id']) or current.get(g['game_id'])
        if not r:continue
        g['analysis']=r.get('analysis',{'sentences':['No measured analysis was saved for this capture.']})
        g['our_note']=r.get('our_note')
        g['note_deadline']=r['game']['cutoff_at']
        g['captured_at']=r.get('captured_at',r.get('capture',{}).get('received_at'))
        if r['status']=='LIVE' and g['status']!='FINAL':
            g.update(lock_status='LIVE',status='UPCOMING',freeze_time=None)
            g['verdicts']={m:{**verdict(r,m),'availability':'LIVE'} for m in ('spreads','totals')}
            g['consensus']={m:{'line':(-1 if m=='spreads' else 1)*v['full']['center'],'coverage':v['full']['coverage']} for m,v in r['consensus'].items()}
            g['best_captured']={m:r['analysis']['measured'][m]['best_same_line'] for m in ('spreads','totals')}
        pairs=[]
        for o in r.get('offers',[]):
            same=[p for p in r['offers'] if p['book']==o['book'] and p['market']==o['market']]
            side=r['game']['home_abbr'] if o['side']==g['home_team'] else r['game']['away_abbr'] if o['side']==g['away_team'] else o['side']
            if side=='LA':side='LAR'
            pairs.append({'market':'spread' if o['market']=='spreads' else 'total','side':side,'point':o['line'],'americanPrice':o['price'],'book':o['book'],'capturedAt':g['captured_at'],'marketVigPercent':(sum(1/decimal_odds(p['price']) for p in same)-1)*100})
        g['quote_pairs']=pairs
        hg=next((p for p in human if p['game_id']==g['game_id']),None)
        if hg:g['human_lean_grade']=hg['outcome']
    for week,value in board.get('week_records',{}).items():value['human_lean']=summary([g for g in human if int(g['week'])==int(week)])
    return board
