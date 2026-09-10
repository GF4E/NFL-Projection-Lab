"""Confirmed executed-slip ingestion. No odds calls and no model-pick changes."""
import argparse
import csv
import datetime as dt
import fcntl
import hashlib
import io
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path
from engine.pick_log import FIELDS
from engine.pricing import decimal_odds
from engine.pick_store import put, read_pinned, sha

ROOT=Path(__file__).resolve().parents[1]
DEFAULT_LOG=ROOT/'outputs/jaret/pick_log.csv'
PRIVATE=ROOT/'work/slip-ingest-v1/private-input'
EXTRA=['source','game_id','placed_at','stake','stake_currency','ingested_at','slip_id','confirmation_fields']
SLIP_FIELDS=FIELDS+EXTRA
REQUIRED=('game','market','side','line','price','stake','stake_currency','book','placed_at')
BOOKS={'betmgm':'betmgm','bet mgm':'betmgm','draftkings':'draftkings','draft kings':'draftkings','fanduel':'fanduel','fan duel':'fanduel','caesars':'williamhill_us','williamhill_us':'williamhill_us'}


def schedules():
    refs=sorted((ROOT/'work/model-pick-v1/daily').glob('*/schedule-ref.json'),reverse=True)
    if not refs:raise ValueError('No cached schedule; run public daily preparation first')
    schedule=read_pinned(json.loads(refs[0].read_text()))
    return [g for group in schedule['groups'] for g in group['games']]


def mentions(text,game,side):
    name=game[side+'_team'];abbr=game[side+'_abbr']
    aliases=[name,name.split()[-1],abbr]
    if abbr=='LA':aliases+=['LAR','LA Rams']
    return any(re.search(r'(?<!\w)'+re.escape(a)+r'(?!\w)',text,re.I) for a in aliases)


def unique(values):
    values=list(dict.fromkeys(values))
    return values[0] if len(values)==1 else None


def parse(text, games):
    text=text.replace('−','-').replace('–','-');result={}
    result['book']=unique([v for k,v in BOOKS.items() if re.search(r'\b'+re.escape(k)+r'\b',text,re.I)])
    explicit=re.findall(r'\b20\d{2}_\d{2}_[A-Z]+_[A-Z]+\b',text)
    possible=[g for g in games if g['game_id'] in explicit] if explicit else [g for g in games if mentions(text,g,'home') and mentions(text,g,'away')]
    # A fully dated placement can disambiguate the nearest scheduled matchup,
    # but never infer which of several games was intended from today's date.
    result['game']=unique([g['game_id'] for g in possible])
    result['market']='totals' if re.search(r'\b(over|under|total)\b',text,re.I) else 'moneyline' if re.search(r'\b(moneyline|money line|ML)\b',text,re.I) else 'spreads' if re.search(r'\b(spread|handicap)\b',text,re.I) else None
    result['side']=unique([s.title() for s in re.findall(r'\b(over|under)\b',text,re.I)]) if result['market']=='totals' else None
    total=re.findall(r'\b(?:over|under)\s*([0-9]+(?:\.5)?)\b',text,re.I)
    lines=re.findall(r'\bline\s*[:=]?\s*([+-]?\d+(?:\.5)?)\b',text,re.I)
    if not lines and result['market']=='totals':lines=total
    if not lines and result['market']!='totals':lines=re.findall(r'(?<![\w\d])([+-](?:[0-9]|[1-9][0-9])(?:\.5)?)(?![\d.])',text)
    result['line']=unique(lines)
    if result['market']=='moneyline':result['line']='0'
    prices=re.findall(r'(?<!\w)([+-][1-9]\d{2,})(?![\d.])',text)
    result['price']=unique(prices)
    stakes=re.findall(r'\b(?:stake|wager|bet amount|risk)\s*[:=]?\s*(\$|€|£|USD|EUR|GBP)?\s*([0-9][0-9,.]*)\s*(units?|USD|EUR|GBP)?',text,re.I)
    amounts=[x[1].replace(',','') for x in stakes if re.fullmatch(r'(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?',x[1])]
    result['stake']=unique(amounts) if len(amounts)==len(stakes) else None
    currencies=[{'$':'USD','€':'EUR','£':'GBP'}.get(x[0],x[0].upper()) or ('units' if x[2].lower().startswith('unit') else x[2].upper()) for x in stakes]
    result['stake_currency']=unique([x for x in currencies if x])
    times=re.findall(r'\b(20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))\b',text)
    result['placed_at']=unique(times)
    if not result['placed_at']:
        labeled=re.findall(r'(?:placed(?: at)?|date placed|time placed)\s*[:=]?\s*(20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))',text,re.I)
        result['placed_at']=unique(labeled)
    if result['game'] and result['market'] in ('spreads','moneyline'):
        game=next(g for g in games if g['game_id']==result['game'])
        # Selection line must identify a team, not just the matchup heading.
        selected=[]
        for line in text.splitlines():
            if not (re.search(r'\b(?:pick|side|selection)\s*[:=]',line,re.I) or (re.search(r'[+-]\d',line) and not re.search(r'\bvs\b|\s@\s',line,re.I))):continue
            for side in ('home','away'):
                if mentions(line,game,side) and not mentions(line,game,'away' if side=='home' else 'home'):selected.append(game[side+'_team'])
        result['side']=unique(selected)
    result['_unsupported']=bool(re.search(r'\b(parlay|teaser|same game|player prop|rushing|receiving|passing yards|first half|1st half|first quarter|1st quarter|cashed out|voided|free bet)\b',text,re.I))
    return result


