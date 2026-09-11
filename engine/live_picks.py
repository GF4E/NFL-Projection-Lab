"""One mutable pick per game/market; only the T75 transition is logged.

Selection reuses the frozen model's pure quote, consensus and EV functions.
Analysis is a deterministic rendering of measured inputs, never generated advice.
"""
import copy
import datetime as dt
import json
import math
import os
import tempfile
from pathlib import Path
from engine.model_pick import BOOKS, MARKETS, quotes, consensus, evaluate, probabilities
from engine.market_distribution import MarketDistribution
from engine.pricing import timestamp, cents, decimal_odds
from engine.board_bridge import teaser_leg
from engine.harvest import canonical

NAMES = {'betmgm':'BetMGM','williamhill_us':'Caesars','fanduel':'FanDuel','draftkings':'DraftKings'}


def overwrite(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile('w',dir=path.parent,prefix='.pending-',delete=False) as f:
        json.dump(value,f,sort_keys=True,indent=2,allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno());name=f.name
    os.replace(name,path)


def recompute(game, event, receipt, shape, config, previous=None, weather=None, state=None, inactive=None):
    if previous and previous['status']=='LOCKED': raise ValueError('Locked pick cannot be overwritten')
    if not event or timestamp(event['commence_time'])!=timestamp(game['kickoff_at']) or event['home_team']!=game['home_team'] or event['away_team']!=game['away_team']: raise ValueError('Event mismatch')
    qs=quotes(event,receipt,shape);centers={}
    for market in MARKETS:
        books={b:q for (b,m),q in qs.items() if m==market}
        centers[market]={'full':consensus(books),'leave_one_out':{b:consensus(books,b) for b in BOOKS},'devigged_books':{b:{k:v for k,v in q.items() if k!='outcomes'} for b,q in books.items()}}
    choices=evaluate(shape,game,qs,centers,config['version'])
    if len(choices)!=2:raise ValueError('Both targets require complete independent quotes')
    record={'game':game,'version':config['version'],'lifecycle':'live-to-locked-v1','status':'LIVE','record_class':'paper_model_pick',
            'distribution_hash':config['distribution']['sha256'],'captured_at':receipt['received_at'],'capture_label':receipt['label'],
            'picks':[choices[m] for m in MARKETS],'consensus':centers,'capture':receipt,
            'offers':[{**o,'market':m,'book':b} for (b,m),q in qs.items() if b in BOOKS for o in q['outcomes']],
            'forecast':weather or {'status':'UNAVAILABLE'},'inactives':inactive or {'status':'INACTIVES_UNAVAILABLE'}}
    for offer in record['offers']:
        center=centers[offer['market']]['leave_one_out'][offer['book']]['center']
        offer['fair_probability']=probabilities(shape,offer['market'],center,offer,game['home_team'])['conditional_win'] if center is not None else None
    record['analysis']=analysis(record,previous,shape,state)
    record['paper_picks']=[]
    if record['analysis']['measured']['wind_rule'] and game['week']<=4 and centers['totals']['full']['coverage']>=2:
        center=centers['totals']['full']['center']
        under=[o for o in record['offers'] if o['market']=='totals' and o['side']=='Under' and o['line']==center]
        if under:
            chosen=max(under,key=lambda o:decimal_odds(o['price']))
            pr=probabilities(shape,'totals',center,chosen,game['home_team'])
            record['paper_picks']=[{**chosen,**pr,'fair_probability':pr['conditional_win'],'EV':pr['win']*(decimal_odds(chosen['price'])-1)-pr['loss'],'paper_rule':'WIND-UNDER-10-15-V1-T75','edge_source':'paper_rule','filtered_subset':False}]
    return record


def analysis(record, previous, shape, state):
    game=record['game'];lines=[];fields={};cs=record['consensus'];offers=record['offers']
    for market,label in [('spreads','Spread'),('totals','Total')]:
        center=cs[market]['full']['center'];line=-center if market=='spreads' else center
        old=(previous or {}).get('consensus',{}).get(market,{}).get('full',{}).get('center')
        movement=None if old is None else line-(-old if market=='spreads' else old)
        fields[market]={'consensus_line':line,'movement':movement}
        text=f'{label} consensus is {game["home_abbr"]+" " if market=="spreads" else ""}{line:+g}.'
        text+= ' This is the first capture; movement is not yet measured.' if movement is None else f' It moved {movement:+g} points since the previous capture.'
        lines.append(text)
        pick=next(p for p in record['picks'] if p['market']==market)
        same=[o for o in offers if o['market']==market and o['side']==pick['side'] and o['line']==pick['line']]
        same.sort(key=lambda o:decimal_odds(o['price']),reverse=True)
        best=same[0];edge=cents(best['price'])-cents(same[1]['price']) if len(same)>1 else None
        fields[market]['best_same_line']={**best,'advantage_cents':edge}
        lines.append(f'{NAMES[best["book"]]} has the best captured price for {best["side"]} {best["line"]:+g} at {best["price"]:+g}'+(f', {edge:g} cents better than the next book at the same line.' if edge is not None else '; no other book has a comparable price at that line.'))
    spread=fields['spreads']['consensus_line'];near=[k for k in (3,7) if abs(abs(spread)-k)<=.5]
    lines.append(f'The spread is on or within a half point of {" and ".join(map(str,near))}.' if near else 'The spread is not within a half point of 3 or 7.')
    fields['half_points']=[]
    for pick in [p for p in record['picks'] if p['market']=='spreads']:
        improved={**pick,'line':pick['line']+.5};pr=probabilities(shape,'spreads',pick['loo_center'],improved,game['home_team'])
        payout=1+(pick['EV']+pr['loss'])/pr['win'] if pr['win'] else None
        ceiling=100/(payout-1) if payout and 1<payout<2 else None
        fields['half_points'].append({'side':pick['side'],'from':pick['line'],'to':improved['line'],'same_EV_max_negative_price':ceiling,'buy_price_available':False})
        lines.append(f'Buying {pick["side"]} from {pick["line"]:+g} to {improved["line"]:+g} preserves the current modeled EV up to -{ceiling:.1f}; no captured buy-half price is available, so whether it is worth buying is unknown.' if ceiling else 'No comparable buy-half price is captured; the value of buying is unknown.')
    f=record['forecast'];band=f.get('status')=='FORECAST' and game['roof'] in ('open','outdoors') and 10<=f.get('wind_mph',-1)<15
    from scripts.model_pick_runner import forecast_qualified
    qualified=band and record['capture_label']=='T80' and forecast_qualified(f,game)
    fields['wind_rule']=qualified
    lines.append(f'Kickoff forecast wind is {f["wind_mph"]:.1f} mph. '+('WIND RULE applies at the lock if this forecast remains qualified.' if qualified else 'The wind is in the rule band, but a qualifying T80 forecast is still required.' if band else 'WIND RULE does not apply.') if f.get('status')=='FORECAST' else 'No qualified kickoff forecast is available; WIND RULE cannot apply.' if game['roof'] in ('open','outdoors') else 'The venue is indoors or its roof is unknown; WIND RULE does not apply.')
    elo=None
    if state and tuple(state.get('training_max_origin') or (0,0))<(game['season'],game['week']):
        teams=state['teams'];h=teams.get(canonical(game['home_abbr']));a=teams.get(canonical(game['away_abbr']))
        if h and a:elo=(h['elo']-a['elo']+(0 if game.get('neutral') else 65))/25
    fields['elo_disagreement']=None if elo is None else elo-cs['spreads']['full']['center']
    lines.append('Plain Elo disagrees with the market margin by '+f'{fields["elo_disagreement"]:+.2f} points; diagnostic only, with no QB adjustment.' if elo is not None else 'Elo disagreement is unavailable; diagnostic only.')
    candidates=[]
    for offer in offers:
        moved,keys=teaser_leg(offer)
        if len(keys)>=2:
            identity=(offer['market'],offer['side'],offer['line'])
            if any((x['market'],x['side'],x['line'])==identity for x in candidates):continue
            candidates.append({**offer,'teased_line':moved,'key_numbers_crossed':keys})
    fields['teaser_candidates']=candidates
    lines.append('Teaser candidates: '+ '; '.join(f'{o["side"]} {o["line"]:+g} to {o["teased_line"]:+g}, crossing '+', '.join(map(str,o['key_numbers_crossed'])) for o in candidates)+'. Ticket prices and a partner are not established.' if candidates else 'Neither side of the captured spreads or totals meets the six-point teaser crossing criteria.')
    known=[f'{team}: starting QB '+('inactive' if v['starting_qb_inactive']=='yes' else 'not on the verified inactive list') for team,v in record['inactives'].get('teams',{}).items() if v.get('starting_qb_inactive') in ('yes','no')]
    lines.append('QB status: '+('; '.join(known) if known else 'inactives unknown until T-90')+'.')
    return {'sentences':lines,'measured':fields,'captured_at':record['captured_at']}


def freeze(record, when, note=None):
    cutoff=timestamp(record['game']['cutoff_at']);now=timestamp(when)
    if record['status']!='LIVE' or now<cutoff or timestamp(record['captured_at'])>cutoff:raise ValueError('Invalid lock transition')
    value=copy.deepcopy(record);value.update(status='LOCKED',freeze_timestamp=when,cutoff='T75',lock_delay_seconds=(now-cutoff).total_seconds())
    if note:
        if timestamp(note['updated_at'])>=cutoff:raise ValueError('Note is after deadline')
        value['our_note']=note
        if note.get('side') and note.get('market'):
            offers=[p for p in value['offers'] if p['market']==note['market'] and p['side']==note['side']]
            if offers:
                # Freeze the chosen side at the best captured offered price; retain its exact line.
                selected=max(offers,key=lambda p:decimal_odds(p['price']))
                value['human_lean']={**selected,'source':'human_lean','author':note['author']}
    return value
