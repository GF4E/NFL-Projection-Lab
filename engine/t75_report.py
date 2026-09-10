"""Daily close ingestion and descriptive reporting. Never opens a T80 capture.

Reads immutable lock DTOs and their embedded frozen counterfactual decisions.
No quote transport or consensus-selection modules are imported here.
"""
import argparse
import csv
import datetime as dt
import io
import json
import math
import statistics
import urllib.request
from collections import defaultdict
from pathlib import Path
from engine.pick_store import put, pin, read_pinned, sha
from engine.t75_grade import grade

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/model-pick-v1'


def final_feed(raw, source_sha):
    result={}
    for r in csv.DictReader(io.StringIO(raw.decode())):
        try:
            home,away=float(r['home_score']),float(r['away_score'])
            spread,total=float(r['spread_line']),float(r['total_line'])
            if not all(math.isfinite(x) for x in (home,away,spread,total)):continue
            # nflverse's completed-game result field must agree with both scores.
            if float(r['result'])!=home-away or float(r['total'])!=home+away:continue
            result[r['game_id']]={'final':True,'home_score':home,'away_score':away,
                                 'spread_line':spread,'total_line':total,'source_sha256':source_sha}
        except (ValueError,TypeError,KeyError):continue
    return result


def dto(pick, game):
    keys=('market','side','line','price','fair_probability')
    return {**{k:pick[k] for k in keys},'home_team':game['home_team']}


def score_files(lock_paths, results, shape, grades_dir):
    """Create-only grades per pick. A later results correction needs a new record."""
    output=[]
    for path in lock_paths:
        record=json.loads(Path(path).read_text())
        if record['status']!='LOCKED':continue
        game=record['game'];result=results.get(game['game_id'])
        picked=[('actual',p) for p in record['picks']]
        picked += [(name,info['counterfactual_pick']) for name,info in record.get('shadows',{}).get('adjustments',{}).items() if 'counterfactual_pick' in info]
        picked += [(p['paper_rule'],p) for p in record.get('paper_picks',[])]
        for kind,p in picked:
            identity=sha((record['version']+'|'+game['game_id']+'|'+kind+'|'+p['market']).encode())
            dest=Path(grades_dir)/record['version']/(identity+'.json')
            if dest.exists():output.append(json.loads(dest.read_text()));continue
            g=grade(dto(p,game),result,shape)
            if g['status']!='SCORED':continue
            value={**g,'pick_id':identity,'version':record['version'],'game_id':game['game_id'],
                   'season':game['season'],'week':game['week'],'market':p['market'],'kind':kind,
                   'edge_source':p.get('edge_source'),'filtered_subset':p.get('filtered_subset',False),
                   'pick_sha256':sha(Path(path).read_bytes()),'scored_at':dt.datetime.now(dt.timezone.utc).isoformat()}
            put(dest,value);output.append(value)
    return output


def wilson(w,l):
    n=w+l
    if not n:return None,None
    p=w/n;z=1.959963984540054;den=1+z*z/n
    center=(p+z*z/(2*n))/den;half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return center-half,center+half


def summarize(rows):
    w=sum(r['outcome']=='W' for r in rows);l=sum(r['outcome']=='L' for r in rows);p=sum(r['outcome']=='P' for r in rows)
    clv=[r['clv_cents'] for r in rows if r['clv_cents'] is not None]
    probs=[r['clv_probability'] for r in rows if r['clv_probability'] is not None]
    lo,hi=wilson(w,l)
    return {'wins':w,'losses':l,'pushes':p,'rate':w/(w+l) if w+l else None,'lower95':lo,'upper95':hi,
            'units':sum(r['units'] for r in rows),'mean_clv_cents':statistics.mean(clv) if clv else None,
            'mean_clv_probability':statistics.mean(probs) if probs else None,'clv_n':len(clv)}


def scorecard(records, grades):
    result=[]
    versions=sorted({r['version'] for r in records})
    for version in versions:
        allrec=[r for r in records if r['version']==version]
        for week in ['ALL']+sorted({r['game']['week'] for r in allrec}):
            rec=[r for r in allrec if week=='ALL' or r['game']['week']==week]
            for market in ('spreads','totals'):
                kinds=['all','price','filtered','WIND-UNDER-10-15-V1-T75']
                for subset in kinds:
                    def match(r):
                        return (r['kind']==subset if subset.startswith('WIND-') else r['kind']=='actual' and (subset=='all' or subset=='price' and r['edge_source']=='price' or subset=='filtered' and r['filtered_subset']))
                    selected=[r for r in grades if r['version']==version and (week=='ALL' or r['week']==week) and r['market']==market and match(r)]
                    pending=0
                    for r in rec:
                        picks=r.get('paper_picks',[]) if subset.startswith('WIND-') else r.get('picks',[])
                        for p in picks:
                            pseudo={**p,'kind':p.get('paper_rule','actual')}
                            if p['market']==market and match(pseudo):pending+=1
                    result.append({'version':version,'week':week,'market':market,'subset':subset,
                                   'missed_games':sum(r['status']=='MISSED' for r in rec),'pending':max(0,pending-len(selected)),
                                   **summarize(selected),'clv_reference':'nflverse_close','report_type':'DESCRIPTIVE_ONLY'})
    return result