def validate(fields,games):
    errors={k:'missing or ambiguous' for k in REQUIRED if fields.get(k) in (None,'')}
    game=next((g for g in games if g['game_id']==fields.get('game')),None)
    if not game:errors['game']='use an exact cached game_id (YYYY_WW_AWAY_HOME)'
    if fields.get('market') not in ('spreads','totals','moneyline'):errors['market']='supported straight full-game markets: spreads, totals, moneyline'
    if game and fields.get('side'):
        allowed=('Over','Under') if fields.get('market')=='totals' else (game['home_team'],game['away_team'])
        if fields['side'] not in allowed:errors['side']='must be one of '+', '.join(allowed)
    for field in ('line','price','stake'):
        try:
            value=float(fields[field])
            if not math.isfinite(value):raise ValueError()
            if field=='price':decimal_odds(value)
            if field=='stake' and value<=0:raise ValueError()
            if field=='line' and (value*2!=int(value*2) or fields.get('market')=='totals' and value<=0 or fields.get('market')=='moneyline' and value!=0):raise ValueError()
        except (KeyError,ValueError,TypeError):errors[field]='invalid numeric value'
    if fields.get('book') not in set(BOOKS.values()):errors['book']='use betmgm, draftkings, fanduel, or williamhill_us (Caesars)'
    if fields.get('stake_currency') not in ('USD','EUR','GBP','units'):errors['stake_currency']='use USD, EUR, GBP, or units; never infer stake units'
    try:
        time=dt.datetime.fromisoformat(fields['placed_at'].replace('Z','+00:00'))
        if time.tzinfo is None:raise ValueError()
    except (KeyError,ValueError,TypeError,AttributeError):errors['placed_at']='provide ISO timestamp with timezone, e.g. 2026-09-10T18:05:00-04:00'
    if fields.get('_unsupported'):errors['ticket']='parlays, teasers, and player/period markets need a dedicated settlement schema; do not import them as straight bets'
    return errors


def extract(input_value):
    if input_value=='-':return sys.stdin.read(),[],None
    path=Path(input_value)
    try:exists=path.is_file()
    except OSError:exists=False
    if not exists:return input_value,[],None
    raw=path.read_bytes()
    if path.suffix.lower()=='.json':
        draft=json.loads(raw)
        if draft.get('kind')=='slip-review':return draft['text'],draft.get('ocr',[]),draft
    if path.suffix.lower() in ('.txt','.md'):return raw.decode(),[],None
    if path.suffix.lower() not in ('.png','.jpg','.jpeg','.heic','.tif','.tiff'):raise ValueError('Provide pasted text, a text file, or a screenshot image')
    p=subprocess.run(['/usr/bin/swift',str(ROOT/'scripts/slip_ocr.swift'),str(path.resolve())],capture_output=True,text=True,timeout=120)
    if p.returncode:raise ValueError('Local OCR failed; paste the slip text instead. No row written.')
    items=json.loads(p.stdout)
    image_hash=sha(raw)
    put(PRIVATE/(image_hash+path.suffix.lower()),raw,raw=True)
    for item in items:item['image_sha256']=image_hash
    return '\n'.join(r['text'] for r in items),items,None


