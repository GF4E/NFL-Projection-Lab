"""Hand-maintained posted teaser references; never invent an unknown quote."""
import datetime as dt
import hashlib
import json
from pathlib import Path
from engine.pricing import decimal_odds, timestamp

NAMES={'betmgm':'BetMGM','williamhill_us':'Caesars','fanduel':'FanDuel','draftkings':'DraftKings'}


def load(root):
    p=Path(root)/'config/teaser_prices.json'
    if not p.exists():return {'books':{}}
    raw=p.read_bytes();value=json.loads(raw)
    if value.get('points')!=6 or value.get('sport')!='NFL':raise ValueError('Wrong teaser configuration')
    for key,row in value['books'].items():
        if key not in NAMES:raise ValueError('Not an execution book')
        for field in ('two_leg','three_leg'):
            n=row.get(field)
            if n is not None and (not isinstance(n,(int,float)) or isinstance(n,bool) or abs(n)<100):raise ValueError('Invalid American teaser price')
        dt.date.fromisoformat(row['as_of'])
        if not row.get('source_page'):raise ValueError('Teaser source is required')
    return {**value,'sha256':hashlib.sha256(raw).hexdigest()}


def apply(verdict, record, market):
    from engine.board_bridge import teaser_leg
    if verdict['state']=='PLAY':return verdict
    config=record.get('teaser_prices',{});candidates=[];unknown=[]
    cutoff=timestamp(record.get('freeze_timestamp') or record['captured_at']).date()
    for offer in record.get('offers',[]):
        if offer['market']!=market:continue
        moved,keys=teaser_leg(offer)
        if len(keys)<2:continue
        row=config.get('books',{}).get(offer['book'],{})
        price=row.get('two_leg')
        if not row.get('as_of') or dt.date.fromisoformat(row['as_of'])>cutoff or price is None:
            unknown.append(offer['book']);continue
        candidates.append({**offer,'teased_line':moved,'key_numbers_crossed':keys,'teaser_price':price,'pricing':row})
    if not candidates:
        if unknown:return {**verdict,'teaser_notice':'TEASE candidate, teaser price unverified at '+', '.join(NAMES[b] for b in sorted(set(unknown)))}
        return verdict
    best=max(candidates,key=lambda o:(decimal_odds(o['teaser_price']),o['book'],o['side']))
    notice=f'TEASE candidate, best teaser price {best["teaser_price"]:+g} at {NAMES[best["book"]]}'
    info={'teaser_notice':notice,'leg':best['side'],'original_line':best['line'],'teased_line':best['teased_line'],'key_numbers_crossed':best['key_numbers_crossed'],'best_book':best['book'],'teaser_price':best['teaser_price'],'teaser_pricing':best['pricing'],'teaser_config_sha256':config.get('sha256')}
    if decimal_odds(best['teaser_price'])>=decimal_odds(-110):
        return {**verdict,**info,'state':'TEASE','teaser_notice':None,'ticket_legs':2,'partner_status':'NEEDS_PARTNER','teaser_price_basis':'DATED_CONFIG_REFERENCE'}
    return {**verdict,**info,'state':'HARD PASS','reason':notice}