def diagnose(grades, versions=()):
    result=[]
    for version in sorted(set(versions)|{r['version'] for r in grades}):
        for name,market in (('elo_anya','spreads'),('wind_dome','totals')):
            actual={r['game_id']:r for r in grades if r['version']==version and r['kind']=='actual' and r['market']==market}
            shadow={r['game_id']:r for r in grades if r['version']==version and r['kind']==name}
            ids=sorted(set(actual)&set(shadow));n=len(ids)
            for label,source in [('actual',actual),(name,shadow)]:
                result.append({'version':version,'shadow':name,'series':label,'paired_n':n,
                               'status':'INSUFFICIENT_SAMPLE' if n<100 else 'NUMBERS_ONLY_NO_VERDICT' if n<200 else 'DESCRIPTIVE_REVIEW_REQUIRED',
                               **summarize([source[k] for k in ids])})
    return result


def inactive_diagnostics(records, grades):
    output=[]
    for version in sorted({r['version'] for r in records}):
        for label in ('yes','no','unknown'):
            ids=set()
            for r in records:
                if r['version']!=version or r['status']!='LOCKED':continue
                flags=[t.get('starting_qb_inactive','unknown') for t in r.get('shadows',{}).get('inactives',{}).get('teams',{}).values()]
                category='yes' if 'yes' in flags else 'no' if len(flags)==2 and all(x=='no' for x in flags) else 'unknown'
                if category==label:ids.add(r['game']['game_id'])
            for market in ('spreads','totals'):
                selected=[r for r in grades if r['version']==version and r['kind']=='actual' and r['market']==market and r['game_id'] in ids]
                output.append({'version':version,'qb_inactive':label,'market':market,'games':len(ids),'scored_picks':len(selected),
                               'status':'INSUFFICIENT_SAMPLE' if len(selected)<100 else 'NUMBERS_ONLY_NO_VERDICT' if len(selected)<200 else 'DESCRIPTIVE_REVIEW_REQUIRED',
                               **summarize(selected)})
    return output


def csv_bytes(rows):
    if not rows:return b''
    f=io.StringIO();writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows);return f.getvalue().encode()


def run(fetch_results=False, output=OUT):
    output=Path(output);config=json.loads((ROOT/'work/model-pick-v1/runtime-config.json').read_text())
    shape=read_pinned(config['distribution']);paths=sorted((output/'locks').glob('*/T75-picks.json'))
    results={};date=dt.datetime.now(dt.timezone.utc).date().isoformat();resultref=output/'daily'/date/'results-ref.json'
    if resultref.exists():
        ref=json.loads(resultref.read_text());raw=Path(ref['path']).read_bytes()
        if sha(raw)!=ref['sha256']:raise ValueError('Result hash mismatch')
        results=final_feed(raw,ref['sha256'])
    elif fetch_results:
        url='https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
        raw=urllib.request.urlopen(url,timeout=30).read();ref=pin(output/'final-sources',raw,'.csv',True)
        put(resultref,{**ref,'url':url,'received_at':dt.datetime.now(dt.timezone.utc).isoformat()})
        results=final_feed(raw,ref['sha256'])
    grades=score_files(paths,results,shape,output/'grades')
    records=[json.loads(p.read_text()) for p in paths]
    tables={'scorecard':scorecard(records,grades),'diagnose':diagnose(grades,[r['version'] for r in records]),'inactives':inactive_diagnostics(records,grades)}
    report_id=sha(__import__('engine.pick_store',fromlist=['encode']).encode(tables))
    for name,table in tables.items():put(output/'reports'/report_id/(name+'.csv'),csv_bytes(table),raw=True)
    put(output/'reports'/report_id/'report.json',{'tables':tables,'lock_count':len(records),'scored_records':len(grades)})
    return {'report':str(output/'reports'/report_id),'lock_count':len(records),'scored_records':len(grades)}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--scorecard',action='store_true');p.add_argument('--diagnose',action='store_true');p.add_argument('--refresh-results',action='store_true');a=p.parse_args()
    print(json.dumps(run(a.refresh_results)))