def ingest(text,games,log=DEFAULT_LOG,overrides=None,confirmed=(),ocr=(),private=PRIVATE):
    fields=parse(text,games);fields.update(overrides or {})
    errors=validate(fields,games)
    # OCR can confidently misread a minus sign or amount: numerical/image fields
    # receive a review flag until explicitly confirmed, regardless of confidence.
    if ocr:
        for key in REQUIRED:
            if key not in confirmed and key not in (overrides or {}):errors.setdefault(key,'confirm OCR extraction')
    identity=sha(text.encode())
    review={'kind':'slip-review','text':text,'ocr':ocr,'fields':fields,'errors':errors,'confirmed':sorted(set(confirmed)|set(overrides or {})),'source_sha256':identity}
    review_path=Path(private)/(sha(json.dumps(review,sort_keys=True).encode())+'.json')
    put(review_path,review)
    if errors:return {'status':'NEEDS_CONFIRMATION','fields':fields,'questions':errors,'review':str(review_path)}
    game=next(g for g in games if g['game_id']==fields['game'])
    placed=dt.datetime.fromisoformat(fields['placed_at'].replace('Z','+00:00')).isoformat()
    canonical={k:fields[k] for k in REQUIRED};canonical['placed_at']=placed
    for key in ('line','price','stake'):canonical[key]=float(canonical[key])
    slip_id=sha(json.dumps(canonical,sort_keys=True).encode())
    row=dict.fromkeys(SLIP_FIELDS,'')
    row.update(pick_id='jaret:'+slip_id,source='jaret',status='executed',record_class='live',game_id=game['game_id'],
        event_id=game.get('event_id',game['game_id']),season=game['season'],week=game['week'],home_team=game['home_team'],away_team=game['away_team'],
        commence_time=game['kickoff_at'],decision_at=placed,placed_at=placed,executed_book=fields['book'],market=fields['market'],side=fields['side'],
        line_at_approval=canonical['line'],book_price=canonical['price'],stake=canonical['stake'],stake_currency=fields['stake_currency'],
        ingested_at=dt.datetime.now(dt.timezone.utc).isoformat(),slip_id=slip_id,source_sha256=identity,
        quote_id='slip:'+slip_id,probability_source='EXECUTED_SLIP_NO_AS_PLACED_MODEL_PROBABILITY',confirmation_fields=json.dumps(review['confirmed']))
    log=Path(log);log.parent.mkdir(parents=True,exist_ok=True)
    with log.open('a+',newline='') as f:
        fcntl.flock(f,fcntl.LOCK_EX);f.seek(0);reader=csv.DictReader(f);old=list(reader)
        if reader.fieldnames and reader.fieldnames!=SLIP_FIELDS:raise ValueError('Slip log schema mismatch')
        if any(r['pick_id']==row['pick_id'] for r in old):return {'status':'already_recorded','pick_id':row['pick_id'],'log':str(log)}
        f.seek(0,2);w=csv.DictWriter(f,fieldnames=SLIP_FIELDS)
        if not reader.fieldnames:w.writeheader()
        w.writerow(row);f.flush();os.fsync(f.fileno())
    return {'status':'executed','pick_id':row['pick_id'],'fields':canonical,'log':str(log)}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ingest-slip',nargs='?',const='-',required=True,help='Pasted text, text/screenshot path, saved review JSON, or - for stdin')
    p.add_argument('--set',action='append',default=[],metavar='FIELD=VALUE');p.add_argument('--confirm',action='append',default=[],choices=REQUIRED)
    p.add_argument('--log',default=str(DEFAULT_LOG));a=p.parse_args()
    text,ocr,draft=extract(a.ingest_slip);values={};confirmed=set(a.confirm)
    if draft:values={k:v for k,v in draft['fields'].items() if k in draft.get('confirmed',[])};confirmed.update(draft.get('confirmed',[]))
    for pair in a.set:
        if '=' not in pair:p.error('--set requires FIELD=VALUE')
        key,value=pair.split('=',1)
        if key not in REQUIRED:p.error('Unknown field: '+key)
        values[key]=value
    games=schedules();result=ingest(text,games,a.log,values,confirmed,ocr)
    while result['status']=='NEEDS_CONFIRMATION' and sys.stdin.isatty():
        print(json.dumps(result['fields'],indent=2))
        if 'ticket' in result['questions']:break
        for key,reason in result['questions'].items():
            current=result['fields'].get(key)
            value=input(f'{key} ({reason}); detected {current!r}. Enter value, or Enter to confirm detected: ').strip()
            if value:values[key]=value
            elif current not in (None,''):values[key]=current
        result=ingest(text,games,a.log,values,confirmed,ocr)
    print(json.dumps(result,indent=2))
    return 2 if result['status']=='NEEDS_CONFIRMATION' else 0

if __name__=='__main__':sys.exit(main())
